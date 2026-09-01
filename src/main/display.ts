import { screen } from 'electron'
import type { AppConfig, DisplayInfo } from '@shared/types'

/**
 * Electron reports display sizes in device-independent pixels, so a panel on a
 * scaled desktop does not report its native resolution. Multiplying back by the
 * scale factor gives us something stable to match against.
 */
function nativeSize(display: Electron.Display): { width: number; height: number } {
  const scale = display.scaleFactor || 1
  return {
    width: Math.round(display.size.width * scale),
    height: Math.round(display.size.height * scale)
  }
}

function matchesTarget(display: Electron.Display, target: { width: number; height: number }): boolean {
  const { width, height } = nativeSize(display)
  const tolerance = 40
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= tolerance
  // Accept either orientation, since Windows may report the panel rotated.
  return (
    (near(width, target.width) && near(height, target.height)) ||
    (near(width, target.height) && near(height, target.width))
  )
}

/** A case panel is unusually wide for its height. Nothing else on a desk looks like this. */
function looksLikeAPanel(display: Electron.Display): boolean {
  const { width, height } = nativeSize(display)
  const aspect = Math.max(width, height) / Math.min(width, height)
  return aspect >= 3
}

/**
 * Resolution order: the display the user pinned, then an exact size match, then
 * anything with panel-like proportions that is not the primary monitor. Falls
 * back to primary so the app always opens somewhere visible.
 */
export function findPanelDisplay(config: AppConfig): { display: Electron.Display; detected: boolean } {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()

  if (config.displayId !== null) {
    const pinned = displays.find((d) => d.id === config.displayId)
    if (pinned) return { display: pinned, detected: true }
  }

  const bySize = displays.find((d) => matchesTarget(d, config.displayMatch))
  if (bySize) return { display: bySize, detected: true }

  const byShape = displays.find((d) => d.id !== primary.id && looksLikeAPanel(d))
  if (byShape) return { display: byShape, detected: true }

  return { display: primary, detected: false }
}

export function listDisplays(activeId: number | null): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay()
  return screen.getAllDisplays().map((d) => {
    const { width, height } = nativeSize(d)
    return {
      id: d.id,
      label: d.label || `Display ${d.id}`,
      width,
      height,
      primary: d.id === primary.id,
      active: d.id === activeId
    }
  })
}
