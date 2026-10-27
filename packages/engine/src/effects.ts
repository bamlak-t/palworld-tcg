/**
 * Resolving card abilities.
 *
 * Effects are plain functions. When one needs a player's choice that hasn't been made
 * yet, it throws Suspend: the state is rolled back to just before the effect started and
 * the choice becomes pending. Once answered, the effect is replayed from the start with
 * the answers so far. Effects are deterministic, so the replay reaches the same point.
 */
import { defOf, isPal, isStructure } from './cards.ts';
import {
  allActs,
  getScript,
  grantedScript,
  type ActAbility,
  type CardScript,
  type CostSpec,
  type EffectApi,
} from './abilities.ts';
import {
  assign,
  butcher,
  card,
  deploy,
  draw,
  fail,
  gainLife,
  gainResource,
  inBase,
  leaveBase,
  other,
  player,
  removeFromZones,
  rest,
  stand,
  type Ctx,
} from './ops.ts';
import { shuffleInPlace } from './rng.ts';
import {
  canBeChosenBy,
  canPutInBase,
  costToPlay,
  damageBonus,
  hasKeyword,
  hasMainName,
  isNight,
  namesOf,
  powerOf,
  strikeOf,
} from './stats.ts';
import type {
  CardInstance,
  ChoiceOption,
  CostChoice,
  Duration,
  GameState,
  Modifier,
  PendingChoice,
  Resolution,
  Seat,
} from './types.ts';

class Suspend {
  constructor(readonly pending: PendingChoice) {}
}

/** Starts resolving an ability. Returns true if it paused for a choice. */
export function startResolution(ctx: Ctx, r: Omit<Resolution, 'answers'>): boolean {
  ctx.s.resolving = { ...r, answers: [] };
  return runResolution(ctx);
}

/** (Re)runs the current resolution with the answers recorded so far. Returns true if paused. */
export function runResolution(ctx: Ctx): boolean {
  const r = ctx.s.resolving!;
  const snapshot = structuredClone(ctx.s);
  const eventCount = ctx.events.length;
  try {
    runAbility(ctx, r);
  } catch (e) {
    if (!(e instanceof Suspend)) throw e;
    ctx.s = snapshot;
    ctx.events.length = eventCount;
    ctx.s.pending = e.pending;
    return true;
  }
  ctx.s.resolving = null;
  if (r.ability.kind === 'event') {
    // §10.6.2.4.2: after resolving, the event goes to its owner's graveyard (unless the
    // effect moved it, e.g. "return this card to hand").
    const c = card(ctx.s, r.sourceId);
    if (ctx.s.resolutionZone.includes(c.id)) {
      removeFromZones(ctx, c);
      player(ctx, c.owner).graveyard.push(c.id);
    }
  }
  return false;
}

function runAbility(ctx: Ctx, r: Resolution) {
  const api = makeApi(ctx, r);
  const ability = r.ability;
  if (ability.kind === 'event') return getScript(r.cardId).event?.(api);
  const script: CardScript = ability.grant ? grantedScript(ability.grant) : getScript(r.cardId);
  if (ability.kind === 'act') {
    const own = ability.grant ? script.acts : getScript(r.cardId).acts;
    return own?.[ability.index]?.effect(api);
  }

  switch (ability.trigger) {
    case 'endOfTurn': {
      // §12.9 Vigilance: at the end of your turn, stand this card.
      const self = card(ctx.s, r.sourceId);
      if (!ability.grant && inBase(ctx.s, self) && hasKeyword(ctx.s, self, 'vigilance')) stand(ctx, self);
      return script.endOfTurn?.(api);
    }
    case 'watch':
      return script.watchers?.[Number(ability.key)]?.effect(api);
    case 'delayed':
      return script.delayed?.[ability.key!]?.(api);
    default:
      return script[ability.trigger]?.(api);
  }
}

/** Turns a Duration into what's stored on a modifier. */
function stored(ctx: Ctx, me: Seat, duration: Duration): Pick<Modifier, 'duration' | 'untilTurn'> {
  if (duration !== 'untilOpponentsNextTurnEnd') return { duration };
  // The opponent's next turn is the next turn if it's ours, otherwise the one after.
  return { duration: 'untilTurn', untilTurn: ctx.s.turn + (ctx.s.activeSeat === me ? 1 : 2) };
}

