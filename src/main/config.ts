import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_THEME } from '@shared/themes'

// Settings live as plain JSON in userData. Credentials go through secrets.ts.

export const CONFIG_VERSION = 4

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: CONFIG_VERSION,
  displayId: null,
  // Portrait as mounted. Matching accepts either orientation.
  displayMatch: { width: 682, height: 2560 },
  // Frosted blurs the gaps between cards too, so Clear is the default.
  glassMode: 'clear',
  alwaysOnTop: true,
  alertsLayout: 'list',
  panels: { clock: true, stats: true, agenda: true, todos: true, alerts: true },
  clockHour12: true,
  // The free ones plus what an NVIDIA card gives up without asking. The rest
  // are off so the card stays short on a portrait panel.
  stats: {
    cpuLoad: true,
    cpuTemp: true,
    memory: true,
    gpuTemp: true,
    gpuLoad: true,
    gpuVram: true,
    gpuPower: false,
    gpuFan: false,
    disk: false,
    uptime: false
  },
  // AMD gives the 9800X3D a 95C maximum operating temperature.
  cpuTempLimit: 95,
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
    mail: {
      gmail: { host: 'imap.gmail.com', port: 993, user: '', security: 'tls', enabled: true },
      // Bridge listens on loopback and upgrades rather than starting encrypted.
      proton: { host: '127.0.0.1', port: 1143, user: '', security: 'starttls', enabled: false }
    },
    // Free over IMAP, unlike the Gmail API where it cost a restricted scope.
    mailDetail: 'subjects'
  },
  taskProvider: 'local',
  microsoft: { clientId: '', listId: null },
  bluesky: { handle: '', service: 'https://bsky.social' },
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
/** The pre-v4 single mail account, before mailboxes were named. */
interface LegacyMailAccount {
  host: string
  port: number
  user: string
  enabled: boolean
}

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

  // v3 -> v4 turned the single mail account into one per mailbox. The old shape
  // is recognised by having a host of its own rather than named accounts.
  if (from < 4 && next.feeds) {
    const mail = next.feeds.mail as unknown as LegacyMailAccount | undefined
    if (mail && typeof mail.host === 'string') {
      next.feeds = {
        ...next.feeds,
        mail: {
          gmail: { ...mail, security: 'tls' },
          ...DEFAULT_CONFIG.feeds.mail.proton ? { proton: DEFAULT_CONFIG.feeds.mail.proton } : {}
        }
      } as AppConfig['feeds']
    }
  }

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
