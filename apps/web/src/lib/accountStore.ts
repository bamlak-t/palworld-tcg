/** Who is signed in on this browser: { username, token }, or null. See lib/account.ts. */
const STORAGE_KEY = 'pal-account';
const CHANGE_EVENT = 'pal-account-changed';

export interface Account {
  username: string;
  token: string;
}

let cache: { raw: string | null; account: Account | null } = { raw: null, account: null };

export function getAccount(): Account | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: signed out.
  }
  if (raw === cache.raw) return cache.account;
  let account: Account | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as Account) : null;
    if (parsed && typeof parsed.username === 'string' && typeof parsed.token === 'string') account = parsed;
  } catch {
    // Unreadable: signed out.
  }
  cache = { raw, account };
  return account;
}

export function setAccount(account: Account | null) {
  try {
    if (account) localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal: you'll just be signed out next visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const subscribeAccount = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};
