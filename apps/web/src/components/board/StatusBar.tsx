import type { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { GameView } from '@pal/engine';
import { cn } from '@/lib/utils';

const PHASE_NAME = {
  setup: 'Setup',
  stand: 'Stand phase',
  draw: 'Draw phase',
  soul: 'Soul phase',
  main: 'Main phase',
  end: 'End phase',
} as const;
const STEP_NAME = {
  attack: 'Attack',
  block: 'Block step',
  quick: 'Quick step',
  damage: 'Damage step',
  endOfBattle: 'End of battle',
} as const;

const Dots = () => <span aria-hidden className="h-0 min-w-3 flex-1 border-t-2 border-dotted border-board-ink/45" />;

/**
 * Borderless bar between the two halves: day/night and the turn on the left, the stage in
 * the centre of the board, your main action on the right, joined by a dotted line. The
 * outer columns share the leftover width equally, so the stage stays centred whatever is
 * either side. Prompts take the centre on wide screens and a row of their own on phones.
 */
export function StatusBar({
  view,
  prompt,
  action,
  timer,
}: {
  view: GameView;
  prompt?: ReactNode;
  action?: ReactNode;
  /** The move timer, in timed games. */
  timer?: ReactNode;
}) {
  const stage = view.battle ? `Battle · ${STEP_NAME[view.battle.step]}` : PHASE_NAME[view.phase];
  const stageText = (
    <span className="font-display text-sm font-bold tracking-wide whitespace-nowrap md:text-lg">{stage}</span>
  );
  return (
    <div className="flex flex-col gap-1 px-1 py-1 text-board-ink">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            title={view.night ? 'Night' : 'Day'}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full p-1.5 text-xs font-semibold md:px-3 md:py-1',
              view.night
                ? 'bg-indigo-950/80 text-indigo-200 ring-1 ring-indigo-400/50'
                : 'bg-amber-200/90 text-amber-900',
            )}
          >
            {view.night ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
            <span className="hidden md:inline">{view.night ? 'Night' : 'Day'}</span>
          </span>
          <span className="shrink-0 font-display text-xs tracking-widest uppercase md:text-sm">
            <span className="md:hidden">T{view.turn}</span>
            <span className="hidden md:inline">
              Turn {view.turn} · {view.players[view.activeSeat].name}
            </span>
          </span>
          <Dots />
        </div>

        <div className="flex min-h-9 items-center justify-center gap-2 text-center">
          {prompt ? (
            <>
              <span className="md:hidden">{stageText}</span>
              <span className="hidden items-center gap-2 md:flex">{prompt}</span>
            </>
          ) : (
            stageText
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Dots />
          <div className="flex shrink-0 items-center gap-2">
            {timer}
            {action}
          </div>
        </div>
      </div>

      {prompt && <div className="flex flex-wrap items-center justify-center gap-2 text-center md:hidden">{prompt}</div>}
    </div>
  );
}
