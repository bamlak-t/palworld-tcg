import type { GameView } from '@pal/engine';
import { cn } from '@/lib/utils';

const PHASES = [
  ['stand', 'Stand'],
  ['draw', 'Draw'],
  ['soul', 'Soul'],
  ['main', 'Main'],
  ['end', 'End'],
] as const;

/** The turn's phases, like the "Flow of the Game" panel on the official playmat. */
export function PhaseFlow({ phase }: { phase: GameView['phase'] }) {
  return (
    <ol className="flex flex-col gap-1" aria-label="Turn phases">
      {PHASES.map(([id, label]) => (
        <li
          key={id}
          aria-current={phase === id ? 'step' : undefined}
          className={cn(
            'corner-cut px-3 py-1 text-xs font-semibold tracking-wide uppercase [--cut:6px]',
            phase === id ? 'bg-hud-border text-hud' : 'bg-hud/60 text-hud-foreground/70',
          )}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
