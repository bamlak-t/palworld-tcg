import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AVATARS } from '@/components/board/Avatar';
import { Board } from '@/components/board/Board';
import { DeckSelect } from '@/components/DeckSelect';
import { expandDeck, useDecks } from '@/lib/decks';
import { Window } from '@/components/game/Window';
import { useLocalGame, type DeckChoice } from '@/game/useLocalGame';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

type Pair<T> = [T, T];
interface Setup {
  names: Pair<string>;
  /** Deck ids from the deck list (saved or starter). */
  decks: Pair<string>;
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
  const { settings } = useSettings();
  // Start empty (blank names fall back to "Player 1/2"), unless you've set a name in Settings.
  const savedName = settings.playerName.trim() === 'Player 1' ? '' : settings.playerName.trim();
  const [names, setNames] = useState<Pair<string>>([savedName, '']);
  const [decks, setDecks] = useState<Pair<string>>(['trial:ETD01', 'trial:ETD02']);
  const [avatars, setAvatars] = useState<Pair<string>>([
    settings.avatarId,
    AVATARS.find((a) => a.id !== settings.avatarId)!.id,
  ]);
  return (
    <div className="mx-auto max-w-xl py-8">
      <Window title="Local game" bodyClassName="flex flex-col gap-6">
        {([0, 1] as const).map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 py-2" role="radiogroup" aria-label={`Player ${i + 1} avatar`}>
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
                  <Avatar avatarId={a.id} size={44} />
                </button>
              ))}
            </div>
            {/* Theme colours (not fixed white/black) so the fields read well in light and dark. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`player-${i}`}>Player {i + 1}</Label>
                <Input
                  id={`player-${i}`}
                  value={names[i]}
                  onChange={(e) => setNames((n) => setAt(n, i, e.target.value))}
                  className="bg-background/70"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Deck</Label>
                <DeckSelect value={decks[i]} onChange={(v) => setDecks((d) => setAt(d, i, v))} />
              </div>
            </div>
          </div>
        ))}
        <Button
          size="lg"
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
  const { all } = useDecks();
  const deckChoice = (id: string): DeckChoice => {
    const d = all.find((x) => x.id === id) ?? all[0]!;
    return { name: d.name, cards: expandDeck(d) };
  };
  const [players] = useState(
    () =>
      [
        { name: setup.names[0], deck: deckChoice(setup.decks[0]) },
        { name: setup.names[1], deck: deckChoice(setup.decks[1]) },
      ] as Pair<{ name: string; deck: DeckChoice }>,
  );
  const game = useLocalGame(players);
  const { skin } = useSettings();
  const result = game.view.result;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Viewing as <span className="font-semibold text-foreground">{game.view.players[game.seat].name}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="lg" className="h-10 px-4 md:h-9" variant="outline" onClick={game.restart}>
            New game
          </Button>
          <Button size="lg" className="h-10 px-4 md:h-9" variant="ghost" onClick={onQuit}>
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
        skin={skin}
        avatars={setup.avatars}
      />
    </div>
  );
}
