/**
 * Resolving card abilities.
 *
 * Effects are plain functions. When one needs a player's choice that hasn't been made
 * yet, it throws Suspend: the state is rolled back to just before the effect started and
 * the choice becomes pending. Once answered, the effect is replayed from the start with
 * the answers so far. Effects are deterministic, so the replay reaches the same point.
 */
import { defOf, isPal, isStructure } from './cards.ts';
import { getScript, type ActAbility, type CostSpec, type EffectApi } from './abilities.ts';
import {
  assign,
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
import { hasKeyword, isNight, powerOf, strikeOf } from './stats.ts';
import type { CardInstance, ChoiceOption, CostChoice, GameState, PendingChoice, Resolution, Seat } from './types.ts';

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
    // §10.6.2.4.2: after resolving, the event goes to its owner's graveyard.
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
  const script = getScript(r.cardId);
  const ability = r.ability;
  if (ability.kind === 'event') return script.event?.(api);
  if (ability.kind === 'act') return script.acts?.[ability.index]?.effect(api);

  if (ability.trigger === 'endOfTurn') {
    // §12.9 Vigilance: at the end of your turn, stand this card.
    const self = card(ctx.s, r.sourceId);
    if (inBase(ctx.s, self) && hasKeyword(ctx.s, self, 'vigilance')) stand(ctx, self);
  }
  script[ability.trigger]?.(api);
}

