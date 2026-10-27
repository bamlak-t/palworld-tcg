/**
 * Low-level game operations shared by the turn flow and card effects.
 * All of them mutate ctx.s in place; apply() works on a clone.
 */
import { defOf, isPal } from './cards.ts';
import { getScript, scriptSources, type CardScript, type Watcher } from './abilities.ts';
import { canGainLife, doublesAutoAbilities, hasKeyword } from './stats.ts';
import type { CardInstance, GameEvent, GameState, PlayerState, QueuedTrigger, Seat, TriggerKind } from './types.ts';

/** Mutable working copy for one apply() call. ctx.s may be replaced when an effect suspends. */
export interface Ctx {
  s: GameState;
  events: GameEvent[];
}

export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
export const player = (ctx: Ctx, seat: Seat): PlayerState => ctx.s.players[seat];

export class RuleError extends Error {}
export const fail = (msg: string): never => {
  throw new RuleError(msg);
};

export function card(s: GameState, id: string): CardInstance {
  const c = s.cards[id];
  if (!c) throw new Error(`No card instance ${id}`);
  return c;
}

export const inBase = (s: GameState, c: CardInstance) => s.players[c.owner].base.includes(c.id);

export function draw(ctx: Ctx, seat: Seat, count: number) {
  const p = player(ctx, seat);
  const n = Math.min(count, p.deck.length); // §1.3.2: draw what you can
  p.hand.push(...p.deck.splice(0, n));
  if (n > 0) ctx.events.push({ type: 'drew', seat, count: n });
}

/** Removes a card from whichever zone holds it (including underneath a structure). */
export function removeFromZones(ctx: Ctx, c: CardInstance) {
  const p = player(ctx, c.owner);
  for (const zone of ['deck', 'hand', 'base', 'graveyard', 'exile'] as const) {
    const i = p[zone].indexOf(c.id);
    if (i >= 0) p[zone].splice(i, 1);
  }
  const r = ctx.s.resolutionZone.indexOf(c.id);
  if (r >= 0) ctx.s.resolutionZone.splice(r, 1);
  for (const other of Object.values(ctx.s.cards)) {
    const u = other.under?.indexOf(c.id) ?? -1;
    if (u >= 0) other.under!.splice(u, 1);
  }
}

/** §5.15 deploy a Pal, structure or gear into its owner's base. */
export function deploy(ctx: Ctx, c: CardInstance, opts: { rested?: boolean } = {}) {
  removeFromZones(ctx, c);
  resetCard(c);
  c.rested = !!opts.rested;
  c.placedAt = ++ctx.s.placementCounter;
  player(ctx, c.owner).base.push(c.id);
  ctx.events.push({ type: 'deployed', instanceId: c.id, cardId: c.cardId, seat: c.owner });
  enqueue(ctx, c, 'onDeploy');
  if (isPal(c)) fireWatchers(ctx, 'palDeployed', c);
}

/** §4.1.4: a card leaving the base becomes a new card. */
function resetCard(c: CardInstance) {
  c.rested = false;
  c.damage = 0;
  c.modifiers = [];
  c.assignedTo = null;
  c.skipNextStand = false;
  c.frozenBy = null;
}

/**
 * Moves a card out of the base. Queues its "leaves the base" and "put into the graveyard"
 * abilities, which look at the card as it was in the base (§10.8.4.1.2).
 */
export function leaveBase(ctx: Ctx, c: CardInstance, to: 'graveyard' | 'exile' | 'hand' | 'deckTop') {
  const wasInBase = inBase(ctx.s, c);
  // Triggers are queued from the card as it was, including granted abilities.
  if (wasInBase) {
    enqueue(ctx, c, 'onLeaveBase');
    if (to === 'graveyard') enqueue(ctx, c, 'onGraveyard');
  }
  removeFromZones(ctx, c);
  resetCard(c);
  const p = player(ctx, c.owner);
  if (to === 'graveyard') p.graveyard.push(c.id);
  else if (to === 'exile') p.exile.push(c.id);
  else if (to === 'hand') p.hand.push(c.id);
  else p.deck.unshift(c.id);

  // Cards underneath a structure go to their owner's graveyard with it.
  for (const id of c.under ?? []) player(ctx, card(ctx.s, id).owner).graveyard.push(id);
  c.under = [];
}

/**
 * Queues a card's automatic ability (its own and any granted ones). Under Shadowbeak at
 * night, a Pal's automatic abilities activate twice.
 */
