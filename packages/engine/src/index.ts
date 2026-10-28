import './scripts/index.ts';

export * from './types.ts';
export {
  createGame,
  apply,
  forfeit,
  expire,
  canAttack,
  attackTargets,
  activatableAbilities,
  isQuickEvent,
  mustStillAttack,
  type PlayerSetup,
} from './engine.ts';
export { getLegalActions } from './legal.ts';
export { viewFor, type CardStats, type GameView, type PlayerView, type Viewer } from './view.ts';
export {
  validateDeck,
  copyLimit,
  makeRules,
  rulesOf,
  STANDARD_RULES,
  RULE_LIMITS,
  RULE_OPTIONS,
  MAIN_DECK_SIZE,
  MAX_COPIES,
  MAX_LUCKY,
  SOUL_COUNT,
} from './deck.ts';
export { advanceClock, deadline, actingSeat, type Clock } from './clock.ts';
export { TRIAL_DECKS } from './decks.ts';
export { defOf, costOf, isLucky } from './cards.ts';
export { powerOf, strikeOf, hasKeyword, isNight, costToPlay } from './stats.ts';
export { allActs, getScript, isImplemented, printedKeywords, type CardScript, type ActAbility } from './abilities.ts';
