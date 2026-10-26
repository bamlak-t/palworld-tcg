import { useLayoutEffect, useRef } from 'react';
import { getCard, imageUrl, type CardDef, type Printing } from '@pal/cards';
import { CardText } from '@/components/CardText';
import { cn } from '@/lib/utils';

/**
 * Where each card template prints its rules text, as % of the image. The official images
 * are only 400px wide, so we cover that box with the same text rendered sharply.
 */
const TEXT_BOX: Record<string, { left: number; top: number; width: number; height: number }> = {
  Pal: { left: 4.5, top: 68.5, width: 91, height: 19 },
  Gear: { left: 4.5, top: 68.5, width: 91, height: 16 },
  Event: { left: 4.5, top: 68.5, width: 91, height: 16 },
  Structure: { left: 51, top: 3.5, width: 46, height: 72 },
};

const MAX_FONT = 18;
const MIN_FONT = 7;

/** A card image with its rules text re-rendered crisply on top. */
export function SharpCard({
  card,
  printing,
  sharp = true,
  className,
}: {
  card: CardDef | string;
  printing?: Printing;
  /** Overlay our text on the printed text box. */
  sharp?: boolean;
  className?: string;
}) {
  const def = typeof card === 'string' ? getCard(card) : card;
  const box = def ? TEXT_BOX[def.kind] : undefined;
  if (!def) return null;
  const landscape = def.kind === 'Structure';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[4%/3%]',
        landscape ? 'aspect-[400/286]' : 'aspect-[400/559]',
        className,
      )}
    >
      <img src={imageUrl(printing ?? def)} alt={def.name} className="size-full object-cover" draggable={false} />
      {sharp && box && def.text && (
        <FittedText
          text={def.text}
          style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
        />
      )}
    </div>
  );
}

/** Text that shrinks until it fits its box. */
function FittedText({ text, style }: { text: string; style: React.CSSProperties }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const inner = box.firstElementChild as HTMLElement | null;
      if (!inner) return;
      // Scale with the whole card's width, then shrink until the text fits the box.
      const cardWidth = box.parentElement?.clientWidth ?? box.clientWidth;
      let size = Math.min(MAX_FONT, Math.max(MIN_FONT, cardWidth / 22));
      inner.style.fontSize = `${size}px`;
      while (inner.scrollHeight > box.clientHeight && size > MIN_FONT) {
        size -= 0.5;
        inner.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={boxRef}
      className="absolute overflow-hidden rounded-[3px] bg-parchment shadow-[0_0_0_1px_oklch(0_0_0/0.1)]"
      style={style}
    >
      <CardText text={text} className="rounded-none bg-transparent px-[4%] py-[3%] leading-snug" />
    </div>
  );
}
