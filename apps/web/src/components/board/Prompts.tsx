/** Dialogs for decisions the engine is waiting on. */
import { useState } from 'react';
import { motion } from 'motion/react';
import { getCard } from '@pal/cards';
import type { Action, GameView, PendingChoice, Seat } from '@pal/engine';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { GameCard } from '@/components/game/GameCard';
import { cn } from '@/lib/utils';

type Dispatch = (a: Action) => void;

export function PendingDialog({ view, seat, dispatch }: { view: GameView; seat: Seat; dispatch: Dispatch }) {
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
          <CardRow ids={(view.players[seat].hand ?? []).map((c) => ({ id: c.id, cardId: c.cardId }))} />
          <div className="flex justify-center gap-2">
            <Button onClick={() => dispatch({ type: 'mulligan', redraw: false })}>Keep</Button>
            <Button variant="outline" onClick={() => dispatch({ type: 'mulligan', redraw: true })}>
              Redraw
            </Button>
          </div>
        </Modal>
      );
    case 'effectChoice':
      return <EffectChoice key={`${p.prompt}-${view.version}`} pending={p} dispatch={dispatch} />;
    case 'overload':
      return <OverloadChoice key={view.version} pending={p} view={view} dispatch={dispatch} />;
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

function CardRow({
  ids,
  selected,
  onToggle,
  locked,
}: {
  ids: { id: string; cardId?: string; label?: string }[];
  selected?: string[];
  onToggle?: (id: string) => void;
  locked?: string[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ids.map((o) =>
        o.cardId ? (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle?.(o.id)}
            disabled={!onToggle || locked?.includes(o.id)}
            className={cn(
              'rounded-lg transition',
              selected?.includes(o.id) ? '-translate-y-1' : onToggle && 'opacity-80 hover:opacity-100',
            )}
          >
            <GameCard card={getCard(o.cardId)} size="md" state={selected?.includes(o.id) ? 'selectable' : undefined} />
          </button>
        ) : null,
      )}
    </div>
  );
}

function EffectChoice({
  pending,
  dispatch,
}: {
  pending: Extract<PendingChoice, { kind: 'effectChoice' }>;
  dispatch: Dispatch;
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
          <CardRow ids={cards} selected={selected} onToggle={toggle} />
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
}: {
  pending: Extract<PendingChoice, { kind: 'overload' }>;
  view: GameView;
  dispatch: Dispatch;
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
      <CardRow ids={options} selected={keep} onToggle={toggle} locked={pending.mustKeep} />
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
  amount,
  milled,
  cancelled,
  lifeLost,
  onDone,
}: {
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
      <h3 className="font-display text-2xl font-bold tracking-wide text-white uppercase">Incoming damage: {amount}</h3>
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
