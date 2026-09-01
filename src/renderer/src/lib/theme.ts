import type { ThemeConfig } from '@shared/types'

/** Card fills are stored as solid hex plus a separate opacity, so the colour
 *  survives being dialled down to a tint over a wallpaper. */
function hexToRgba(hex: string, alpha: number): string {
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
  if ([r, g, b].some(Number.isNaN)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Writes the theme onto the document as custom properties. Every rule in
 * styles.css reads these, so a change here repaints the whole panel with no
 * re-render and no reload.
 */
export function applyTheme(theme: ThemeConfig, transparent: boolean): void {
  const root = document.documentElement
  const set = (name: string, value: string): void => root.style.setProperty(name, value)

  // Transparent mode lets the Wallpaper Engine wallpaper through the page itself.
  set('--bg', transparent ? 'transparent' : theme.background)
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
  set('--text-shadow', theme.textShadow ? '0 1px 4px rgba(0, 0, 0, 0.9)' : 'none')
}

const DESIGN_WIDTH = 682

/**
 * The panel is mounted portrait, so width is the tight dimension. Everything is
 * sized in rem against a root font size derived from it, which keeps one layout
 * working on the panel and in a scaled dev window.
 */
export function applyScale(fontScale: number): void {
  const scale = (window.innerWidth / DESIGN_WIDTH) * fontScale
  document.documentElement.style.fontSize = `${16 * scale}px`
}
