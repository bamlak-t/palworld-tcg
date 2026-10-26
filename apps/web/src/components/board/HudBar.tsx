import type { ReactNode } from 'react';
import type { PlayerView } from '@pal/engine';
import { LifeGauge, ResourceCounter } from '@/components/game/PlayerHud';

/**
 * A player's status bar: name, life and resources, plus optional controls on the right.
 * Colours come from --hud-bg / --hud-border, which skins can override.
 */
export function HudBar({ player, children }: { player: PlayerView; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-hud-border bg-hud px-4 py-2 text-hud-foreground shadow-md backdrop-blur-sm">
      <span className="font-display text-base font-bold">{player.name}</span>
      <div className="w-48">
        <LifeGauge life={player.life} />
      </div>
      <div className="flex gap-1">
        <ResourceCounter kind="Material" value={player.material} />
        <ResourceCounter kind="Ingredient" value={player.ingredient} />
      </div>
      {player.hand === null && <span className="text-xs opacity-80">{player.handCount} cards in hand</span>}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
