/**
 * Card scripts: how each card's text behaves. Keywords are read from the card text,
 * so a card that only has keywords needs no script.
 */
import { getCard, type CardDef } from '@pal/cards';
import type { CardFlag, CardInstance, ChoiceOption, Duration, GameState, Keyword, Seat, SkillGrant } from './types.ts';

/** What a card effect can see and do. Implemented in effects.ts. */
export interface EffectApi {
  readonly s: GameState;
  /** The card whose ability is resolving. */
  readonly self: CardInstance;
  readonly me: Seat;
  readonly opp: Seat;
  /** The card a trigger is about (the Pal deployed, attacked, assigned…), if any. */
  readonly subject: CardInstance | undefined;
  /** The X paid in an activated ability's cost (0 if none). */
  readonly x: number;
  /** Pals assigned to pay this ability's cost. */
  readonly assigned: CardInstance[];
  /** Cards exiled to pay this ability's cost. */
  readonly exiledForCost: CardInstance[];

  // Queries
  pals(filter?: (c: CardInstance) => boolean): CardInstance[];
  palsOf(seat: Seat): CardInstance[];
  structuresOf(seat: Seat): CardInstance[];
  gearsOf(seat: Seat): CardInstance[];
  baseOf(seat: Seat): CardInstance[];
  hand(seat: Seat): CardInstance[];
  graveyard(seat: Seat): CardInstance[];
  deck(seat: Seat): CardInstance[];
  /** The top n cards of a deck, without moving them. */
  lookTop(n: number, seat?: Seat): CardInstance[];
  power(c: CardInstance): number;
  strike(c: CardInstance): number;
  /** Current cost to play, after reductions. */
  cost(c: CardInstance): number;
  def(c: CardInstance): CardDef;
  hasKeyword(c: CardInstance, kw: Keyword): boolean;
  /** Card names, including names added by effects. */
  names(c: CardInstance): string[];
  /** True if any of the card's names has this main name ("main name 《X》"). */
  isMainName(c: CardInstance, mainName: string): boolean;
  isNight(): boolean;
  /** Total souls (standing + rested) in a player's soul area. */
  souls(seat?: Seat): number;
  /** Cards the source may choose: drops ones protected from it (e.g. "cannot be chosen by…"). */
  targetable(cards: CardInstance[]): CardInstance[];
  /** Whether the card could legally enter its owner's base now (Legendary limit). */
  canDeploy(c: CardInstance): boolean;
  /** Per-turn memory, e.g. "a mode not chosen this turn". */
  remembered(key: string): boolean;
  remember(key: string): void;
  /** Pals assigned this turn. */
  assignedThisTurn(): CardInstance[];

  // Choices (§10.6.3). These may pause the game until the chooser answers.
  choose(opts: {
    prompt: string;
    options: (CardInstance | ChoiceOption)[];
    min: number;
    max: number;
    chooser?: Seat;
  }): string[];
  /** "Choose 1 X": exactly 1 if any exist. Protected cards are left out. */
  chooseOne(prompt: string, cards: CardInstance[], chooser?: Seat): CardInstance | undefined;
  /** "Choose up to N X". Protected cards are left out. */
  chooseUpTo(n: number, prompt: string, cards: CardInstance[], chooser?: Seat): CardInstance[];
  confirm(prompt: string, chooser?: Seat): boolean;
  /** "Choose 1 of the following": returns the chosen index. Disabled options can't be picked. */
  chooseMode(prompt: string, labels: string[], disabled?: boolean[]): number;

