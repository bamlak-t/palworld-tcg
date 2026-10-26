import type { BattleStep, GameView } from '@pal/engine';
import { cn } from '@/lib/utils';

const PHASES = [
  ['stand', 'Stand'],
  ['draw', 'Draw'],
  ['soul', 'Soul'],
  ['main', 'Main'],
  ['end', 'End'],
] as const;

const BATTLE_STEPS: [BattleStep, string][] = [
  ['attack', 'Attack'],
  ['block', 'Block'],
  ['quick', 'Quick'],
  ['damage', 'Damage'],
  ['endOfBattle', 'End of battle'],
];

/**
 * The turn's phases, like the "Flow of the Game" panel on the official playmat. A battle
 * happens inside the main phase, so its steps appear nested under Main while one is running.
 */
export function PhaseFlow({ phase, battleStep }: { phase: GameView['phase']; battleStep?: BattleStep }) {
  return (
    <ol className="flex flex-col gap-1" aria-label="Turn phases">
      {PHASES.map(([id, label]) => (
        <li key={id}>
          <div
            aria-current={phase === id ? 'step' : undefined}
            className={cn(
              'corner-cut px-3 py-1 text-xs font-semibold tracking-wide uppercase [--cut:6px]',
              phase === id ? 'bg-hud-border text-hud' : 'bg-hud text-hud-foreground/70',
            )}
          >
            {label}
          </div>
          {id === 'main' && battleStep && (
            <ol
              className="mt-1 ml-3 flex flex-col gap-0.5 border-l border-hud-border/60 pl-2"
              aria-label="Battle steps"
            >
              {BATTLE_STEPS.map(([step, stepLabel]) => (
                <li
                  key={step}
                  aria-current={battleStep === step ? 'step' : undefined}
                  className={cn(
                    'text-[11px]',
                    battleStep === step ? 'font-bold text-orange-300' : 'text-hud-foreground/60',
                  )}
                >
                  {stepLabel}
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}