export function enqueue(ctx: Ctx, c: CardInstance, trigger: TriggerKind, extra: Partial<QueuedTrigger> = {}) {
  for (const { script, grant } of scriptSources(c)) {
    // Vigilance stands the card at end of turn even without a scripted endOfTurn.
    const vigilance = trigger === 'endOfTurn' && !grant && hasKeyword(ctx.s, c, 'vigilance');
    if (!script[trigger as keyof CardScript] && !vigilance) continue;
    push(ctx, { sourceId: c.id, cardId: c.cardId, controller: c.owner, trigger, ...extra, ...(grant && { grant }) }, c);
  }
}

function push(ctx: Ctx, t: QueuedTrigger, c: CardInstance) {
  ctx.s.triggers.push(t);
  if (isPal(c) && doublesAutoAbilities(ctx.s, c.owner)) ctx.s.triggers.push({ ...t });
}

/** Fires watchers on every card in play (or in a graveyard, for graveyard watchers). */
export function fireWatchers(ctx: Ctx, on: Watcher['on'], subject: CardInstance) {
  for (const seat of [ctx.s.activeSeat, other(ctx.s.activeSeat)] as Seat[]) {
    const p = player(ctx, seat);
    for (const [zone, ids] of [
      ['base', p.base],
      ['graveyard', p.graveyard],
    ] as const) {
      for (const id of ids) {
        const watcherCard = card(ctx.s, id);
        getScript(watcherCard.cardId).watchers?.forEach((w, i) => {
          if (w.on !== on || (w.zone ?? 'base') !== zone) return;
          const mine = subject.owner === watcherCard.owner;
          if (w.whose === 'mine' && !mine) return;
          if (w.whose === 'opponent' && mine) return;
          if (w.filter && !w.filter(ctx.s, watcherCard, subject)) return;
          push(
            ctx,
            {
              sourceId: id,
              cardId: watcherCard.cardId,
              controller: watcherCard.owner,
              trigger: 'watch',
              key: String(i),
              subjectId: subject.id,
            },
            watcherCard,
          );
        });
      }
    }
  }
}

export function rest(ctx: Ctx, c: CardInstance) {
  if (c.rested) return;
  c.rested = true;
  ctx.events.push({ type: 'rested', instanceId: c.id });
}

export function stand(ctx: Ctx, c: CardInstance) {
  if (!c.rested) return;
  c.rested = false;
  ctx.events.push({ type: 'stood', instanceId: c.id });
}

/** §5.17: rest a standing Pal and link it to the structure. */
export function assign(ctx: Ctx, pal: CardInstance, structure: CardInstance) {
  if (pal.rested || !isPal(pal)) fail(`${defOf(pal).name} can't be assigned.`);
  pal.rested = true;
  pal.assignedTo = structure.id;
  (ctx.s.assignedThisTurn ??= []).push(pal.id);
  ctx.events.push({ type: 'assigned', palId: pal.id, structureId: structure.id });
  enqueue(ctx, pal, 'onAssign', { subjectId: structure.id });
  fireWatchers(ctx, 'palAssigned', pal);
}

/** §5.16: butcher one of your Pals (it goes to the graveyard). */
export function butcher(ctx: Ctx, pal: CardInstance) {
  if (!inBase(ctx.s, pal)) return;
  leaveBase(ctx, pal, 'graveyard');
  ctx.events.push({ type: 'butchered', instanceId: pal.id, cardId: pal.cardId });
  fireWatchers(ctx, 'palButchered', pal);
}

export function gainResource(ctx: Ctx, seat: Seat, resource: 'material' | 'ingredient', amount: number) {
  if (amount <= 0) return;
  player(ctx, seat)[resource] += amount;
  ctx.events.push({ type: 'resourceGained', seat, resource, amount });
}

export function gainLife(ctx: Ctx, seat: Seat, amount: number) {
  if (amount <= 0 || !canGainLife(ctx.s, seat)) return;
  const p = player(ctx, seat);
  p.life += amount;
  ctx.events.push({ type: 'lifeGained', seat, amount, life: p.life });
}

/** §11.2 player damage resolution (an interrupt-type rule action, so it happens immediately). */
export function dealPlayerDamage(ctx: Ctx, seat: Seat, amount: number) {
  if (amount <= 0) return;
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
    const lucky = defOf(c).subKind === 'Lucky Pal';
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

export function endGame(ctx: Ctx, winner: Seat | null, reason: string): true {
  ctx.s.result = { winner, reason };
  ctx.s.pending = null;
  ctx.events.push({ type: 'gameOver', winner, reason });
  return true;
}
