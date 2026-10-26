import './scripts/index.ts';

export * from './types.ts';
export {
  createGame,
  apply,
  canAttack,
  attackTargets,
  activatableAbilities,
  isQuickEvent,
  type PlayerSetup,
} from './engine.ts';
export { getLegalActions } from './legal.ts';
export { viewFor, type CardStats, type GameView, type PlayerView, type Viewer } from './view.ts';
export { validateDeck, MAIN_DECK_SIZE, MAX_COPIES, MAX_LUCKY, SOUL_COUNT } from './deck.ts';
export { TRIAL_DECKS } from './decks.ts';
export { defOf, costOf, isLucky } from './cards.ts';
export { powerOf, strikeOf, hasKeyword, isNight } from './stats.ts';
export { getScript, isImplemented, printedKeywords, type CardScript, type ActAbility } from './abilities.ts';
