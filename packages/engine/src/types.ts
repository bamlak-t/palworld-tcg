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

export const KEYWORDS = [
  'assault',
  'taunt',
  'stealth',
  'vigilance',
  'interrupt',
  'retaliate',
  'nocturnal',
  'breakthrough',
  'brave',
  'serious',
] as const;
export type Keyword = (typeof KEYWORDS)[number];

/**
 * A change to a card's power or strike, or a granted keyword, kept with its source so
 * the UI can explain it.
 */
export interface Modifier {
  stat: 'power' | 'strike' | 'keyword';
  /** Ignored for keyword grants. */
  amount: number;
  keyword?: Keyword;
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
  /** Skip standing in the owner's next stand phase (e.g. Crystal Breath). */
  skipNextStand?: boolean;
  /** Card whose effect exiled this one (e.g. Hanging Trap), for "the Pal exiled by this card". */
  exiledBy?: string | null;
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
  /** §5.18: the attack was nullified; no battle damage. */
  nullified?: boolean;
}

/** An option in an effect choice. cardId is set when the option is a card. */
export interface ChoiceOption {
  id: string;
  cardId?: string;
  label?: string;
}

/** An automatic ability waiting to be played at the next check timing (§10.8). */
export interface QueuedTrigger {
  sourceId: string;
  cardId: string;
  controller: Seat;
  trigger: TriggerKind;
}

export type TriggerKind = 'onDeploy' | 'onAttack' | 'onGraveyard' | 'onLeaveBase' | 'endOfTurn';

/** Which ability of a card is resolving. */
export type AbilityRef = { kind: 'trigger'; trigger: TriggerKind } | { kind: 'act'; index: number } | { kind: 'event' };

/**
 * The effect currently resolving. Effects that need a choice suspend; the answer is
 * recorded and the effect is replayed from the start with the answers so far.
 */
export interface Resolution {
  sourceId: string;
  cardId: string;
  controller: Seat;
  ability: AbilityRef;
  answers: string[][];
}

/** A decision the engine is waiting on. Options are always listed by the engine. */
export type PendingChoice =
  | { kind: 'chooseFirstPlayer'; seat: Seat }
  | { kind: 'mulligan'; seat: Seat }
  | { kind: 'block'; seat: Seat; options: string[] }
  | { kind: 'overload'; seat: Seat; candidates: string[]; mustKeep: string[]; keepCount: number }
  | { kind: 'quickStep'; seat: Seat }
  | {
      kind: 'effectChoice';
      seat: Seat;
      prompt: string;
      sourceCardId: string;
      options: ChoiceOption[];
      min: number;
      max: number;
    };

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
  /** Automatic abilities waiting for the next check timing. */
  triggers: QueuedTrigger[];
  resolving: Resolution | null;
  /** §4.11: events being resolved sit here until they go to the graveyard. */
  resolutionZone: string[];
  /** Once-per-turn ability uses this turn, keyed "instanceId:abilityIndex". */
  usedThisTurn: string[];
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
  | { type: 'activate'; sourceId: string; index: number; cost?: CostChoice }
  | { type: 'passQuick' }
  | { type: 'answer'; choice: string[] }
  | { type: 'endTurn' }
  | { type: 'concede' };

/** Choices made while paying an ability's cost, sent with the activate action. */
export interface CostChoice {
  /** Pal to assign for "[Assign 1 Pal]". */
  assignId?: string;
  /** Cards discarded from hand for discard costs. */
  discardIds?: string[];
  /** Which alternative to pay when the cost says "OR". */
  option?: number;
}

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
  | { type: 'destroyed'; instanceId: string; cardId: string; reason: 'lethal' | 'overload' | 'effect' }
  | { type: 'battleEnded' }
  | { type: 'attackNullified'; byCardId: string }
  | { type: 'abilityActivated'; seat: Seat; instanceId: string; cardId: string; index: number }
  | { type: 'triggered'; instanceId: string; cardId: string; trigger: TriggerKind }
  | { type: 'damageDealt'; sourceId: string; targetId: string; amount: number }
  | { type: 'modified'; instanceId: string; stat: Modifier['stat']; amount: number; keyword?: Keyword; source: string }
  | { type: 'resourceGained'; seat: Seat; resource: 'material' | 'ingredient'; amount: number }
  | { type: 'resourceSpent'; seat: Seat; resource: 'material' | 'ingredient'; amount: number }
  | { type: 'lifeGained'; seat: Seat; amount: number; life: number }
  | { type: 'assigned'; palId: string; structureId: string }
  | { type: 'rested'; instanceId: string }
  | { type: 'stood'; instanceId: string }
  | { type: 'deployed'; instanceId: string; cardId: string; seat: Seat }
  | { type: 'discarded'; seat: Seat; instanceId: string; cardId: string }
  | { type: 'exiled'; instanceId: string; cardId: string }
  | { type: 'putOnDeck'; seat: Seat }
  | { type: 'revealed'; seat: Seat; instanceId: string; cardId: string }
  | { type: 'returnedToHand'; seat: Seat; instanceId: string; cardId: string }
  | { type: 'nightStarted'; untilTurn: number }
  | { type: 'turnEnded'; seat: Seat }
  | { type: 'gameOver'; winner: Seat | null; reason: string };

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };
