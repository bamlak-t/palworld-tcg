import { useState, type ReactNode } from 'react';
import { cardDb, getCard, imageUrl } from '@pal/cards';
import type { CardInstance, GameView, PlayerView } from '@pal/engine';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GameCard } from '@/components/game/GameCard';
import { cn } from '@/lib/utils';
import { BoardCard } from './BoardCard';
import { PhaseFlow } from './PhaseFlow';

const soulCard = cardDb.cards.find((c) => c.kind === 'Soul')!;

/**
 * One player's half of the playmat (from the official mat): soul deck bottom-left;
 * exile, deck and graveyard down the right; base in the middle with the soul area below.
 * The opponent's half is the same mat turned around.
 */
export function PlayerArea({
  player,
  flipped,
  phase,
  renderBaseCard,
}: {
  player: PlayerView;
  flipped?: boolean;
  /** Shown as the playmat's phase list on your own side. */
  phase?: GameView['phase'];
  renderBaseCard: (c: CardInstance) => ReactNode;
}) {
  const pals = player.base.filter((c) => getCard(c.cardId)?.kind === 'Pal');
  const others = player.base.filter((c) => getCard(c.cardId)?.kind !== 'Pal');

  const pilesColumn = (
    <div className={cn('flex flex-col justify-between gap-2', flipped && 'flex-col-reverse')}>
      <PileSlot label="Exile" cards={player.exile} />
      <DeckSlot count={player.deckCount} />
      <PileSlot label="Graveyard" cards={player.graveyard} />
    </div>
  );

  // Left of your own mat: the turn's phases on top, the soul deck below (like the playmat).
  const soulColumn = (
    <div className={cn('flex flex-col justify-between gap-2', flipped && 'flex-col-reverse')}>
      {phase ? <PhaseFlow phase={phase} /> : <div />}
      <Slot label="Soul deck">
        {player.soulDeck > 0 && <img src={imageUrl(soulCard)} alt="" className="h-[82px] rounded-[4px]" />}
        <Count value={player.soulDeck} />
      </Slot>
    </div>
  );

  const baseRow = (
    <div
      data-testid={flipped ? 'opponent-base' : 'my-base'}
      className="flex min-h-[150px] flex-wrap items-center justify-center gap-3 rounded-xl border border-white/25 bg-white/5 p-2"
    >
      {pals.map((c) => (
        <div key={c.id}>{renderBaseCard(c)}</div>
      ))}
      {others.length > 0 && pals.length > 0 && <div className="mx-1 h-24 w-px bg-white/20" />}
      {others.map((c) => (
        <div key={c.id}>{renderBaseCard(c)}</div>
      ))}
      {player.base.length === 0 && <span className="text-xs tracking-widest text-white/50 uppercase">Base</span>}
    </div>
  );

  const soulArea = (
    <div className="flex min-h-12 items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1">
      <span className="mr-2 text-[10px] tracking-widest text-white/60 uppercase">Soul area</span>
      {Array.from({ length: player.soulsStanding + player.soulsRested }, (_, i) => {
        const rested = i >= player.soulsStanding;
        return (
          <div key={i} className="flex size-9 items-center justify-center">
            <img
              src={imageUrl(soulCard)}
              alt={rested ? 'Spent soul' : 'Available soul'}
              className={cn(
                'h-9 w-[26px] rounded-[2px] transition-transform duration-300',
                rested
                  ? 'rotate-90 opacity-80 ring-1 ring-white/40 grayscale-[60%]'
                  : 'shadow-[0_0_8px] shadow-violet-300/70',
              )}
            />
          </div>
        );
      })}
      <span className="ml-auto text-xs text-white/70 tabular-nums">
        {player.soulsStanding} / {player.soulsStanding + player.soulsRested}
      </span>
    </div>
  );

  return (
    <div className="grid grid-cols-[10rem_1fr_10rem] gap-3">
      {flipped ? pilesColumn : soulColumn}
      <div className={cn('flex flex-col gap-2', flipped && 'flex-col-reverse')}>
        {baseRow}
        {soulArea}
      </div>
      {flipped ? soulColumn : pilesColumn}
    </div>
  );
}

function Slot({ label, children, onClick }: { label: string; children?: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative flex h-[118px] flex-col items-center justify-center gap-1 rounded-lg border border-white/30 bg-white/10 enabled:hover:bg-white/20"
    >
      {children}
      <span className="absolute top-1 left-1.5 text-[9px] tracking-widest text-white/70 uppercase">{label}</span>
    </button>
  );
}

const Count = ({ value }: { value: number }) => (
  <span className="absolute right-1.5 bottom-1 rounded bg-black/60 px-1.5 text-xs font-bold text-white tabular-nums">
    {value}
  </span>
);

function DeckSlot({ count }: { count: number }) {
  return (
    <Slot label="Deck">
      {count > 0 && <GameCard faceDown size="xs" />}
      <Count value={count} />
    </Slot>
  );
}

function PileSlot({ label, cards }: { label: string; cards: CardInstance[] }) {
  const [open, setOpen] = useState(false);
  const top = cards.at(-1);
  return (
    <>
      <Slot label={label} onClick={cards.length > 0 ? () => setOpen(true) : undefined}>
        {top && <BoardCard card={top} size="xs" />}
        <Count value={cards.length} />
      </Slot>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>
            {label} ({cards.length})
          </DialogTitle>
          <div className="grid max-h-[70dvh] grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto">
            {[...cards].reverse().map((c) => (
              <GameCard key={c.id} card={getCard(c.cardId)} size="sm" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
