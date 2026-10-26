import { card, costOf, defOf, isLucky, isPal, isStructure, powerOf, strikeOf } from './cards.ts';
import { SOUL_COUNT } from './deck.ts';
import { nextRandom, shuffleInPlace } from './rng.ts';
import type {
  Action,
  ApplyResult,
  AttackTarget,
  CardInstance,
  GameEvent,
  GameState,
  PlayerState,
  Seat,
} from './types.ts';

const STARTING_LIFE = 10;
const OPENING_HAND = 5;
const SOULS_PER_TURN = 2;
const SOUL_DRAW_COST = 3;
const MAX_PALS = 5;

/** Mutable working copy for one apply() call. */
interface Ctx {
  s: GameState;
  events: GameEvent[];
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const player = (ctx: Ctx, seat: Seat): PlayerState => ctx.s.players[seat];

class RuleError extends Error {}
const fail = (msg: string): never => {
  throw new RuleError(msg);
};

// ---------------------------------------------------------------------------
// Setup (§6)
// ---------------------------------------------------------------------------

export interface PlayerSetup {
  name: string;
  /** 50 canonical card ids. Validate with validateDeck() first. */
  deck: string[];
}

export function createGame(seed: number, setups: [PlayerSetup, PlayerSetup]): { state: GameState; events: GameEvent[] } {
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
    id = 'c' + Math.floor(r * 36 ** 6).toString(36).padStart(6, '0');
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

function dispatch(ctx: Ctx, seat: Seat, action: Action) {
  const { s } = ctx;

  if (action.type === 'concede') {
    endGame(ctx, other(seat), `${player(ctx, seat).name} conceded`);
    return;
  }

  // While a choice is pending, only its owner may act, and only to answer it.
  if (s.pending) {
    if (s.pending.seat !== seat) fail('Waiting for the other player.');
    switch (s.pending.kind) {
      case 'chooseFirstPlayer':
        if (action.type !== 'chooseFirstPlayer') fail('Choose who goes first.');
        return chooseFirstPlayer(ctx, (action as Extract<Action, { type: 'chooseFirstPlayer' }>).first);
      case 'mulligan':
        if (action.type !== 'mulligan') fail('Choose whether to redraw your hand.');
        return mulligan(ctx, seat, (action as Extract<Action, { type: 'mulligan' }>).redraw);
      case 'block':
        if (action.type !== 'block') fail('Choose a blocker or decline.');
        return block(ctx, (action as Extract<Action, { type: 'block' }>).blockerId);
      case 'overload':
        if (action.type !== 'chooseOverload') fail('Choose which Pals to keep.');
        return chooseOverload(ctx, (action as Extract<Action, { type: 'chooseOverload' }>).keep);
    }
  }

  if (s.phase !== 'main') fail('You can only act during your main phase.');
  if (seat !== s.activeSeat) fail("It's not your turn.");

  switch (action.type) {
    case 'playCard':
      return playCard(ctx, seat, action.cardId);
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
  player(ctx, seat).soulDrawUsed = false;
  ctx.events.push({ type: 'turnStarted', seat, turn: s.turn });
  runPhasesFrom(ctx, 'stand');
}

/**
 * Runs the automatic phases in order. Each phase ends with a check timing; if that
 * pauses the game, resume() later continues from the phase after s.phase.
 */
function runPhasesFrom(ctx: Ctx, from: 'stand' | 'draw' | 'soul' | 'main') {
  const { s } = ctx;
  const seat = s.activeSeat;
  const p = player(ctx, seat);
  const order = ['stand', 'draw', 'soul', 'main'] as const;

  for (const phase of order.slice(order.indexOf(from))) {
    s.phase = phase;
    ctx.events.push({ type: 'phase', phase });
    switch (phase) {
      case 'stand': // §7.2: stand the base and the soul area
        for (const id of p.base) {
          card(s, id).rested = false;
          card(s, id).assignedTo = null;
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

function endTurn(ctx: Ctx) {
  if (ctx.s.battle) fail('Finish the battle first.');
  ctx.s.phase = 'end';
  ctx.events.push({ type: 'phase', phase: 'end' });
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
      c.modifiers = c.modifiers.filter((m) => m.duration === 'permanent');
    }
  }
  if (s.nightUntilTurn !== null && s.nightUntilTurn <= s.turn) s.nightUntilTurn = null;
  ctx.events.push({ type: 'turnEnded', seat });
  startTurn(ctx, other(seat));
}

// ---------------------------------------------------------------------------
// Main phase actions (§8)
// ---------------------------------------------------------------------------

function playCard(ctx: Ctx, seat: Seat, instanceId: string) {
  const { s } = ctx;
  if (s.battle) fail("You can't play cards during a battle.");
  const p = player(ctx, seat);
  const idx = p.hand.indexOf(instanceId);
  if (idx < 0) fail("That card isn't in your hand.");
  const c = card(s, instanceId);
  const def = defOf(c);
  const cost = costOf(c);
  if (cost > p.soulsStanding) fail(`Not enough souls: ${def.name} costs ${cost}.`);

  // Pay the cost by resting souls (§10.4.3).
  p.soulsStanding -= cost;
  p.soulsRested += cost;
  p.hand.splice(idx, 1);
  ctx.events.push({ type: 'cardPlayed', seat, cardId: c.cardId, instanceId, cost });

  if (def.kind === 'Event') {
    // Event effects arrive with the ability system; for now it just resolves to the graveyard.
    p.graveyard.push(instanceId);
  } else {
    deploy(ctx, c);
  }
  checkTiming(ctx);
}

function deploy(ctx: Ctx, c: CardInstance) {
  c.rested = false;
  c.damage = 0;
  c.modifiers = [];
  c.assignedTo = null;
  c.placedAt = ++ctx.s.placementCounter;
  player(ctx, c.owner).base.push(c.id);
}

function soulDraw(ctx: Ctx, seat: Seat) {
  const p = player(ctx, seat);
  if (ctx.s.battle) fail("You can't do that during a battle.");
  if (p.soulDrawUsed) fail('You can only pay souls to draw once per turn.');
  if (p.soulsStanding < SOUL_DRAW_COST) fail(`You need ${SOUL_DRAW_COST} standing souls.`);
  p.soulsStanding -= SOUL_DRAW_COST;
  p.soulsRested += SOUL_DRAW_COST;
  p.soulDrawUsed = true;
  ctx.events.push({ type: 'soulDraw', seat });
  draw(ctx, seat, 1);
  checkTiming(ctx);
}

function draw(ctx: Ctx, seat: Seat, count: number) {
  const p = player(ctx, seat);
  const n = Math.min(count, p.deck.length); // §1.3.2: draw what you can
  p.hand.push(...p.deck.splice(0, n));
  if (n > 0) ctx.events.push({ type: 'drew', seat, count: n });
}

// ---------------------------------------------------------------------------
// Battle (§9)
// ---------------------------------------------------------------------------

export function canAttack(s: GameState, seat: Seat, attackerId: string): boolean {
  const c = s.cards[attackerId];
  return !!c && c.owner === seat && s.players[seat].base.includes(attackerId) && isPal(c) && !c.rested;
}

/** §9.2.3: the opponent, or one of their rested Pals or structures. */
export function attackTargets(s: GameState, seat: Seat): AttackTarget[] {
  const opp = other(seat);
  const targets: AttackTarget[] = [{ kind: 'player', seat: opp }];
  for (const id of s.players[opp].base) {
    const c = card(s, id);
    if (c.rested && (isPal(c) || isStructure(c))) targets.push({ kind: 'card', id });
  }
  return targets;
}

const sameTarget = (a: AttackTarget, b: AttackTarget) =>
  a.kind === 'player' ? b.kind === 'player' && a.seat === b.seat : b.kind === 'card' && a.id === b.id;

function declareAttack(ctx: Ctx, seat: Seat, attackerId: string, target: AttackTarget) {
  const { s } = ctx;
  if (s.battle) fail('A battle is already in progress.');
  if (!canAttack(s, seat, attackerId)) fail("That Pal can't attack.");
  if (!attackTargets(s, seat).some((t) => sameTarget(t, target))) fail("That isn't a valid attack target.");

  // §9.3.2: rest the attacker.
  card(s, attackerId).rested = true;
  s.battle = { attackerId, target, step: 'attack', blockerId: null };
  ctx.events.push({ type: 'attackDeclared', attackerId, target });
  if (checkTiming(ctx)) return;
  toBlockStep(ctx);
}

function toBlockStep(ctx: Ctx) {
  const { s } = ctx;
  const battle = s.battle!;
  battle.step = 'block';
  const defender = other(s.activeSeat);
  // §9.4.2: a standing Pal that isn't already the attack target.
  const options = s.players[defender].base.filter((id) => {
    const c = card(s, id);
    return isPal(c) && !c.rested && !(battle.target.kind === 'card' && battle.target.id === id);
  });
  if (options.length > 0) {
    s.pending = { kind: 'block', seat: defender, options };
  } else {
    afterBlock(ctx);
  }
}

function block(ctx: Ctx, blockerId: string | null) {
  const { s } = ctx;
  const pending = s.pending;
  if (pending?.kind !== 'block') fail('Nothing to block.');
  const options = (pending as Extract<typeof pending, { kind: 'block' }>).options;
  s.pending = null;
  if (blockerId !== null) {
    if (!options.includes(blockerId)) fail("That Pal can't block.");
    card(s, blockerId).rested = true;
    s.battle!.target = { kind: 'card', id: blockerId };
    s.battle!.blockerId = blockerId;
  }
  ctx.events.push({ type: 'blocked', blockerId });
  afterBlock(ctx);
}

function afterBlock(ctx: Ctx) {
  if (checkTiming(ctx)) return;
  // §9.5 quick step: the defender may play Quick cards. None are scripted yet, so it passes.
  ctx.s.battle!.step = 'quick';
  if (checkTiming(ctx)) return;
  damageStep(ctx);
}

function damageStep(ctx: Ctx) {
  const { s } = ctx;
  const battle = s.battle!;
  battle.step = 'damage';
  const attacker = s.cards[battle.attackerId];
  const attackerInBase = attacker && s.players[attacker.owner].base.includes(attacker.id);

  if (attackerInBase) {
    const t = battle.target;
    if (t.kind === 'player') {
      // §9.6.3.3: deal damage equal to strike.
      const strike = strikeOf(attacker);
      if (strike > 0) dealPlayerDamage(ctx, t.seat, strike);
    } else {
      const target = s.cards[t.id];
      if (target && s.players[target.owner].base.includes(target.id)) {
        // §9.6.3.1: Pals hit each other simultaneously; structures don't hit back (§9.6.3.2).
        const atk = powerOf(attacker);
        const back = isPal(target) ? powerOf(target) : 0;
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
  const { s } = ctx;
  s.battle!.step = 'endOfBattle';
  if (checkTiming(ctx)) return;
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
// Player damage (§11.2, interrupt rule action)
// ---------------------------------------------------------------------------

function dealPlayerDamage(ctx: Ctx, seat: Seat, amount: number) {
  const p = player(ctx, seat);
  p.damageTaken += amount;
  ctx.events.push({ type: 'playerDamage', seat, amount });

  let milled = 0;
  for (;;) {
    if (p.deck.length === 0) {
      loseLife(ctx, seat, p.damageTaken);
      break;
    }
    const id = p.deck.shift()!;
    p.graveyard.push(id);
    milled++;
    const c = card(ctx.s, id);
    const lucky = isLucky(c);
    ctx.events.push({ type: 'milled', seat, instanceId: id, cardId: c.cardId, lucky });
    if (lucky) {
      ctx.events.push({ type: 'damageCancelled', seat, luckyId: id });
      break;
    }
    if (milled >= p.damageTaken || p.deck.length === 0) {
      loseLife(ctx, seat, p.damageTaken);
      break;
    }
  }
  p.damageTaken = 0;
}

function loseLife(ctx: Ctx, seat: Seat, amount: number) {
  const p = player(ctx, seat);
  p.life -= amount;
  ctx.events.push({ type: 'lifeLost', seat, amount, life: p.life });
}

// ---------------------------------------------------------------------------
// Check timing and check-type rule actions (§10.5, §11)
// ---------------------------------------------------------------------------

/**
 * Runs rule actions until none apply. Returns true if the game is now waiting
 * (game over, or a choice is pending), so the caller must stop advancing.
 */
function checkTiming(ctx: Ctx): boolean {
  const { s } = ctx;
  for (;;) {
    if (s.result) return true;
    let changed = false;

    // §11.4 lethal damage, §11.3 losing verdict: simultaneous.
    const lethal: CardInstance[] = [];
    for (const p of s.players) {
      for (const id of p.base) {
        const c = card(s, id);
        if ((isPal(c) || isStructure(c)) && c.damage > 0 && c.damage >= powerOf(c)) lethal.push(c);
      }
    }
    const losers = ([0, 1] as const).filter((seat) => s.players[seat].life <= 0 || s.players[seat].deck.length === 0);

    for (const c of lethal) {
      moveToGraveyard(ctx, c);
      ctx.events.push({ type: 'destroyed', instanceId: c.id, cardId: c.cardId, reason: 'lethal' });
      changed = true;
    }
    if (losers.length === 2) return endGame(ctx, null, 'Both players lost at the same time');
    if (losers.length === 1) {
      const loser = losers[0]!;
      const why = s.players[loser].life <= 0 ? 'ran out of life' : 'ran out of cards';
      return endGame(ctx, other(loser), `${s.players[loser].name} ${why}`);
    }

    // §11.5 overloaded Pals: the turn player resolves first.
    if (!s.pending) {
      for (const seat of [s.activeSeat, other(s.activeSeat)]) {
        const choice = overloadChoice(s, seat);
        if (choice) {
          s.pending = choice;
          return true;
        }
      }
    }

    if (!changed) return s.pending !== null;
  }
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

function chooseOverload(ctx: Ctx, keep: string[]) {
  const { s } = ctx;
  const pending = s.pending as Extract<GameState['pending'], { kind: 'overload' }>;
  const unique = new Set(keep);
  if (unique.size !== pending.keepCount) fail(`Choose exactly ${pending.keepCount} Pals to keep.`);
  if (![...unique].every((id) => pending.candidates.includes(id))) fail('You can only keep Pals from the list.');
  if (!pending.mustKeep.every((id) => unique.has(id))) fail('The Pal you just played must stay.');
  s.pending = null;

  const p = player(ctx, pending.seat);
  const discard = p.base.filter((id) => isPal(card(s, id)) && !unique.has(id));
  for (const id of discard) {
    const c = card(s, id);
    moveToGraveyard(ctx, c);
    ctx.events.push({ type: 'destroyed', instanceId: id, cardId: c.cardId, reason: 'overload' });
  }
  resume(ctx);
}

function moveToGraveyard(ctx: Ctx, c: CardInstance) {
  const p = player(ctx, c.owner);
  p.base = p.base.filter((id) => id !== c.id);
  // §4.1.4: a card leaving the base becomes a new card.
  c.rested = false;
  c.damage = 0;
  c.modifiers = [];
  c.assignedTo = null;
  p.graveyard.push(c.id);
}

/** Continues the game after a pending choice that interrupted a check timing. */
function resume(ctx: Ctx) {
  const { s } = ctx;
  if (checkTiming(ctx)) return;
  const battle = s.battle;
  if (!battle) {
    const next = { setup: null, stand: 'draw', draw: 'soul', soul: 'main', main: null, end: null } as const;
    const phase = s.phase;
    if (phase === 'end') return finishEndPhase(ctx);
    const after = next[phase];
    if (after) runPhasesFrom(ctx, after);
    return; // otherwise back to the main phase play timing
  }
  switch (battle.step) {
    case 'attack':
      return toBlockStep(ctx);
    case 'block':
    case 'quick':
      return damageStep(ctx);
    case 'damage':
      return endBattle(ctx);
    case 'endOfBattle':
      s.battle = null;
      ctx.events.push({ type: 'battleEnded' });
      checkTiming(ctx);
  }
}

function endGame(ctx: Ctx, winner: Seat | null, reason: string): true {
  ctx.s.result = { winner, reason };
  ctx.s.pending = null;
  ctx.events.push({ type: 'gameOver', winner, reason });
  return true;
}
