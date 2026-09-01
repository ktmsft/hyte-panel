import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_THEME } from '@shared/themes'

/**
 * Settings live as plain JSON in userData. Credentials do not live here, they go
 * through secrets.ts and are encrypted with the OS keystore.
 */

export const CONFIG_VERSION = 1

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: CONFIG_VERSION,
  displayId: null,
  // Y70 Touch Infinite panel, portrait as mounted in the case. Matching accepts
  // either orientation, so this only has to name the two dimensions.
  displayMatch: { width: 682, height: 2560 },
  // Frosted by default: the panel is far more interesting sitting over a live
  // wallpaper than over its own flat background.
  glassMode: 'frosted',
  alwaysOnTop: true,
  alertsLayout: 'list',
  theme: DEFAULT_THEME,
  sources: {
    gmail: { enabled: true },
    proton: { enabled: true },
    bluesky: { enabled: true },
    discord: { enabled: true }
  },
  taskProvider: 'local',
  // The panel should come back on its own after a reboot. That is the whole
  // point of something mounted in the case.
  autostart: true,
  dim: { enabled: false, startHour: 23, endHour: 7, level: 0.35 }
}

let cache: AppConfig | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

/** Shallow-merges one level deep, which covers every nested object in AppConfig. */
function merge(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = out[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      out[key] = { ...(current as object), ...(value as object) }
    } else {
      out[key] = value
    }
  }
  return out as unknown as AppConfig
}

/** Shape of the pre-versioning config, kept only so v0 files can be read. */
interface LegacyConfig extends Partial<AppConfig> {
  transparent?: boolean
}

/**
 * v0 had a `transparent` boolean and defaulted to a solid Midnight theme. The
 * glass modes replace the boolean, and anyone still on the untouched default
 * theme is moved to Frosted, since that is what the new default looks like.
 * A theme the user actually customised is left exactly as they left it.
 */
function migrate(saved: LegacyConfig): Partial<AppConfig> {
  if ((saved.configVersion ?? 0) >= CONFIG_VERSION) return saved

  const next: Partial<AppConfig> = { ...saved, configVersion: CONFIG_VERSION }
  next.glassMode = saved.glassMode ?? (saved.transparent === false ? 'solid' : 'frosted')
  if (saved.theme && saved.theme.preset === 'midnight' && saved.theme.cardOpacity === 1) {
    next.theme = DEFAULT_THEME
  }
  delete (next as LegacyConfig).transparent
  return next
}

export function getConfig(): AppConfig {
  if (cache) return cache
  const path = configPath()
  if (existsSync(path)) {
    try {
      const saved = JSON.parse(readFileSync(path, 'utf8')) as LegacyConfig
      cache = merge(DEFAULT_CONFIG, migrate(saved))
      return cache
    } catch (err) {
      // A corrupt config should not stop the panel from opening.
      console.error('[config] unreadable, falling back to defaults:', err)
    }
  }
  cache = { ...DEFAULT_CONFIG }
  return cache
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = merge(getConfig(), patch)
  cache = next
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(next, null, 2), 'utf8')
  return next
}
