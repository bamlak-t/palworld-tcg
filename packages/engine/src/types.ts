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

/**
 * How long a modifier lasts. 'untilOpponentsNextTurnEnd' is stored as 'untilTurn' with the
 * turn number, so it survives the end of the current turn.
 */
export type Duration = 'endOfTurn' | 'endOfBattle' | 'permanent' | 'untilOpponentsNextTurnEnd';

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
  'legendary',
] as const;
export type Keyword = (typeof KEYWORDS)[number];

/**
 * A change to a card's power or strike, or a granted keyword, kept with its source so
 * the UI can explain it.
 */
export interface Modifier {
  /**
   * power/strike: a number. keyword: a granted keyword. skill: an ability granted by another
   * card's script (its `grants[key]`). name: an extra card name. flag: a restriction.
   */
  stat: 'power' | 'strike' | 'keyword' | 'skill' | 'name' | 'flag';
  /** Ignored except for power and strike. */
  amount: number;
  keyword?: Keyword;
  grant?: SkillGrant;
  name?: string;
  flag?: CardFlag;
  /** Human-readable source, e.g. "Brave 300" or "Nocturnal". */
  source: string;
  duration: Duration | 'untilTurn';
  /** For duration 'untilTurn': expires at the end of this turn number. */
  untilTurn?: number;
}

/** An ability from another card's script, granted to this one ("gets the skill in 〈〉"). */
export interface SkillGrant {
  fromCardId: string;
  key: string;
}

export type CardFlag = 'cannotBlock' | 'cannotBeAttacked' | 'untargetableByOpponent';

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
  /** Doesn't stand while this card is in a base (e.g. Relaxaurus: "while this card is in the base"). */
  frozenBy?: string | null;
  /** Cards put face down underneath this one (e.g. Wooden Chest). Hidden from the opponent. */
  under?: string[];
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
  /** Cost reduction for the next gear played this turn (e.g. Primitive Furnace). */
  nextGearDiscount?: number;
  /** Cards played from hand this game (e.g. "if you have not played any other cards"). */
  cardsPlayed?: number;
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
  /** The card the trigger is about, e.g. the Pal that was deployed or attacked. */
  subjectId?: string;
  /** Which watcher or delayed ability (index or name), for 'watch' and 'delayed'. */
  key?: string;
  /** Set when the ability was granted by another card. */
  grant?: SkillGrant;
}

export type TriggerKind =
  | 'onDeploy'
  | 'onAttack'
  | 'onGraveyard'
  | 'onLeaveBase'
  | 'endOfTurn'
  /** This Pal was assigned to a structure (subject: the structure). */
  | 'onAssign'
  /** This card was chosen as an attack target. */
  | 'onAttacked'
  /** End of a battle this card attacked in. */
  | 'onBattleEnd'
  /** This card's opposing combat Pal went to the graveyard (subject: that Pal). */
  | 'onBeatOpponent'
  /** This card's Interrupt was used (it's in the graveyard by then). */
  | 'onInterrupt'
  /** One of the card's watchers fired (key: watcher index). */
  | 'watch'
  /** A delayed ability created by an effect (key: its name). */
  | 'delayed';

/** Which ability of a card is resolving. */
export type AbilityRef =
  | { kind: 'trigger'; trigger: TriggerKind; subjectId?: string; key?: string; grant?: SkillGrant }
  | { kind: 'act'; index: number; grant?: SkillGrant }
  | { kind: 'event' };

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
  /** The X paid in the cost (Material/Ingredient consumed, Pals assigned or cards discarded). */
  x?: number;
  /** Pals assigned to pay the cost. */
  assignedIds?: string[];
  exiledIds?: string[];
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
  /** Other per-turn memory for effects ("not chosen this turn", etc.). Cleared each turn. */
  turnMemory?: string[];
  /** Pals assigned this turn (e.g. Alarm Bell stands them). */
  assignedThisTurn?: string[];
  /** Turn-wide rules set by effects, per seat (e.g. Alarm Bell). Cleared each turn. */
  turnFlags?: { mustAttack: Seat[]; noAssign: Seat[] };
  /** Delayed abilities: resolve at the end of the given turn. */
  delayed?: { sourceId: string; cardId: string; controller: Seat; key: string; atTurn: number }[];
  result: { winner: Seat | null; reason: string } | null;
}

export type Action =
  | { type: 'chooseFirstPlayer'; first: Seat }
  | { type: 'mulligan'; redraw: boolean }
  /** x: Material to consume to lower the cost, for cards that allow it (e.g. Flamethrower). */
  | { type: 'playCard'; cardId: string; x?: number }
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
  /** For "assign X Pals" / "assign 2 Pals" costs. */
  assignIds?: string[];
  /** Pal to butcher for "[Butcher 1 Pal]". */
  butcherId?: string;
  /** Cards to exile from the graveyard for exile costs. */
  exileIds?: string[];
  /** X for "Consume X Material" style costs. */
  x?: number;
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
  | { type: 'abilityActivated'; seat: Seat; instanceId: string; cardId: string; index: number; label: string }
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
  | { type: 'butchered'; instanceId: string; cardId: string }
  | { type: 'soulsStood'; seat: Seat; count: number }
  | { type: 'soulsAdded'; seat: Seat; count: number }
  | { type: 'resourceLost'; seat: Seat; resource: 'material' | 'ingredient'; amount: number }
  | { type: 'shuffled'; seat: Seat }
  | { type: 'putUnder'; seat: Seat; structureId: string }
  | { type: 'declaredName'; seat: Seat; name: string }
  | { type: 'turnEnded'; seat: Seat }
  | { type: 'gameOver'; winner: Seat | null; reason: string };

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };
