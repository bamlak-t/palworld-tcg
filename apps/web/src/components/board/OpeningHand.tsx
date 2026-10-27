/**
 * The opening hand, shown large in the middle of the screen. Keep or redraw; after a
 * redraw the old cards sink away and the new ones flip in. When it closes, each card flies
 * into the hand: the cards share their layoutId with the hand's cards.
 */
import { AnimatePresence, motion } from 'motion/react';
import { getCard } from '@pal/cards';
import type { CardInstance } from '@pal/engine';
import { Button } from '@/components/ui/button';
import { GameCard } from '@/components/game/GameCard';

export function OpeningHand({
  cards,
  stage,
  onKeep,
  onRedraw,
  onInspect,
}: {
  cards: CardInstance[];
  /** 'choose': keep or redraw. 'redrawn': showing the new hand before it flies in. */
  stage: 'choose' | 'redrawn';
  onKeep: () => void;
  onRedraw: () => void;
  onInspect: (c: CardInstance) => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/55 p-4 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal
      aria-label="Your opening hand"
    >
      <div className="text-center text-white drop-shadow">
        <h2 className="font-display text-xl tracking-wide uppercase">
          {stage === 'choose' ? 'Your opening hand' : 'Your new hand'}
        </h2>
        {stage === 'choose' && (
          <p className="text-sm text-white/80">Keep it, or shuffle it back and draw 5 new cards (once).</p>
        )}
      </div>

      <div className="flex max-w-full flex-wrap justify-center gap-2 sm:gap-3">
        <AnimatePresence mode="popLayout">
          {cards.map((c, i) => (
            <motion.button
              key={c.id}
              layoutId={c.id}
              type="button"
              onClick={() => onInspect(c)}
              aria-label={`Read ${getCard(c.cardId)?.name}`}
              className="rounded-lg"
              initial={{ opacity: 0, rotateY: 90, y: -30 }}
              animate={{ opacity: 1, rotateY: 0, y: 0, transition: { delay: 0.08 * i, duration: 0.35 } }}
              exit={{ opacity: 0, y: 160, scale: 0.6, rotate: -8, transition: { duration: 0.35 } }}
              whileHover={{ y: -6 }}
            >
              <GameCard card={getCard(c.cardId)} size="md" />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {stage === 'choose' && (
        <div className="flex gap-3">
          <Button size="lg" onClick={onKeep}>
            Keep
          </Button>
          <Button size="lg" variant="secondary" onClick={onRedraw}>
            Redraw
          </Button>
        </div>
      )}
      <p className="text-xs text-white/70">{stage === 'choose' ? 'Click a card to read it.' : ' '}</p>
    </motion.div>
  );
}
