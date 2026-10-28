/**
 * Small, CSS-only particle effects for the board: element-themed impact bursts, floating
 * numbers, burning-away cards and play shimmers. Each effect renders at a screen point,
 * plays once and calls onDone.
 */
import { motion } from 'motion/react';
import type { Element } from '@pal/cards';

type Shape = 'ember' | 'drop' | 'leaf' | 'bolt' | 'shard' | 'rock' | 'smoke' | 'spark';

interface ElementFx {
  colors: [string, string, string];
  shape: Shape;
  /** Particles drift up (fire) or fall (rocks) after the burst. */
  drift?: number;
  ring?: boolean;
}

/** One look per Pal element, so every Pal's hits feel different without per-card work. */
export const ELEMENT_FX: Record<Element, ElementFx> = {
  Fire: { colors: ['#fff1a8', '#ff8a2a', '#e63946'], shape: 'ember', drift: -36 },
  Water: { colors: ['#e0f4ff', '#4cc9f0', '#1d6fd8'], shape: 'drop', ring: true, drift: 18 },
  Grass: { colors: ['#d8f3c4', '#57cc99', '#2d6a4f'], shape: 'leaf', drift: 10 },
  Electric: { colors: ['#fffbe0', '#ffd60a', '#f4a300'], shape: 'bolt' },
  Ice: { colors: ['#ffffff', '#caf0f8', '#7ec8e3'], shape: 'shard', ring: true },
  Ground: { colors: ['#f2d49b', '#b08968', '#6f4a2f'], shape: 'rock', drift: 40 },
  Dark: { colors: ['#e0d4ff', '#8e44d6', '#2b0a4f'], shape: 'smoke', drift: -14 },
  Dragon: { colors: ['#ffe1ea', '#f72585', '#7209b7'], shape: 'spark', ring: true },
  Neutral: { colors: ['#ffffff', '#f1f5f9', '#b8c4d4'], shape: 'spark' },
};

const SHAPE_STYLE: Record<Shape, React.CSSProperties> = {
  ember: { width: 7, height: 7, borderRadius: '50%' },
  drop: { width: 7, height: 10, borderRadius: '50% 50% 50% 0' },
  leaf: { width: 10, height: 6, borderRadius: '0 80% 0 80%' },
  bolt: { width: 3, height: 16, borderRadius: 1 },
  shard: { width: 9, height: 12, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' },
  rock: { width: 8, height: 7, borderRadius: '30% 50% 40% 60%' },
  smoke: { width: 18, height: 18, borderRadius: '50%', filter: 'blur(4px)' },
  spark: {
    width: 10,
    height: 10,
    clipPath: 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)',
  },
};

