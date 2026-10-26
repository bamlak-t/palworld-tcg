import type { PlayerView } from '@pal/engine';
import { LifeGauge, ResourceCounter } from '@/components/game/PlayerHud';

/**
 * A player's status bar: name top-left, life top-right, resources bottom-right (with the
 * hand size bottom-left for the opponent). Colours come from --hud / --hud-border, which
 * skins can override.
 */
export function HudBar({ player }: { player: PlayerView }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-lg border border-hud-border bg-hud px-3 py-2 text-hud-foreground shadow-md backdrop-blur-sm md:px-4">
      <span className="truncate font-display text-base font-bold">{player.name}</span>
      <div className="md:w-52">
        <LifeGauge life={player.life} compactOnMobile />
      </div>
      <span className="text-xs opacity-80">{player.hand === null ? `${player.handCount} cards in hand` : ''}</span>
      <div className="flex justify-end gap-1">
        <ResourceCounter kind="Material" value={player.material} />
        <ResourceCounter kind="Ingredient" value={player.ingredient} />
      </div>
    </div>
  );
}
