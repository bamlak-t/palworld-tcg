import { cardDb, textIconUrl } from '@pal/cards';
import { cn } from '@/lib/utils';

/** Life as segments. Life can go above 10 (§3.2.1.1); extra life just shows in the number. */
export function LifeGauge({
  life,
  max = 10,
  stacked,
  compactOnMobile,
}: {
  life: number;
  max?: number;
  stacked?: boolean;
  /** On phones, drop the label and thin the segments so the gauge fits a narrow bar. */
  compactOnMobile?: boolean;
}) {
  const segments = (
    <div className={cn('flex gap-0.5', stacked && 'w-full')}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-4 -skew-x-12 rounded-[2px]',
            stacked
              ? 'flex-1'
              : max > 10 // more life than standard: thinner segments, same overall width
                ? 'w-1 md:w-[5px]'
                : compactOnMobile
                  ? 'w-1.5 md:w-2.5'
                  : 'w-2.5',
            i < life
              ? 'bg-gradient-to-b from-emerald-300 to-emerald-600 shadow-[0_0_6px] shadow-emerald-400/60'
              : 'bg-white/15',
          )}
        />
      ))}
    </div>
  );
  const label = (
    <span
      className={cn('font-display text-xs tracking-widest text-window-trim', compactOnMobile && 'hidden md:inline')}
    >
      LIFE
    </span>
  );
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
