/**
 * Board skins: the play-area background. Gradients for now; a skin can later add an
 * `image` under public/skins/<id>/ layered beneath the gradient.
 */
export interface BoardSkin {
  id: string;
  name: string;
  background: string;
  /** Colour for text and outlines drawn on the background. Light backgrounds need dark ink. */
  ink?: string;
  /** Player status bar colours; defaults come from --hud / --hud-border in index.css. */
  hud?: { background?: string; border?: string; foreground?: string };
}

/** CSS variables a skin sets on the board. */
export const skinStyle = (skin: BoardSkin): Record<string, string> => ({
  background: skin.background,
  ...(skin.ink && { '--board-ink': skin.ink }),
  ...(skin.hud?.background && { '--hud': skin.hud.background }),
  ...(skin.hud?.border && { '--hud-border': skin.hud.border }),
  ...(skin.hud?.foreground && { '--hud-foreground': skin.hud.foreground }),
});

export const BOARD_SKINS: BoardSkin[] = [
  {
    id: 'meadow',
    name: 'Palpagos Meadow',
    ink: 'oklch(0.22 0.04 255)',
    hud: { background: 'oklch(0.3 0.06 160 / 0.8)', border: 'oklch(0.85 0.12 110)' },
    background:
      'radial-gradient(ellipse at 50% 0%, oklch(0.9 0.08 120 / 0.6), transparent 60%), linear-gradient(180deg, oklch(0.84 0.09 140), oklch(0.66 0.1 150))',
  },
  {
    id: 'moonlit',
    name: 'Moonlit Night',
    background:
      'radial-gradient(circle at 88% 6%, oklch(0.95 0.03 90 / 0.55) 0 1%, transparent 3.5%), radial-gradient(ellipse at 50% 0%, oklch(0.4 0.12 280 / 0.8), transparent 70%), linear-gradient(180deg, oklch(0.25 0.08 275), oklch(0.12 0.04 270))',
  },
  {
    id: 'volcano',
    name: 'Volcano Rim',
    hud: { background: 'oklch(0.22 0.05 30 / 0.85)', border: 'oklch(0.75 0.17 50)' },
    background:
      'radial-gradient(ellipse at 50% 100%, oklch(0.65 0.2 40 / 0.7), transparent 60%), linear-gradient(180deg, oklch(0.3 0.04 30), oklch(0.18 0.05 25))',
  },
  {
    id: 'tundra',
    name: 'Frozen Tundra',
    ink: 'oklch(0.22 0.04 255)',
    hud: { background: 'oklch(0.32 0.07 240 / 0.8)', border: 'oklch(0.92 0.04 220)' },
    background:
      'radial-gradient(ellipse at 30% 0%, oklch(0.97 0.02 230 / 0.8), transparent 60%), linear-gradient(180deg, oklch(0.88 0.04 230), oklch(0.7 0.06 238))',
  },
  {
    id: 'desert',
    name: 'Desert Ruins',
    ink: 'oklch(0.22 0.04 255)',
    hud: { background: 'oklch(0.3 0.05 50 / 0.8)', border: 'oklch(0.88 0.1 85)' },
    background:
      'radial-gradient(ellipse at 50% 0%, oklch(0.95 0.06 85 / 0.7), transparent 60%), linear-gradient(180deg, oklch(0.88 0.07 80), oklch(0.72 0.1 62))',
  },
];

export const DEFAULT_SKIN_ID = 'moonlit';

export const getSkin = (id: string | null | undefined): BoardSkin =>
  BOARD_SKINS.find((s) => s.id === id) ?? BOARD_SKINS.find((s) => s.id === DEFAULT_SKIN_ID)!;
