/**
 * Accounts: a username and password, so your decks follow you to other devices. Games
 * don't need one. The token is kept in this browser until you sign out.
 */
import { useSyncExternalStore } from 'react';
import { call } from '@/game/online';
import { getAccount, setAccount, subscribeAccount, type Account } from '@/lib/accountStore';
import { adoptGuestDecks, forgetAccountDecks, syncDecks, unsyncedChanges } from '@/lib/decks';

export type { Account };

async function start(account: Account) {
  setAccount(account);
  const moved = adoptGuestDecks(account);
  await syncDecks();
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
  setAccount(null);
}

export { unsyncedChanges };

export const useAccount = () => useSyncExternalStore(subscribeAccount, getAccount, () => null);
