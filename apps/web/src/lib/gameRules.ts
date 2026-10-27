/** House rules for games you create or start here, remembered in this browser. */
import { useSyncExternalStore } from 'react';
import { makeRules, STANDARD_RULES, type GameRules } from '@pal/engine';

const STORAGE_KEY = 'pal-game-rules';
const CHANGE_EVENT = 'pal-game-rules-changed';

let cache: { raw: string | null; rules: GameRules } = { raw: null, rules: STANDARD_RULES };

function read(): GameRules {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: standard rules.
  }
  if (raw === cache.raw) return cache.rules;
  let rules = STANDARD_RULES;
  try {
    const parsed = makeRules(raw ? (JSON.parse(raw) as Partial<GameRules>) : {});
    if (typeof parsed !== 'string') rules = parsed;
  } catch {
    // Unreadable: standard rules.
  }
  cache = { raw, rules };
  return rules;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
};

export function useGameRules() {
  const rules = useSyncExternalStore(subscribe, read, () => STANDARD_RULES);
  const set = (next: GameRules) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal: the rules just won't be remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  const standard = rules.startingLife === STANDARD_RULES.startingLife && rules.souls === STANDARD_RULES.souls;
  return { rules, set, standard, reset: () => set(STANDARD_RULES) };
}
