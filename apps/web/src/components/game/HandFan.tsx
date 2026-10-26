import type { CardDef } from '@pal/cards';
import { GameCard } from './GameCard';

/** The player's hand, fanned. Hovered cards lift; playable cards get a highlight. */
export function HandFan({ cards, playable = [] }: { cards: CardDef[]; playable?: string[] }) {
  const mid = (cards.length - 1) / 2;
  return (
    <div className="flex justify-center pt-6">
      {cards.map((c, i) => {
        const offset = i - mid;
        return (
          <div
            key={`${c.id}-${i}`}
            className="-mx-3 transition-transform duration-200 hover:z-10 hover:[transform:translateY(-1.5rem)_rotate(0deg)!important]"
            style={{ transform: `rotate(${offset * 5}deg) translateY(${Math.abs(offset) * 6}px)` }}
          >
            <GameCard card={c} size="md" state={playable.includes(c.id) ? 'selectable' : undefined} />
          </div>
        );
      })}
    </div>
  );
}
