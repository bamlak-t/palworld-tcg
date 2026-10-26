import { imageUrl, type CardDef, type Printing } from '@pal/cards';
import { cn } from '@/lib/utils';

const RARE = new Set(['SR', 'OSR', 'SSP', 'SP', 'TSR', 'TSP', 'TDR', 'SSS']);

const SIZES = { xs: 56, sm: 84, md: 112, lg: 160 } as const;

export interface GameCardProps {
  card?: CardDef;
  printing?: Printing;
  faceDown?: boolean;
  rested?: boolean;
  /** Damage taken this turn; cleared in the end phase. */
  damage?: number;
  /** Net power change from effects (e.g. Nocturnal +300). */
  powerMod?: number;
  /** 'lucky' = a Lucky Pal that just cancelled damage (prismatic ring). */
  state?: 'attacking' | 'target' | 'selectable' | 'assigned' | 'lucky';
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * A card as it sits on the board. Rested cards turn sideways and the slot reserves
 * the rotated footprint so neighbours don't overlap.
 */
export function GameCard({
  card,
  printing,
  faceDown,
  rested,
  damage = 0,
  powerMod = 0,
  state,
  size = 'md',
  className,
}: GameCardProps) {
  const landscape = card?.kind === 'Structure';
  const short = SIZES[size];
  const long = Math.round((short * 559) / 400);
  const [w, h] = landscape ? [long, short] : [short, long];
  const [slotW, slotH] = rested ? [h, w] : [w, h];
  const p = printing ?? card?.printings[0];
  const rare = !faceDown && p && RARE.has(p.rarity);
  const power = card?.power != null ? card.power + powerMod : null;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: slotW, height: slotH }}>
      {state === 'lucky' && (
        <div
          aria-hidden
          className="prismatic-ring absolute top-1/2 left-1/2 rounded-[7%/5.5%]"
          style={{
            width: w + 8,
            height: h + 8,
            transform: `translate(-50%, -50%) rotate(${rested ? 90 : 0}deg)`,
          }}
        />
      )}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 overflow-hidden rounded-[6%/4.5%] shadow-md transition-transform duration-300',
          rare && 'holo',
          state === 'attacking' && 'ring-3 ring-orange-400',
          state === 'target' && 'ring-3 ring-red-500',
          state === 'selectable' && 'ring-3 ring-sky-400 hover:-translate-y-1',
          state === 'assigned' && 'opacity-80 saturate-50',
        )}
        style={{
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotate(${rested ? 90 : 0}deg)`,
        }}
      >
        {faceDown || !card ? (
          <div className="card-back size-full rounded-[inherit]" />
        ) : (
          <img src={imageUrl(p!)} alt={card.name} className="size-full object-cover" draggable={false} />
        )}
      </div>

      {!faceDown && power != null && (damage > 0 || powerMod !== 0) && (
        <div className="absolute -top-2 -right-2 z-10 flex flex-col items-end gap-0.5">
          {powerMod !== 0 && (
            <span
              className={cn(
                'rounded-full px-1.5 text-[11px] font-bold text-white shadow tabular-nums',
                powerMod > 0 ? 'bg-emerald-600' : 'bg-rose-700',
              )}
              title={`Power ${card!.power} ${powerMod > 0 ? '+' : ''}${powerMod}`}
            >
              {power}
            </span>
          )}
          {damage > 0 && (
            <span
              className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white shadow tabular-nums"
              title="Damage taken this turn"
            >
              −{damage}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
