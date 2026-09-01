import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'

/**
 * Settings live as plain JSON in userData. Credentials do not live here, they go
 * through secrets.ts and are encrypted with the OS keystore.
 */

export const DEFAULT_CONFIG: AppConfig = {
  displayId: null,
  // Y70 Touch Infinite panel, portrait as mounted in the case. Matching accepts
  // either orientation, so this only has to name the two dimensions.
  displayMatch: { width: 682, height: 2560 },
  sources: {
    gmail: { enabled: true },
    proton: { enabled: true },
    bluesky: { enabled: true },
    discord: { enabled: true }
  },
  taskProvider: 'local',
  autostart: false,
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

export function getConfig(): AppConfig {
  if (cache) return cache
  const path = configPath()
  if (existsSync(path)) {
    try {
      cache = merge(DEFAULT_CONFIG, JSON.parse(readFileSync(path, 'utf8')) as Partial<AppConfig>)
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
