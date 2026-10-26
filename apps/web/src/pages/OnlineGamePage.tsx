import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Check, Copy, Eye, Users } from 'lucide-react';
import type { SessionInfo } from '@pal/server';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/board/Avatar';
import { Board } from '@/components/board/Board';
import { Window } from '@/components/game/Window';
import { gameApi, gameLink, seats } from '@/game/online';
import { useOnlineGame } from '@/game/useOnlineGame';
import { useSettings } from '@/lib/settings';
import { DECK_OPTIONS, ProfilePicker, type DeckKey } from './PlayPage';

/** /play/:code — join if you don't have a seat yet, then the lobby or the game. */
export function OnlineGamePage() {
  const code = (useParams().code ?? '').toUpperCase();
  const [token, setToken] = useState(() => seats.get(code));
  if (!token) return <JoinForm code={code} onJoined={setToken} />;
  return <OnlineGame key={token} code={code} token={token} />;
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const { settings } = useSettings();
  const [profile, setProfile] = useState({ name: settings.playerName, avatarId: settings.avatarId });
  const [deck, setDeck] = useState<DeckKey>('ETD02');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await gameApi.join(code, { ...profile, name: profile.name.trim() }, deck);
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
        <ProfilePicker profile={profile} onChange={setProfile} />
        <div className="flex flex-col gap-1.5">
          <Label>Your deck (if you get a player seat)</Label>
          <Select value={deck} onValueChange={(v) => setDeck(v as DeckKey)}>
            <SelectTrigger className="w-full bg-background/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECK_OPTIONS.map(([key, d]) => (
                <SelectItem key={key} value={key}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="lg"
          className="h-10 bg-window-trim text-window-trim-foreground hover:bg-window-trim/85"
          disabled={busy || !profile.name.trim()}
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
    navigate('/play');
  };

  if (game.gone) {
    seats.remove(code);
    return (
      <Message title="Game not found">
        This game has ended or the link is wrong.{' '}
        <Link to="/play" className="underline">
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
                <Link to="/play">Back to Play</Link>
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

function Lobby({ info }: { info: SessionInfo }) {
  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <Window title="Waiting for an opponent" bodyClassName="flex flex-col gap-5">
        <div className="text-center">
          <p className="text-xs text-window-foreground/70">Share this code</p>
          <p className="font-display text-4xl font-bold tracking-[0.3em] text-window-trim">{info.code}</p>
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
