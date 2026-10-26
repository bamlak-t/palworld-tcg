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
export function StatusBar({ view, prompt }: { view: GameView; prompt?: ReactNode }) {
  const stage = view.battle ? `Battle · ${STEP_NAME[view.battle.step]}` : PHASE_NAME[view.phase];
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-2 py-1 text-white">
      <span className="font-display text-sm tracking-widest uppercase drop-shadow">
        Turn {view.turn} · {view.players[view.activeSeat].name}
      </span>
      <div className="flex min-h-9 items-center justify-center gap-2 text-center">
        {prompt ?? <span className="font-display text-lg font-bold tracking-wide drop-shadow">{stage}</span>}
      </div>
      <span
        className={cn(
          'flex items-center gap-1.5 justify-self-end rounded-full px-3 py-1 text-xs font-semibold',
          view.night ? 'bg-indigo-950/80 text-indigo-200 ring-1 ring-indigo-400/50' : 'bg-amber-200/90 text-amber-900',
        )}
      >
        {view.night ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
        {view.night ? 'Night' : 'Day'}
      </span>
    </div>
  );
}
