import { useState, type FormEvent, type ReactNode } from 'react';
import { CloudOff, LoaderCircle, RefreshCw, TriangleAlert, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { onlineConfigured } from '@/game/online';
import { signIn, signOut, signUp, unsyncedChanges, useAccount } from '@/lib/account';
import { syncDecks, useDeckSync } from '@/lib/decks';
import { cn } from '@/lib/utils';

/**
 * Sign in, create an account or sign out. Opened from the header (default trigger) or
 * from any element passed as children.
 */
export function AccountDialog({ children }: { children?: ReactNode }) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            size={account ? 'sm' : 'icon'}
            className={cn(account && 'max-sm:size-9 max-sm:px-0')}
            aria-label={account ? 'Account' : 'Sign in'}
          >
            <UserRound />
            {account && <span className="hidden max-w-28 truncate sm:inline">{account.username}</span>}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        {account ? <SignedIn username={account.username} /> : <SignInForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'signIn' ? signIn : signUp)(username, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <DialogTitle className="font-display text-xl">
          {mode === 'signIn' ? 'Sign in' : 'Create an account'}
        </DialogTitle>
        <DialogDescription className="mt-1">
          Keep your decks in an account and use them on any device. Decks saved on this device move into it. You don't
          need an account to play.
        </DialogDescription>
      </div>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-medium" role="tablist">
        {(
          [
            ['signIn', 'Sign in'],
            ['signUp', 'Create account'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={cn('rounded-md py-1.5 transition', mode === value && 'bg-background shadow-sm')}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-username">Username</Label>
        <Input
          id="account-username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        {mode === 'signUp' && (
          <p className="text-xs text-muted-foreground">3–20 letters, numbers, - or _. Not case-sensitive.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-password">Password</Label>
        <Input
          id="account-password"
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === 'signUp' && (
          <p className="text-xs text-muted-foreground">
            At least 6 characters. There's no password reset, so keep it safe.
          </p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!onlineConfigured && (
        <p className="text-sm text-destructive">Accounts need the online server, which isn't set up here.</p>
      )}
      <Button type="submit" disabled={busy || !onlineConfigured}>
        {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
        {mode === 'signIn' ? 'Sign in' : 'Create account'}
      </Button>
    </form>
  );
}

function SignedIn({ username }: { username: string }) {
  const [confirm, setConfirm] = useState(false);
  const pending = unsyncedChanges(username);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <DialogTitle className="font-display text-xl">{username}</DialogTitle>
        <DialogDescription className="mt-1">
          Your decks are saved to this account and sync to every device you sign in on.
        </DialogDescription>
      </div>
      <SyncStatus />
      {confirm && pending > 0 && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {pending === 1 ? '1 change hasn’t' : `${pending} changes haven’t`} uploaded yet and will be lost if you sign
          out now.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => void syncDecks()}>
          <RefreshCw data-icon="inline-start" /> Sync now
        </Button>
        <Button
          variant={confirm && pending > 0 ? 'destructive' : 'secondary'}
          onClick={() => (pending > 0 && !confirm ? setConfirm(true) : signOut())}
        >
          {confirm && pending > 0 ? 'Sign out anyway' : 'Sign out'}
        </Button>
      </div>
    </div>
  );
}

/** One line on where your decks are kept; used in the account dialog and on the Decks page. */
export function SyncStatus({ className }: { className?: string }) {
  const sync = useDeckSync();
  const account = useAccount();
  const line = (icon: ReactNode, text: ReactNode, tone?: string) => (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', tone, className)}>
      {icon}
      <span>{text}</span>
    </p>
  );
  switch (sync.state) {
    case 'local':
      return line(
        null,
        <>
          Saved on this device only.{' '}
          <AccountDialog>
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline">
              Sign in
            </button>
          </AccountDialog>{' '}
          to use them anywhere.
        </>,
      );
    case 'syncing':
      return line(<LoaderCircle className="size-3.5 animate-spin" />, 'Syncing…');
    case 'synced':
      return line(null, `Synced to ${account?.username ?? 'your account'}.`);
    case 'offline':
      return line(<CloudOff className="size-3.5" />, "Offline: changes are kept here and upload when you're back.");
    case 'error':
      return line(<TriangleAlert className="size-3.5" />, sync.message, 'text-destructive');
  }
}
