import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_THEME } from '@shared/themes'

// Settings live as plain JSON in userData. Credentials go through secrets.ts.

export const CONFIG_VERSION = 3

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
  feeds: {
    // Added by the user; each one pairs with a secret URL in the vault.
    calendars: [],
    calendarDays: 7,
    mail: { host: 'imap.gmail.com', port: 993, user: '', enabled: true },
    // Free over IMAP, unlike the Gmail API where it cost a restricted scope.
    mailDetail: 'subjects'
  },
  taskProvider: 'local',
  // Something mounted in the case should come back on its own.
  autostart: true,
  // Off by default: a fresh install should not quietly rearrange the desktop.
  hideTaskbar: false,
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
  /** v2's Google OAuth block, removed when calendars moved to iCal feeds. */
  google?: unknown
}

/** Steps a saved file up one version at a time. v2 added the `google` block. */
function migrate(saved: LegacyConfig): Partial<AppConfig> {
  const from = saved.configVersion ?? 0
  if (from >= CONFIG_VERSION) return saved

  const next: Partial<AppConfig> = { ...saved, configVersion: CONFIG_VERSION }

  // v0 had a `transparent` boolean and a solid default theme. These rules must
  // stay gated on the version, or a v1 file would have its theme reset too.
  if (from < 1) {
    // v0's transparent:true is what Clear does now.
    if (saved.glassMode === undefined && saved.transparent !== undefined) {
      next.glassMode = saved.transparent ? 'clear' : 'solid'
    }
    if (saved.theme && saved.theme.preset === 'midnight' && saved.theme.cardOpacity === 1) {
      next.theme = DEFAULT_THEME
    }
    delete (next as LegacyConfig).transparent
  }

  // v2 -> v3 replaced the Google OAuth block with `feeds`, which the merge
  // against DEFAULT_CONFIG supplies. Drop the dead key so it stops being saved.
  if (from < 3) delete (next as LegacyConfig).google

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
