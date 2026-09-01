import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_THEME } from '@shared/themes'

// Settings live as plain JSON in userData. Credentials go through secrets.ts.

export const CONFIG_VERSION = 1

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: CONFIG_VERSION,
  displayId: null,
  // Portrait as mounted. Matching accepts either orientation.
  displayMatch: { width: 682, height: 2560 },
  // Frosted blurs the gaps between cards too, so Clear is the default.
  glassMode: 'clear',
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
  // Something mounted in the case should come back on its own.
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

/** v0 had a `transparent` boolean and a solid default theme. */
function migrate(saved: LegacyConfig): Partial<AppConfig> {
  if ((saved.configVersion ?? 0) >= CONFIG_VERSION) return saved

  const next: Partial<AppConfig> = { ...saved, configVersion: CONFIG_VERSION }
  // v0's transparent:true is what Clear does now.
  if (saved.glassMode === undefined && saved.transparent !== undefined) {
    next.glassMode = saved.transparent ? 'clear' : 'solid'
  }
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
