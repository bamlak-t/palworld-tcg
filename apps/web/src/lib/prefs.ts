/**
 * UI preferences follow a signed-in player between devices: settings (board skin, player
 * name and avatar, reduce motion), the light/dark theme and the house rules for new games.
 * Each still lives in its own localStorage key; this module copies them to and from the
 * account. Signing in takes the account's preferences if it has any, otherwise uploads
 * this device's. Later changes upload shortly after they're made.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { call } from '@/game/online';
import { getAccount, subscribeAccount } from '@/lib/accountStore';

const KEYS = { settings: 'pal-settings', theme: 'pal-theme', rules: 'pal-game-rules' } as const;
type Prefs = Partial<Record<keyof typeof KEYS, unknown>>;

/** Fired after preferences from the account were written locally; providers reload then. */
export const PREFS_APPLIED = 'pal-prefs-applied';

/** Changed here but not uploaded yet (e.g. offline). */
const dirtyKey = (username: string) => `pal-prefs-dirty@${username}`;

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Non-fatal.
    }
  },
};

function collect(): Prefs {
  const prefs: Prefs = {};
  for (const [name, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    const raw = storage.get(key);
    if (raw === null) continue;
    try {
      prefs[name] = name === 'theme' ? raw : JSON.parse(raw);
    } catch {
      // Unreadable: leave it out.
    }
  }
  return prefs;
}

function apply(prefs: Prefs) {
  for (const [name, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    const value = prefs[name];
    if (value === undefined) continue;
    storage.set(key, name === 'theme' ? String(value) : JSON.stringify(value));
  }
  window.dispatchEvent(new Event(PREFS_APPLIED));
}

/** JSON with sorted keys: the database doesn't keep key order. */
const canonical = (v: unknown): string =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
        .join(',')}}`
    : JSON.stringify(v);

let timer: ReturnType<typeof setTimeout> | null = null;

/** Call after changing a preference: uploads it to the account (if signed in) shortly after. */
export function prefsChanged() {
  const account = getAccount();
  if (!account) return;
  storage.set(dirtyKey(account.username), '1');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncPrefs(), 800);
}

let lastSync = 0;
/** Coming back to the tab syncs again, at most this often. */
const RESYNC_AFTER_MS = 10_000;

/** Keeps preferences in sync while signed in: on load and when the tab comes back. */
export function usePrefsSync() {
  const account = useSyncExternalStore(subscribeAccount, getAccount, () => null);
  const token = account?.token;
  useEffect(() => {
    if (!token) return;
    const resync = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync > RESYNC_AFTER_MS) void syncPrefs();
    };
    resync();
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    return () => {
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [token]);
}

/** Uploads local changes, or else takes the account's preferences (if it has any). */
export async function syncPrefs() {
  const account = getAccount();
  if (!account) return;
  lastSync = Date.now();
  try {
    if (storage.get(dirtyKey(account.username))) {
      const sent = collect();
      await call({ op: 'savePrefs', token: account.token, prefs: sent });
      // Changed again during the upload: leave it dirty for the next sync.
      if (canonical(collect()) === canonical(sent)) storage.set(dirtyKey(account.username), null);
      return;
    }
    const { prefs } = await call<{ prefs: Prefs | null }>({ op: 'prefs', token: account.token });
    if (getAccount()?.token !== account.token) return;
    if (!prefs) await call({ op: 'savePrefs', token: account.token, prefs: collect() });
    else if (canonical(prefs) !== canonical(collect())) apply(prefs);
  } catch {
    // Offline or signed out: local preferences still work; the next sync catches up.
  }
}

export function forgetPrefsSync(username: string) {
  storage.set(dirtyKey(username), null);
}
