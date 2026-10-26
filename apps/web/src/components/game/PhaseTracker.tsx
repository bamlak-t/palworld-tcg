import { Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PHASES = ['Stand', 'Draw', 'Soul', 'Main', 'End'] as const;
export const BATTLE_STEPS = ['Attack', 'Block', 'Quick', 'Damage', 'End of battle'] as const;

export function PhaseTracker({
  phase,
  battleStep,
  night,
  turn,
  activeName,
}: {
  phase: (typeof PHASES)[number];
  battleStep?: (typeof BATTLE_STEPS)[number];
  night?: boolean;
  turn: number;
  activeName: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <span className="font-display text-xs tracking-widest text-window-trim">
        TURN {turn} · {activeName.toUpperCase()}
      </span>
      <ol className="flex items-center gap-1">
        {PHASES.map((p) => (
          <li
            key={p}
            className={cn(
              'corner-cut px-2.5 py-1 text-xs font-semibold [--cut:6px]',
              p === phase ? 'bg-window-trim text-window-trim-foreground' : 'bg-white/10 text-window-foreground/60',
            )}
          >
            {p}
          </li>
        ))}
      </ol>
      {battleStep && (
        <ol className="flex items-center gap-1 text-[11px]">
          {BATTLE_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              {i > 0 && <span className="text-window-foreground/40">›</span>}
              <span className={cn(s === battleStep ? 'font-bold text-orange-300' : 'text-window-foreground/50')}>
                {s}
              </span>
            </li>
          ))}
        </ol>
      )}
      {night && (
        <span className="flex items-center gap-1 rounded-full bg-indigo-950/70 px-2 py-0.5 text-xs text-indigo-200 ring-1 ring-indigo-400/50">
          <Moon className="size-3" /> Night
        </span>
      )}
    </div>
  );
}
