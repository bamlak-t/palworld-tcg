import { Shield } from 'lucide-react';
import { imageUrl, type CardDef, type Printing } from '@pal/cards';
import { cn } from '@/lib/utils';

/**
 * A card's face in the shared portrait shape. Structures are printed landscape; they show
 * the left half of the image (cost, art and name), which is almost exactly portrait-shaped,
 * plus a durability badge (top-right, clear of the cost and name) for the part that's
 * cropped off. Fills its container.
 */
export function CardFace({
  card,
  printing,
  durability,
  className,
}: {
  card: CardDef;
  printing?: Printing;
  /** Durability to show for a structure (defaults to the printed value). */
  durability?: number | null;
  className?: string;
}) {
  const structure = card.kind === 'Structure';
  const shown = durability ?? card.power;
  return (
    <div className={cn('@container relative size-full overflow-hidden', className)}>
      <img
        src={imageUrl(printing ?? card)}
        alt={card.name}
        draggable={false}
        loading="lazy"
        className={structure ? 'h-full w-auto max-w-none' : 'size-full object-cover'}
      />
      {structure && shown != null && (
        <span
          className="absolute top-[3%] right-[4%] flex items-center gap-[0.15em] rounded-[0.25em] bg-black/75 px-[0.3em] text-[clamp(9px,8cqw,16px)] font-bold text-white tabular-nums"
          title="Durability"
        >
          <Shield className="size-[1em]" />
          {shown}
        </span>
      )}
    </div>
  );
}
