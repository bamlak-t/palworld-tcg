/**
 * Low-level game operations shared by the turn flow and card effects.
 * All of them mutate ctx.s in place; apply() works on a clone.
 */
import { defOf, isPal } from './cards.ts';
import { getScript } from './abilities.ts';
import type { CardInstance, GameEvent, GameState, PlayerState, Seat, TriggerKind } from './types.ts';

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

/** Removes a card from whichever zone of its owner holds it. */
export function removeFromZones(ctx: Ctx, c: CardInstance) {
  const p = player(ctx, c.owner);
  for (const zone of ['deck', 'hand', 'base', 'graveyard', 'exile'] as const) {
    const i = p[zone].indexOf(c.id);
    if (i >= 0) p[zone].splice(i, 1);
  }
  const r = ctx.s.resolutionZone.indexOf(c.id);
  if (r >= 0) ctx.s.resolutionZone.splice(r, 1);
}

/** §5.15 deploy a Pal, structure or gear into its owner's base. */
export function deploy(ctx: Ctx, c: CardInstance, opts: { rested?: boolean } = {}) {
  removeFromZones(ctx, c);
  resetCard(c);
  c.rested = !!opts.rested;
  c.placedAt = ++ctx.s.placementCounter;
  player(ctx, c.owner).base.push(c.id);
  ctx.events.push({ type: 'deployed', instanceId: c.id, cardId: c.cardId, seat: c.owner });
  if (getScript(c.cardId).onDeploy) enqueue(ctx, c, 'onDeploy');
}

/** §4.1.4: a card leaving the base becomes a new card. */
function resetCard(c: CardInstance) {
  c.rested = false;
  c.damage = 0;
  c.modifiers = [];
  c.assignedTo = null;
  c.skipNextStand = false;
}

/**
 * Moves a card out of the base. Queues its "leaves the base" and "put into the graveyard"
 * abilities, which look at the card as it was in the base (§10.8.4.1.2).
 */
export function leaveBase(ctx: Ctx, c: CardInstance, to: 'graveyard' | 'exile' | 'hand' | 'deckTop') {
  const wasInBase = inBase(ctx.s, c);
  removeFromZones(ctx, c);
  resetCard(c);
  const p = player(ctx, c.owner);
  if (to === 'graveyard') p.graveyard.push(c.id);
  else if (to === 'exile') p.exile.push(c.id);
  else if (to === 'hand') p.hand.push(c.id);
  else p.deck.unshift(c.id);

  if (!wasInBase) return;
  const script = getScript(c.cardId);
  if (script.onLeaveBase) enqueue(ctx, c, 'onLeaveBase');
  if (to === 'graveyard' && script.onGraveyard) enqueue(ctx, c, 'onGraveyard');
}

export function enqueue(ctx: Ctx, c: CardInstance, trigger: TriggerKind) {
  ctx.s.triggers.push({ sourceId: c.id, cardId: c.cardId, controller: c.owner, trigger });
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
  ctx.events.push({ type: 'assigned', palId: pal.id, structureId: structure.id });
}

export function gainResource(ctx: Ctx, seat: Seat, resource: 'material' | 'ingredient', amount: number) {
  if (amount <= 0) return;
  player(ctx, seat)[resource] += amount;
  ctx.events.push({ type: 'resourceGained', seat, resource, amount });
}

export function gainLife(ctx: Ctx, seat: Seat, amount: number) {
  if (amount <= 0) return;
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
