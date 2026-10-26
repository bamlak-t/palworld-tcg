import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Monitor, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AVATARS } from '@/components/board/Avatar';
import { DeckSelect } from '@/components/DeckSelect';
import { expandDeck, useDecks } from '@/lib/decks';
import { Window } from '@/components/game/Window';
import { gameApi, onlineConfigured, seats } from '@/game/online';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

/** Pick how to play: an online game (create or join by code) or a game on this screen. */
export function PlayPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [profile, setProfile] = useState({ name: settings.playerName, avatarId: settings.avatarId });
  const decks = useDecks();
  const [deck, setDeck] = useState('trial:ETD01');
  const deckCards = () => expandDeck(decks.all.find((d) => d.id === deck) ?? decks.all[0]!);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = profile.name.trim();
  const ready = name.length > 0;

  const run = async (kind: 'create' | 'join', fn: () => Promise<{ code: string; seatToken?: string }>) => {
    setBusy(kind);
    setError(null);
    try {
      const info = await fn();
      if (info.seatToken) seats.set(info.code, info.seatToken);
      navigate(`/play/${info.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setError('Game codes are 6 characters.');
    void run('join', () => gameApi.join(c, { ...profile, name }, deckCards()));
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-6 py-6 md:grid-cols-[1.4fr_1fr]">
      <Window
        title={
          <span className="flex items-center gap-2">
            <Users className="size-4" /> Play online
          </span>
        }
        bodyClassName="flex flex-col gap-5"
      >
        {!onlineConfigured && (
          <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            Online play isn't configured for this build.
          </p>
        )}
        <ProfilePicker profile={profile} onChange={setProfile} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="play-deck">Your deck</Label>
          <DeckSelect value={deck} onChange={setDeck} id="play-deck" />
        </div>
        <Button
          size="lg"
          disabled={!ready || !onlineConfigured || busy !== null}
          className="h-10 bg-window-trim text-window-trim-foreground hover:bg-window-trim/85"
          onClick={() => void run('create', () => gameApi.create({ ...profile, name }, deckCards()))}
        >
          {busy === 'create' ? 'Creating…' : 'Create a game'}
        </Button>
        <form onSubmit={onJoin} className="flex flex-col gap-1.5">
          <Label htmlFor="join-code">Or join with a code</Label>
          <div className="flex gap-2">
            <Input
              id="join-code"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              className="h-10 bg-background/70 font-display text-lg tracking-[0.3em] uppercase"
              autoComplete="off"
              aria-describedby="join-hint"
            />
            <Button
              type="submit"
              size="lg"
              variant="secondary"
              className="h-10"
              disabled={!ready || !onlineConfigured || busy !== null}
            >
              {busy === 'join' ? 'Joining…' : 'Join'}
            </Button>
          </div>
          <p id="join-hint" className="text-xs text-window-foreground/70">
            If two players are already in, you'll join as a spectator (up to 3).
          </p>
        </form>
        {error && <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      </Window>

      <Window
        title={
          <span className="flex items-center gap-2">
            <Monitor className="size-4" /> Same screen
          </span>
        }
        bodyClassName="flex h-full flex-col gap-4"
      >
        <p className="text-sm text-window-foreground/80">Two players take turns on this device.</p>
        <Button asChild size="lg" variant="secondary" className="mt-auto h-10">
          <Link to="/play/local">Start a local game</Link>
        </Button>
      </Window>
    </div>
  );
}

/** Name and avatar, pre-filled from Settings. */
export function ProfilePicker({
  profile,
  onChange,
}: {
  profile: { name: string; avatarId: string };
  onChange: (p: { name: string; avatarId: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 py-1" role="radiogroup" aria-label="Your avatar">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={profile.avatarId === a.id}
            title={a.name}
            onClick={() => onChange({ ...profile, avatarId: a.id })}
            className={cn(
              'rounded-full transition',
              profile.avatarId === a.id ? 'scale-110' : 'opacity-55 hover:opacity-100',
            )}
          >
            <Avatar avatarId={a.id} size={44} />
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Your name</Label>
        <Input
          id="profile-name"
          value={profile.name}
          maxLength={24}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          className="bg-background/70"
        />
      </div>
    </div>
  );
}
