/**
 * Plays the latest action's effects over the board: attack lunges, element-themed hits
 * with damage numbers, cards burning away, play shimmers, stat pop-ups, assign hops, the
 * life bar shaking, and night falling or lifting.
 *
 * It finds things on screen by data attributes: data-card / data-fx-card (cards and their
 * base slots), data-avatar-seat, data-hud-seat and data-board.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { getCard, imageUrl, type Element } from '@pal/cards';
import type { GameEvent, GameView } from '@pal/engine';
import type { EventBatch } from '@/game/useLocalGame';
import { BurnAway, FloatingNumber, ImpactBurst, Shimmer } from './particles';

type Fx =
  | { id: number; kind: 'impact'; x: number; y: number; element: Element; big: boolean }
  | { id: number; kind: 'number'; x: number; y: number; text: string; tone: 'damage' | 'up' | 'down' }
  | { id: number; kind: 'burn'; rect: DOMRect; image: string }
  | { id: number; kind: 'shimmer'; rect: DOMRect }
  | { id: number; kind: 'sky'; night: boolean; rect: DOMRect };

/** An effect before it gets its id. */
type NewFx = Fx extends infer F ? (F extends Fx ? Omit<F, 'id'> : never) : never;

const COLOR_ELEMENT: Record<string, Element> = { Red: 'Fire', Blue: 'Water', Green: 'Grass', Purple: 'Dark' };

/** A card's look for effects: its first element, or one matching its colour (gear, events). */
function elementOf(cardId: string | undefined): Element {
  const def = cardId ? getCard(cardId) : undefined;
  return def?.elements[0] ?? COLOR_ELEMENT[def?.color ?? ''] ?? 'Neutral';
}

