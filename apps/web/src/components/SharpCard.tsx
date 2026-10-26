import { useLayoutEffect, useRef } from 'react';
import { getCard, hasStandardFrame, imageUrl, TEXT_BOX, type CardDef, type Printing } from '@pal/cards';
import { CardText } from '@/components/CardText';
import { cn } from '@/lib/utils';

/** Overlay colour: matches the printed parchment. */
const OVERLAY_BG = '#E4DDCC';
/** Pull the overlay in from the box edges so it doesn't sit on the printed border. */
const INSET_PX = 1.5;

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
  if (!def) return null;
  const shown = printing ?? def.printings[0]!;
  // Full-art printings print their text over the artwork, so there's no box to cover.
  const box = hasStandardFrame(shown) ? TEXT_BOX[def.kind] : undefined;
  const landscape = def.kind === 'Structure';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[4%/3%]',
        landscape ? 'aspect-[400/286]' : 'aspect-[400/559]',
        className,
      )}
    >
      <img src={imageUrl(shown)} alt={def.name} className="size-full object-cover" draggable={false} />
      {sharp && box && def.text && (
        <FittedText
          text={def.text}
          style={{
            left: `calc(${box.left}% + ${INSET_PX}px)`,
            top: `calc(${box.top}% + ${INSET_PX}px)`,
            width: `calc(${box.width}% - ${INSET_PX * 2}px)`,
            height: `calc(${box.height}% - ${INSET_PX * 2}px)`,
            background: OVERLAY_BG,
          }}
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
    // Inline icons change the text height once they load, so fit again then.
    box.addEventListener('load', fit, true);
    return () => {
      ro.disconnect();
      box.removeEventListener('load', fit, true);
    };
  }, [text]);

  return (
    <div ref={boxRef} className="absolute overflow-hidden rounded-[2px]" style={style}>
      <CardText text={text} className="rounded-none bg-transparent px-[4%] py-[3%] leading-snug" />
    </div>
  );
}
