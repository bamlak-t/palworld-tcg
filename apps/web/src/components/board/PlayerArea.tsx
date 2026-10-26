import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cardDb, getCard, imageUrl } from '@pal/cards';
import type { BattleStep, CardInstance, GameView, PlayerView } from '@pal/engine';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GameCard } from '@/components/game/GameCard';
import { cn } from '@/lib/utils';
import { BoardCard } from './BoardCard';
import { PhaseFlow } from './PhaseFlow';

const soulCard = cardDb.cards.find((c) => c.kind === 'Soul')!;

/**
 * One player's half of the playmat (from the official mat): soul deck bottom-left;
 * exile, deck and graveyard down the right; base in the middle with the soul area and
 * hand below. The opponent's half is the same mat turned around. On phones the side
 * columns collapse into a strip of counts.
 */
export function PlayerArea({
  player,
  flipped,
  phase,
  battleStep,
  baseCards,
  hand,
  avatar,
  soulAction,
  onInspect,
}: {
  player: PlayerView;
  flipped?: boolean;
  /** Shown as the playmat's phase list on your own side. */
  phase?: GameView['phase'];
  battleStep?: BattleStep;
  baseCards: ReactNode[];
  hand: ReactNode;
  avatar: ReactNode;
  /** Shown at the end of the soul strip (your "rest 3 souls to draw" button). */
  soulAction?: ReactNode;
  onInspect: (c: CardInstance) => void;
}) {
  const piles = (
    <>
      <PileSlot label="Exile" cards={player.exile} onInspect={onInspect} />
      <DeckSlot count={player.deckCount} />
      <PileSlot label="Graveyard" cards={player.graveyard} onInspect={onInspect} />
    </>
  );
  const soulDeck = (
    <Slot label="Soul deck">
      {player.soulDeck > 0 && <img src={imageUrl(soulCard)} alt="" className="h-[74px] rounded-[4px]" />}
      <Count value={player.soulDeck} />
    </Slot>
  );

  const left = (
    <div className={cn('hidden flex-col justify-between gap-2 md:flex', flipped && 'flex-col-reverse')}>
      {flipped ? piles : phase ? <PhaseFlow phase={phase} battleStep={battleStep} /> : <div />}
      {flipped ? null : soulDeck}
    </div>
  );
  const right = (
    <div className={cn('hidden flex-col justify-between gap-2 md:flex', flipped && 'flex-col-reverse')}>
      {flipped ? <div /> : null}
      {flipped ? soulDeck : piles}
    </div>
  );

  const base = (
    <div
      data-testid={flipped ? 'opponent-base' : 'my-base'}
      className="flex min-h-[110px] flex-wrap items-center justify-center gap-2 rounded-xl border border-board-ink/25 bg-board-ink/5 p-2 md:min-h-[150px] md:gap-3"
    >
      {baseCards}
      {baseCards.length === 0 && <span className="text-xs tracking-widest text-board-ink/50 uppercase">Base</span>}
    </div>
  );

  const soulArea = (
    <div className="flex min-h-10 items-center gap-0.5 rounded-lg border border-board-ink/20 bg-board-ink/5 px-2 py-1 md:px-3">
      <span className="mr-1 hidden text-[10px] tracking-widest text-board-ink/60 uppercase sm:inline">Soul area</span>
      {Array.from({ length: player.soulsStanding + player.soulsRested }, (_, i) => {
        const rested = i >= player.soulsStanding;
        return (
          <div key={i} className="flex size-7 items-center justify-center md:size-9">
            <img
              src={imageUrl(soulCard)}
              alt={rested ? 'Spent soul' : 'Available soul'}
              className={cn(
                'h-7 w-5 rounded-[2px] transition-transform duration-300 md:h-9 md:w-[26px]',
                rested
                  ? 'rotate-90 opacity-80 ring-1 ring-board-ink/40 grayscale-[60%]'
                  : 'shadow-[0_0_8px] shadow-violet-300/70',
              )}
            />
          </div>
        );
      })}
      <span className="ml-auto text-xs text-board-ink/70 tabular-nums">
        {player.soulsStanding}/{player.soulsStanding + player.soulsRested}
      </span>
      {soulAction && <div className="ml-2 shrink-0">{soulAction}</div>}
    </div>
  );

  // The avatar sits beside the hand, on the soul deck side of the mat.
  // The avatar sits beside the soul area, on the soul deck side (left for you, right for
  // the opponent), so the hand below gets the full width.
  const soulRow = (
    <div className={cn('flex items-center gap-2', flipped && 'flex-row-reverse')}>
      <div className="shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1">{soulArea}</div>
    </div>
  );

  const mobileStrip = (
    <div className="flex flex-wrap items-center gap-2 text-xs text-board-ink/85 md:hidden">
      <MiniPile label="Deck" value={player.deckCount} />
      <MiniPile label="Grave" value={player.graveyard.length} cards={player.graveyard} onInspect={onInspect} />
      <MiniPile label="Exile" value={player.exile.length} cards={player.exile} onInspect={onInspect} />
      <MiniPile label="Soul deck" value={player.soulDeck} />
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[8.5rem_1fr_8.5rem] md:gap-3">
      {left}
      <div className={cn('flex flex-col gap-2', flipped && 'flex-col-reverse')}>
        {base}
        {soulRow}
        {hand}
        {mobileStrip}
      </div>
      {right}
    </div>
  );
}

