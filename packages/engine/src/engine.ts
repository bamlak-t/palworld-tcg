/**
 * Turn flow: setup, phases, main-phase actions, battle and check timing.
 * Section numbers (§x.y) refer to the Comprehensive Rules ver. 1.00.
 */
import { defOf, isPal, isStructure } from './cards.ts';
import { allActs, getScript, INTERRUPT, type ActAbility } from './abilities.ts';
import { SOUL_COUNT } from './deck.ts';
import { costChoices, isValidCostChoice, payCost, runResolution, startResolution } from './effects.ts';
import {
  card,
  dealPlayerDamage,
  deploy,
  draw,
  endGame,
  enqueue,
  fail,
  fireWatchers,
  inBase,
  leaveBase,
  other,
  player,
  removeFromZones,
  rest,
  RuleError,
  type Ctx,
} from './ops.ts';
import { nextRandom, shuffleInPlace } from './rng.ts';
import { canPutInBase, costToPlay, hasFlag, hasKeyword, keywordValue, powerOf, strikeOf } from './stats.ts';
import type {
  Action,
  ApplyResult,
  AttackTarget,
  CardInstance,
  CostChoice,
  GameEvent,
  GameState,
  PendingChoice,
  PlayerState,
  Seat,
} from './types.ts';

const STARTING_LIFE = 10;
const OPENING_HAND = 5;
const SOULS_PER_TURN = 2;
const SOUL_DRAW_COST = 3;
const MAX_PALS = 5;

// ---------------------------------------------------------------------------
// Setup (§6)
// ---------------------------------------------------------------------------

export interface PlayerSetup {
  name: string;
  /** 50 canonical card ids. Validate with validateDeck() first. */
  deck: string[];
}

export function createGame(
  seed: number,
  setups: [PlayerSetup, PlayerSetup],
): { state: GameState; events: GameEvent[] } {
  const s: GameState = {
    version: 0,
    rngState: seed | 0,
    players: [emptyPlayer(setups[0].name), emptyPlayer(setups[1].name)],
    cards: {},
    turn: 0,
    activeSeat: 0,
    firstSeat: null,
    phase: 'setup',
    battle: null,
    pending: null,
    nightUntilTurn: null,
    placementCounter: 0,
    triggers: [],
    resolving: null,
    resolutionZone: [],
    usedThisTurn: [],
    result: null,
  };
  const ctx: Ctx = { s, events: [] };

  // Instance ids are random so they reveal nothing about deck order or card identity.
  ([0, 1] as const).forEach((seat) => {
    for (const cardId of setups[seat].deck) {
      const id = randomId(ctx);
      s.cards[id] = { id, cardId, owner: seat, rested: false, damage: 0, modifiers: [], placedAt: 0, assignedTo: null };
      s.players[seat].deck.push(id);
    }
    shuffle(ctx, s.players[seat].deck); // §6.2.1.2
  });

  // §6.2.1.3: a random player chooses who goes first.
  const [r, next] = nextRandom(s.rngState);
  s.rngState = next;
  s.pending = { kind: 'chooseFirstPlayer', seat: r < 0.5 ? 0 : 1 };
  return { state: s, events: ctx.events };
}

function emptyPlayer(name: string): PlayerState {
  return {
    name,
    life: STARTING_LIFE,
    damageTaken: 0,
    material: 0,
    ingredient: 0,
    deck: [],
    hand: [],
    base: [],
    graveyard: [],
    exile: [],
    soulDeck: SOUL_COUNT,
    soulsStanding: 0,
    soulsRested: 0,
    soulDrawUsed: false,
    mulliganDone: false,
    maxPals: MAX_PALS,
  };
}

function randomId(ctx: Ctx): string {
  let id: string;
  do {
    const [r, next] = nextRandom(ctx.s.rngState);
    ctx.s.rngState = next;
    id =
      'c' +
      Math.floor(r * 36 ** 6)
        .toString(36)
        .padStart(6, '0');
  } while (ctx.s.cards[id]);
  return id;
}

function shuffle(ctx: Ctx, ids: string[]) {
  ctx.s.rngState = shuffleInPlace(ids, ctx.s.rngState);
}

// ---------------------------------------------------------------------------
// apply()
// ---------------------------------------------------------------------------

