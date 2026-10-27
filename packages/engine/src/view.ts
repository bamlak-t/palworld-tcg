import {
  KEYWORDS,
  type BattleState,
  type CardInstance,
  type GameRules,
  type GameState,
  type Keyword,
  type PendingChoice,
  type Seat,
} from './types.ts';
import { STANDARD_RULES } from './deck.ts';
import { costToPlay, hasKeyword, isNight, powerOf, strikeOf } from './stats.ts';

export type Viewer = Seat | 'spectator';

export interface CardStats {
  power: number;
  strike: number;
  keywords: Keyword[];
}

export interface PlayerView {
  name: string;
  life: number;
  material: number;
  ingredient: number;
  soulDeck: number;
  soulsStanding: number;
  soulsRested: number;
  soulDrawUsed: boolean;
  deckCount: number;
  handCount: number;
  /** Only present for the viewer's own hand. */
  hand: CardInstance[] | null;
  base: CardInstance[];
  graveyard: CardInstance[];
  exile: CardInstance[];
}

/** What one viewer is allowed to see. Hidden zones (decks, the other hand) are counts only. */
export interface GameView {
  viewer: Viewer;
  version: number;
  turn: number;
  activeSeat: Seat;
  firstSeat: Seat | null;
  phase: GameState['phase'];
  battle: BattleState | null;
  pending: PendingChoice | null;
  night: boolean;
  /** Current power, strike and keywords of cards in either base. */
  stats: Record<string, CardStats>;
  /** What each card in the viewer's hand costs to play right now (after reductions). */
  handCosts: Record<string, number>;
  /** Event cards currently resolving (public, §4.11). */
  resolving: CardInstance[];
  result: GameState['result'];
  rules: GameRules;
  players: [PlayerView, PlayerView];
}

export function viewFor(s: GameState, viewer: Viewer): GameView {
  const cards = (ids: string[]) => ids.map((id) => s.cards[id]!);
  const playerView = (seat: Seat): PlayerView => {
    const p = s.players[seat];
    return {
      name: p.name,
      life: p.life,
      material: p.material,
      ingredient: p.ingredient,
      soulDeck: p.soulDeck,
      soulsStanding: p.soulsStanding,
      soulsRested: p.soulsRested,
      soulDrawUsed: p.soulDrawUsed,
      deckCount: p.deck.length,
      handCount: p.hand.length,
      hand: viewer === seat ? cards(p.hand) : null,
      base: cards(p.base),
      graveyard: cards(p.graveyard),
      exile: cards(p.exile),
    };
  };
  return {
    viewer,
    version: s.version,
    turn: s.turn,
    activeSeat: s.activeSeat,
    firstSeat: s.firstSeat,
    phase: s.phase,
    battle: s.battle,
    pending: redactPending(s.pending, viewer),
    night: isNight(s),
    handCosts:
      viewer === 'spectator'
        ? {}
        : Object.fromEntries(s.players[viewer].hand.map((id) => [id, costToPlay(s, viewer, s.cards[id]!)])),
    resolving: cards(s.resolutionZone),
    stats: Object.fromEntries(
      [...s.players[0].base, ...s.players[1].base].map((id) => {
        const c = s.cards[id]!;
        return [
          id,
          { power: powerOf(s, c), strike: strikeOf(s, c), keywords: KEYWORDS.filter((k) => hasKeyword(s, c, k)) },
        ];
      }),
    ),
    result: s.result,
    rules: s.rules ?? STANDARD_RULES,
    players: [playerView(0), playerView(1)],
  };
}

/**
 * Effect choices can list hidden cards (e.g. the chooser's hand), so only the chooser sees
 * the options. Everyone else just sees who is choosing and why.
 */
function redactPending(p: PendingChoice | null, viewer: Viewer): PendingChoice | null {
  if (p?.kind !== 'effectChoice' || p.seat === viewer) return p;
  return { ...p, options: [] };
}
