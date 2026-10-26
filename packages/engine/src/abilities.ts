/**
 * Card scripts: how each card's text behaves. Keywords are read from the card text,
 * so a card that only has keywords needs no script.
 */
import { getCard, type CardDef } from '@pal/cards';
import type { CardInstance, ChoiceOption, Duration, GameState, Keyword, Seat } from './types.ts';

/** What a card effect can see and do. Implemented in effects.ts. */
export interface EffectApi {
  readonly s: GameState;
  /** The card whose ability is resolving. */
  readonly self: CardInstance;
  readonly me: Seat;
  readonly opp: Seat;

  // Queries
  pals(filter?: (c: CardInstance) => boolean): CardInstance[];
  palsOf(seat: Seat): CardInstance[];
  structuresOf(seat: Seat): CardInstance[];
  hand(seat: Seat): CardInstance[];
  graveyard(seat: Seat): CardInstance[];
  power(c: CardInstance): number;
  strike(c: CardInstance): number;
  def(c: CardInstance): CardDef;
  isNight(): boolean;

  // Choices (§10.6.3). These may pause the game until the chooser answers.
  choose(opts: {
    prompt: string;
    options: (CardInstance | ChoiceOption)[];
    min: number;
    max: number;
    chooser?: Seat;
  }): string[];
  /** "Choose 1 X": exactly 1 if any exist. */
  chooseOne(prompt: string, cards: CardInstance[], chooser?: Seat): CardInstance | undefined;
  /** "Choose up to N X". */
  chooseUpTo(n: number, prompt: string, cards: CardInstance[], chooser?: Seat): CardInstance[];
  confirm(prompt: string, chooser?: Seat): boolean;

  // Actions
  damage(c: CardInstance, amount: number): void;
  modify(c: CardInstance, stat: 'power' | 'strike', amount: number, duration?: Duration): void;
  grant(c: CardInstance, keyword: Keyword, duration?: Duration): void;
  destroy(c: CardInstance): void;
  rest(c: CardInstance): void;
  stand(c: CardInstance): void;
  skipNextStand(c: CardInstance): void;
  draw(n: number, seat?: Seat): void;
  gain(resource: 'material' | 'ingredient', n: number, seat?: Seat): void;
  gainLife(n: number, seat?: Seat): void;
  deploy(c: CardInstance, opts?: { rested?: boolean }): void;
  putOnTopOfDeck(c: CardInstance): void;
  addToHand(c: CardInstance): void;
  discard(c: CardInstance): void;
  exile(c: CardInstance): void;
  /** Reveals the top card of a deck without moving it. */
  revealTop(seat?: Seat): CardInstance | undefined;
  setNightUntilEndOfOpponentsNextTurn(): void;
  nullifyAttack(): void;
}

export type Effect = (e: EffectApi) => void;

/** One way to pay an ability's cost. Activated abilities may offer alternatives ("OR"). */
export interface CostSpec {
  /** Rest this many standing souls (①, ②…). */
  souls?: number;
  material?: number;
  ingredient?: number;
  restSelf?: boolean;
  /** "[Assign 1 Pal]": rest one of your standing Pals onto this structure. */
  assign?: boolean;
  discardSelf?: boolean;
  /** Discard this many other cards from hand, optionally restricted. */
  discardFromHand?: { count: number; filter?: (def: CardDef) => boolean; label?: string };
  millTop?: number;
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

export interface CardScript {
  onDeploy?: Effect;
  onAttack?: Effect;
  /** "When this card is put into the graveyard" (from the base). */
  onGraveyard?: Effect;
  onLeaveBase?: Effect;
  /** "At the end of your turn". */
  endOfTurn?: Effect;
  acts?: ActAbility[];
  /** Effect of an event card. */
  event?: Effect;
  /** CONT: extra power while in the base. */
  powerBonus?: (s: GameState, self: CardInstance) => number;
  /** CONT: attack restrictions on this card as a target. */
  canBeAttackedBy?: (s: GameState, self: CardInstance, attacker: CardInstance) => boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const scripts = new Map<string, CardScript>();

export function registerScripts(entries: Record<string, CardScript>) {
  for (const [id, script] of Object.entries(entries)) scripts.set(id, script);
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
const INTERRUPT: ActAbility = {
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
