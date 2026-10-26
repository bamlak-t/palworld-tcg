/**
 * Player avatars: simple original creature faces (not Palworld characters), drawn in SVG
 * so they stay crisp at any size.
 */
import { cn } from '@/lib/utils';

export interface AvatarDef {
  id: string;
  name: string;
  bg: string;
  face: string;
  draw: (face: string) => React.ReactNode;
}

const eyes = (y = 52, gap = 14, r = 5) => (
  <>
    <circle cx={50 - gap} cy={y} r={r} fill="#1b1b2f" />
    <circle cx={50 + gap} cy={y} r={r} fill="#1b1b2f" />
    <circle cx={50 - gap + 1.6} cy={y - 1.8} r={r / 2.6} fill="#fff" />
    <circle cx={50 + gap + 1.6} cy={y - 1.8} r={r / 2.6} fill="#fff" />
  </>
);

export const AVATARS: AvatarDef[] = [
  {
    id: 'woolly',
    name: 'Woolly',
    bg: '#f6d6a8',
    face: '#fff8ee',
    draw: (f) => (
      <>
        {[22, 36, 50, 64, 78].map((x) => (
          <circle key={x} cx={x} cy={34} r={12} fill={f} />
        ))}
        <ellipse cx="50" cy="58" rx="26" ry="22" fill="#e9c9a3" />
        {eyes(56, 11, 4.5)}
        <ellipse cx="50" cy="68" rx="5" ry="3" fill="#c48a6a" />
      </>
    ),
  },
  {
    id: 'ember',
    name: 'Ember',
    bg: '#ffb27a',
    face: '#ff7a3d',
    draw: (f) => (
      <>
        <path d="M22 30 L34 52 L18 50 Z M78 30 L66 52 L82 50 Z" fill={f} />
        <ellipse cx="50" cy="58" rx="28" ry="24" fill={f} />
        <ellipse cx="50" cy="66" rx="16" ry="12" fill="#fff1e3" />
        {eyes(54, 12)}
        <circle cx="50" cy="64" r="3" fill="#1b1b2f" />
      </>
    ),
  },
  {
    id: 'frost',
    name: 'Frost',
    bg: '#a8d8ff',
    face: '#2e4a7a',
    draw: (f) => (
      <>
        <ellipse cx="50" cy="56" rx="30" ry="28" fill={f} />
        <ellipse cx="50" cy="62" rx="20" ry="18" fill="#f4f8ff" />
        {eyes(54, 10)}
        <path d="M43 64 L57 64 L50 72 Z" fill="#ffb347" />
      </>
    ),
  },
  {
    id: 'sprout',
    name: 'Sprout',
    bg: '#c4ec9f',
    face: '#5fae4c',
    draw: (f) => (
      <>
        <path d="M50 30 C40 14 28 20 30 28 C38 26 44 28 50 32 C56 28 62 26 70 28 C72 20 60 14 50 30 Z" fill="#3f8a34" />
        <circle cx="50" cy="58" r="27" fill={f} />
        {eyes(56, 11)}
        <path d="M42 68 Q50 74 58 68" stroke="#1b1b2f" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'spark',
    name: 'Spark',
    bg: '#fff09a',
    face: '#ffd23f',
    draw: (f) => (
      <>
        <path d="M24 22 L38 44 L28 44 Z M76 22 L62 44 L72 44 Z" fill="#2b2b3d" />
        <circle cx="50" cy="58" r="27" fill={f} />
        <circle cx="34" cy="66" r="5" fill="#ff8a8a" />
        <circle cx="66" cy="66" r="5" fill="#ff8a8a" />
        {eyes(54, 12)}
        <path d="M45 66 Q50 70 55 66" stroke="#1b1b2f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'shade',
    name: 'Shade',
    bg: '#c9b6ff',
    face: '#4b3a7a',
    draw: (f) => (
      <>
        <path d="M20 40 Q24 18 36 30 L50 22 L64 30 Q76 18 80 40 Z" fill={f} />
        <ellipse cx="50" cy="58" rx="30" ry="24" fill={f} />
        <ellipse cx="38" cy="55" rx="7" ry="5" fill="#ffe56b" />
        <ellipse cx="62" cy="55" rx="7" ry="5" fill="#ffe56b" />
        <ellipse cx="38" cy="55" rx="2" ry="4" fill="#1b1b2f" />
        <ellipse cx="62" cy="55" rx="2" ry="4" fill="#1b1b2f" />
      </>
    ),
  },
];

export const getAvatar = (id: string | undefined) => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;

export function Avatar({
  avatarId,
  size = 56,
  className,
  glow,
}: {
  avatarId: string | undefined;
  size?: number;
  className?: string;
  /** Pulsing ring, e.g. when the player can be targeted. */
  glow?: boolean;
}) {
  const a = getAvatar(avatarId);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={a.name}
      className={cn(
        'shrink-0 rounded-full ring-2 ring-hud-border',
        glow && 'animate-pulse ring-4 ring-orange-400',
        className,
      )}
    >
      <circle cx="50" cy="50" r="50" fill={a.bg} />
      {a.draw(a.face)}
    </svg>
  );
}