/** Applies one player action. Pure: the input state is never mutated. */
export function apply(state: GameState, seat: Seat, action: Action): ApplyResult {
  if (state.result) return { ok: false, error: 'The game is over.' };
  const ctx: Ctx = { s: structuredClone(state), events: [] };
  try {
    dispatch(ctx, seat, action);
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
  ctx.s.version++;
  return { ok: true, state: ctx.s, events: ctx.events };
}

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

function dispatch(ctx: Ctx, seat: Seat, action: Action) {
  const { s } = ctx;

  if (action.type === 'concede') {
    endGame(ctx, other(seat), `${player(ctx, seat).name} conceded`);
    return;
  }

  // While a choice is pending, only its owner may act, and only to answer it.
  const pending = s.pending;
  if (pending) {
    if (pending.seat !== seat) fail('Waiting for the other player.');
    const expect = (type: Action['type'], msg: string) => {
      if (action.type !== type) fail(msg);
    };
    switch (pending.kind) {
      case 'chooseFirstPlayer':
        expect('chooseFirstPlayer', 'Choose who goes first.');
        return chooseFirstPlayer(ctx, (action as ActionOf<'chooseFirstPlayer'>).first);
      case 'mulligan':
        expect('mulligan', 'Choose whether to redraw your hand.');
        return mulligan(ctx, seat, (action as ActionOf<'mulligan'>).redraw);
      case 'block':
        expect('block', 'Choose a blocker or decline.');
        return block(ctx, pending, (action as ActionOf<'block'>).blockerId);
      case 'overload':
        expect('chooseOverload', 'Choose which Pals to keep.');
        return chooseOverload(ctx, pending, (action as ActionOf<'chooseOverload'>).keep);
      case 'effectChoice':
        expect('answer', pending.prompt);
        return answer(ctx, (action as ActionOf<'answer'>).choice);
      case 'quickStep':
        // §9.5.2: the defender may play Quick cards and abilities, then pass.
        if (action.type === 'passQuick') {
          s.pending = null;
          return damageStep(ctx);
        }
        if (action.type === 'playCard') return playCard(ctx, seat, action.cardId, true, action.x);
        if (action.type === 'activate') return activate(ctx, seat, action, true);
        return fail('Play a Quick card or ability, or pass.');
    }
  }

  if (s.phase !== 'main') fail('You can only act during your main phase.');
  if (seat !== s.activeSeat) fail("It's not your turn.");
  if (s.battle) fail('Finish the battle first.');

  switch (action.type) {
    case 'playCard':
      return playCard(ctx, seat, action.cardId, false, action.x);
    case 'activate':
      return activate(ctx, seat, action, false);
    case 'soulDraw':
      return soulDraw(ctx, seat);
    case 'attack':
      return declareAttack(ctx, seat, action.attackerId, action.target);
    case 'endTurn':
      return endTurn(ctx);
    default:
      fail(`Can't ${action.type} right now.`);
  }
}

// ---------------------------------------------------------------------------
// Setup choices
// ---------------------------------------------------------------------------

function chooseFirstPlayer(ctx: Ctx, first: Seat) {
  const { s } = ctx;
  if (first !== 0 && first !== 1) fail('Invalid seat.');
  s.pending = null;
  s.firstSeat = first;
  s.activeSeat = first;
  ctx.events.push({ type: 'gameStarted', firstSeat: first });

  // §6.2.1.5: the second player starts with 1 soul.
  const second = player(ctx, other(first));
  second.soulDeck--;
  second.soulsStanding++;

  for (const seat of [first, other(first)]) draw(ctx, seat, OPENING_HAND); // §6.2.1.6
  s.pending = { kind: 'mulligan', seat: first }; // §6.2.1.7
}

function mulligan(ctx: Ctx, seat: Seat, redraw: boolean) {
  const p = player(ctx, seat);
  if (redraw) {
    p.deck.push(...p.hand);
    p.hand = [];
    shuffle(ctx, p.deck);
    draw(ctx, seat, OPENING_HAND);
  }
  p.mulliganDone = true;
  ctx.events.push({ type: 'mulligan', seat, redraw });

  const next = other(seat);
  if (!player(ctx, next).mulliganDone) {
    ctx.s.pending = { kind: 'mulligan', seat: next };
  } else {
    ctx.s.pending = null;
    startTurn(ctx, ctx.s.firstSeat!); // §6.2.1.11
  }
}

// ---------------------------------------------------------------------------
// Turn structure (§7)
// ---------------------------------------------------------------------------

function startTurn(ctx: Ctx, seat: Seat) {
  const { s } = ctx;
  s.turn++;
  s.activeSeat = seat;
  s.usedThisTurn = [];
  s.turnMemory = [];
  s.assignedThisTurn = [];
  s.turnFlags = { mustAttack: [], noAssign: [] };
  for (const p of s.players) p.nextGearDiscount = 0;
  player(ctx, seat).soulDrawUsed = false;
  ctx.events.push({ type: 'turnStarted', seat, turn: s.turn });
  runPhasesFrom(ctx, 'stand');
}

/**
 * Runs the automatic phases in order. Each phase ends with a check timing; if that
 * pauses the game, resume() later continues from the phase after s.phase.
 */
function runPhasesFrom(ctx: Ctx, from: 'stand' | 'draw' | 'soul' | 'main') {
  const order = ['stand', 'draw', 'soul', 'main'] as const;
  for (const phase of order.slice(order.indexOf(from))) {
    const s = ctx.s;
    const seat = s.activeSeat;
    const p = player(ctx, seat);
    s.phase = phase;
    ctx.events.push({ type: 'phase', phase });
    switch (phase) {
      case 'stand': // §7.2: stand the base and the soul area
        for (const id of p.base) {
          const c = card(s, id);
          c.assignedTo = null;
          // Frozen cards stay rested while the card that froze them is in a base.
          const freezer = c.frozenBy ? s.cards[c.frozenBy] : undefined;
          if (freezer && inBase(s, freezer)) continue;
          c.frozenBy = null;
          if (c.skipNextStand) c.skipNextStand = false;
          else c.rested = false;
        }
        p.soulsStanding += p.soulsRested;
        p.soulsRested = 0;
        break;
      case 'draw': // §7.3.1: the first player skips this on the very first turn
        if (s.turn !== 1) draw(ctx, seat, 1);
        break;
      case 'soul': {
        // §7.4
        const gained = Math.min(SOULS_PER_TURN, p.soulDeck);
        p.soulDeck -= gained;
        p.soulsStanding += gained;
        if (gained > 0) ctx.events.push({ type: 'soulsGained', seat, count: gained });
        break;
      }
      case 'main': // §7.5: the turn player gets a play timing
        break;
    }
    if (checkTiming(ctx)) return;
  }
}

/** True if the turn player must still attack (e.g. Alarm Bell) and has a Pal able to. */
export function mustStillAttack(s: GameState): boolean {
  const seat = s.activeSeat;
  if (!s.turnFlags?.mustAttack.includes(seat)) return false;
  return s.players[seat].base.some((id) => canAttack(s, seat, id) && attackTargets(s, seat, id).length > 0);
}

function endTurn(ctx: Ctx) {
  const { s } = ctx;
  if (mustStillAttack(s)) fail('Your Pals must attack as much as possible this turn.');
  s.phase = 'end';
  ctx.events.push({ type: 'phase', phase: 'end' });
  // §7.6.1: "at the end of turn" abilities trigger.
  for (const id of player(ctx, s.activeSeat).base) enqueue(ctx, card(s, id), 'endOfTurn');
  // Delayed abilities set up this turn ("at the end of this turn, ...").
  for (const d of (s.delayed ?? []).filter((d) => d.atTurn === s.turn)) {
    s.triggers.push({
      sourceId: d.sourceId,
      cardId: d.cardId,
      controller: d.controller,
      trigger: 'delayed',
      key: d.key,
    });
  }
  s.delayed = (s.delayed ?? []).filter((d) => d.atTurn > s.turn);
  if (checkTiming(ctx)) return;
  finishEndPhase(ctx);
}

/** §7.6.3–7.6.5: clear damage and end-of-turn effects, then pass the turn. */
function finishEndPhase(ctx: Ctx) {
  const { s } = ctx;
  const seat = s.activeSeat;
  for (const p of s.players) {
    for (const id of p.base) {
      const c = card(s, id);
      c.damage = 0;
      c.modifiers = c.modifiers.filter(
        (m) => m.duration === 'permanent' || (m.duration === 'untilTurn' && (m.untilTurn ?? 0) > s.turn),
      );
    }
  }
  if (s.nightUntilTurn !== null && s.nightUntilTurn <= s.turn) s.nightUntilTurn = null;
  ctx.events.push({ type: 'turnEnded', seat });
  startTurn(ctx, other(seat));
}

// ---------------------------------------------------------------------------
// Playing cards and abilities (§8, §10.6)
// ---------------------------------------------------------------------------

/** An event whose text starts with Quick can be played in the quick step (§12.2.1.2). */
export const isQuickEvent = (cardId: string) => {
  const def = defOf(cardId);
  return def.kind === 'Event' && def.text.startsWith('Quick@');
};

function playCard(ctx: Ctx, seat: Seat, instanceId: string, inQuickStep: boolean, x = 0) {
  const { s } = ctx;
  const p = player(ctx, seat);
  if (!p.hand.includes(instanceId)) fail("That card isn't in your hand.");
  const c = card(s, instanceId);
  const def = defOf(c);
  if (inQuickStep && !isQuickEvent(c.cardId)) fail('Only Quick events can be played now.');
  // "You may consume X Material and reduce its cost by X."
  if (x !== 0) {
    if (!getScript(c.cardId).materialReducesCost) fail("That card's cost can't be reduced with Material.");
    if (!Number.isInteger(x) || x < 0 || x > p.material) fail('Not enough Material.');
  }
  if (def.kind !== 'Event' && !canPutInBase(s, c)) fail(`You already have ${def.name} in your base (Legendary).`);
  const cost = costToPlay(s, seat, c, x);
  if (cost > p.soulsStanding) fail(`Not enough souls: ${def.name} costs ${cost}.`);

  // Pay the cost by resting souls (§10.4.3).
  p.soulsStanding -= cost;
  p.soulsRested += cost;
  if (x > 0) {
    p.material -= x;
    ctx.events.push({ type: 'resourceSpent', seat, resource: 'material', amount: x });
  }
  if (def.kind === 'Gear') p.nextGearDiscount = 0;
  p.cardsPlayed = (p.cardsPlayed ?? 0) + 1;
  ctx.events.push({ type: 'cardPlayed', seat, cardId: c.cardId, instanceId, cost });

  if (def.kind === 'Event') {
    removeFromZones(ctx, c);
    s.resolutionZone.push(c.id);
    s.pending = null;
    if (startResolution(ctx, { sourceId: c.id, cardId: c.cardId, controller: seat, ability: { kind: 'event' } }))
      return;
    return resume(ctx);
  }
  deploy(ctx, c);
  checkTiming(ctx);
}

function activate(ctx: Ctx, seat: Seat, action: ActionOf<'activate'>, inQuickStep: boolean) {
  const { s } = ctx;
  const self = s.cards[action.sourceId] ?? fail('Unknown card.');
  const acts = allActs(self);
  const picked = acts[action.index] ?? fail('That card has no such ability.');
  const ability: ActAbility = picked.ability;
  const zone = ability.zone === 'hand' ? player(ctx, seat).hand : player(ctx, seat).base;
  if (!zone.includes(self.id)) fail(`That ability can only be used from your ${ability.zone}.`);
  if (inQuickStep && !ability.quick) fail('Only Quick abilities can be used now.');
  if (ability.usable && !ability.usable(s, self)) fail("That ability can't be used right now.");
  const key = `${self.id}:${action.index}`;
  if (ability.oncePerTurn && s.usedThisTurn.includes(key)) fail('That ability can only be used once per turn.');
  const choice: CostChoice = { option: 0, ...action.cost };
  if (!isValidCostChoice(s, seat, self, ability, choice)) fail("You can't pay that cost.");

  const consumed = payCost(ctx, seat, self, ability.costs[choice.option ?? 0]!, choice);
  if (ability.oncePerTurn) s.usedThisTurn.push(key);
  ctx.events.push({
    type: 'abilityActivated',
    seat,
    instanceId: self.id,
    cardId: self.cardId,
    index: action.index,
    label: ability.label,
  });
  if (consumed > 0) fireWatchers(ctx, 'actConsumedMaterial', self);
  if (ability === INTERRUPT) enqueue(ctx, self, 'onInterrupt');
  s.pending = null;
  // The index within the script the ability came from (its own, or a granted one).
  const local = acts.slice(0, action.index).filter((a) => a.grant?.key === picked.grant?.key).length;
  const ref = { kind: 'act' as const, index: local, ...(picked.grant && { grant: picked.grant }) };
  const spec = ability.costs[choice.option ?? 0]!;
  const x =
    choice.x ??
    (spec.assign === 'X'
      ? choice.assignIds?.length
      : spec.discardFromHand?.count === 'X'
        ? choice.discardIds?.length
        : 0);
  if (
    startResolution(ctx, {
      sourceId: self.id,
      cardId: self.cardId,
      controller: seat,
      ability: ref,
      x,
      assignedIds: choice.assignIds ?? (choice.assignId ? [choice.assignId] : []),
      exiledIds: choice.exileIds ?? [],
    })
  )
    return;
  resume(ctx);
}

function answer(ctx: Ctx, choice: string[]) {
  if (!ctx.s.resolving) fail('Nothing to answer.');
  if (!Array.isArray(choice)) fail('Invalid answer.');
  ctx.s.resolving!.answers.push(choice);
  ctx.s.pending = null;
  if (runResolution(ctx)) return;
  resume(ctx);
}

/** Abilities the seat could activate right now, with every way of paying. */
export function activatableAbilities(s: GameState, seat: Seat, inQuickStep: boolean) {
  const out: { sourceId: string; index: number; costs: CostChoice[] }[] = [];
  const p = s.players[seat];
  for (const id of [...p.base, ...p.hand]) {
    const self = s.cards[id]!;
    allActs(self).forEach(({ ability }, index) => {
      const zone = ability.zone === 'hand' ? p.hand : p.base;
      if (!zone.includes(id)) return;
      if (inQuickStep && !ability.quick) return;
      if (ability.usable && !ability.usable(s, self)) return;
      if (ability.oncePerTurn && s.usedThisTurn.includes(`${id}:${index}`)) return;
      const costs = costChoices(s, seat, self, ability);
      if (costs.length > 0) out.push({ sourceId: id, index, costs });
    });
  }
  return out;
}

function soulDraw(ctx: Ctx, seat: Seat) {
  const p = player(ctx, seat);
  if (p.soulDrawUsed) fail('You can only pay souls to draw once per turn.');
  if (p.soulsStanding < SOUL_DRAW_COST) fail(`You need ${SOUL_DRAW_COST} standing souls.`);
  p.soulsStanding -= SOUL_DRAW_COST;
  p.soulsRested += SOUL_DRAW_COST;
  p.soulDrawUsed = true;
  ctx.events.push({ type: 'soulDraw', seat });
  draw(ctx, seat, 1);
  checkTiming(ctx);
}

// ---------------------------------------------------------------------------
// Battle (§9)
// ---------------------------------------------------------------------------

export function canAttack(s: GameState, seat: Seat, attackerId: string): boolean {
  const c = s.cards[attackerId];
  return !!c && c.owner === seat && s.players[seat].base.includes(attackerId) && isPal(c) && !c.rested;
}

/**
 * §9.2.3: the opponent, or one of their rested Pals or structures. Assault also allows
 * standing Pals (§12.15); Taunt forces the choice when a taunting card is targetable (§12.10).
 */
export function attackTargets(s: GameState, seat: Seat, attackerId?: string): AttackTarget[] {
  const opp = other(seat);
  const attacker = attackerId ? s.cards[attackerId] : undefined;
  const assault = !!attacker && hasKeyword(s, attacker, 'assault');
  const cards = s.players[opp].base
    .map((id) => card(s, id))
    .filter((c) => (isPal(c) && (c.rested || assault)) || (isStructure(c) && c.rested))
    .filter((c) => !hasFlag(c, 'cannotBeAttacked'))
    .filter((c) => !attacker || (getScript(c.cardId).canBeAttackedBy?.(s, c, attacker) ?? true));

  const taunting = cards.filter((c) => hasKeyword(s, c, 'taunt'));
  if (taunting.length > 0) return taunting.map((c) => ({ kind: 'card', id: c.id }));
  return [{ kind: 'player', seat: opp }, ...cards.map((c): AttackTarget => ({ kind: 'card', id: c.id }))];
}

const sameTarget = (a: AttackTarget, b: AttackTarget) =>
  a.kind === 'player' ? b.kind === 'player' && a.seat === b.seat : b.kind === 'card' && a.id === b.id;

function declareAttack(ctx: Ctx, seat: Seat, attackerId: string, target: AttackTarget) {
  const { s } = ctx;
  if (!canAttack(s, seat, attackerId)) fail("That Pal can't attack.");
  if (!attackTargets(s, seat, attackerId).some((t) => sameTarget(t, target))) fail("That isn't a valid attack target.");

  const attacker = card(s, attackerId);
  rest(ctx, attacker); // §9.3.2
  s.battle = { attackerId, target, step: 'attack', blockerId: null };
  ctx.events.push({ type: 'attackDeclared', attackerId, target });

  // §12.6 Brave N: On Attack, +N power until end of turn.
  if (hasKeyword(s, attacker, 'brave')) {
    const amount = keywordValue(attacker, 'brave');
    attacker.modifiers.push({ stat: 'power', amount, source: `Brave ${amount}`, duration: 'endOfTurn' });
    ctx.events.push({ type: 'modified', instanceId: attacker.id, stat: 'power', amount, source: `Brave ${amount}` });
  }
  enqueue(ctx, attacker, 'onAttack', target.kind === 'card' ? { subjectId: target.id } : {});
  fireWatchers(ctx, 'palAttacks', attacker);
  if (target.kind === 'card') {
    const defender = card(s, target.id);
    enqueue(ctx, defender, 'onAttacked', { subjectId: attacker.id });
    if (isPal(defender)) fireWatchers(ctx, 'palAttacked', defender);
  }
  if (checkTiming(ctx)) return;
  toBlockStep(ctx);
}

function toBlockStep(ctx: Ctx) {
  const s = ctx.s;
  const battle = s.battle!;
  battle.step = 'block';
  const defender = other(s.activeSeat);
  const attacker = s.cards[battle.attackerId];
  const stealth = !!attacker && inBase(s, attacker) && hasKeyword(s, attacker, 'stealth'); // §12.11
  // §9.4.2: a standing Pal that isn't already the attack target.
  const options = stealth
    ? []
    : s.players[defender].base.filter((id) => {
        const c = card(s, id);
        return (
          isPal(c) &&
          !c.rested &&
          !hasFlag(c, 'cannotBlock') &&
          !(battle.target.kind === 'card' && battle.target.id === id)
        );
      });
  if (options.length > 0) {
    s.pending = { kind: 'block', seat: defender, options };
  } else {
    afterBlock(ctx);
  }
}

function block(ctx: Ctx, pending: Extract<PendingChoice, { kind: 'block' }>, blockerId: string | null) {
  const s = ctx.s;
  if (blockerId !== null && !pending.options.includes(blockerId)) fail("That Pal can't block.");
  s.pending = null;
  if (blockerId !== null) {
    rest(ctx, card(s, blockerId));
    s.battle!.target = { kind: 'card', id: blockerId };
    s.battle!.blockerId = blockerId;
  }
  ctx.events.push({ type: 'blocked', blockerId });
  afterBlock(ctx);
}

function afterBlock(ctx: Ctx) {
  if (checkTiming(ctx)) return;
  toQuickStep(ctx);
}

/** §9.5: the defender always gets a play timing, so passing reveals nothing about their hand. */
function toQuickStep(ctx: Ctx) {
  const s = ctx.s;
  if (s.battle!.nullified) return endBattle(ctx);
  s.battle!.step = 'quick';
  s.pending = { kind: 'quickStep', seat: other(s.activeSeat) };
}

function damageStep(ctx: Ctx) {
  const s = ctx.s;
  const battle = s.battle!;
  battle.step = 'damage';
  if (battle.nullified) return endBattle(ctx); // §5.18
  const attacker = s.cards[battle.attackerId]!;

  if (inBase(s, attacker)) {
    const t = battle.target;
    // Rayhound: "deal double the battle damage instead".
    const multiplier = getScript(attacker.cardId).battleDamageMultiplier ?? 1;
    if (t.kind === 'player') {
      dealPlayerDamage(ctx, t.seat, strikeOf(s, attacker) * multiplier); // §9.6.3.3
    } else {
      const target = s.cards[t.id];
      if (target && inBase(s, target)) {
        // §9.6.3.1: Pals hit each other simultaneously; structures don't hit back (§9.6.3.2).
        const atk = powerOf(s, attacker) * multiplier;
        const back = isPal(target) ? powerOf(s, target) * (getScript(target.cardId).battleDamageMultiplier ?? 1) : 0;
        if (atk > 0) {
          target.damage += atk;
          ctx.events.push({ type: 'battleDamage', sourceId: attacker.id, targetId: target.id, amount: atk });
        }
        if (back > 0) {
          attacker.damage += back;
          ctx.events.push({ type: 'battleDamage', sourceId: target.id, targetId: attacker.id, amount: back });
        }
      }
    }
  }
  if (checkTiming(ctx)) return;
  endBattle(ctx);
}

function endBattle(ctx: Ctx) {
  const battle = ctx.s.battle!;
  battle.step = 'endOfBattle';
  // "At the end of the battle this card attacked" (only if it's still in the base).
  const attacker = ctx.s.cards[battle.attackerId];
  if (attacker && inBase(ctx.s, attacker)) enqueue(ctx, attacker, 'onBattleEnd');
  if (checkTiming(ctx)) return;
  finishBattle(ctx);
}

function finishBattle(ctx: Ctx) {
  const s = ctx.s;
  for (const p of s.players) {
    for (const id of p.base) {
      const c = card(s, id);
      c.modifiers = c.modifiers.filter((m) => m.duration !== 'endOfBattle');
    }
  }
  s.battle = null;
  ctx.events.push({ type: 'battleEnded' });
  checkTiming(ctx);
}

// ---------------------------------------------------------------------------
// Check timing (§10.5), rule actions (§11) and automatic abilities (§10.8)
// ---------------------------------------------------------------------------

/**
 * Runs rule actions, then automatic abilities (turn player's first), until nothing is
 * left. Returns true if the game is now waiting (game over or a pending choice), in which
 * case the caller must stop advancing.
 */
function checkTiming(ctx: Ctx): boolean {
  for (;;) {
    const s = ctx.s;
    if (s.result) return true;
    if (s.pending) return true;

    if (lethalAndLosses(ctx)) continue;
    if (ctx.s.result) return true;

    for (const seat of [s.activeSeat, other(s.activeSeat)]) {
      const choice = overloadChoice(s, seat);
      if (choice) {
        s.pending = choice;
        return true;
      }
    }

    const next = s.triggers.findIndex((t) => t.controller === s.activeSeat);
    const index = next >= 0 ? next : s.triggers.length > 0 ? 0 : -1;
    if (index < 0) return false;
    const [t] = s.triggers.splice(index, 1);
    ctx.events.push({ type: 'triggered', instanceId: t!.sourceId, cardId: t!.cardId, trigger: t!.trigger });
    const { trigger, subjectId, key, grant } = t!;
    const ability = { kind: 'trigger' as const, trigger, subjectId, key, grant };
    if (startResolution(ctx, { sourceId: t!.sourceId, cardId: t!.cardId, controller: t!.controller, ability }))
      return true;
  }
}

/** §11.4 lethal damage and §11.3 losing verdict, applied together. Returns true if anything changed. */
function lethalAndLosses(ctx: Ctx): boolean {
  const s = ctx.s;
  const lethal: CardInstance[] = [];
  for (const p of s.players) {
    for (const id of p.base) {
      const c = card(s, id);
      if ((isPal(c) || isStructure(c)) && c.damage > 0 && c.damage >= powerOf(s, c)) lethal.push(c);
    }
  }
  const losers = ([0, 1] as const).filter((seat) => s.players[seat].life <= 0 || s.players[seat].deck.length === 0);

  // Battle keywords look at the cards as they were before leaving the base.
  const battle = s.battle;
  const combat =
    battle && battle.target.kind === 'card' ? { attackerId: battle.attackerId, targetId: battle.target.id } : null;
  const retaliators = combat
    ? lethal.filter((c) => (c.id === combat.attackerId || c.id === combat.targetId) && hasKeyword(s, c, 'retaliate'))
    : [];
  const attacker = combat ? s.cards[combat.attackerId] : undefined;
  const breakthrough =
    combat &&
    attacker &&
    inBase(s, attacker) &&
    hasKeyword(s, attacker, 'breakthrough') &&
    isPal(s.cards[combat.targetId]!) &&
    lethal.some((c) => c.id === combat.targetId)
      ? { seat: s.cards[combat.targetId]!.owner, amount: strikeOf(s, attacker) }
      : null;

  // "When this card's opposing combat Pal is put into the graveyard": queued from the
  // cards as they are now, before either leaves the base.
  if (combat) {
    for (const [mine, theirs] of [
      [combat.attackerId, combat.targetId],
      [combat.targetId, combat.attackerId],
    ] as const) {
      const self = s.cards[mine];
      if (self && isPal(self) && lethal.some((c) => c.id === theirs) && isPal(s.cards[theirs]!))
        enqueue(ctx, self, 'onBeatOpponent', { subjectId: theirs });
    }
  }

  for (const c of lethal) {
    leaveBase(ctx, c, 'graveyard');
    ctx.events.push({ type: 'destroyed', instanceId: c.id, cardId: c.cardId, reason: 'lethal' });
  }

  if (losers.length === 2) {
    endGame(ctx, null, 'Both players lost at the same time');
    return false;
  }
  if (losers.length === 1) {
    const loser = losers[0]!;
    const why = s.players[loser].life <= 0 ? 'ran out of life' : 'ran out of cards';
    endGame(ctx, other(loser), `${s.players[loser].name} ${why}`);
    return false;
  }

  // §12.12 Retaliate: the opposing combat Pal goes to the graveyard too.
  for (const c of retaliators) {
    const opposingId = c.id === combat!.attackerId ? combat!.targetId : combat!.attackerId;
    const opposing = s.cards[opposingId];
    if (opposing && inBase(s, opposing)) {
      leaveBase(ctx, opposing, 'graveyard');
      ctx.events.push({ type: 'destroyed', instanceId: opposing.id, cardId: opposing.cardId, reason: 'effect' });
    }
  }
  // §12.14 Breakthrough: deal the attacker's strike to the destroyed Pal's master.
  if (breakthrough) dealPlayerDamage(ctx, breakthrough.seat, breakthrough.amount);

  return lethal.length > 0 || retaliators.length > 0 || !!breakthrough;
}

function overloadChoice(s: GameState, seat: Seat) {
  const p = s.players[seat];
  const pals = p.base.filter((id) => isPal(card(s, id)));
  if (pals.length <= p.maxPals) return null;
  const latest = Math.max(...pals.map((id) => card(s, id).placedAt));
  const recent = pals.filter((id) => card(s, id).placedAt === latest);
  // §11.5.1.1–2: if the newest Pals alone exceed the limit, keep only from them; otherwise
  // they all stay and the player fills the remaining slots from the older Pals.
  return recent.length > p.maxPals
    ? { kind: 'overload' as const, seat, candidates: recent, mustKeep: [], keepCount: p.maxPals }
    : { kind: 'overload' as const, seat, candidates: pals, mustKeep: recent, keepCount: p.maxPals };
}

function chooseOverload(ctx: Ctx, pending: Extract<PendingChoice, { kind: 'overload' }>, keep: string[]) {
  const s = ctx.s;
  const unique = new Set(keep);
  if (unique.size !== pending.keepCount) fail(`Choose exactly ${pending.keepCount} Pals to keep.`);
  if (![...unique].every((id) => pending.candidates.includes(id))) fail('You can only keep Pals from the list.');
  if (!pending.mustKeep.every((id) => unique.has(id))) fail('The Pal you just played must stay.');
  s.pending = null;

  const discard = player(ctx, pending.seat).base.filter((id) => isPal(card(s, id)) && !unique.has(id));
  for (const id of discard) {
    const c = card(s, id);
    leaveBase(ctx, c, 'graveyard');
    ctx.events.push({ type: 'destroyed', instanceId: id, cardId: c.cardId, reason: 'overload' });
  }
  resume(ctx);
}

/** Continues the game after something paused it (a choice or an effect). */
function resume(ctx: Ctx) {
  if (checkTiming(ctx)) return;
  const s = ctx.s;
  const battle = s.battle;
  if (battle) {
    switch (battle.step) {
      case 'attack':
        return toBlockStep(ctx);
      case 'block':
      case 'quick':
        return toQuickStep(ctx);
      case 'damage':
        return endBattle(ctx);
      case 'endOfBattle':
        return finishBattle(ctx);
    }
  }
  switch (s.phase) {
    case 'stand':
      return runPhasesFrom(ctx, 'draw');
    case 'draw':
      return runPhasesFrom(ctx, 'soul');
    case 'soul':
      return runPhasesFrom(ctx, 'main');
    case 'end':
      return finishEndPhase(ctx);
    default:
      return; // main phase: back to the turn player's play timing
  }
}
