import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Check, Copy, Eye, Users, WifiOff } from 'lucide-react';
import { AWAY_AFTER_SECONDS, type SessionInfo } from '@pal/server';
import { useNow } from '@/hooks/useNow';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/board/Avatar';
import { Board } from '@/components/board/Board';
import { Window } from '@/components/game/Window';
import { gameApi, gameLink, seats } from '@/game/online';
import { useOnlineGame } from '@/game/useOnlineGame';
import { useSettings } from '@/lib/settings';
import { usePlayerName } from '@/lib/account';
import { ProfilePicker } from './PlayPage';
import { DeckSelect } from '@/components/DeckSelect';
import { expandDeck, useDecks } from '@/lib/decks';

/** /play/:code — join if you don't have a seat yet, then the lobby or the game. */
export function OnlineGamePage() {
  const code = (useParams().code ?? '').toUpperCase();
  const [token, setToken] = useState(() => seats.get(code));
  if (!token) return <JoinForm code={code} onJoined={setToken} />;
  return <OnlineGame key={token} code={code} token={token} />;
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const { settings } = useSettings();
  const playerName = usePlayerName();
  const [profile, setProfile] = useState({ name: playerName.custom, avatarId: settings.avatarId });
  const name = profile.name.trim() || playerName.fallback;
  const decks = useDecks();
  const [deck, setDeck] = useState('trial:ETD02');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await gameApi.join(
        code,
        { ...profile, name },
        expandDeck(decks.all.find((d) => d.id === deck) ?? decks.all[0]!),
      );
      seats.set(code, info.seatToken!);
      onJoined(info.seatToken!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg py-6">
      <Window title={`Join game ${code}`} bodyClassName="flex flex-col gap-5">
        <ProfilePicker profile={profile} onChange={setProfile} placeholder={playerName.fallback} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="join-deck">Your deck (if you get a player seat)</Label>
          <DeckSelect value={deck} onChange={setDeck} id="join-deck" />
        </div>
        <Button
          size="lg"
          className="h-10 bg-window-trim text-window-trim-foreground hover:bg-window-trim/85"
          disabled={busy}
          onClick={() => void join()}
        >
          {busy ? 'Joining…' : 'Join game'}
        </Button>
        {error && <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      </Window>
    </div>
  );
}

function OnlineGame({ code, token }: { code: string; token: string }) {
  const navigate = useNavigate();
  const { skin } = useSettings();
  const game = useOnlineGame(code, token);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const info = game.info;

  const leave = async () => {
    await game.leave().catch(() => undefined);
    seats.remove(code);
    navigate('/');
  };

  if (game.gone) {
    seats.remove(code);
    return (
      <Message title="Game not found">
        This game has ended or the link is wrong.{' '}
        <Link to="/" className="underline">
          Back to Play
        </Link>
      </Message>
    );
  }
  if (!info) return <Message title={`Game ${code}`}>Connecting…</Message>;

  const spectator = info.role === 'spectator';
  const playing = info.status !== 'waiting' && info.view;
  const avatarOf = (role: 'p1' | 'p2') => info.members.find((m) => m.role === role)?.avatarId ?? 'woolly';
  const leaveLabel = spectator || info.status !== 'playing' ? 'Leave' : 'Concede';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {spectator ? (
            <span className="flex items-center gap-1.5">
              <Eye className="size-4" /> Spectating game <b className="text-foreground">{code}</b>
            </span>
          ) : (
            <>
              Game <b className="text-foreground">{code}</b> · you are{' '}
              <b className="text-foreground">{info.members.find((m) => m.role === info.role)?.name}</b>
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CopyLinkButton code={code} />
          <Button
            size="lg"
            variant="ghost"
            className="h-10 px-4 md:h-9"
            onClick={() => (info.status === 'playing' && !spectator ? setConfirmLeave(true) : void leave())}
          >
            {leaveLabel}
          </Button>
        </div>
      </div>

      <ConnectionBanner
        info={info}
        receivedAt={game.receivedAt}
        reconnecting={game.reconnecting}
        onClaimWin={() => void game.claimWin()}
      />

      {game.error && (
        <button
          onClick={game.clearError}
          className="rounded-md bg-destructive/15 px-3 py-2 text-left text-sm text-destructive"
        >
          {game.error}
        </button>
      )}

      {!playing ? (
        <Lobby info={info} />
      ) : (
        <>
          {info.view!.result && (
            <Window bodyClassName="flex items-center justify-between gap-3">
              <span className="font-display text-lg font-bold">
                {info.view!.result.winner === null
                  ? 'Draw'
                  : `${info.view!.players[info.view!.result.winner].name} wins!`}{' '}
                <span className="text-sm font-normal text-window-foreground/80">{info.view!.result.reason}</span>
              </span>
              <Button asChild size="sm" className="bg-window-trim text-window-trim-foreground hover:bg-window-trim/85">
                <Link to="/">Back to Play</Link>
              </Button>
            </Window>
          )}
          <Board
            view={info.view!}
            seat={info.seat ?? 0}
            legal={info.legal}
            dispatch={(a) => void game.dispatch(a)}
            batches={game.batches}
            skin={skin}
            avatars={[avatarOf('p1'), avatarOf('p2')]}
            readOnly={spectator}
            clock={game.clock}
          />
        </>
      )}

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Concede this game?</DialogTitle>
          <DialogDescription>Leaving a game in progress counts as a loss.</DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Keep playing</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void leave()}>
              Concede and leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Your own connection dropping ("Reconnecting…"), or a player who has stopped checking in.
 * After info.rules.claimWinSeconds a player can claim the win; the server checks the time too.
 */
function ConnectionBanner({
  info,
  receivedAt,
  reconnecting,
  onClaimWin,
}: {
  info: SessionInfo;
  receivedAt: number;
  reconnecting: boolean;
  onClaimWin: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const playing = info.status === 'playing';
  const players = info.members.filter((m) => m.role !== 'spectator' && m.role !== info.role);
  const now = useNow(playing && players.length > 0);
  const elapsed = Math.max(0, Math.floor((now - receivedAt) / 1000));
  // While you're offline yourself, you can't tell whether the others are still there.
  const away = reconnecting || !playing ? [] : players.filter((m) => m.secondsAway + elapsed >= AWAY_AFTER_SECONDS);

  if (reconnecting) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
        <WifiOff className="size-4 shrink-0" /> Connection lost. Reconnecting…
      </p>
    );
  }
  if (away.length === 0) return null;

  return (
    <>
      {away.map((m) => {
        const seconds = m.secondsAway + elapsed;
        const canClaim = info.role !== 'spectator' && seconds >= info.rules.claimWinSeconds;
        return (
          <div
            key={m.role}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
          >
            <WifiOff className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <b>{m.name}</b> seems to have disconnected ({mmss(seconds)}).{' '}
              {info.role === 'spectator'
                ? 'Waiting for them to come back.'
                : canClaim
                  ? 'You can wait, or claim the win.'
                  : `If they're not back within ${mmss(info.rules.claimWinSeconds)}, you can claim the win.`}
            </span>
            {canClaim && (
              <Button size="sm" onClick={() => setConfirm(true)}>
                Claim win
              </Button>
            )}
          </div>
        );
      })}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Claim the win?</DialogTitle>
          <DialogDescription>
            Your opponent has been disconnected for a while. This ends the game in your favour.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Keep waiting</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setConfirm(false);
                onClaimWin();
              }}
            >
              Claim win
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FIRST = {
  choose: 'random player chooses who goes first',
  random: 'coin toss for first',
  host: 'host goes first',
  guest: 'host goes second',
} as const;

/** "15 life · 10 souls · host goes first · 2 min turns" */
function describeRules(r: SessionInfo['rules']) {
  const timer =
    r.turnSeconds === null
      ? 'no turn timer'
      : r.turnSeconds < 120
        ? `${r.turnSeconds}s turns`
        : `${r.turnSeconds / 60} min turns`;
  return [
    `${r.startingLife} life`,
    `${r.souls} souls`,
    FIRST[r.firstPlayer],
    timer,
    r.spectators ? null : 'no spectators',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Lobby({ info }: { info: SessionInfo }) {
  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <Window title="Waiting for an opponent" bodyClassName="flex flex-col gap-5">
        <div className="text-center">
          <p className="text-xs text-window-foreground/70">Share this code</p>
          <p className="font-display text-4xl font-bold tracking-[0.3em] text-window-trim">{info.code}</p>
          <p className="mt-1 text-xs text-window-foreground/70">{describeRules(info.rules)}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {info.members.map((m) => (
            <li
              key={`${m.role}-${m.name}`}
              className="flex items-center gap-3 rounded-md bg-window-foreground/5 px-3 py-2"
            >
              <Avatar avatarId={m.avatarId} size={36} />
              <span className="font-medium">{m.name}</span>
              <span className="ml-auto text-xs text-window-foreground/70">
                {m.role === 'spectator' ? 'Spectator' : 'Player'}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-md border border-dashed border-window-foreground/25 px-3 py-2 text-sm text-window-foreground/60">
            <Users className="size-4" /> Waiting for player 2…
          </li>
        </ul>
        <div className="flex justify-center">
          <CopyLinkButton code={info.code} large />
        </div>
      </Window>
    </div>
  );
}

function CopyLinkButton({ code, large }: { code: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(gameLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is on screen to share instead.
    }
  };
  return (
    <Button
      size={large ? 'lg' : 'sm'}
      variant="secondary"
      className={large ? 'h-10' : undefined}
      onClick={() => void copy()}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? 'Link copied' : 'Copy invite link'}
    </Button>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg py-10">
      <Window title={title}>
        <p className="text-sm">{children}</p>
      </Window>
    </div>
  );
}
