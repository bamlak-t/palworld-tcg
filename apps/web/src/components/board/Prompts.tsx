/** Dialogs for decisions the engine is waiting on. */
import { useState } from 'react';
import { motion } from 'motion/react';
import { Maximize2 } from 'lucide-react';
import { getCard } from '@pal/cards';
import type { Action, GameView, PendingChoice, Seat } from '@pal/engine';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { GameCard } from '@/components/game/GameCard';
import { cn } from '@/lib/utils';

type Dispatch = (a: Action) => void;

/** Opens the card inspector for a card shown in a dialog. */
type Inspect = (option: { id: string; cardId: string }) => void;

export function PendingDialog({
  view,
  seat,
  dispatch,
  onInspect,
}: {
  view: GameView;
  seat: Seat;
  dispatch: Dispatch;
  onInspect: Inspect;
}) {
  const p = view.pending;
  if (!p || p.seat !== seat) return null;
  switch (p.kind) {
    case 'chooseFirstPlayer':
      return (
        <Modal
          title="Who goes first?"
          description="You won the toss. The player going second starts with 1 extra soul."
        >
          <div className="flex justify-center gap-2">
            <Button onClick={() => dispatch({ type: 'chooseFirstPlayer', first: seat })}>I'll go first</Button>
            <Button
              variant="outline"
              onClick={() => dispatch({ type: 'chooseFirstPlayer', first: seat === 0 ? 1 : 0 })}
            >
              Go second
            </Button>
          </div>
        </Modal>
      );
    case 'mulligan':
      return (
        <Modal title="Your opening hand" description="You may shuffle it back and draw 5 new cards, once.">
          <p className="text-center text-xs text-muted-foreground">Click a card to read it.</p>
          <CardRow
            ids={(view.players[seat].hand ?? []).map((c) => ({ id: c.id, cardId: c.cardId }))}
            onInspect={onInspect}
          />
          <div className="flex justify-center gap-2">
            <Button onClick={() => dispatch({ type: 'mulligan', redraw: false })}>Keep</Button>
            <Button variant="outline" onClick={() => dispatch({ type: 'mulligan', redraw: true })}>
              Redraw
            </Button>
          </div>
        </Modal>
      );
    case 'effectChoice':
      return <EffectChoice key={`${p.prompt}-${view.version}`} pending={p} dispatch={dispatch} onInspect={onInspect} />;
    case 'overload':
      return <OverloadChoice key={view.version} pending={p} view={view} dispatch={dispatch} onInspect={onInspect} />;
    default:
      return null; // block and quick step are handled on the board itself
  }
}

