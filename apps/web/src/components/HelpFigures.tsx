/**
 * Illustrations for the How to play guide, built from real cards and the board's own
 * components so they always match what you see in a game.
 */
import type { ReactNode } from 'react';
import { Shield, Swords } from 'lucide-react';
import { cardDb, getCard, imageUrl } from '@pal/cards';
import { GameCard } from '@/components/game/GameCard';
import { LifeGauge } from '@/components/game/PlayerHud';
import { PhaseFlow } from '@/components/board/PhaseFlow';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

const card = (id: string) => getCard(id)!;

/** Card size for figures: smaller on phones so each picture fits the dialog. */
const useCardSize = () => (useIsMobile() ? 'xs' : 'sm');
const soul = cardDb.cards.find((c) => c.kind === 'Soul')!;

/** Dark panel the figures sit on, so the board components look as they do in a game. */
function Figure({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <div
        className={cn(
          'flex flex-wrap items-end justify-center gap-4 rounded-xl bg-gradient-to-b from-[oklch(0.3_0.08_268)] to-[oklch(0.17_0.05_268)] p-4 text-white [&_li]:ml-0 [&_ol]:list-none [&_ol]:space-y-0',
          className,
        )}
      >
        {children}
      </div>
      {caption && <figcaption className="text-center text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

const Labelled = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col items-center gap-1.5">
    {children}
    <span className="text-[11px] tracking-wide text-white/80 uppercase">{label}</span>
  </div>
);

export const WinFigure = () => (
  <Figure caption="Either one loses the game: no life left, or no cards left in the deck.">
    <Labelled label="Life">
      <div className="w-44 rounded-md bg-black/30 p-2">
        <LifeGauge life={0} stacked />
      </div>
    </Labelled>
    <span className="pb-6 text-sm text-white/70">or</span>
    <Labelled label="Deck">
      <div className="relative">
        <GameCard faceDown size="xs" className="opacity-40" />
        <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold">0</span>
      </div>
    </Labelled>
  </Figure>
);

export const TurnFigure = () => (
  <Figure caption="The phase list on the left of your side of the board. Stand, Draw and Soul happen automatically; Main is where you play.">
    <div className="w-36">
      <PhaseFlow phase="main" />
    </div>
  </Figure>
);

export const SoulsFigure = () => (
  <Figure caption="Three souls ready to spend, two already spent (turned sideways) this turn.">
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex size-14 items-center justify-center">
        <img
          src={imageUrl(soul)}
          alt={i < 3 ? 'Available soul' : 'Spent soul'}
          className={cn(
            'h-14 w-10 rounded-[3px]',
            i < 3 ? 'shadow-[0_0_10px] shadow-violet-300/70' : 'rotate-90 opacity-70 grayscale-[60%]',
          )}
        />
      </div>
    ))}
  </Figure>
);

export const CardTypesFigure = () => {
  const size = useCardSize();
  return (
    <Figure>
      {(
        [
          ['ETD01-005', 'Pal'],
          ['ETD01-008', 'Structure'],
          ['ETD01-010', 'Gear'],
          ['ETD01-011', 'Event'],
        ] as const
      ).map(([id, label]) => (
        <Labelled key={id} label={label}>
          <GameCard card={card(id)} size={size} />
        </Labelled>
      ))}
    </Figure>
  );
};

export const BattleFigure = () => {
  const size = useCardSize();
  return (
    <Figure caption="Grizzbolt attacks a rested Pal. A standing Pal of the defender's can step in to block.">
      <Labelled label="Attacker">
        <GameCard card={card('ETD01-001')} size={size} rested state="attacking" />
      </Labelled>
      <Swords className="mb-12 size-6 text-orange-300" />
      <Labelled label="Target (rested)">
        <GameCard card={card('ETD02-016')} size={size} rested state="target" />
      </Labelled>
      <Labelled label="Can block">
        <div className="relative">
          <GameCard card={card('ETD02-001')} size={size} state="selectable" />
          <Shield className="absolute -top-2 -right-2 size-5 rounded-full bg-sky-500 p-0.5 text-white" />
        </div>
      </Labelled>
    </Figure>
  );
};

export const DamageFigure = () => {
  const size = useCardSize();
  return (
    <Figure caption="Hit for 3: the third card flipped is a Lucky Pal, so no life is lost.">
      {(['ETD01-011', 'ETD01-009', 'ETD02-006'] as const).map((id, i) => (
        <Labelled key={id} label={`Flip ${i + 1}`}>
          <GameCard card={card(id)} size={size} state={i === 2 ? 'lucky' : undefined} />
        </Labelled>
      ))}
    </Figure>
  );
};

export const KeywordFigure = () => (
  <Figure caption="Foxparks has Interrupt: discard it from your hand during the opponent's attack to cancel it.">
    <GameCard card={card('ETD01-004')} size="md" />
  </Figure>
);

/** Labelled map of your half of the board, matching the current layout. */
export const BoardFigure = () => {
  const zone = (label: string, className?: string) => (
    <div
      className={cn(
        'flex items-center justify-center rounded-md border border-white/30 bg-white/10 p-1 text-center text-[9px] font-semibold tracking-wide uppercase sm:text-[10px]',
        className,
      )}
    >
      {label}
    </div>
  );
  return (
    <Figure caption="Your side of the board. The opponent's side is the same, turned around." className="block">
      <div className="mx-auto grid max-w-md grid-cols-[3.75rem_1fr_3.75rem] gap-1.5 sm:grid-cols-[4.5rem_1fr_4.5rem]">
        {zone('☀ Day · Turn · stage · End turn', 'col-span-3 h-7 border-dashed')}
        {zone('Phases', 'row-span-2')}
        {zone('Base: Pals, structures, gears', 'h-14')}
        {zone('Exile')}
        <div className="flex items-center gap-1.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/15 text-[8px] uppercase">
            You
          </span>
          {zone('Soul area · Draw (3 souls)', 'h-9 flex-1')}
        </div>
        {zone('Deck')}
        {zone('Soul deck', 'h-14')}
        {zone('Your hand', 'h-14')}
        {zone('Graveyard', 'h-14')}
        <div className="col-span-3 grid grid-cols-2 gap-1 rounded-md border border-amber-300/70 bg-white/10 p-1.5 text-[9px] font-semibold uppercase sm:text-[10px]">
          <span>Name</span>
          <span className="text-right">Life</span>
          <span />
          <span className="text-right">Material · Ingredient</span>
        </div>
      </div>
    </Figure>
  );
};