/** Deterministic jitter, so a burst looks varied without Math.random in render. */
const jitter = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** An impact: a flash, an optional shock ring and a spray of themed particles. */
export function ImpactBurst({
  x,
  y,
  element,
  big,
  onDone,
}: {
  x: number;
  y: number;
  element: Element;
  big?: boolean;
  onDone: () => void;
}) {
  const fx = ELEMENT_FX[element];
  const count = big ? 16 : 11;
  const reach = big ? 90 : 62;
  return (
    <div className="pointer-events-none fixed z-50" style={{ left: x, top: y }}>
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 70,
          height: 70,
          left: -35,
          top: -35,
          background: `radial-gradient(circle, ${fx.colors[0]} 0%, ${fx.colors[1]}cc 35%, transparent 70%)`,
          mixBlendMode: 'screen',
        }}
        initial={{ scale: 0.2, opacity: 1 }}
        animate={{ scale: big ? 2.2 : 1.7, opacity: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        onAnimationComplete={onDone}
      />
      {fx.ring && (
        <motion.div
          className="absolute rounded-full border-2"
          style={{ width: 60, height: 60, left: -30, top: -30, borderColor: fx.colors[1] }}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
      )}
      {fx.shape === 'bolt' && <Lightning color={fx.colors[1]} />}
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + jitter(i, 1) * 0.6;
        const dist = reach * (0.55 + jitter(i, 2) * 0.45);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist + (fx.drift ?? 0);
        const style = SHAPE_STYLE[fx.shape];
        return (
          <motion.span
            key={i}
            className="absolute"
            style={{
              ...style,
              left: -(Number(style.width) / 2),
              top: -(Number(style.height) / 2),
              background: fx.colors[i % 3],
              boxShadow: fx.shape === 'ember' || fx.shape === 'spark' ? `0 0 6px ${fx.colors[1]}` : undefined,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: 0.4, rotate: (jitter(i, 3) - 0.5) * 360 }}
            transition={{ duration: 0.55 + jitter(i, 4) * 0.3, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

function Lightning({ color }: { color: string }) {
  return (
    <motion.svg
      className="absolute"
      width="120"
      height="120"
      viewBox="-60 -60 120 120"
      style={{ left: -60, top: -60, filter: `drop-shadow(0 0 4px ${color})` }}
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 0.2, 1, 0] }}
      transition={{ duration: 0.4 }}
    >
      {[0, 2.1, 4.2].map((a) => (
        <polyline
          key={a}
          points={`0,0 ${Math.cos(a) * 18 + 6},${Math.sin(a) * 18} ${Math.cos(a) * 30 - 5},${Math.sin(a) * 30 + 4} ${Math.cos(a) * 48},${Math.sin(a) * 48}`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="bevel"
        />
      ))}
    </motion.svg>
  );
}

/** A number that pops up and floats away: damage in red, buffs in green. */
export function FloatingNumber({
  x,
  y,
  text,
  tone,
  onDone,
}: {
  x: number;
  y: number;
  text: string;
  tone: 'damage' | 'up' | 'down';
  onDone: () => void;
}) {
  const color = tone === 'damage' ? '#ff4d5e' : tone === 'up' ? '#4ade80' : '#fb923c';
  return (
    <motion.div
      className="pointer-events-none fixed z-50 font-display text-2xl font-black tabular-nums"
      style={{
        left: x,
        top: y,
        color,
        translateX: '-50%',
        WebkitTextStroke: '1.5px rgba(0,0,0,0.75)',
        textShadow: '0 2px 6px rgba(0,0,0,0.6)',
      }}
      initial={{ y: 0, scale: 0.4, opacity: 0 }}
      animate={{ y: -46, scale: [0.4, 1.25, 1], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
      onAnimationComplete={onDone}
    >
      {text}
    </motion.div>
  );
}

/** A destroyed card burning away where it stood. */
export function BurnAway({ rect, image, onDone }: { rect: DOMRect; image: string; onDone: () => void }) {
  return (
    <div
      className="pointer-events-none fixed z-40"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <motion.div
        className="absolute inset-0 rounded-md bg-cover bg-center"
        style={{ backgroundImage: `url(${image})` }}
        initial={{ opacity: 1, filter: 'brightness(1) sepia(0) blur(0px)', scale: 1 }}
        animate={{
          opacity: [1, 1, 0],
          filter: [
            'brightness(1) sepia(0) blur(0px)',
            'brightness(1.7) sepia(1) blur(0px)',
            'brightness(0.2) sepia(1) blur(3px)',
          ],
          scale: [1, 1.04, 0.92],
          clipPath: ['inset(0% 0% 0% 0%)', 'inset(0% 0% 10% 0%)', 'inset(0% 0% 100% 0%)'],
        }}
        transition={{ duration: 0.9, ease: 'easeIn' }}
        onAnimationComplete={onDone}
      />
      {Array.from({ length: 12 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rounded-full"
          style={{
            left: `${10 + jitter(i, 5) * 80}%`,
            bottom: `${jitter(i, 6) * 30}%`,
            background: i % 2 ? '#ffb347' : '#ff5e3a',
            boxShadow: '0 0 6px #ff8a2a',
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -40 - jitter(i, 7) * 40, opacity: [0, 1, 0] }}
          transition={{ duration: 0.9, delay: jitter(i, 8) * 0.35 }}
        />
      ))}
    </div>
  );
}

/** A light sweep across a card that just entered play. */
export function Shimmer({ rect, onDone }: { rect: DOMRect; onDone: () => void }) {
  return (
    <div
      className="pointer-events-none fixed z-40 overflow-hidden rounded-md"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <motion.div
        className="absolute inset-y-0 w-1/2"
        style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.75), transparent)' }}
        initial={{ x: '-120%' }}
        animate={{ x: '260%' }}
        transition={{ duration: 0.7, ease: 'easeInOut', delay: 0.15 }}
        onAnimationComplete={onDone}
      />
    </div>
  );
}

/** Gold flash and sparkles around a Lucky Pal that stops the damage. Fills its parent. */
export function LuckyFlash({ delay }: { delay: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute -inset-3 rounded-xl"
        style={{
          background: 'radial-gradient(circle, rgba(255,224,102,0.85), rgba(255,183,3,0.35) 45%, transparent 70%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.35], scale: [0.6, 1.25, 1.05] }}
        transition={{ delay, duration: 0.9, ease: 'easeOut' }}
      />
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2"
            style={{
              ...SHAPE_STYLE.spark,
              marginLeft: -5,
              marginTop: -5,
              background: i % 2 ? '#ffe066' : '#fff8d6',
              boxShadow: '0 0 8px #ffd60a',
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            animate={{
              x: Math.cos(angle) * 110,
              y: Math.sin(angle) * 140,
              opacity: [0, 1, 0],
              scale: [0.5, 1.4, 0.6],
              rotate: 180,
            }}
            transition={{ delay: delay + 0.1, duration: 0.9, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}
