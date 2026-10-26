import { useState } from 'react';
import { TRIAL_DECKS } from '@pal/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AVATARS } from '@/components/board/Avatar';
import { Board } from '@/components/board/Board';
import { Window } from '@/components/game/Window';
import { useLocalGame, type DeckChoice } from '@/game/useLocalGame';
import { BOARD_SKINS, getSkin } from '@/lib/skins';
import { cn } from '@/lib/utils';

const DECKS: Record<string, DeckChoice> = TRIAL_DECKS;
type DeckKey = keyof typeof TRIAL_DECKS;
type Pair<T> = [T, T];
interface Setup {
  names: Pair<string>;
  decks: Pair<DeckKey>;
  avatars: Pair<string>;
}

const setAt = <T,>(pair: Pair<T>, i: 0 | 1, value: T): Pair<T> => (i === 0 ? [value, pair[1]] : [pair[0], value]);

/** Hot-seat play: two players share one screen. */
export function LocalPlayPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <SetupForm onStart={setSetup} />;
  return <LocalGame key={JSON.stringify(setup)} setup={setup} onQuit={() => setSetup(null)} />;
}

function SetupForm({ onStart }: { onStart: (s: Setup) => void }) {
  const [names, setNames] = useState<Pair<string>>(['Player 1', 'Player 2']);
  const [decks, setDecks] = useState<Pair<DeckKey>>(['ETD01', 'ETD02']);
  const [avatars, setAvatars] = useState<Pair<string>>(['woolly', 'ember']);
  return (
    <div className="mx-auto max-w-xl py-8">
      <Window title="Local game" bodyClassName="flex flex-col gap-6">
        <p className="text-sm text-window-foreground/80">
          Two players, one screen. The board turns to whoever has to act next, so look away when it's not your move.
        </p>
        {([0, 1] as const).map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-window-foreground/80">Player {i + 1}</Label>
                <Input
                  value={names[i]}
                  onChange={(e) => setNames((n) => setAt(n, i, e.target.value))}
                  className="bg-white/90 text-slate-900"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-window-foreground/80">Deck</Label>
                <Select value={decks[i]} onValueChange={(v) => setDecks((d) => setAt(d, i, v as DeckKey))}>
                  <SelectTrigger className="w-full bg-white/90 text-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DECKS).map(([key, deck]) => (
                      <SelectItem key={key} value={key}>
                        {deck.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Player ${i + 1} avatar`}>
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={avatars[i] === a.id}
                  title={a.name}
                  onClick={() => setAvatars((v) => setAt(v, i, a.id))}
                  className={cn(
                    'rounded-full transition',
                    avatars[i] === a.id ? 'scale-110' : 'opacity-55 hover:opacity-100',
                  )}
                >
                  <Avatar avatarId={a.id} size={40} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <Button
          className="bg-window-trim text-window-trim-foreground hover:bg-window-trim/85"
          onClick={() => onStart({ names: [names[0] || 'Player 1', names[1] || 'Player 2'], decks, avatars })}
        >
          Start game
        </Button>
      </Window>
    </div>
  );
}

function LocalGame({ setup, onQuit }: { setup: Setup; onQuit: () => void }) {
  const [players] = useState(
    () =>
      [
        { name: setup.names[0], deck: DECKS[setup.decks[0]]! },
        { name: setup.names[1], deck: DECKS[setup.decks[1]]! },
      ] as Pair<{ name: string; deck: DeckChoice }>,
  );
  const game = useLocalGame(players);
  const [skinId, setSkinId] = useState(() => getSkin(null).id);
  const result = game.view.result;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Viewing as <span className="font-semibold text-foreground">{game.view.players[game.seat].name}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={skinId} onValueChange={setSkinId}>
            <SelectTrigger size="sm" className="w-40" aria-label="Board skin">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOARD_SKINS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={game.restart}>
            New game
          </Button>
          <Button size="sm" variant="ghost" onClick={onQuit}>
            Quit
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
      {result && (
        <Window bodyClassName="flex items-center justify-between gap-3">
          <span className="font-display text-lg font-bold">
            {result.winner === null ? 'Draw' : `${game.view.players[result.winner].name} wins!`}{' '}
            <span className="text-sm font-normal text-window-foreground/80">{result.reason}</span>
          </span>
          <Button
            size="sm"
            className="bg-window-trim text-window-trim-foreground hover:bg-window-trim/85"
            onClick={game.restart}
          >
            Play again
          </Button>
        </Window>
      )}

      <Board
        view={game.view}
        seat={game.seat}
        legal={game.legal}
        dispatch={game.dispatch}
        batches={game.batches}
        skin={getSkin(skinId)}
        avatars={setup.avatars}
      />
    </div>
  );
}
