import { useEffect, type ReactNode } from 'react';
import { motion, useAnimate } from 'motion/react';
import { getCard } from '@pal/cards';
import type { CardInstance, CardStats } from '@pal/engine';
import { GameCard, type GameCardProps } from '@/components/game/GameCard';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type CardMotion = { kind: 'shake' } | { kind: 'lunge'; direction: 'up' | 'down' };

/**
 * A card on the board. Its layoutId is the instance id, so moving between zones
 * (hand → base → graveyard) animates automatically.
 */
export function BoardCard({
  card,
  stats,
  size = 'sm',
  state,
  faceDown,
  onClick,
  menu,
  menuOpen,
  onMenuOpenChange,
  motionCue,
  cueKey,
  className,
}: {
  card?: CardInstance;
  stats?: CardStats;
  size?: GameCardProps['size'];
  state?: GameCardProps['state'];
  faceDown?: boolean;
  onClick?: () => void;
  /** Actions shown in a popover when the card is clicked. */
  menu?: ReactNode;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** Hit or attack animation to play when cueKey changes. */
  motionCue?: CardMotion;
  cueKey?: number;
  className?: string;
}) {
  const [scope, animate] = useAnimate();
  const def = card ? getCard(card.cardId) : undefined;

  useEffect(() => {
    if (!motionCue || !scope.current) return;
    if (motionCue.kind === 'shake') {
      animate(scope.current, { x: [0, -7, 7, -5, 5, -2, 0] }, { duration: 0.45 });
    } else {
      const dy = motionCue.direction === 'up' ? -36 : 36;
      animate(scope.current, { y: [0, dy, 0], scale: [1, 1.08, 1] }, { duration: 0.5, ease: 'easeInOut' });
    }
    // Re-run only when a new cue arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey]);

  const body = (
    <motion.div
      ref={scope}
      layoutId={card && !faceDown ? card.id : undefined}
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={cn('relative', (onClick || menu) && 'cursor-pointer', className)}
      onClick={menu ? undefined : onClick}
      title={def?.name}
      data-card={card?.id}
      data-state={state}
    >
      <GameCard
        card={def}
        faceDown={faceDown}
        rested={card?.rested}
        damage={card?.damage}
        powerMod={stats && def?.power != null ? stats.power - def.power : 0}
        state={state}
        size={size}
      />
      {stats && stats.keywords.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-2 flex flex-wrap justify-center gap-0.5">
          {stats.keywords.map((k) => (
            <span key={k} className="rounded bg-black/75 px-1 text-[9px] font-semibold text-amber-200 capitalize">
              {k}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );

  if (!menu) return body;
  return (
    <Popover open={menuOpen} onOpenChange={onMenuOpenChange}>
      <PopoverTrigger asChild>{body}</PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" sideOffset={8}>
        {menu}
      </PopoverContent>
    </Popover>
  );
}

export function MenuItem({
  children,
  hint,
  onSelect,
  disabled,
}: {
  children: ReactNode;
  hint?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
    >
      <span className="font-medium">{children}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}