function makeApi(ctx: Ctx, r: Resolution): EffectApi {
  let choiceIndex = 0;
  const s = () => ctx.s;
  const self = () => card(ctx.s, r.sourceId);
  const me = r.controller;
  const opp = other(me);
  const base = (seat: Seat) => s().players[seat].base.map((id) => card(s(), id));
  const zone = (seat: Seat, z: 'hand' | 'graveyard' | 'deck') => s().players[seat][z].map((id) => card(s(), id));
  const sourceName = defOf(r.cardId).name;
  const subjectId = r.ability.kind === 'trigger' ? r.ability.subjectId : undefined;

  const choose: EffectApi['choose'] = ({ prompt, options, min, max, chooser }) => {
    const opts: ChoiceOption[] = options.map((o) => ('owner' in o ? { id: o.id, cardId: o.cardId } : o));
    const lo = Math.min(min, opts.length);
    const hi = Math.min(max, opts.length);
    if (hi === 0) return [];
    if (lo === hi && opts.length === lo) return opts.map((o) => o.id); // no real choice
    const i = choiceIndex++;
    const answer = r.answers[i];
    if (answer === undefined) {
      throw new Suspend({
        kind: 'effectChoice',
        seat: chooser ?? me,
        prompt,
        sourceCardId: r.cardId,
        options: opts,
        min: lo,
        max: hi,
      });
    }
    const valid =
      new Set(answer).size === answer.length &&
      answer.length >= lo &&
      answer.length <= hi &&
      answer.every((id) => opts.some((o) => o.id === id));
    if (!valid) fail(`Choose ${lo === hi ? lo : `${lo}–${hi}`} of the options.`);
    return answer;
  };

  // Cards in a base can be protected from being chosen; other zones can't.
  const targetable = (cards: CardInstance[]) => cards.filter((c) => !inBase(s(), c) || canBeChosenBy(s(), c, self()));

  const addModifier = (c: CardInstance, m: Omit<Modifier, 'source' | 'duration' | 'untilTurn'>, duration: Duration) => {
    if (!inBase(s(), c)) return;
    c.modifiers.push({ ...m, source: sourceName, ...stored(ctx, me, duration) });
    ctx.events.push({
      type: 'modified',
      instanceId: c.id,
      stat: m.stat,
      amount: m.amount,
      keyword: m.keyword,
      source: sourceName,
    });
  };

  const api: EffectApi = {
    get s() {
      return ctx.s;
    },
    get self() {
      return self();
    },
    me,
    opp,
    x: r.x ?? 0,
    get subject() {
      return subjectId ? s().cards[subjectId] : undefined;
    },

    pals: (filter) => [...base(me), ...base(opp)].filter((c) => isPal(c) && (!filter || filter(c))),
    palsOf: (seat) => base(seat).filter(isPal),
    structuresOf: (seat) => base(seat).filter(isStructure),
    gearsOf: (seat) => base(seat).filter((c) => defOf(c).kind === 'Gear'),
    baseOf: (seat) => base(seat),
    hand: (seat) => zone(seat, 'hand'),
    graveyard: (seat) => zone(seat, 'graveyard'),
    deck: (seat) => zone(seat, 'deck'),
    lookTop: (n, seat = me) => zone(seat, 'deck').slice(0, Math.max(0, n)),
    power: (c) => powerOf(s(), c),
    strike: (c) => strikeOf(s(), c),
    cost: (c) => costToPlay(s(), c.owner, c),
    def: (c) => defOf(c),
    hasKeyword: (c, kw) => hasKeyword(s(), c, kw),
    names: (c) => namesOf(c),
    isMainName: (c, name) => hasMainName(c, name),
    isNight: () => isNight(s()),
    souls: (seat = me) => s().players[seat].soulsStanding + s().players[seat].soulsRested,
    targetable,
    canDeploy: (c) => canPutInBase(s(), c),
    remembered: (key) => (s().turnMemory ?? []).includes(`${r.sourceId}:${key}`),
    remember(key) {
      (s().turnMemory ??= []).push(`${r.sourceId}:${key}`);
    },
    assignedThisTurn: () => (s().assignedThisTurn ?? []).map((id) => card(s(), id)).filter((c) => inBase(s(), c)),

    choose,
    chooseOne(prompt, cards, chooser) {
      const [id] = choose({ prompt, options: targetable(cards), min: 1, max: 1, chooser });
      return id ? card(s(), id) : undefined;
    },
    chooseUpTo(n, prompt, cards, chooser) {
      return choose({ prompt, options: targetable(cards), min: 0, max: n, chooser }).map((id) => card(s(), id));
    },
    confirm(prompt, chooser) {
      const [a] = choose({
        prompt,
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        min: 1,
        max: 1,
        chooser,
      });
      return a === 'yes';
    },
    chooseMode(prompt, labels, disabled = []) {
      const options = labels.flatMap((label, i) => (disabled[i] ? [] : [{ id: `m${i}`, label }]));
      if (options.length === 0) return -1;
      const [a] = choose({ prompt, options, min: 1, max: 1 });
      return Number(a!.slice(1));
    },

    damage(c, amount) {
      if (amount <= 0 || !inBase(s(), c)) return;
      const total = amount + damageBonus(s(), self(), c);
      c.damage += total;
      ctx.events.push({ type: 'damageDealt', sourceId: r.sourceId, targetId: c.id, amount: total });
    },
    modify(c, stat, amount, duration = 'endOfTurn') {
      addModifier(c, { stat, amount }, duration);
    },
    grant(c, keyword, duration = 'endOfTurn') {
      addModifier(c, { stat: 'keyword', amount: 0, keyword }, duration);
    },
    grantSkill(c, key, duration = 'endOfTurn') {
      addModifier(c, { stat: 'skill', amount: 0, grant: { fromCardId: r.cardId, key } }, duration);
    },
    addFlag(c, flag, duration = 'endOfTurn') {
      addModifier(c, { stat: 'flag', amount: 0, flag }, duration);
    },
    addName(c, name, duration = 'endOfTurn') {
      addModifier(c, { stat: 'name', amount: 0, name }, duration);
    },
    destroy(c) {
      if (!inBase(s(), c)) return;
      leaveBase(ctx, c, 'graveyard');
      ctx.events.push({ type: 'destroyed', instanceId: c.id, cardId: c.cardId, reason: 'effect' });
    },
    butcher: (c) => butcher(ctx, c),
    rest: (c) => rest(ctx, c),
    stand: (c) => stand(ctx, c),
    skipNextStand(c) {
      c.skipNextStand = true;
    },
    freeze(c) {
      if (inBase(s(), c)) c.frozenBy = r.sourceId;
    },
    draw: (n, seat = me) => draw(ctx, seat, n),
    gain: (resource, n, seat = me) => gainResource(ctx, seat, resource, n),
    loseResources(seat, upTo, chooser = me) {
      const p = player(ctx, seat);
      const total = Math.min(upTo, p.material + p.ingredient);
      if (total <= 0) return;
      // Offer every split that takes the most possible.
      const options: ChoiceOption[] = [];
      for (let m = Math.max(0, total - p.ingredient); m <= Math.min(total, p.material); m++) {
        options.push({ id: `${m}`, label: `${m} Material + ${total - m} Ingredient` });
      }
      const [pick] = choose({
        prompt: `Choose ${total} Material and/or Ingredient to remove.`,
        options,
        min: 1,
        max: 1,
        chooser,
      });
      const m = Number(pick);
      for (const [resource, amount] of [
        ['material', m],
        ['ingredient', total - m],
      ] as const) {
        if (amount <= 0) continue;
        p[resource] -= amount;
        ctx.events.push({ type: 'resourceLost', seat, resource, amount });
      }
    },
    gainLife: (n, seat = me) => gainLife(ctx, seat, n),
    standSouls(n, seat = me) {
      const p = player(ctx, seat);
      const k = Math.min(n, p.soulsRested);
      if (k <= 0) return;
      p.soulsRested -= k;
      p.soulsStanding += k;
      ctx.events.push({ type: 'soulsStood', seat, count: k });
    },
    addSouls(n, { rested = false, seat = me } = {}) {
      const p = player(ctx, seat);
      const k = Math.min(n, p.soulDeck);
      if (k <= 0) return;
      p.soulDeck -= k;
      if (rested) p.soulsRested += k;
      else p.soulsStanding += k;
      ctx.events.push({ type: 'soulsAdded', seat, count: k });
    },
    deploy(c, opts) {
      if (canPutInBase(s(), c)) deploy(ctx, c, opts);
    },
    putOnTopOfDeck(c) {
      if (inBase(s(), c)) leaveBase(ctx, c, 'deckTop');
      else {
        removeFromZones(ctx, c);
        player(ctx, c.owner).deck.unshift(c.id);
      }
      ctx.events.push({ type: 'putOnDeck', seat: c.owner });
    },
    putOnBottomOfDeck(c) {
      if (inBase(s(), c)) leaveBase(ctx, c, 'deckTop');
      removeFromZones(ctx, c);
      player(ctx, c.owner).deck.push(c.id);
      ctx.events.push({ type: 'putOnDeck', seat: c.owner });
    },
    addToHand(c) {
      if (inBase(s(), c)) leaveBase(ctx, c, 'hand');
      else {
        removeFromZones(ctx, c);
        player(ctx, c.owner).hand.push(c.id);
      }
      ctx.events.push({ type: 'returnedToHand', seat: c.owner, instanceId: c.id, cardId: c.cardId });
    },
    discard(c) {
      removeFromZones(ctx, c);
      player(ctx, c.owner).graveyard.push(c.id);
      ctx.events.push({ type: 'discarded', seat: c.owner, instanceId: c.id, cardId: c.cardId });
    },
    exile(c) {
      if (inBase(s(), c)) leaveBase(ctx, c, 'exile');
      else {
        removeFromZones(ctx, c);
        player(ctx, c.owner).exile.push(c.id);
      }
      c.exiledBy = r.sourceId;
      ctx.events.push({ type: 'exiled', instanceId: c.id, cardId: c.cardId });
    },
    millTop(n, seat = me) {
      const p = player(ctx, seat);
      const ids = p.deck.splice(0, Math.max(0, n));
      p.graveyard.push(...ids);
      for (const id of ids) {
        ctx.events.push({ type: 'milled', seat, instanceId: id, cardId: card(s(), id).cardId, lucky: false });
      }
      return ids.map((id) => card(s(), id));
    },
    shuffleDeck(seat = me) {
      ctx.s.rngState = shuffleInPlace(player(ctx, seat).deck, ctx.s.rngState);
      ctx.events.push({ type: 'shuffled', seat });
    },
    revealTop(seat = me) {
      const id = s().players[seat].deck[0];
      if (!id) return undefined;
      const c = card(s(), id);
      ctx.events.push({ type: 'revealed', seat, instanceId: id, cardId: c.cardId });
      return c;
    },
    reveal(cards) {
      for (const c of cards) ctx.events.push({ type: 'revealed', seat: c.owner, instanceId: c.id, cardId: c.cardId });
    },
    putUnder(structure, c) {
      removeFromZones(ctx, c);
      (structure.under ??= []).push(c.id);
      ctx.events.push({ type: 'putUnder', seat: structure.owner, structureId: structure.id });
    },
    underneath: (structure) => (structure.under ?? []).map((id) => card(s(), id)),
    setNightUntilEndOfOpponentsNextTurn() {
      const untilTurn = stored(ctx, me, 'untilOpponentsNextTurnEnd').untilTurn!;
      s().nightUntilTurn = Math.max(s().nightUntilTurn ?? 0, untilTurn);
      ctx.events.push({ type: 'nightStarted', untilTurn });
    },
    nullifyAttack() {
      const battle = s().battle;
      if (!battle || battle.nullified) return;
      battle.nullified = true;
      ctx.events.push({ type: 'attackNullified', byCardId: r.cardId });
    },
    setTurnFlag(flag, seat = me) {
      const flags = (s().turnFlags ??= { mustAttack: [], noAssign: [] });
      if (!flags[flag].includes(seat)) flags[flag].push(seat);
    },
    atEndOfTurn(key) {
      (s().delayed ??= []).push({ sourceId: r.sourceId, cardId: r.cardId, controller: me, key, atTurn: s().turn });
    },
    declareName(name) {
      ctx.events.push({ type: 'declaredName', seat: me, name });
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Activated ability costs (§10.4)
// ---------------------------------------------------------------------------

const assignable = (s: GameState, seat: Seat, self: CardInstance) =>
  s.turnFlags?.noAssign.includes(seat)
    ? []
    : s.players[seat].base.filter((id) => id !== self.id && isPal(s.cards[id]!) && !s.cards[id]!.rested);

const discardable = (s: GameState, seat: Seat, self: CardInstance, spec: CostSpec) =>
  s.players[seat].hand.filter((id) => {
    if (id === self.id) return false;
    const filter = spec.discardFromHand?.filter;
    return !filter || filter(defOf(s.cards[id]!));
  });

const butcherable = (s: GameState, seat: Seat, self: CardInstance, spec: CostSpec) =>
  s.players[seat].base.filter((id) => isPal(s.cards[id]!) && (spec.butcher !== 'other' || id !== self.id));

const exilable = (s: GameState, seat: Seat, spec: CostSpec) =>
  s.players[seat].graveyard.filter(
    (id) => !spec.exileFromGraveyard?.filter || spec.exileFromGraveyard.filter(defOf(s.cards[id]!)),
  );

/**
 * Ways the seat can pay this ability's cost right now, for listing legal actions. Costs
 * with a free-sized part ("X") list a few representative choices; isValidCostChoice
 * accepts any valid one.
 */
export function costChoices(s: GameState, seat: Seat, self: CardInstance, ability: ActAbility): CostChoice[] {
  const p = s.players[seat];
  const out: CostChoice[] = [];
  ability.costs.forEach((spec, option) => {
    if (!basicPayable(s, seat, self, spec)) return;
    const pals = assignable(s, seat, self);
    const assignOptions: (string[] | undefined)[] =
      spec.assign === 'X'
        ? pals.map((_, k) => pals.slice(0, k + 1))
        : typeof spec.assign === 'number' || spec.assign === true
          ? combinations(pals, spec.assign === true ? 1 : spec.assign)
          : [undefined];
    const handIds = discardable(s, seat, self, spec);
    const discardOptions: (string[] | undefined)[] = !spec.discardFromHand
      ? [undefined]
      : spec.discardFromHand.count === 'X'
        ? handIds.map((_, k) => handIds.slice(0, k + 1))
        : combinations(handIds, spec.discardFromHand.count);
    const butcherOptions: (string | undefined)[] = spec.butcher ? butcherable(s, seat, self, spec) : [undefined];
    const exileOptions: (string[] | undefined)[] = spec.exileFromGraveyard
      ? combinations(exilable(s, seat, spec), spec.exileFromGraveyard.count).slice(0, 10)
      : [undefined];
    const xMax = spec.xMaterial ? p.material : spec.xIngredient ? p.ingredient : 0;
    const xMin = spec.xMaterial?.min ?? spec.xIngredient?.min ?? 0;
    const xOptions: (number | undefined)[] =
      spec.xMaterial || spec.xIngredient
        ? Array.from({ length: Math.max(0, xMax - xMin + 1) }, (_, i) => xMin + i)
        : [undefined];

    for (const assignIds of assignOptions)
      for (const discardIds of discardOptions)
        for (const butcherId of butcherOptions)
          for (const exileIds of exileOptions)
            for (const x of xOptions) {
              const choice: CostChoice = { option };
              if (assignIds?.length === 1 && spec.assign === true) choice.assignId = assignIds[0];
              else if (assignIds) choice.assignIds = assignIds;
              if (discardIds) choice.discardIds = discardIds;
              if (butcherId) choice.butcherId = butcherId;
              if (exileIds) choice.exileIds = exileIds;
              if (x !== undefined) choice.x = x;
              out.push(choice);
            }
  });
  return out.slice(0, 60);
}

function basicPayable(s: GameState, seat: Seat, self: CardInstance, spec: CostSpec) {
  const p = s.players[seat];
  if ((spec.souls ?? 0) > p.soulsStanding) return false;
  if ((spec.material ?? 0) > p.material) return false;
  if ((spec.ingredient ?? 0) > p.ingredient) return false;
  if ((spec.millTop ?? 0) > p.deck.length) return false;
  if (spec.restSelf && (self.rested || !p.base.includes(self.id))) return false;
  if (spec.discardSelf && !p.hand.includes(self.id)) return false;
  return true;
}

const assignIdsOf = (c: CostChoice) => c.assignIds ?? (c.assignId ? [c.assignId] : []);

/** Checks a submitted cost choice directly against the rules of the cost. */
export function isValidCostChoice(
  s: GameState,
  seat: Seat,
  self: CardInstance,
  ability: ActAbility,
  choice: CostChoice,
) {
  const spec = ability.costs[choice.option ?? 0];
  if (!spec || !basicPayable(s, seat, self, spec)) return false;
  const p = s.players[seat];
  const distinct = (ids: string[]) => new Set(ids).size === ids.length;

  const assignIds = assignIdsOf(choice);
  const pals = assignable(s, seat, self);
  const wantAssign =
    spec.assign === true ? 1 : typeof spec.assign === 'number' ? spec.assign : spec.assign === 'X' ? -1 : 0;
  if (wantAssign === 0 && assignIds.length > 0) return false;
  if (wantAssign > 0 && assignIds.length !== wantAssign) return false;
  if (wantAssign === -1 && assignIds.length < 1) return false;
  if (!distinct(assignIds) || !assignIds.every((id) => pals.includes(id))) return false;

  const discards = choice.discardIds ?? [];
  if (!spec.discardFromHand && discards.length > 0) return false;
  if (spec.discardFromHand) {
    const n = spec.discardFromHand.count;
    if (n === 'X' ? discards.length < 1 : discards.length !== n) return false;
    const allowed = discardable(s, seat, self, spec);
    if (!distinct(discards) || !discards.every((id) => allowed.includes(id))) return false;
  }

  if (
    spec.butcher ? !choice.butcherId || !butcherable(s, seat, self, spec).includes(choice.butcherId) : choice.butcherId
  )
    return false;

  const exiles = choice.exileIds ?? [];
  if (spec.exileFromGraveyard) {
    if (exiles.length !== spec.exileFromGraveyard.count || !distinct(exiles)) return false;
    if (!exiles.every((id) => exilable(s, seat, spec).includes(id))) return false;
  } else if (exiles.length > 0) return false;

  if (spec.xMaterial || spec.xIngredient) {
    const x = choice.x;
    const max = spec.xMaterial ? p.material : p.ingredient;
    if (x === undefined || !Number.isInteger(x) || x < (spec.xMaterial ?? spec.xIngredient)!.min || x > max)
      return false;
  } else if (choice.x !== undefined) return false;
  return true;
}

/** Pays the cost. Returns how much Material was consumed (for "consumes Material" watchers). */
export function payCost(ctx: Ctx, seat: Seat, self: CardInstance, spec: CostSpec, choice: CostChoice): number {
  const p = player(ctx, seat);
  if (spec.souls) {
    p.soulsStanding -= spec.souls;
    p.soulsRested += spec.souls;
  }
  const spend = {
    material: (spec.material ?? 0) + (spec.xMaterial ? (choice.x ?? 0) : 0),
    ingredient: (spec.ingredient ?? 0) + (spec.xIngredient ? (choice.x ?? 0) : 0),
  };
  for (const resource of ['material', 'ingredient'] as const) {
    if (spend[resource] > 0) {
      p[resource] -= spend[resource];
      ctx.events.push({ type: 'resourceSpent', seat, resource, amount: spend[resource] });
    }
  }
  if (spec.restSelf) rest(ctx, self);
  for (const id of assignIdsOf(choice)) assign(ctx, card(ctx.s, id), self);
  const discards = [...(spec.discardSelf ? [self.id] : []), ...(choice.discardIds ?? [])];
  for (const id of discards) {
    const c = card(ctx.s, id);
    removeFromZones(ctx, c);
    p.graveyard.push(id);
    ctx.events.push({ type: 'discarded', seat, instanceId: id, cardId: c.cardId });
  }
  for (let i = 0; i < (spec.millTop ?? 0); i++) {
    const id = p.deck.shift()!;
    p.graveyard.push(id);
    ctx.events.push({ type: 'milled', seat, instanceId: id, cardId: card(ctx.s, id).cardId, lucky: false });
  }
  if (choice.butcherId) butcher(ctx, card(ctx.s, choice.butcherId));
  for (const id of choice.exileIds ?? []) {
    const c = card(ctx.s, id);
    removeFromZones(ctx, c);
    p.exile.push(id);
    ctx.events.push({ type: 'exiled', instanceId: id, cardId: c.cardId });
  }
  return spend.material;
}

/** Abilities a card can activate (own + granted), with their combined index. */
export const actsOf = (c: CardInstance) => allActs(c);

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first!, ...c]), ...combinations(rest, k)];
}