function cardIdIn(view: GameView, id: string): string | undefined {
  for (const p of view.players) {
    for (const zone of [p.base, p.graveyard, p.exile, p.hand ?? []]) {
      const c = zone.find((x) => x.id === id);
      if (c) return c.cardId;
    }
  }
  return view.resolving.find((c) => c.id === id)?.cardId;
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function FxLayer({ batch, view, enabled }: { batch: EventBatch | undefined; view: GameView; enabled: boolean }) {
  const [fx, setFx] = useState<Fx[]>([]);
  const nextId = useRef(0);
  /** Where each card was after the previous update, for cards that have just left. */
  const lastRects = useRef(new Map<string, DOMRect>());
  const lastAttacker = useRef<string | undefined>(undefined);
  const seen = useRef<number | undefined>(undefined);
  const night = useRef(view.night);

  const add = (f: NewFx, delay = 0) => {
    const run = () => setFx((list) => [...list, { ...f, id: nextId.current++ } as Fx]);
    if (delay) setTimeout(run, delay);
    else run();
  };
  const remove = (id: number) => setFx((list) => list.filter((f) => f.id !== id));

  const rectOf = (id: string) => q(`[data-card="${id}"]`)?.getBoundingClientRect() ?? lastRects.current.get(id);

  useLayoutEffect(() => {
    if (!batch || batch.id === seen.current) return;
    seen.current = batch.id;
    if (!enabled) return;
    for (const e of batch.events) play(e, batch.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, enabled]);

  // Night falling or lifting, whatever caused it.
  useEffect(() => {
    if (view.night === night.current) return;
    night.current = view.night;
    const board = q('[data-board]')?.getBoundingClientRect();
    if (enabled && board) add({ kind: 'sky', night: view.night, rect: board });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.night, enabled]);

  // After every update, remember where the cards are.
  useLayoutEffect(() => {
    const map = new Map<string, DOMRect>();
    document
      .querySelectorAll<HTMLElement>('[data-card]')
      .forEach((el) => map.set(el.dataset.card!, el.getBoundingClientRect()));
    lastRects.current = map;
  });

  function play(e: GameEvent, v: GameView) {
    switch (e.type) {
      case 'attackDeclared': {
        lastAttacker.current = cardIdIn(v, e.attackerId);
        const slot = q(`[data-fx-card="${e.attackerId}"]`);
        const target =
          e.target.kind === 'player'
            ? q(`[data-avatar-seat="${e.target.seat}"]`)?.getBoundingClientRect()
            : rectOf(e.target.id);
        if (!slot || !target) return;
        const from = centre(slot.getBoundingClientRect());
        const to = centre(target);
        // Lunge most of the way there and spring back.
        slot.style.zIndex = '30';
        void animate(
          slot,
          { x: [0, (to.x - from.x) * 0.55, 0], y: [0, (to.y - from.y) * 0.55, 0], scale: [1, 1.12, 1] },
          { duration: 0.55, times: [0, 0.4, 1], ease: 'easeInOut' },
        ).then(() => (slot.style.zIndex = ''));
        return;
      }
      case 'battleDamage':
      case 'damageDealt': {
        const r = rectOf(e.targetId);
        if (!r) return;
        const c = centre(r);
        add({ kind: 'impact', ...c, element: elementOf(cardIdIn(v, e.sourceId)), big: e.amount >= 1000 });
        add({ kind: 'number', x: c.x, y: r.top + 8, text: `−${e.amount}`, tone: 'damage' });
        return;
      }
      case 'playerDamage': {
        const avatar = q(`[data-avatar-seat="${e.seat}"]`)?.getBoundingClientRect();
        if (avatar) {
          const c = centre(avatar);
          add({ kind: 'impact', ...c, element: elementOf(lastAttacker.current), big: true });
          add({ kind: 'number', x: c.x, y: avatar.top - 4, text: `−${e.amount}`, tone: 'damage' });
        }
        shake(q(`[data-hud-seat="${e.seat}"]`));
        return;
      }
      case 'lifeLost':
        shake(q(`[data-hud-seat="${e.seat}"]`));
        return;
      case 'destroyed': {
        const r = lastRects.current.get(e.instanceId);
        const def = getCard(e.cardId);
        if (r && def) add({ kind: 'burn', rect: r, image: imageUrl(def) });
        return;
      }
      case 'deployed': {
        // Measure once the card has landed in the base.
        setTimeout(() => {
          const r = q(`[data-card="${e.instanceId}"]`)?.getBoundingClientRect();
          if (r) add({ kind: 'shimmer', rect: r });
        }, 380);
        return;
      }
      case 'modified': {
        if (e.stat !== 'power' && e.stat !== 'strike') return;
        const r = rectOf(e.instanceId);
        if (!r || e.amount === 0) return;
        const sign = e.amount > 0 ? '+' : '−';
        const text = e.stat === 'power' ? `${sign}${Math.abs(e.amount)}` : `${sign}${Math.abs(e.amount)} strike`;
        add(
          { kind: 'number', x: centre(r).x, y: r.top + r.height * 0.35, text, tone: e.amount > 0 ? 'up' : 'down' },
          150,
        );
        return;
      }
      case 'assigned': {
        const slot = q(`[data-fx-card="${e.palId}"]`);
        if (slot) void animate(slot, { y: [0, -14, 0] }, { duration: 0.4, ease: 'easeOut' });
        return;
      }
    }
  }

  if (!enabled) return null;
  return (
    <>
      {fx.map((f) => {
        const done = () => remove(f.id);
        switch (f.kind) {
          case 'impact':
            return <ImpactBurst key={f.id} x={f.x} y={f.y} element={f.element} big={f.big} onDone={done} />;
          case 'number':
            return <FloatingNumber key={f.id} x={f.x} y={f.y} text={f.text} tone={f.tone} onDone={done} />;
          case 'burn':
            return <BurnAway key={f.id} rect={f.rect} image={f.image} onDone={done} />;
          case 'shimmer':
            return <Shimmer key={f.id} rect={f.rect} onDone={done} />;
          case 'sky':
            return <SkyChange key={f.id} night={f.night} rect={f.rect} onDone={done} />;
        }
      })}
    </>
  );
}

function shake(el: HTMLElement | null) {
  if (!el) return;
  void animate(el, { x: [0, -8, 8, -6, 6, -3, 0] }, { duration: 0.5 });
  // A red glow that fades out completely (a zero-size shadow still tints a see-through bar).
  const glow = (a: number, blur: number) => `drop-shadow(0 0 ${blur}px rgba(244, 63, 94, ${a}))`;
  void animate(el, { filter: [glow(0, 0), glow(0.9, 12), glow(0, 0)] }, { duration: 0.7 }).then(() => {
    el.style.filter = '';
  });
}

/** Dusk sweeping down the board with a moon rising, or dawn light with the sun. */
function SkyChange({ night, rect, onDone }: { night: boolean; rect: DOMRect; onDone: () => void }) {
  const Icon = night ? Moon : Sun;
  return (
    <div
      className="pointer-events-none fixed z-30 overflow-hidden rounded-xl"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <AnimatePresence>
        <motion.div
          className="absolute inset-0"
          style={{
            background: night
              ? 'linear-gradient(180deg, rgba(10,8,40,0.85), rgba(30,20,80,0.55) 60%, transparent)'
              : 'linear-gradient(180deg, rgba(255,214,120,0.7), rgba(255,240,200,0.35) 60%, transparent)',
          }}
          initial={{ y: '-100%', opacity: 1 }}
          animate={{ y: ['-100%', '0%', '0%'], opacity: [1, 1, 0] }}
          transition={{ duration: 1.8, times: [0, 0.45, 1], ease: 'easeInOut' }}
          onAnimationComplete={onDone}
        />
      </AnimatePresence>
      <motion.div
        className="absolute"
        style={{ left: '50%', top: '40%' }}
        initial={{ x: '-45vw', y: 60, opacity: 0, rotate: -30 }}
        animate={{ x: ['-30vw', '0vw', '20vw'], y: [60, -20, 10], opacity: [0, 1, 0], rotate: [-30, 0, 20] }}
        transition={{ duration: 1.8, ease: 'easeInOut' }}
      >
        <Icon
          className={night ? 'size-16 text-indigo-100' : 'size-16 text-amber-300'}
          style={{ filter: `drop-shadow(0 0 18px ${night ? '#c7d2fe' : '#fbbf24'})` }}
          fill="currentColor"
        />
      </motion.div>
    </div>
  );
}
