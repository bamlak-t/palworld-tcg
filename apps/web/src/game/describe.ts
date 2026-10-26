/** Plain-language text for engine events and ability costs. */
import { getCard } from '@pal/cards';
import { getScript, type CostChoice, type GameEvent, type GameView, type Seat } from '@pal/engine';

const cardName = (cardId: string) => getCard(cardId)?.name ?? cardId;
const mainName = (cardId: string) => getCard(cardId)?.mainName ?? cardId;

/** Looks up the card id behind an instance id among the cards the viewer can see. */
export function instanceCardId(view: GameView, instanceId: string): string | undefined {
  for (const p of view.players) {
    for (const zone of [p.base, p.graveyard, p.exile, p.hand ?? []]) {
      const c = zone.find((x) => x.id === instanceId);
      if (c) return c.cardId;
    }
  }
  return view.resolving.find((c) => c.id === instanceId)?.cardId;
}

export function describeEvent(e: GameEvent, view: GameView): string | null {
  const who = (seat: Seat) => view.players[seat].name;
  const inst = (id: string) => {
    const cardId = instanceCardId(view, id);
    return cardId ? mainName(cardId) : 'a card';
  };
  switch (e.type) {
    case 'gameStarted':
      return `${who(e.firstSeat)} goes first.`;
    case 'mulligan':
      return e.redraw ? `${who(e.seat)} redrew their hand.` : `${who(e.seat)} kept their hand.`;
    case 'turnStarted':
      return `Turn ${e.turn}: ${who(e.seat)}.`;
    case 'cardPlayed':
      return `${who(e.seat)} played ${cardName(e.cardId)}.`;
    case 'soulDraw':
      return `${who(e.seat)} paid 3 souls to draw a card.`;
    case 'abilityActivated': {
      const label = getScript(e.cardId).acts?.[e.index]?.label;
      return `${who(e.seat)} used ${mainName(e.cardId)}${label ? `: ${label}` : ''}.`;
    }
    case 'triggered':
      return null;
    case 'attackDeclared':
      return `${inst(e.attackerId)} attacks ${e.target.kind === 'player' ? who(e.target.seat) : inst(e.target.id)}.`;
    case 'blocked':
      return e.blockerId ? `${inst(e.blockerId)} blocks.` : 'No block.';
    case 'attackNullified':
      return `${mainName(e.byCardId)} nullified the attack.`;
    case 'battleDamage':
    case 'damageDealt':
      return `${inst(e.targetId)} takes ${e.amount} damage.`;
    case 'playerDamage':
      return `${who(e.seat)} takes ${e.amount} damage.`;
    case 'damageCancelled':
      return `Lucky Pal! ${who(e.seat)}'s damage is cancelled.`;
    case 'lifeLost':
      return `${who(e.seat)} loses ${e.amount} life (${e.life} left).`;
    case 'lifeGained':
      return `${who(e.seat)} gains ${e.amount} life (${e.life}).`;
    case 'destroyed':
      return `${mainName(e.cardId)} ${e.reason === 'overload' ? 'was discarded (too many Pals)' : 'was destroyed'}.`;
    case 'resourceGained':
      return `${who(e.seat)} gets ${e.amount} ${e.resource === 'material' ? 'Material' : 'Ingredient'}.`;
    case 'modified':
      if (e.stat === 'keyword') return `${inst(e.instanceId)} gains ${e.keyword}.`;
      return `${inst(e.instanceId)} gets ${e.amount > 0 ? '+' : ''}${e.amount} ${e.stat}.`;
    case 'assigned':
      return `${inst(e.palId)} is assigned to ${inst(e.structureId)}.`;
    case 'deployed':
      return null;
    case 'discarded':
      return `${who(e.seat)} discarded ${cardName(e.cardId)}.`;
    case 'exiled':
      return `${mainName(e.cardId)} was exiled.`;
    case 'revealed':
      return `${who(e.seat)} revealed ${cardName(e.cardId)}.`;
    case 'returnedToHand':
      return `${cardName(e.cardId)} went to ${who(e.seat)}'s hand.`;
    case 'putOnDeck':
      return `${who(e.seat)} put a card on top of their deck.`;
    case 'nightStarted':
      return 'It becomes night.';
    case 'turnEnded':
      return null;
    case 'gameOver':
      return e.winner === null ? `Draw: ${e.reason}.` : `${who(e.winner)} wins! ${e.reason}.`;
    default:
      return null;
  }
}

/** "Assign Jolthog", "① + discard this card", etc. */
export function describeCost(cardId: string, index: number, choice: CostChoice, view: GameView): string {
  const ability = getScript(cardId).acts?.[index];
  const spec = ability?.costs[choice.option ?? 0];
  if (!spec) return 'Use';
  const parts: string[] = [];
  if (spec.souls) parts.push(`Rest ${spec.souls} soul${spec.souls > 1 ? 's' : ''}`);
  if (spec.material) parts.push(`${spec.material} Material`);
  if (spec.ingredient) parts.push(`${spec.ingredient} Ingredient`);
  if (spec.restSelf) parts.push('Rest this card');
  if (spec.discardSelf) parts.push('Discard this card');
  if (choice.assignId) parts.push(`Assign ${mainName(instanceCardId(view, choice.assignId) ?? '')}`);
  for (const id of choice.discardIds ?? []) parts.push(`Discard ${mainName(instanceCardId(view, id) ?? '')}`);
  if (spec.millTop) parts.push(`Mill ${spec.millTop}`);
  return parts.length ? parts.join(' · ') : 'No cost';
}
