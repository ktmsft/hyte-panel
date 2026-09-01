import type { ThemeConfig } from './types'

/**
 * Presets are complete themes, not partial overrides, so picking one always
 * lands somewhere coherent. Editing any colour flips `preset` to 'custom' and
 * the values stay exactly as the user left them.
 */

export interface ThemePreset {
  id: string
  label: string
  /** A one-line note shown under the swatches in settings. */
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

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    note: 'The default. Cool grey on near-black, solid cards.',
    theme: { ...BASE }
  },
  {
    id: 'glass',
    label: 'Glass',
    note: 'Built for Wallpaper Engine. Cards drop to a tint and text gets a shadow.',
    theme: {
      ...BASE,
      cardBackground: '#0a1017',
      cardOpacity: 0.42,
      cardBorder: '#3b4a5a',
      text: '#f4f8fc',
      muted: '#c2ced9',
      faint: '#93a2b0',
      textShadow: true
    }
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

export const DEFAULT_THEME: ThemeConfig = { preset: 'midnight', ...BASE }

export function presetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)
}
