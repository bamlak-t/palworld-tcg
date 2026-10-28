/**
 * Accounts: a username and password, so your decks and preferences follow you to other devices. Games
 * don't need one. The token is kept in this browser until you sign out.
 */
import { useSyncExternalStore } from 'react';
import { call } from '@/game/online';
import { getAccount, setAccount, subscribeAccount, type Account } from '@/lib/accountStore';
import { adoptGuestDecks, forgetAccountDecks, syncDecks, unsyncedChanges } from '@/lib/decks';
import { forgetPrefsSync, syncPrefs } from '@/lib/prefs';
import { useSettings } from '@/lib/settings';

export type { Account };

async function start(account: Account) {
  setAccount(account);
  const moved = adoptGuestDecks(account);
  await Promise.all([syncDecks(), syncPrefs()]);
  return { moved };
}

export const signIn = async (username: string, password: string) =>
  start(await call<Account>({ op: 'signIn', username, password }));

export const signUp = async (username: string, password: string) =>
  start(await call<Account>({ op: 'signUp', username, password }));

/** Signing out removes the account's decks from this browser; they stay in the account. */
export function signOut() {
  const account = getAccount();
  if (!account) return;
  void call({ op: 'signOut', token: account.token }).catch(() => {
    // The token stops working after 180 days unused anyway.
  });
  forgetAccountDecks(account.username);
  forgetPrefsSync(account.username);
  setAccount(null);
}

export { unsyncedChanges };

export const useAccount = () => useSyncExternalStore(subscribeAccount, getAccount, () => null);

const DEFAULT_PLAYER_NAME = 'Player 1';

/**
 * Your name for new games. `custom` is the name set in Settings ('' if never changed);
 * a blank name field falls back to `fallback`: your username when signed in, else "Player 1".
 */
export function usePlayerName() {
  const { settings } = useSettings();
  const account = useAccount();
  const name = settings.playerName.trim();
  return { custom: name === DEFAULT_PLAYER_NAME ? '' : name, fallback: account?.username ?? DEFAULT_PLAYER_NAME };
}
