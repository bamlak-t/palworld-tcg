import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { DEFAULT_SKIN_ID, getSkin, type BoardSkin } from '@/lib/skins';
import { PREFS_APPLIED, prefsChanged } from '@/lib/prefs';

/** Colours for the "Custom" board skin, as hex so they work with colour pickers. */
export interface CustomSkinColors {
  top: string;
  bottom: string;
  bar: string;
  barBorder: string;
  ink: string;
}

export interface Settings {
  skinId: string;
  custom: CustomSkinColors;
  playerName: string;
  avatarId: string;
  /** Skip board effects (lunges, bursts, sweeps) and shorten animations. */
  reduceMotion: boolean;
}

export const CUSTOM_SKIN_ID = 'custom';

const DEFAULTS: Settings = {
  skinId: DEFAULT_SKIN_ID,
  custom: { top: '#2b3a6b', bottom: '#11162b', bar: '#1b2347', barBorder: '#e8c46a', ink: '#f5f7ff' },
  playerName: 'Player 1',
  avatarId: 'woolly',
  // Follow the system setting until the player chooses.
  reduceMotion:
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
};

const STORAGE_KEY = 'pal-settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...saved, custom: { ...DEFAULTS.custom, ...saved.custom } };
    }
  } catch {
    // Storage unavailable or corrupt: use defaults.
  }
  return DEFAULTS;
}

/** The Custom skin built from the chosen colours. */
export const customSkin = (c: CustomSkinColors): BoardSkin => ({
  id: CUSTOM_SKIN_ID,
  name: 'Custom',
  background: `linear-gradient(180deg, ${c.top}, ${c.bottom})`,
  ink: c.ink,
  hud: { background: `color-mix(in oklab, ${c.bar} 85%, transparent)`, border: c.barBorder },
});

const SettingsContext = createContext<{
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  skin: BoardSkin;
} | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  // Preferences synced from your account.
  useEffect(() => {
    const reload = () => setSettings(load());
    window.addEventListener(PREFS_APPLIED, reload);
    return () => window.removeEventListener(PREFS_APPLIED, reload);
  }, []);
  const update = (patch: Partial<Settings>) => {
    prefsChanged();
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal: the change just won't persist.
      }
      return next;
    });
  };
  const skin = settings.skinId === CUSTOM_SKIN_ID ? customSkin(settings.custom) : getSkin(settings.skinId);
  return <SettingsContext.Provider value={{ settings, update, skin }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

/** Applies the Reduce motion setting to every Motion animation in the app. */
export function MotionPrefs({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'never'}>{children}</MotionConfig>;
}
