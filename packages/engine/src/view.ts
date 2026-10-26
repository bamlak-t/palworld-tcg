import type { BattleState, CardInstance, GameState, PendingChoice, Seat } from './types.ts';

export type Viewer = Seat | 'spectator';

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
  result: GameState['result'];
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
    pending: s.pending,
    night: s.nightUntilTurn !== null,
    result: s.result,
    players: [playerView(0), playerView(1)],
  };
}
