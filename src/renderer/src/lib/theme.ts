import type { GlassMode, ThemeConfig } from '@shared/types'

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  const value = hex.replace('#', '').trim()
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return [r, g, b].some(Number.isNaN) ? null : { r, g, b }
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/** Relative luminance, so light glass and dark glass can be told apart. */
function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.45
}

/** Writes the theme as CSS custom properties. Repaints with no re-render. */
export function applyTheme(theme: ThemeConfig, glassMode: GlassMode): void {
  const root = document.documentElement
  const set = (name: string, value: string): void => root.style.setProperty(name, value)

  // Only Solid paints a page background. The rest show what is behind.
  set('--bg', glassMode === 'solid' ? theme.background : 'transparent')
  set('--card-bg', hexToRgba(theme.cardBackground, theme.cardOpacity))
  set('--line', theme.cardBorder)
  set('--text', theme.text)
  set('--muted', theme.muted)
  set('--faint', theme.faint)
  set('--accent', theme.accent)
  set('--ok', theme.ok)
  set('--warn', theme.warn)
  set('--err', theme.err)
  set('--font-family', theme.fontFamily)
  // Drives both the space between cards and the panel's inset, so wallpaper
  // shows through in the same measure all round.
  set('--gap', `${DESIGN_GAP_REM * theme.gapScale}rem`)

  // Text printed on the accent has to flip with it.
  set('--on-accent', isLight(theme.accent) ? '#0b1219' : '#f6fafd')

  const lightGlass = isLight(theme.cardBackground)
  set('--card-highlight', lightGlass ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.09)')
  // A white tint would be invisible on off-white glass.
  set('--panel-raised', lightGlass ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.07)')

  // Dark text over a bright wallpaper wants a light halo, not a dark shadow.
  const shadow = isLight(theme.text) ? '0 1px 4px rgba(0, 0, 0, 0.9)' : '0 1px 3px rgba(255, 255, 255, 0.7)'
  set('--text-shadow', theme.textShadow ? shadow : 'none')
  // Stat labels carry a halo whatever the body setting says: they sit over
  // translucent glass with the wallpaper right behind them.
  set('--label-shadow', shadow)
}

/** The gap the layout was drawn at, in rem. gapScale multiplies it. */
const DESIGN_GAP_REM = 0.7

const DESIGN_WIDTH = 682

/** Portrait, so width is the tight dimension and everything else is rem. */
export function applyScale(fontScale: number): void {
  const scale = (window.innerWidth / DESIGN_WIDTH) * fontScale
  document.documentElement.style.fontSize = `${16 * scale}px`
}
