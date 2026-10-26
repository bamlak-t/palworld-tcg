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

/** Borderless bar between the two halves: turn on the left, the current stage (or a prompt) in the middle, day/night on the right. */
/**
 * Borderless bar between the two halves: day/night and the turn on the left, the current
 * stage (or a prompt) in the middle, your main action on the right. A dotted line runs
 * across it, dividing the two halves.
 */
export function StatusBar({ view, prompt, action }: { view: GameView; prompt?: ReactNode; action?: ReactNode }) {
  const stage = view.battle ? `Battle · ${STEP_NAME[view.battle.step]}` : PHASE_NAME[view.phase];
  const dots = (
    <span aria-hidden className="hidden h-0 min-w-4 flex-1 border-t-2 border-dotted border-board-ink/45 md:block" />
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 py-1 text-board-ink md:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            view.night
              ? 'bg-indigo-950/80 text-indigo-200 ring-1 ring-indigo-400/50'
              : 'bg-amber-200/90 text-amber-900',
          )}
        >
          {view.night ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          {view.night ? 'Night' : 'Day'}
        </span>
        <span className="font-display text-xs tracking-widest uppercase md:text-sm">
          Turn {view.turn} · {view.players[view.activeSeat].name}
        </span>
      </div>
      {dots}
      <div className="order-last flex min-h-9 w-full items-center justify-center gap-2 text-center md:order-none md:w-auto md:shrink">
        {prompt ?? <span className="font-display text-base font-bold tracking-wide md:text-lg">{stage}</span>}
      </div>
      {dots}
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </div>
  );
}
