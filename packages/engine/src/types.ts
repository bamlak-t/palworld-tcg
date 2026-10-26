/**
 * Game state for the Palworld OFFICIAL CARD GAME rules engine.
 * Plain JSON throughout so it can be stored in Postgres and sent over the wire.
 * Section numbers (§x.y) refer to the Comprehensive Rules ver. 1.00.
 */

export type Seat = 0 | 1;

export const PHASES = ['stand', 'draw', 'soul', 'main', 'end'] as const;
export type Phase = (typeof PHASES)[number];

export const BATTLE_STEPS = ['attack', 'block', 'quick', 'damage', 'endOfBattle'] as const;
export type BattleStep = (typeof BATTLE_STEPS)[number];

/** How long a modifier lasts. */
export type Duration = 'endOfTurn' | 'endOfBattle' | 'permanent';

/** A change to a card's power or strike, kept with its source so the UI can explain it. */
export interface Modifier {
  stat: 'power' | 'strike';
  amount: number;
  /** Human-readable source, e.g. "Brave 300" or "Nocturnal". */
  source: string;
  duration: Duration;
}

/** One physical card in the game. */
export interface CardInstance {
  id: string;
  /** Canonical card id from @pal/cards, e.g. "ETD01-005". */
  cardId: string;
  owner: Seat;
  /** Orientation; only meaningful in the base. */
  rested: boolean;
  /** Damage taken this turn (§4.4.4); cleared in the end phase. */
  damage: number;
  modifiers: Modifier[];
  /** Order the card entered the base, for the overload rule (§11.5). */
  placedAt: number;
  /** Structure this Pal is assigned to (§5.17), if any. */
  assignedTo: string | null;
}

export interface PlayerState {
  name: string;
  /** §3.2: starts at 10. */
  life: number;
  /** §3.2.2: pending player damage, resolved immediately by §11.2. */
  damageTaken: number;
  material: number;
  ingredient: number;
  /** Top of deck is index 0. */
  deck: string[];
  hand: string[];
  base: string[];
  graveyard: string[];
  exile: string[];
  /** §13.2: souls are tracked as counts rather than physical soul cards. */
  soulDeck: number;
  soulsStanding: number;
  soulsRested: number;
  /** §8.5: pay 3 souls to draw once per turn. */
  soulDrawUsed: boolean;
  mulliganDone: boolean;
  /** §4.4.5: max Pals in base. */
  maxPals: number;
}

export type AttackTarget = { kind: 'player'; seat: Seat } | { kind: 'card'; id: string };

export interface BattleState {
  attackerId: string;
  target: AttackTarget;
  step: BattleStep;
  blockerId: string | null;
}

/** A decision the engine is waiting on. Options are always listed by the engine. */
export type PendingChoice =
  | { kind: 'chooseFirstPlayer'; seat: Seat }
  | { kind: 'mulligan'; seat: Seat }
  | { kind: 'block'; seat: Seat; options: string[] }
  | { kind: 'overload'; seat: Seat; candidates: string[]; mustKeep: string[]; keepCount: number };

export interface GameState {
  /** Bumped on every applied action; used for optimistic locking. */
  version: number;
  rngState: number;
  players: [PlayerState, PlayerState];
  cards: Record<string, CardInstance>;
  turn: number;
  activeSeat: Seat;
  firstSeat: Seat | null;
  phase: Phase | 'setup';
  battle: BattleState | null;
  pending: PendingChoice | null;
  /** §5.3 night: active until the end phase of this turn number, or null for day. */
  nightUntilTurn: number | null;
  /** Counter for CardInstance.placedAt. */
  placementCounter: number;
  result: { winner: Seat | null; reason: string } | null;
}

export type Action =
  | { type: 'chooseFirstPlayer'; first: Seat }
  | { type: 'mulligan'; redraw: boolean }
  | { type: 'playCard'; cardId: string }
  | { type: 'soulDraw' }
  | { type: 'attack'; attackerId: string; target: AttackTarget }
  | { type: 'block'; blockerId: string | null }
  | { type: 'chooseOverload'; keep: string[] }
  | { type: 'endTurn' }
  | { type: 'concede' };

/** Something that happened, for animation and the action log. */
export type GameEvent =
  | { type: 'gameStarted'; firstSeat: Seat }
  | { type: 'mulligan'; seat: Seat; redraw: boolean }
  | { type: 'turnStarted'; seat: Seat; turn: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'drew'; seat: Seat; count: number }
  | { type: 'soulsGained'; seat: Seat; count: number }
  | { type: 'cardPlayed'; seat: Seat; cardId: string; instanceId: string; cost: number }
  | { type: 'soulDraw'; seat: Seat }
  | { type: 'attackDeclared'; attackerId: string; target: AttackTarget }
  | { type: 'blocked'; blockerId: string | null }
  | { type: 'battleDamage'; sourceId: string; targetId: string; amount: number }
  | { type: 'playerDamage'; seat: Seat; amount: number }
  | { type: 'milled'; seat: Seat; instanceId: string; cardId: string; lucky: boolean }
  | { type: 'damageCancelled'; seat: Seat; luckyId: string }
  | { type: 'lifeLost'; seat: Seat; amount: number; life: number }
  | { type: 'destroyed'; instanceId: string; cardId: string; reason: 'lethal' | 'overload' }
  | { type: 'battleEnded' }
  | { type: 'turnEnded'; seat: Seat }
  | { type: 'gameOver'; winner: Seat | null; reason: string };

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };
