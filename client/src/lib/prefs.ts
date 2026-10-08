import { useSyncExternalStore } from 'react';
import { webglSupported } from './webgl';

/** Per-device preferences (not shared with the room). */
export type TableTheme = 'green' | 'wine' | 'blue';

export interface Prefs {
  muted: boolean;
  haptics: boolean;
  theme: TableTheme;
  /** Realistic mode: the table seen from your seat in 3D. Off: the simplified top-down table. */
  view3d: boolean;
}

const KEY = 'dane-se:prefs';

/** The first-person table suits desktops; phones and tablets get the simpler top-down table. */
export function recommendedView3d(): boolean {
  if (!webglSupported) return false;
  try {
    return !(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
  } catch {
    return true;
  }
}

const DEFAULTS: Prefs = { muted: false, haptics: true, theme: 'green', view3d: recommendedView3d() };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();
applyTheme(prefs.theme);

function applyTheme(theme: TableTheme): void {
  document.documentElement.dataset.table = theme;
}

export function getPrefs(): Prefs {
  return prefs;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage disabled: the preference lasts until the page is closed.
  }
  if (key === 'theme') applyTheme(value as TableTheme);
  for (const l of listeners) l();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
