import type { ReactNode } from 'react';
import { Check, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AVATARS } from '@/components/board/Avatar';
import { BOARD_SKINS, skinStyle, type BoardSkin } from '@/lib/skins';
import { CUSTOM_SKIN_ID, customSkin, useSettings, type CustomSkinColors } from '@/lib/settings';
import { useTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** Settings in a dialog, opened from the gear in the header. Saved per browser. */
export function SettingsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="font-display text-xl">Settings</DialogTitle>
        <DialogDescription className="sr-only">Board skin, appearance and your player.</DialogDescription>
        <SettingsPanel />
      </DialogContent>
    </Dialog>
  );
}

function SettingsPanel() {
  const { settings, update } = useSettings();
  const { theme, setTheme } = useTheme();
  const custom = customSkin(settings.custom);

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Board skin"
        description="The play area's background, player bars and board text. Saved in this browser."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...BOARD_SKINS, custom].map((skin) => (
            <SkinPreview
              key={skin.id}
              skin={skin}
              selected={settings.skinId === skin.id}
              onSelect={() => update({ skinId: skin.id })}
            />
          ))}
        </div>
        {settings.skinId === CUSTOM_SKIN_ID && (
          <CustomColors colors={settings.custom} onChange={(c) => update({ custom: c })} />
        )}
      </Section>

      <Section title="Appearance" description="Light or dark pages. System follows your device.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
          {(
            [
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
              ['system', 'System', Monitor],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value as Theme)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition',
                theme === value ? 'border-primary bg-primary/15' : 'hover:bg-muted',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Your player" description="Used when you start a game.">
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="player-name">Name</Label>
          <Input
            id="player-name"
            value={settings.playerName}
            maxLength={24}
            onChange={(e) => update({ playerName: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={settings.avatarId === a.id}
              title={a.name}
              onClick={() => update({ avatarId: a.id })}
              className={cn(
                'rounded-full transition',
                settings.avatarId === a.id ? 'scale-110' : 'opacity-55 hover:opacity-100',
              )}
            >
              <Avatar avatarId={a.id} size={52} />
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** A miniature board: background, a player bar and some board text, so each skin's colours are visible. */
function SkinPreview({ skin, selected, onSelect }: { skin: BoardSkin; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-xl p-3 text-left shadow-md ring-offset-2 ring-offset-background transition',
        selected ? 'ring-3 ring-primary' : 'hover:-translate-y-0.5',
      )}
      style={skinStyle(skin)}
    >
      <div className="flex items-center gap-2 rounded-md border border-hud-border bg-hud px-2 py-1 text-xs text-hud-foreground">
        <span className="font-semibold">Player</span>
        <span className="h-2 flex-1 rounded-sm bg-gradient-to-r from-emerald-300 to-emerald-600" />
        <span className="font-bold">10</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-board-ink uppercase">
        <span className="tracking-widest">Turn 3</span>
        <span className="h-0 flex-1 border-t-2 border-dotted border-board-ink/50" />
        <span className="font-bold normal-case">Main phase</span>
      </div>
      <div className="h-10 rounded-md border border-board-ink/25 bg-board-ink/5" />
      <span className="flex items-center justify-between text-sm font-semibold text-board-ink">
        {skin.name}
        {selected && <Check className="size-4" />}
      </span>
    </button>
  );
}

function CustomColors({ colors, onChange }: { colors: CustomSkinColors; onChange: (c: CustomSkinColors) => void }) {
  const fields: [keyof CustomSkinColors, string][] = [
    ['top', 'Background top'],
    ['bottom', 'Background bottom'],
    ['bar', 'Player bars'],
    ['barBorder', 'Bar border & highlights'],
    ['ink', 'Board text'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card/60 p-4 sm:grid-cols-5">
      {fields.map(([key, label]) => (
        <label key={key} className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {label}
          <input
            type="color"
            value={colors[key]}
            onChange={(e) => onChange({ ...colors, [key]: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-md border bg-transparent"
          />
        </label>
      ))}
    </div>
  );
}