  // Actions
  damage(c: CardInstance, amount: number): void;
  modify(c: CardInstance, stat: 'power' | 'strike', amount: number, duration?: Duration): void;
  grant(c: CardInstance, keyword: Keyword, duration?: Duration): void;
  /** Grants the ability this card's script lists under grants[key]. */
  grantSkill(c: CardInstance, key: string, duration?: Duration): void;
  addFlag(c: CardInstance, flag: CardFlag, duration?: Duration): void;
  addName(c: CardInstance, name: string, duration?: Duration): void;
  destroy(c: CardInstance): void;
  butcher(c: CardInstance): void;
  rest(c: CardInstance): void;
  stand(c: CardInstance): void;
  skipNextStand(c: CardInstance): void;
  /** The card doesn't stand while this (source) card is in a base. */
  freeze(c: CardInstance): void;
  draw(n: number, seat?: Seat): void;
  gain(resource: 'material' | 'ingredient', n: number, seat?: Seat): void;
  /** The seat loses up to n Material and/or Ingredient in total; chooser picks the split. */
  loseResources(seat: Seat, upTo: number, chooser?: Seat): void;
  gainLife(n: number, seat?: Seat): void;
  /** Rests n standing souls if possible (e.g. to play a card from the deck). Returns false if you can't. */
  paySouls(n: number): boolean;
  standSouls(n: number, seat?: Seat): void;
  /** Moves up to n souls from the soul deck to the soul area. */
  addSouls(n: number, opts?: { rested?: boolean; seat?: Seat }): void;
  deploy(c: CardInstance, opts?: { rested?: boolean }): void;
  putOnTopOfDeck(c: CardInstance): void;
  putOnBottomOfDeck(c: CardInstance): void;
  addToHand(c: CardInstance): void;
  discard(c: CardInstance): void;
  exile(c: CardInstance): void;
  /** Moves the top n cards of a deck to its graveyard; returns them. */
  millTop(n: number, seat?: Seat): CardInstance[];
  shuffleDeck(seat?: Seat): void;
  /** Reveals the top card of a deck without moving it. */
  revealTop(seat?: Seat): CardInstance | undefined;
  /** Shows cards to both players (e.g. "reveal 1 card from your hand"). */
  reveal(cards: CardInstance[]): void;
  putUnder(structure: CardInstance, c: CardInstance): void;
  underneath(structure: CardInstance): CardInstance[];
  setNightUntilEndOfOpponentsNextTurn(): void;
  nullifyAttack(): void;
  setTurnFlag(flag: 'mustAttack' | 'noAssign', seat?: Seat): void;
  /** The Pal can't be assigned to this structure again this turn. */
  blockAssign(pal: CardInstance, structure: CardInstance): void;
  /** Queues this card's delayed[key] ability for the end of the current turn. */
  atEndOfTurn(key: string): void;
  declareName(name: string): void;
}

export type Effect = (e: EffectApi) => void;

/** One way to pay an ability's cost. Activated abilities may offer alternatives ("OR"). */
export interface CostSpec {
  /** Rest this many standing souls (①, ②…). */
  souls?: number;
  material?: number;
  ingredient?: number;
  /** "Consume X Material/Ingredient": the player picks X (from min). */
  xMaterial?: { min: number };
  xIngredient?: { min: number };
  restSelf?: boolean;
  /** "[Assign N Pal(s)]": rest standing Pals onto this structure. 'X' lets the player pick how many. */
  assign?: boolean | number | 'X';
  discardSelf?: boolean;
  /** Discard this many other cards from hand ('X': any number from 1), optionally restricted. */
  discardFromHand?: { count: number | 'X'; filter?: (def: CardDef) => boolean; label?: string };
  millTop?: number;
  /** "[Butcher 1 (other) Pal]". */
  butcher?: 'any' | 'other';
  /** "[Exile N cards from the graveyard]" matching the filter. */
  exileFromGraveyard?: { count: number; filter?: (def: CardDef) => boolean };
}

export interface ActAbility {
  label: string;
  /** Where the card must be to use this. */
  zone: 'base' | 'hand';
  /** Can be used in the opponent's quick step (§12.2). */
  quick?: boolean;
  oncePerTurn?: boolean;
  costs: CostSpec[];
  /** Extra conditions, e.g. Interrupt needs an attack to nullify. */
  usable?: (s: GameState, self: CardInstance) => boolean;
  effect: Effect;
}

