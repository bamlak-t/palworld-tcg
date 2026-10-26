/**
 * Illustrations for the How to play guide, built from real cards and the board's own
 * components so they always match what you see in a game.
 */
import type { ReactNode } from 'react';
import { ArrowRight, Shield, Swords } from 'lucide-react';
import { cardDb, getCard, imageUrl } from '@pal/cards';
import { GameCard } from '@/components/game/GameCard';
import { LifeGauge } from '@/components/game/PlayerHud';
import { cn } from '@/lib/utils';

const card = (id: string) => getCard(id)!;
const soul = cardDb.cards.find((c) => c.kind === 'Soul')!;

/** Dark panel the figures sit on, so the board components look as they do in a game. */
function Figure({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <div
        className={cn(
          'flex flex-wrap items-end justify-center gap-4 rounded-xl bg-gradient-to-b from-[oklch(0.3_0.08_268)] to-[oklch(0.17_0.05_268)] p-4 text-white',
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
  <Figure caption="Stand, Draw and Soul happen automatically. Main is where you play.">
    <ol className="flex flex-wrap items-center justify-center gap-1.5">
      {['Stand', 'Draw', 'Soul', 'Main', 'End'].map((p, i) => (
        <li key={p} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight className="size-3.5 text-white/50" />}
          <span
            className={cn(
              'corner-cut px-3 py-1 text-xs font-semibold uppercase [--cut:6px]',
              p === 'Main' ? 'bg-amber-300 text-slate-900' : 'bg-white/15',
            )}
          >
            {p}
          </span>
        </li>
      ))}
    </ol>
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

export const CardTypesFigure = () => (
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
        <GameCard card={card(id)} size="sm" />
      </Labelled>
    ))}
  </Figure>
);

export const BattleFigure = () => (
  <Figure caption="Grizzbolt attacks a rested Pal. A standing Pal of the defender's can step in to block.">
    <Labelled label="Attacker">
      <GameCard card={card('ETD01-001')} size="sm" rested state="attacking" />
    </Labelled>
    <Swords className="mb-12 size-6 text-orange-300" />
    <Labelled label="Target (rested)">
      <GameCard card={card('ETD02-016')} size="sm" rested state="target" />
    </Labelled>
    <Labelled label="Can block">
      <div className="relative">
        <GameCard card={card('ETD02-001')} size="sm" state="selectable" />
        <Shield className="absolute -top-2 -right-2 size-5 rounded-full bg-sky-500 p-0.5 text-white" />
      </div>
    </Labelled>
  </Figure>
);

export const DamageFigure = () => (
  <Figure caption="Hit for 3: the third card flipped is a Lucky Pal, so no life is lost.">
    {(['ETD01-011', 'ETD01-009', 'ETD02-006'] as const).map((id, i) => (
      <Labelled key={id} label={`Flip ${i + 1}`}>
        <GameCard card={card(id)} size="sm" state={i === 2 ? 'lucky' : undefined} />
      </Labelled>
    ))}
  </Figure>
);

export const KeywordFigure = () => (
  <Figure caption="Foxparks has Interrupt: discard it from your hand during the opponent's attack to cancel it.">
    <GameCard card={card('ETD01-004')} size="md" />
  </Figure>
);

/** Labelled map of your half of the board, matching the playmat layout. */
export const BoardFigure = () => {
  const zone = (label: string, className?: string) => (
    <div
      className={cn(
        'flex items-center justify-center rounded-md border border-white/30 bg-white/10 p-1 text-center text-[10px] font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {label}
    </div>
  );
  return (
    <Figure caption="Your side of the board. The opponent's side is the same, turned around." className="block">
      <div className="mx-auto grid max-w-md grid-cols-[4.5rem_1fr_4.5rem] grid-rows-[auto_auto_auto_auto] gap-1.5">
        {zone('Phases', 'row-span-2')}
        {zone('Base: your Pals, structures and gears', 'h-16')}
        {zone('Exile')}
        {zone('Avatar · Soul area (your souls)', 'h-9')}
        {zone('Deck')}
        {zone('Soul deck', 'h-12')}
        {zone('Your hand', 'h-12')}
        {zone('Graveyard', 'h-12')}
        {zone('Your bar: name, life, Material, Ingredient', 'col-span-3 h-8 border-amber-300/70')}
      </div>
    </Figure>
  );
};