function makeApi(ctx: Ctx, r: Resolution): EffectApi {
  let choiceIndex = 0;
  const s = () => ctx.s;
  const self = () => card(ctx.s, r.sourceId);
  const me = r.controller;
  const opp = other(me);
  const base = (seat: Seat) => s().players[seat].base.map((id) => card(s(), id));
  const sourceName = defOf(r.cardId).name;

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

  const api: EffectApi = {
    get s() {
      return ctx.s;
    },
    get self() {
      return self();
    },
    me,
    opp,

    pals: (filter) => [...base(me), ...base(opp)].filter((c) => isPal(c) && (!filter || filter(c))),
    palsOf: (seat) => base(seat).filter(isPal),
    structuresOf: (seat) => base(seat).filter(isStructure),
    hand: (seat) => s().players[seat].hand.map((id) => card(s(), id)),
    graveyard: (seat) => s().players[seat].graveyard.map((id) => card(s(), id)),
    power: (c) => powerOf(s(), c),
    strike: (c) => strikeOf(s(), c),
    def: (c) => defOf(c),
    isNight: () => isNight(s()),

    choose,
    chooseOne(prompt, cards, chooser) {
      const [id] = choose({ prompt, options: cards, min: 1, max: 1, chooser });
      return id ? card(s(), id) : undefined;
    },
    chooseUpTo(n, prompt, cards, chooser) {
      return choose({ prompt, options: cards, min: 0, max: n, chooser }).map((id) => card(s(), id));
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

    damage(c, amount) {
      if (amount <= 0 || !inBase(s(), c)) return;
      c.damage += amount;
      ctx.events.push({ type: 'damageDealt', sourceId: r.sourceId, targetId: c.id, amount });
    },
    modify(c, stat, amount, duration = 'endOfTurn') {
      if (!inBase(s(), c)) return;
      c.modifiers.push({ stat, amount, source: sourceName, duration });
      ctx.events.push({ type: 'modified', instanceId: c.id, stat, amount, source: sourceName });
    },
    grant(c, keyword, duration = 'endOfTurn') {
      if (!inBase(s(), c)) return;
      c.modifiers.push({ stat: 'keyword', amount: 0, keyword, source: sourceName, duration });
      ctx.events.push({ type: 'modified', instanceId: c.id, stat: 'keyword', amount: 0, keyword, source: sourceName });
    },
    destroy(c) {
      if (!inBase(s(), c)) return;
      leaveBase(ctx, c, 'graveyard');
      ctx.events.push({ type: 'destroyed', instanceId: c.id, cardId: c.cardId, reason: 'effect' });
    },
    rest: (c) => rest(ctx, c),
    stand: (c) => stand(ctx, c),
    skipNextStand(c) {
      c.skipNextStand = true;
    },
    draw: (n, seat = me) => draw(ctx, seat, n),
    gain: (resource, n, seat = me) => gainResource(ctx, seat, resource, n),
    gainLife: (n, seat = me) => gainLife(ctx, seat, n),
    deploy: (c, opts) => deploy(ctx, c, opts),
    putOnTopOfDeck(c) {
      if (inBase(s(), c)) leaveBase(ctx, c, 'deckTop');
      else {
        removeFromZones(ctx, c);
        player(ctx, c.owner).deck.unshift(c.id);
      }
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
    revealTop(seat = me) {
      const id = s().players[seat].deck[0];
      if (!id) return undefined;
      const c = card(s(), id);
      ctx.events.push({ type: 'revealed', seat, instanceId: id, cardId: c.cardId });
      return c;
    },
    setNightUntilEndOfOpponentsNextTurn() {
      // The opponent's next turn is the next turn if it's ours, otherwise the one after.
      const untilTurn = s().turn + (s().activeSeat === me ? 1 : 2);
      s().nightUntilTurn = Math.max(s().nightUntilTurn ?? 0, untilTurn);
      ctx.events.push({ type: 'nightStarted', untilTurn });
    },
    nullifyAttack() {
      const battle = s().battle;
      if (!battle || battle.nullified) return;
      battle.nullified = true;
      ctx.events.push({ type: 'attackNullified', byCardId: r.cardId });
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Activated ability costs (§10.4)
// ---------------------------------------------------------------------------

/** Every concrete way the seat can pay this ability's cost right now. */
export function costChoices(s: GameState, seat: Seat, self: CardInstance, ability: ActAbility): CostChoice[] {
  const p = s.players[seat];
  const out: CostChoice[] = [];
  ability.costs.forEach((spec, option) => {
    if ((spec.souls ?? 0) > p.soulsStanding) return;
    if ((spec.material ?? 0) > p.material) return;
    if ((spec.ingredient ?? 0) > p.ingredient) return;
    if ((spec.millTop ?? 0) > p.deck.length) return;
    if (spec.restSelf && (self.rested || !p.base.includes(self.id))) return;
    if (spec.discardSelf && !p.hand.includes(self.id)) return;

    const assignOptions: (string | undefined)[] = spec.assign
      ? p.base.filter((id) => id !== self.id && isPal(s.cards[id]!) && !s.cards[id]!.rested)
      : [undefined];
    const discardOptions: (string[] | undefined)[] = spec.discardFromHand
      ? combinations(
          p.hand.filter((id) => {
            if (id === self.id) return false;
            const filter = spec.discardFromHand!.filter;
            return !filter || filter(defOf(s.cards[id]!));
          }),
          spec.discardFromHand.count,
        )
      : [undefined];

    for (const assignId of assignOptions) {
      for (const discardIds of discardOptions) {
        const choice: CostChoice = { option };
        if (assignId) choice.assignId = assignId;
        if (discardIds) choice.discardIds = discardIds;
        out.push(choice);
      }
    }
  });
  return out;
}

const costKey = (c: CostChoice) =>
  JSON.stringify([c.option ?? 0, c.assignId ?? null, [...(c.discardIds ?? [])].sort()]);

export function isValidCostChoice(
  s: GameState,
  seat: Seat,
  self: CardInstance,
  ability: ActAbility,
  choice: CostChoice,
) {
  const key = costKey(choice);
  return costChoices(s, seat, self, ability).some((c) => costKey(c) === key);
}

export function payCost(ctx: Ctx, seat: Seat, self: CardInstance, spec: CostSpec, choice: CostChoice) {
  const p = player(ctx, seat);
  if (spec.souls) {
    p.soulsStanding -= spec.souls;
    p.soulsRested += spec.souls;
  }
  for (const resource of ['material', 'ingredient'] as const) {
    const amount = spec[resource] ?? 0;
    if (amount > 0) {
      p[resource] -= amount;
      ctx.events.push({ type: 'resourceSpent', seat, resource, amount });
    }
  }
  if (spec.restSelf) rest(ctx, self);
  if (spec.assign) assign(ctx, card(ctx.s, choice.assignId!), self);
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
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first!, ...c]), ...combinations(rest, k)];
}