/** An ability that fires when something happens to another card. */
export interface Watcher {
  on: 'palDeployed' | 'palAttacked' | 'palAttacks' | 'palAssigned' | 'palButchered' | 'actConsumedMaterial';
  /** Whose card the event must be about, relative to the watcher's owner. */
  whose: 'mine' | 'opponent' | 'any';
  /** Where the watching card must be (default: base). */
  zone?: 'base' | 'graveyard';
  filter?: (s: GameState, self: CardInstance, subject: CardInstance) => boolean;
  effect: Effect;
}

/** Continuous effects a card in the base has on other cards or the game. */
export interface Aura {
  power?: (s: GameState, self: CardInstance, target: CardInstance) => number;
  strike?: (s: GameState, self: CardInstance, target: CardInstance) => number;
  keywords?: (s: GameState, self: CardInstance, target: CardInstance) => Keyword[];
  /** "While this card is in the rest state, it is night." */
  night?: (s: GameState, self: CardInstance) => boolean;
  /** Cost reduction for a card in its owner's hand. */
  cost?: (s: GameState, self: CardInstance, handCard: CardInstance) => number;
  /** True if the target can't be chosen by the source's effects. */
  protects?: (s: GameState, self: CardInstance, target: CardInstance, source: CardInstance) => boolean;
  /** Extra damage when a card of this owner deals non-battle damage (e.g. Suzaku). */
  damageBonus?: (s: GameState, self: CardInstance, source: CardInstance, target: CardInstance) => number;
  /** The opponent can't gain life. */
  opponentCannotGainLife?: boolean;
  /** Your Pals' automatic abilities activate twice while it's night (Shadowbeak). */
  doubleAutoAtNight?: boolean;
}

