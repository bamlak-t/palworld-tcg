import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Monitor, SlidersHorizontal, Users } from 'lucide-react';
import { RULE_LIMITS, type GameRules } from '@pal/engine';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AVATARS } from '@/components/board/Avatar';
import { DeckSelect } from '@/components/DeckSelect';
import { expandDeck, useDecks } from '@/lib/decks';
import { Window } from '@/components/game/Window';
import { gameApi, onlineConfigured, seats } from '@/game/online';
import { useSettings } from '@/lib/settings';
import { usePlayerName } from '@/lib/account';
import { useGameRules } from '@/lib/gameRules';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

/** Pick how to play: an online game (create or join by code) or a game on this screen. */
export function PlayPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const playerName = usePlayerName();
  const [profile, setProfile] = useState({ name: playerName.custom, avatarId: settings.avatarId });
  const decks = useDecks();
  const gameRules = useGameRules();
  const rules = gameRules.rules;
  const setRule = (change: Partial<GameRules>) => gameRules.set({ ...rules, ...change });
  const [deck, setDeck] = useState('trial:ETD01');
  const deckCards = () => expandDeck(decks.all.find((d) => d.id === deck) ?? decks.all[0]!);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = profile.name.trim() || playerName.fallback;
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
        <ProfilePicker profile={profile} onChange={setProfile} placeholder={playerName.fallback} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="play-deck">Your deck</Label>
          <DeckSelect value={deck} onChange={setDeck} id="play-deck" />
        </div>
        <Button
          size="lg"
          disabled={!ready || !onlineConfigured || busy !== null}
          className="h-10 bg-window-trim text-window-trim-foreground hover:bg-window-trim/85"
          onClick={() => void run('create', () => gameApi.create({ ...profile, name }, deckCards(), gameRules.rules))}
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

      <Window
        className="md:col-span-2"
        title={
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" /> Game settings
          </span>
        }
        bodyClassName="flex flex-col gap-4"
      >
        <p className="text-sm text-window-foreground/80">
          For games you create or start here. When you join someone else's game, their settings apply.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <RuleSlider
            label="Starting life"
            id="rule-life"
            value={rules.startingLife}
            limits={RULE_LIMITS.startingLife}
            onChange={(startingLife) => setRule({ startingLife })}
          />
          <RuleSlider
            label="Souls"
            id="rule-souls"
            value={rules.souls}
            limits={RULE_LIMITS.souls}
            onChange={(souls) => setRule({ souls })}
          />
          <RuleChoice
            label="Who goes first"
            hint="The host is whoever creates the game (Player 1 on one screen)."
            value={rules.firstPlayer}
            options={[
              ['random', 'Coin toss'],
              ['host', 'Host first'],
              ['guest', 'Host second'],
            ]}
            onChange={(firstPlayer) => setRule({ firstPlayer })}
          />
          <RuleChoice
            label="Turn timer"
            hint="Out of time: the turn ends (or the response is skipped)."
            value={String(rules.turnSeconds)}
            options={[
              ['60', '60s'],
              ['120', '2 min'],
              ['300', '5 min'],
              ['null', 'Never'],
            ]}
            onChange={(v) => setRule({ turnSeconds: v === 'null' ? null : Number(v) })}
          />
          <RuleChoice
            label="Spectators"
            hint="Online games: up to 3 people can join to watch."
            value={String(rules.spectators)}
            options={[
              ['true', 'Allowed'],
              ['false', 'Not allowed'],
            ]}
            onChange={(v) => setRule({ spectators: v === 'true' })}
          />
          <RuleChoice
            label="Claim the win after"
            hint="Online games: how long an opponent must be disconnected."
            value={String(rules.claimWinSeconds)}
            options={[
              ['60', '1 min'],
              ['180', '3 min'],
              ['300', '5 min'],
            ]}
            onChange={(v) => setRule({ claimWinSeconds: Number(v) })}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-window-foreground/70">
          {gameRules.standard ? 'Standard settings.' : 'Custom settings in use.'}
          {!gameRules.standard && (
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={gameRules.reset}>
              Reset to standard
            </Button>
          )}
        </div>
      </Window>
    </div>
  );
}

function RuleChoice<T extends string>(props: {
  label: string;
  hint: string;
  value: string;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{props.label}</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={props.value}
        onValueChange={(v) => v && props.onChange(v as T)}
        aria-label={props.label}
        className="w-full"
      >
        {props.options.map(([value, label]) => (
          <ToggleGroupItem key={value} value={value} className="flex-1">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-window-foreground/70">{props.hint}</p>
    </div>
  );
}

function RuleSlider(props: {
  label: string;
  id: string;
  value: number;
  limits: { min: number; max: number };
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={props.id}>{props.label}</Label>
        <span className="font-display text-lg font-bold tabular-nums">{props.value}</span>
      </div>
      <Slider
        id={props.id}
        min={props.limits.min}
        max={props.limits.max}
        step={1}
        value={[props.value]}
        onValueChange={([v]) => v !== undefined && props.onChange(v)}
        aria-label={props.label}
      />
    </div>
  );
}

/** Name and avatar, pre-filled from Settings (a blank name uses the placeholder). */
export function ProfilePicker({
  profile,
  onChange,
  placeholder,
}: {
  profile: { name: string; avatarId: string };
  onChange: (p: { name: string; avatarId: string }) => void;
  /** Shown, and used, when the name is left blank. */
  placeholder: string;
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
          placeholder={placeholder}
          maxLength={24}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          className="bg-background/70"
        />
      </div>
    </div>
  );
}