function Modal({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogTitle className="text-center font-display text-lg tracking-wide uppercase">{title}</DialogTitle>
        {description && <DialogDescription className="text-center">{description}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cards in a dialog. With onToggle they're selectable and a small button opens the
 * inspector; without it, clicking a card opens the inspector directly.
 */
function CardRow({
  ids,
  selected,
  onToggle,
  locked,
  onInspect,
}: {
  ids: { id: string; cardId?: string; label?: string }[];
  selected?: string[];
  onToggle?: (id: string) => void;
  locked?: string[];
  onInspect?: Inspect;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ids.map((o) => {
        if (!o.cardId) return null;
        const card = { id: o.id, cardId: o.cardId };
        return (
          <div key={o.id} className="relative">
            <button
              type="button"
              onClick={() => (onToggle ? onToggle(o.id) : onInspect?.(card))}
              disabled={onToggle ? locked?.includes(o.id) : !onInspect}
              aria-label={onToggle ? undefined : `Read ${getCard(o.cardId)?.name}`}
              className={cn(
                'rounded-lg transition',
                selected?.includes(o.id) ? '-translate-y-1' : 'hover:-translate-y-0.5',
                onToggle && !selected?.includes(o.id) && 'opacity-80 hover:opacity-100',
              )}
            >
              <GameCard
                card={getCard(o.cardId)}
                size="md"
                state={selected?.includes(o.id) ? 'selectable' : undefined}
              />
            </button>
            {onToggle && onInspect && (
              <button
                type="button"
                onClick={() => onInspect(card)}
                aria-label={`Read ${getCard(o.cardId)?.name}`}
                className="absolute -top-2 -right-2 rounded-full bg-background p-1 shadow ring-1 ring-border hover:bg-muted"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EffectChoice({
  pending,
  dispatch,
  onInspect,
}: {
  pending: Extract<PendingChoice, { kind: 'effectChoice' }>;
  dispatch: Dispatch;
  onInspect: Inspect;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const cards = pending.options.filter((o) => o.cardId);
  const labels = pending.options.filter((o) => !o.cardId);
  const single = pending.max === 1;
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : single ? [id] : s.length < pending.max ? [...s, id] : s,
    );
  const valid = selected.length >= pending.min && selected.length <= pending.max;
  const source = getCard(pending.sourceCardId);

  return (
    <Modal title={source?.mainName ?? 'Choose'} description={pending.prompt}>
      {labels.length > 0 ? (
        <div className="flex justify-center gap-2">
          {labels.map((o) => (
            <Button
              key={o.id}
              variant={o.id === 'no' ? 'outline' : 'default'}
              onClick={() => dispatch({ type: 'answer', choice: [o.id] })}
            >
              {o.label ?? o.id}
            </Button>
          ))}
        </div>
      ) : (
        <>
          <CardRow ids={cards} selected={selected} onToggle={toggle} onInspect={onInspect} />
          <div className="flex justify-center gap-2">
            <Button disabled={!valid} onClick={() => dispatch({ type: 'answer', choice: selected })}>
              Confirm
            </Button>
            {pending.min === 0 && (
              <Button variant="outline" onClick={() => dispatch({ type: 'answer', choice: [] })}>
                Choose none
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function OverloadChoice({
  pending,
  view,
  dispatch,
  onInspect,
}: {
  pending: Extract<PendingChoice, { kind: 'overload' }>;
  view: GameView;
  dispatch: Dispatch;
  onInspect: Inspect;
}) {
  const [keep, setKeep] = useState<string[]>(pending.mustKeep);
  const all = view.players[pending.seat].base;
  const options = pending.candidates.map((id) => ({ id, cardId: all.find((c) => c.id === id)?.cardId }));
  const toggle = (id: string) =>
    setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : k.length < pending.keepCount ? [...k, id] : k));
  return (
    <Modal
      title="Too many Pals"
      description={`You can have ${pending.keepCount} Pals. Choose which to keep; the rest go to the graveyard.`}
    >
      <CardRow ids={options} selected={keep} onToggle={toggle} locked={pending.mustKeep} onInspect={onInspect} />
      <div className="flex justify-center">
        <Button disabled={keep.length !== pending.keepCount} onClick={() => dispatch({ type: 'chooseOverload', keep })}>
          Keep these {pending.keepCount}
        </Button>
      </div>
    </Modal>
  );
}

/** Damage to a player: the milled cards flip over one by one; a Lucky Pal glows and cancels it. */
export function DamageReveal({
  ownerName,
  amount,
  milled,
  cancelled,
  lifeLost,
  onDone,
}: {
  ownerName: string;
  amount: number;
  milled: { id: string; cardId: string; lucky: boolean }[];
  cancelled: boolean;
  lifeLost: number;
  onDone: () => void;
}) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/55 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <div className="text-center text-white">
        <h3 className="font-display text-2xl font-bold tracking-wide uppercase">Incoming damage: {amount}</h3>
        <p className="text-sm text-white/80">
          {ownerName} flips {amount === 1 ? 'a card' : `${amount} cards`} from their deck into their graveyard
        </p>
      </div>
      <div className="flex gap-4" style={{ perspective: 800 }}>
        {milled.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ rotateY: 180, y: -20, opacity: 0 }}
            animate={{ rotateY: 0, y: 0, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.45, duration: 0.5 }}
          >
            <GameCard card={getCard(m.cardId)} size="md" state={m.lucky ? 'lucky' : undefined} />
          </motion.div>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 + milled.length * 0.45 }}
        className={cn('font-display text-xl font-bold', cancelled ? 'text-emerald-300' : 'text-rose-300')}
      >
        {cancelled ? 'Attack blocked by Lucky Pal' : `−${lifeLost} life`}
      </motion.p>
    </motion.div>
  );
}
