import type { ThemeConfig } from './types'

// Presets are complete themes. Editing any colour flips `preset` to 'custom'.
export interface ThemePreset {
  id: string
  label: string
  /** Shown under the swatches in settings. */
  note: string
  theme: Omit<ThemeConfig, 'preset'>
}

export const FONT_STACKS: { id: string; label: string; stack: string }[] = [
  {
    id: 'segoe',
    label: 'Segoe UI',
    stack: "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif"
  },
  {
    id: 'bahnschrift',
    label: 'Bahnschrift (condensed)',
    stack: "'Bahnschrift', 'Segoe UI', system-ui, sans-serif"
  },
  {
    id: 'cascadia',
    label: 'Cascadia Mono',
    stack: "'Cascadia Mono', 'Cascadia Code', Consolas, ui-monospace, monospace"
  },
  {
    id: 'georgia',
    label: 'Georgia (serif)',
    stack: "Georgia, 'Times New Roman', serif"
  }
]

const SEGOE = FONT_STACKS[0].stack

const BASE: Omit<ThemeConfig, 'preset'> = {
  background: '#06080b',
  cardBackground: '#0e141b',
  cardOpacity: 1,
  cardBorder: '#1e2833',
  text: '#e8eef5',
  muted: '#8494a5',
  faint: '#556170',
  accent: '#58a6ff',
  ok: '#3fb950',
  warn: '#d29922',
  err: '#f85149',
  fontFamily: SEGOE,
  fontScale: 1,
  textShadow: false
}

/** The default. Off-white glass with dark ink, over a sharp wallpaper. */
const FROST_WHITE: Omit<ThemeConfig, 'preset'> = {
  ...BASE,
  cardBackground: '#f4f6f9',
  cardOpacity: 0.58,
  cardBorder: '#ffffff',
  text: '#0e1620',
  muted: '#3c4a58',
  faint: '#68757f',
  accent: '#0b5ed7',
  ok: '#1a7f37',
  warn: '#9a6700',
  err: '#cf222e',
  textShadow: false
}

/** The dark counterpart. Referenced when the glass tint crosses back over. */
const GLASS: Omit<ThemeConfig, 'preset'> = {
  ...BASE,
  cardBackground: '#0a1017',
  cardOpacity: 0.5,
  cardBorder: '#46586b',
  text: '#f4f8fc',
  muted: '#c2ced9',
  faint: '#93a2b0',
  textShadow: true
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'frost-white',
    label: 'Frost White',
    note: 'The default. Off-white glass, dark ink.',
    theme: { ...FROST_WHITE }
  },
  {
    id: 'glass',
    label: 'Smoke',
    note: 'Charcoal panes, light text.',
    theme: { ...GLASS }
  },
  {
    id: 'parchment',
    label: 'Parchment',
    note: 'Warm ivory glass, dark ink.',
    theme: {
      ...BASE,
      cardBackground: '#f7f2e8',
      cardOpacity: 0.58,
      cardBorder: '#fffaf0',
      text: '#1c1710',
      muted: '#4d4437',
      faint: '#7a6f5e',
      accent: '#a15c00',
      ok: '#2c6e2f',
      warn: '#8a5a00',
      err: '#b3261e',
      textShadow: false
    }
  },
  {
    id: 'frosted',
    label: 'Frosted',
    note: 'A lighter tint, for the Frosted glass mode.',
    theme: {
      ...BASE,
      cardBackground: '#0d151f',
      cardOpacity: 0.34,
      cardBorder: '#54657a',
      text: '#f5f9fd',
      muted: '#c8d4e0',
      faint: '#9aa8b6',
      textShadow: true
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    note: 'Cool grey on near-black, solid cards.',
    theme: { ...BASE }
  },
  {
    id: 'carbon',
    label: 'Carbon',
    note: 'Neutral greys, no blue cast, white accent.',
    theme: {
      ...BASE,
      background: '#0a0a0a',
      cardBackground: '#141414',
      cardBorder: '#262626',
      text: '#ededed',
      muted: '#8f8f8f',
      faint: '#5c5c5c',
      accent: '#e4e4e4',
      ok: '#6fcf6f'
    }
  },
  {
    id: 'ember',
    label: 'Ember',
    note: 'Warm amber accent on a brown-black ground.',
    theme: {
      ...BASE,
      background: '#0b0705',
      cardBackground: '#17100b',
      cardBorder: '#33241a',
      text: '#f5ebe1',
      muted: '#b09681',
      faint: '#7a6353',
      accent: '#ff9f45',
      ok: '#8bc34a',
      warn: '#ffc857'
    }
  },
  {
    id: 'mint',
    label: 'Mint',
    note: 'Green accent, slightly cooler text.',
    theme: {
      ...BASE,
      background: '#05090a',
      cardBackground: '#0c1618',
      cardBorder: '#1b2c2e',
      text: '#e4f2f0',
      muted: '#84a5a2',
      faint: '#53706e',
      accent: '#4dd6a8'
    }
  }
]

export const DEFAULT_THEME: ThemeConfig = { preset: 'frost-white', ...FROST_WHITE }

export function presetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)
}
