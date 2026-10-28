import { Hourglass } from 'lucide-react';
import type { Seat } from '@pal/engine';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils';

/** Time left for whoever must move, in games with a turn timer. */
export interface MoveClock {
  seat: Seat;
  /** When they run out (ms since epoch, local clock). */
  deadline: number;
}

export function MoveTimer({ clock, names, you }: { clock: MoveClock; names: [string, string]; you: Seat | null }) {
  const now = useNow(true, 250);
  const left = Math.max(0, Math.ceil((clock.deadline - now) / 1000));
  const who = clock.seat === you ? 'You' : names[clock.seat];
  return (
    <span
      title={`${who}: ${left}s left to move`}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1',
        left <= 10
          ? 'animate-pulse bg-red-600/90 text-white ring-red-300/60'
          : left <= 20
            ? 'bg-amber-400/90 text-amber-950 ring-amber-200/60'
            : 'bg-black/30 text-board-ink ring-board-ink/30',
      )}
    >
      <Hourglass className="size-3" />
      <span className="hidden max-w-20 truncate md:inline">{who}</span>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}