function Slot({ label, children, onClick }: { label: string; children?: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative flex h-[100px] flex-col items-center justify-center gap-1 rounded-lg border border-board-ink/30 bg-board-ink/10 enabled:hover:bg-board-ink/20"
    >
      {children}
      <span className="absolute top-1 left-1.5 text-[9px] tracking-widest text-board-ink/70 uppercase">{label}</span>
    </button>
  );
}

/** Pile size. It pops when the number changes, so you can see which pile cards went to. */
const Count = ({ value }: { value: number }) => (
  <motion.span
    key={value}
    initial={{ scale: 1.8, backgroundColor: 'oklch(0.8 0.15 80)' }}
    animate={{ scale: 1, backgroundColor: 'oklch(0 0 0 / 0.6)' }}
    transition={{ duration: 0.6 }}
    className="absolute right-1.5 bottom-1 rounded px-1.5 text-xs font-bold text-white tabular-nums"
  >
    {value}
  </motion.span>
);

function DeckSlot({ count }: { count: number }) {
  return (
    <Slot label="Deck">
      {count > 0 && <GameCard faceDown size="xs" />}
      <Count value={count} />
    </Slot>
  );
}

function PileSlot({
  label,
  cards,
  onInspect,
}: {
  label: string;
  cards: CardInstance[];
  onInspect: (c: CardInstance) => void;
}) {
  const [open, setOpen] = useState(false);
  const top = cards.at(-1);
  return (
    <>
      <Slot label={label} onClick={cards.length > 0 ? () => setOpen(true) : undefined}>
        {top && <BoardCard card={top} size="xs" />}
        <Count value={cards.length} />
      </Slot>
      <PileDialog label={label} cards={cards} open={open} onOpenChange={setOpen} onInspect={onInspect} />
    </>
  );
}

function MiniPile({
  label,
  value,
  cards,
  onInspect,
}: {
  label: string;
  value: number;
  cards?: CardInstance[];
  onInspect?: (c: CardInstance) => void;
}) {
  const [open, setOpen] = useState(false);
  const clickable = !!cards && cards.length > 0;
  return (
    <>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => setOpen(true)}
        className="rounded-md bg-board-ink/10 px-2 py-1 enabled:underline enabled:decoration-dotted"
      >
        {label} <span className="font-bold tabular-nums">{value}</span>
      </button>
      {cards && onInspect && (
        <PileDialog label={label} cards={cards} open={open} onOpenChange={setOpen} onInspect={onInspect} />
      )}
    </>
  );
}

/** Graveyard or exile contents. Cards keep their printed shape, so structures get more width. */
function PileDialog({
  label,
  cards,
  open,
  onOpenChange,
  onInspect,
}: {
  label: string;
  cards: CardInstance[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInspect: (c: CardInstance) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle>
          {label} ({cards.length})
        </DialogTitle>
        <div className="flex max-h-[70dvh] flex-wrap content-start items-center gap-2 overflow-y-auto">
          {[...cards].reverse().map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onOpenChange(false);
                onInspect(c);
              }}
              className="rounded-md transition hover:-translate-y-0.5"
              title={`View ${getCard(c.cardId)?.name}`}
            >
              <GameCard card={getCard(c.cardId)} size="sm" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