export interface CardScript {
  onDeploy?: Effect;
  onAttack?: Effect;
  /** "When this card is put into the graveyard" (from the base). */
  onGraveyard?: Effect;
  onLeaveBase?: Effect;
  /** "At the end of your turn". */
  endOfTurn?: Effect;
  onAssign?: Effect;
  onAttacked?: Effect;
  onBattleEnd?: Effect;
  /** "When this card's opposing combat Pal is put into the graveyard" (subject: that Pal). */
  onBeatOpponent?: Effect;
  onInterrupt?: Effect;
  watchers?: Watcher[];
  /** Delayed abilities this card can set up with e.atEndOfTurn(key). */
  delayed?: Record<string, Effect>;
  acts?: ActAbility[];
  /** Effect of an event card. */
  event?: Effect;
  /** CONT: extra power while in the base. */
  powerBonus?: (s: GameState, self: CardInstance) => number;
  strikeBonus?: (s: GameState, self: CardInstance) => number;
  /** CONT: attack restrictions on this card as a target. */
  canBeAttackedBy?: (s: GameState, self: CardInstance, attacker: CardInstance) => boolean;
  aura?: Aura;
  /** Abilities this card can give others ("gets the skill in 〈〉"). */
  grants?: Record<string, CardScript>;
  /** CONT with the Hand icon: cost reduction while in hand. */
  handCostReduction?: (s: GameState, self: CardInstance) => number;
  /** "When this card would be played, you may consume X Material and reduce its cost by X." */
  materialReducesCost?: boolean;
  /** Multiplier for battle damage this card deals (Rayhound: 2). */
  battleDamageMultiplier?: number;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const scripts = new Map<string, CardScript>();

export function registerScripts(entries: Record<string, CardScript>) {
  for (const [id, script] of Object.entries(entries)) scripts.set(id, script);
  resolved.clear();
}

const EMPTY: CardScript = {};
const resolved = new Map<string, CardScript>();

/** The card's script, plus generic abilities granted by its keywords (e.g. Interrupt). */
export function getScript(cardId: string): CardScript {
  const cached = resolved.get(cardId);
  if (cached) return cached;
  const base = scripts.get(cardId) ?? EMPTY;
  const kw = printedKeywords(cardId);
  const script: CardScript = kw.has('interrupt') ? { ...base, acts: [...(base.acts ?? []), INTERRUPT] } : base;
  resolved.set(cardId, script);
  return script;
}

/** A granted ability's script piece. */
export const grantedScript = (g: SkillGrant): CardScript => getScript(g.fromCardId).grants?.[g.key] ?? EMPTY;

/** The card's own script and every script piece granted to it by modifiers. */
export function scriptSources(c: CardInstance): { script: CardScript; grant?: SkillGrant }[] {
  const out: { script: CardScript; grant?: SkillGrant }[] = [{ script: getScript(c.cardId) }];
  for (const m of c.modifiers)
    if (m.stat === 'skill' && m.grant) out.push({ script: grantedScript(m.grant), grant: m.grant });
  return out;
}

/** All activated abilities a card has right now: its own, then granted ones. */
export function allActs(c: CardInstance): { ability: ActAbility; grant?: SkillGrant }[] {
  return scriptSources(c).flatMap(({ script, grant }) => (script.acts ?? []).map((ability) => ({ ability, grant })));
}

/** True when every part of the card's text is handled (a script, keywords only, or no text). */
export function isImplemented(cardId: string): boolean {
  if (scripts.has(cardId)) return true;
  const def = getCard(cardId);
  if (!def || def.text === '') return true;
  return keywordOnlyText(def.text);
}

// ---------------------------------------------------------------------------
// Keywords (§12), read from card text
// ---------------------------------------------------------------------------

const KEYWORD_NAMES: Record<Keyword, string> = {
  assault: 'Assault',
  taunt: 'Taunt',
  stealth: 'Stealth',
  vigilance: 'Vigilance',
  interrupt: 'Interrupt',
  retaliate: 'Retaliate',
  nocturnal: 'Nocturnal',
  breakthrough: 'Breakthrough',
  brave: 'Brave',
  serious: 'Serious',
  legendary: 'Legendary',
};

/** Removes 〈…〉 sections: those are skills granted to other cards, not this one. */
const ownText = (text: string) => text.replace(/〈[^〉]*〉/g, '');

const keywordCache = new Map<string, Map<Keyword, number>>();

/** Keywords printed on the card, with their number for Brave/Serious (0 otherwise). */
export function printedKeywordValues(cardId: string): Map<Keyword, number> {
  const cached = keywordCache.get(cardId);
  if (cached) return cached;
  const text = ownText(getCard(cardId)?.text ?? '');
  const found = new Map<Keyword, number>();
  for (const [kw, name] of Object.entries(KEYWORD_NAMES) as [Keyword, string][]) {
    const m = new RegExp(`(?:@|^|\\n)\\s*${name}\\b\\s*(\\d+)?`).exec(text);
    if (m) found.set(kw, m[1] ? Number(m[1]) : 0);
  }
  keywordCache.set(cardId, found);
  return found;
}

export const printedKeywords = (cardId: string) => new Set(printedKeywordValues(cardId).keys());

/** Text made only of keyword lines (with reminder text), so no script is needed. */
function keywordOnlyText(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const names = Object.values(KEYWORD_NAMES).join('|');
  return lines.every((l) => new RegExp(`^(?:CONT@|AUTO@|ACT@)(?:${names})\\b(?:\\s*\\d+)?\\s*(?:\\(.*\\))?$`).test(l));
}

/** §12.8 Interrupt: Quick [①, discard this card] OR [Discard this card and 1 other card from hand]. */
export const INTERRUPT: ActAbility = {
  label: 'Interrupt: nullify the attack',
  zone: 'hand',
  quick: true,
  costs: [
    { souls: 1, discardSelf: true },
    { discardSelf: true, discardFromHand: { count: 1 } },
  ],
  usable: (s, self) => !!s.battle && s.cards[s.battle.attackerId]?.owner !== self.owner,
  effect: (e) => e.nullifyAttack(),
};
