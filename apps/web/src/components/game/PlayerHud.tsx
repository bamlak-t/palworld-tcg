import { cardDb, textIconUrl } from '@pal/cards';
import { cn } from '@/lib/utils';

/** Life as segments. Life can go above 10 (§3.2.1.1); extra life just shows in the number. */
export function LifeGauge({ life, max = 10, stacked }: { life: number; max?: number; stacked?: boolean }) {
  const segments = (
    <div className={cn('flex gap-0.5', stacked && 'w-full')}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-4 -skew-x-12 rounded-[2px]',
            stacked ? 'flex-1' : 'w-2.5',
            i < life
              ? 'bg-gradient-to-b from-emerald-300 to-emerald-600 shadow-[0_0_6px] shadow-emerald-400/60'
              : 'bg-white/15',
          )}
        />
      ))}
    </div>
  );
  const label = <span className="font-display text-xs tracking-widest text-window-trim">LIFE</span>;
  const value = <span className="font-display text-lg leading-none font-bold tabular-nums">{life}</span>;

  if (stacked) {
    return (
      <div className="flex flex-col gap-1" aria-label={`Life ${life}`}>
        <div className="flex items-baseline justify-between">
          {label}
          {value}
        </div>
        {segments}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" aria-label={`Life ${life}`}>
      {label}
      {segments}
      {value}
    </div>
  );
}

/** Souls as glowing orbs: lit = standing (available), dim ring = rested (spent), plus what's left in the soul deck. */
export function SoulTracker({ standing, rested, inDeck }: { standing: number; rested: number; inDeck: number }) {
  return (
    <div
      className="flex items-center gap-2"
      aria-label={`${standing} souls available, ${rested} spent, ${inDeck} in soul deck`}
    >
      <span className="font-display text-xs tracking-widest text-window-trim">SOUL</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: standing + rested }, (_, i) =>
          i < standing ? (
            <span
              key={i}
              className="size-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,white,oklch(0.75_0.17_300)_45%,oklch(0.45_0.2_295))] shadow-[0_0_8px] shadow-violet-400/80"
            />
          ) : (
            <span key={i} className="size-3.5 rounded-full border border-violet-300/60 bg-violet-950/40" />
          ),
        )}
      </div>
      <span className="text-xs text-window-foreground/70 tabular-nums">
        {standing}/{standing + rested} · deck {inDeck}
      </span>
    </div>
  );
}

export function ResourceCounter({ kind, value }: { kind: 'Material' | 'Ingredient'; value: number }) {
  const file = cardDb.textIcons[`${kind}@`]!;
  return (
    <div
      className="flex items-center gap-1 rounded-md bg-parchment px-1.5 py-0.5 text-parchment-foreground"
      title={kind}
    >
      <img src={textIconUrl(file)} alt={kind} className="h-4 w-auto" />
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

export function PileCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="font-display text-base font-bold tabular-nums">{value}</span>
      <span className="text-[10px] tracking-wider text-window-foreground/70 uppercase">{label}</span>
    </div>
  );
}
