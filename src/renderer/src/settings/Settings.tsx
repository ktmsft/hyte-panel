import { useEffect, useState } from 'preact/hooks'
import type {
  AlertsLayout,
  AppConfig,
  DisplayInfo,
  FeedsStatus,
  GlassMode,
  MailAccount,
  MailAccountId,
  MailDetail,
  MicrosoftStatus,
  PanelId,
  StatId,
  SourceId,
  TaskProviderId,
  ThemeConfig
} from '@shared/types'
import { FONT_STACKS, presetById, THEME_PRESETS } from '@shared/themes'
import { isLight } from '@/lib/theme'

const SOURCE_LABELS: Record<SourceId, string> = {
  gmail: 'Gmail',
  proton: 'Proton Mail',
  bluesky: 'Bluesky',
  discord: 'Discord'
}

/** Adapters that do not exist yet. */
const NOT_YET_WIRED: Partial<Record<SourceId, string>> = {
  discord: 'Counts Windows notifications waiting, not Discord’s own badge'
}

const COLOR_FIELDS = [
  ['cardBackground', 'Glass tint'],
  ['text', 'Text'],
  ['muted', 'Secondary text'],
  ['faint', 'Labels'],
  ['accent', 'Accent'],
  ['cardBorder', 'Glass edge'],
  ['background', 'Page background'],
  ['ok', 'Healthy'],
  ['warn', 'Stale'],
  ['err', 'Error']
] as const

type ColorKey = (typeof COLOR_FIELDS)[number][0]

const GLASS_MODES = [
  ['frosted', 'Frosted'],
  ['clear', 'Clear'],
  ['solid', 'Solid']
] as const satisfies readonly (readonly [GlassMode, string])[]

const GLASS_NOTES: Record<GlassMode, string> = {
  frosted: 'Windows acrylic blurs the wallpaper, but frosts the gaps between cards too.',
  clear: 'Wallpaper stays sharp under translucent cards. Raise card opacity if text is fighting it.',
  solid: 'Paints its own background and ignores the wallpaper.'
}

export function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [feeds, setFeeds] = useState<FeedsStatus | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  /** Replacement URLs, per calendar id. Empty means keep the stored one. */
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})
  const [microsoft, setMicrosoft] = useState<MicrosoftStatus | null>(null)
  /** null means untouched, so the saved client ID shows through. */
  const [clientIdDraft, setClientIdDraft] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    void window.hyte.getConfig().then(setConfig)
    void window.hyte.listDisplays().then(setDisplays)
    void window.hyte.feedsStatus().then(setFeeds)
    // Adding or removing a calendar changes the config in main, not here.
    // Without this the local copy goes stale, the list renders empty, and the
    // next patch writes that empty list back over the real one.
    void window.hyte.microsoftStatus().then(setMicrosoft)
    const stopConfig = window.hyte.onConfigChanged(setConfig)
    const stopFeeds = window.hyte.onFeedsStatusChanged(setFeeds)
    const stopMicrosoft = window.hyte.onMicrosoftStatusChanged(setMicrosoft)
    return () => {
      stopConfig()
      stopFeeds()
      stopMicrosoft()
    }
  }, [])

  async function patch(update: Partial<AppConfig>): Promise<void> {
    setConfig(await window.hyte.setConfig(update))
  }

  if (!config) return null

  const { theme, feeds: feedsConfig } = config

  /** Any hand edit means this is no longer a preset. */
  async function patchTheme(update: Partial<ThemeConfig>): Promise<void> {
    await patch({ theme: { ...theme, ...update, preset: 'custom' } })
  }

  async function patchColor(key: ColorKey, value: string): Promise<void> {
    const next: ThemeConfig = { ...theme, preset: 'custom' }
    next[key] = value

    // Crossing the light/dark line drags the ink with it, or off-white glass
    // would keep near-white text and be unreadable.
    if (key === 'cardBackground' && isLight(value) !== isLight(theme.cardBackground)) {
      const ink = presetById(isLight(value) ? 'frost-white' : 'glass')
      if (ink) {
        const { text, muted, faint, accent, cardBorder, ok, warn, err, textShadow } = ink.theme
        Object.assign(next, { text, muted, faint, accent, cardBorder, ok, warn, err, textShadow })
      }
    }

    await patch({ theme: next })
  }

  async function addCalendar(): Promise<void> {
    if (!newUrl.trim()) return
    setFeeds(await window.hyte.calendarAdd(newLabel, newUrl))
    setNewLabel('')
    setNewUrl('')
  }

  /** An empty box keeps the stored URL, so a label can be fixed on its own. */
  async function saveCalendarUrl(id: string): Promise<void> {
    setFeeds(await window.hyte.calendarSetUrl(id, urlDrafts[id] ?? ''))
    setUrlDrafts({ ...urlDrafts, [id]: '' })
  }

  async function removeCalendar(id: string): Promise<void> {
    setFeeds(await window.hyte.calendarRemove(id))
  }

  async function connectMicrosoft(): Promise<void> {
    setConnecting(true)
    try {
      setMicrosoft(await window.hyte.microsoftConnect())
    } finally {
      setConnecting(false)
    }
  }

  function draft(key: string): string {
    return passwordDrafts[key] ?? ''
  }

  function setDraft(key: string, value: string): void {
    setPasswordDrafts({ ...passwordDrafts, [key]: value })
  }

  async function saveMailPassword(id: MailAccountId): Promise<void> {
    setFeeds(await window.hyte.mailSetPassword(id, draft(id)))
    setDraft(id, '')
  }

  async function saveBlueskyPassword(): Promise<void> {
    setFeeds(await window.hyte.blueskySetPassword(draft('bluesky')))
    setDraft('bluesky', '')
  }

  function patchMail(id: MailAccountId, update: Partial<MailAccount>): void {
    void patch({
      feeds: { ...feedsConfig, mail: { ...feedsConfig.mail, [id]: { ...feedsConfig.mail[id], ...update } } }
    })
  }

  function patchCalendar(id: string, update: Partial<(typeof feedsConfig)['calendars'][number]>): void {
    void patch({
      feeds: {
        ...feedsConfig,
        calendars: feedsConfig.calendars.map((feed) => (feed.id === id ? { ...feed, ...update } : feed))
      }
    })
  }

  return (
    <div class="settings">
      <h1>Hyte Panel</h1>
      <p class="lede">On your desktop, not the panel, so you have a keyboard.</p>

      <section>
        <h2>Display</h2>
        {displays.map((display) => (
          <button
            key={display.id}
            class={`display-option${display.active ? ' active' : ''}`}
            onClick={async () => setDisplays(await window.hyte.setDisplay(display.id))}
          >
            <span>{display.label}</span>
            <span class="meta">
              {display.width} x {display.height}
            </span>
            <span class="spacer" />
            {display.primary && <span class="badge">Primary</span>}
            {display.active && <span class="badge on">Panel</span>}
          </button>
        ))}
        <p class="hint">
          Auto-detection looks for {config.displayMatch.width} x {config.displayMatch.height} in either
          orientation, then any non-primary display three times longer than it is wide.
        </p>
      </section>

      <section>
        <h2>Calendars</h2>
        <p class="lede">Each one is an iCalendar feed, read straight over HTTPS. No sign-in.</p>

        {feeds && !feeds.encryptionAvailable && (
          <p class="notice error">
            Windows credential encryption is unavailable, so secret addresses cannot be stored.
          </p>
        )}

        <details class="steps" open={feedsConfig.calendars.length === 0}>
          <summary>Finding the secret address</summary>
          <ol>
            <li>Open Google Calendar in a browser.</li>
            <li>
              Hover the calendar in the left sidebar, then its three-dot menu,{' '}
              <strong>Settings and sharing</strong>.
            </li>
            <li>
              Scroll to <strong>Secret address in iCal format</strong> and copy it. It ends in{' '}
              <code>/basic.ics</code>.
            </li>
          </ol>
          <p class="hint">
            That address is a password in URL form: anyone holding it can read the calendar. It is kept
            encrypted and never shown again once saved. Reset it from the same page if it leaks.
          </p>
        </details>

        {feedsConfig.calendars.map((feed) => (
          <div class="feed" key={feed.id}>
            <div class="row">
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={feed.enabled}
                  onChange={(event) => patchCalendar(feed.id, { enabled: event.currentTarget.checked })}
                />
              </label>
              <input
                type="text"
                class="grow"
                value={feed.label}
                onInput={(event) => patchCalendar(feed.id, { label: event.currentTarget.value })}
              />
              <input
                type="color"
                value={feed.color}
                onChange={(event) => patchCalendar(feed.id, { color: event.currentTarget.value })}
              />
              <button class="action" onClick={() => void removeCalendar(feed.id)}>
                Remove
              </button>
            </div>
            {(() => {
              const health = feeds?.calendars.find((c) => c.id === feed.id)
              if (!health?.hasUrl) return <p class="notice warn">No address saved yet.</p>
              if (health.error) return <p class="notice error">{health.error}</p>
              if (!health.checkedAt) return <p class="notice">Not refreshed yet.</p>
              return (
                <p class="notice ok">
                  {health.events === 0
                    ? `Loaded, but nothing in the next ${feedsConfig.calendarDays} days.`
                    : `Loaded ${health.events} event${health.events === 1 ? '' : 's'}.`}
                </p>
              )
            })()}
            <div class="row">
              <input
                type="password"
                class="grow"
                placeholder="Stored. Paste a new address only to replace it."
                value={urlDrafts[feed.id] ?? ''}
                onInput={(event) => setUrlDrafts({ ...urlDrafts, [feed.id]: event.currentTarget.value })}
              />
              <button
                class="action"
                disabled={!(urlDrafts[feed.id] ?? '').trim()}
                onClick={() => void saveCalendarUrl(feed.id)}
              >
                Replace
              </button>
            </div>
          </div>
        ))}

        <div class="feed">
          <div class="row">
            <input
              type="text"
              value={newLabel}
              placeholder="Name, for example Work"
              onInput={(event) => setNewLabel(event.currentTarget.value)}
            />
            <input
              type="password"
              class="grow"
              value={newUrl}
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              onInput={(event) => setNewUrl(event.currentTarget.value)}
            />
            <button class="action primary" disabled={!newUrl.trim()} onClick={() => void addCalendar()}>
              Add
            </button>
          </div>
        </div>

        <div class="row">
          <span>Agenda looks ahead</span>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={feedsConfig.calendarDays}
            onInput={(event) =>
              void patch({ feeds: { ...feedsConfig, calendarDays: Number(event.currentTarget.value) } })
            }
          />
          <span class="value">{feedsConfig.calendarDays}d</span>
        </div>
        <p class="hint">
          Refreshed every 5 minutes. Google regenerates these feeds on its own schedule, so an event
          added seconds ago can take a while to appear.
        </p>
      </section>

      <section>
        <h2>Mail</h2>
        <p class="lede">Unread counts over IMAP. No OAuth, nothing to verify.</p>

        <details class="steps" open={!feeds?.mail.gmail.passwordSet}>
          <summary>Gmail: making an app password</summary>
          <ol>
            <li>
              Switch on 2-Step Verification at <code>myaccount.google.com/security</code>. App passwords do
              not exist without it.
            </li>
            <li>
              Go to <code>myaccount.google.com/apppasswords</code>, name it Hyte Panel, and create it.
            </li>
            <li>Paste the 16 characters below. Spaces do not matter.</li>
          </ol>
        </details>

        <details class="steps" open={!feeds?.mail.proton.passwordSet}>
          <summary>Proton: pointing at Bridge</summary>
          <ol>
            <li>
              Proton Bridge has to be installed and running. It needs a paid Proton plan, and it is what
              turns the account into something IMAP can read.
            </li>
            <li>
              Open Bridge, select the account, and copy the IMAP settings it shows. The password there is
              Bridge's own, generated for it, not your Proton password.
            </li>
            <li>
              Bridge listens on <code>127.0.0.1:1143</code> and starts unencrypted, upgrading with STARTTLS.
              Its certificate is one it signed itself, which is accepted here only because the connection
              never leaves the machine.
            </li>
          </ol>
        </details>

        {(
          [
            ['gmail', 'Gmail'],
            ['proton', 'Proton']
          ] as [MailAccountId, string][]
        ).map(([id, label]) => {
          const account = feedsConfig.mail[id]
          const health = feeds?.mail[id]
          return (
            <div class="feed" key={id}>
              <div class="row">
                <label class="toggle">
                  <input
                    type="checkbox"
                    checked={account.enabled}
                    onChange={(event) => patchMail(id, { enabled: event.currentTarget.checked })}
                  />
                  {label}
                </label>
                <span class="spacer" />
                <span class="value">{health?.passwordSet ? 'On file' : 'Not set'}</span>
              </div>

              <div class="row">
                <input
                  type="text"
                  class="grow"
                  value={account.host}
                  onInput={(event) => patchMail(id, { host: event.currentTarget.value })}
                />
                <input
                  type="text"
                  class="port"
                  value={String(account.port)}
                  onInput={(event) =>
                    patchMail(id, { port: Number(event.currentTarget.value) || account.port })
                  }
                />
                <div class="segmented">
                  {(
                    [
                      ['tls', 'TLS'],
                      ['starttls', 'STARTTLS']
                    ] as [MailAccount['security'], string][]
                  ).map(([security, text]) => (
                    <button
                      key={security}
                      class={account.security === security ? 'active' : ''}
                      onClick={() => patchMail(id, { security })}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              <div class="row">
                <input
                  type="text"
                  class="grow"
                  value={account.user}
                  placeholder={id === 'gmail' ? 'you@gmail.com' : 'you@proton.me'}
                  onInput={(event) => patchMail(id, { user: event.currentTarget.value })}
                />
                <input
                  type="password"
                  class="grow"
                  value={draft(id)}
                  placeholder={health?.passwordSet ? 'Stored. Type only to replace it.' : 'password'}
                  onInput={(event) => setDraft(id, event.currentTarget.value)}
                />
                <button
                  class="action"
                  disabled={!draft(id).trim()}
                  onClick={() => void saveMailPassword(id)}
                >
                  Save
                </button>
              </div>

              {health?.error && <p class="notice error">{health.error}</p>}
              {health?.passwordSet && !health.error && account.enabled && (
                <p class="notice ok">Signed in. The unread count is live.</p>
              )}
            </div>
          )
        })}

        <div class="row">
          <span>Alerts show</span>
          <div class="segmented">
            {(
              [
                ['count', 'Unread count'],
                ['subjects', 'Count and subjects']
              ] as [MailDetail, string][]
            ).map(([detail, label]) => (
              <button
                key={detail}
                class={feedsConfig.mailDetail === detail ? 'active' : ''}
                onClick={() => void patch({ feeds: { ...feedsConfig, mailDetail: detail } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p class="hint">
          Read-only: messages are fetched with EXAMINE and BODY.PEEK, so nothing is marked as read.
          Refreshed every 2 minutes.
        </p>

        {feeds?.lastError && <p class="notice error">{feeds.lastError}</p>}
      </section>

      <section>
        <h2>Bluesky</h2>
        <p class="lede">Unread notifications. An app password is all it takes.</p>

        <details class="steps" open={!feeds?.bluesky.passwordSet}>
          <summary>Making an app password</summary>
          <ol>
            <li>
              In Bluesky: Settings, Privacy and security, App passwords, Add app password.
            </li>
            <li>
              Paste it below with your handle. An app password cannot change your real password or delete
              the account, which is the point of using one.
            </li>
          </ol>
        </details>

        <div class="row">
          <input
            type="text"
            class="grow"
            value={config.bluesky.handle}
            placeholder="you.bsky.social"
            onInput={(event) =>
              void patch({ bluesky: { ...config.bluesky, handle: event.currentTarget.value } })
            }
          />
          <input
            type="password"
            class="grow"
            value={draft('bluesky')}
            placeholder={feeds?.bluesky.passwordSet ? 'Stored. Type only to replace it.' : 'app password'}
            onInput={(event) => setDraft('bluesky', event.currentTarget.value)}
          />
          <button
            class="action"
            disabled={!draft('bluesky').trim()}
            onClick={() => void saveBlueskyPassword()}
          >
            Save
          </button>
        </div>

        {feeds?.bluesky.error && <p class="notice error">{feeds.bluesky.error}</p>}
        {feeds?.bluesky.passwordSet && !feeds.bluesky.error && config.bluesky.handle.trim() && (
          <p class="notice ok">Signed in. Notifications are live.</p>
        )}
        <p class="hint">
          Refreshed every 2 minutes. The service is <code>{config.bluesky.service}</code>, which only needs
          changing for a self-hosted account.
        </p>
      </section>

      <section>
        <h2>Panels</h2>
        <p class="lede">Cards stack in this order. Hiding one closes the gap it left.</p>
        {(
          [
            ['clock', 'Clock'],
            ['stats', 'System stats'],
            ['agenda', 'Agenda'],
            ['todos', 'To-dos'],
            ['alerts', 'Alerts']
          ] as [PanelId, string][]
        ).map(([id, label]) => (
          <div class="row" key={id}>
            <label class="toggle">
              <input
                type="checkbox"
                checked={config.panels[id]}
                onChange={(event) =>
                  void patch({ panels: { ...config.panels, [id]: event.currentTarget.checked } })
                }
              />
              {label}
            </label>
          </div>
        ))}
        <div class="row">
          <span>Time</span>
          <div class="segmented">
            {(
              [
                [true, '12 hour'],
                [false, '24 hour']
              ] as [boolean, string][]
            ).map(([hour12, label]) => (
              <button
                key={label}
                class={config.clockHour12 === hour12 ? 'active' : ''}
                onClick={() => void patch({ clockHour12: hour12 })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p class="hint">
          Applies to the clock and to event times on the Agenda together, so the two cannot disagree.
        </p>

        <p class="hint">
          Whichever of To-dos, Agenda or Alerts is showing takes the leftover height, so the stack always
          fills the screen. With the clock hidden the gear goes with it, so a settings button appears in
          the panel's top corner instead.
        </p>
      </section>

      <section>
        <h2>System stats</h2>
        <p class="lede">Shown on the System card. Anything switched off is never even read.</p>
        {(
          [
            ['cpuTemp', 'CPU temperature', 'Needs LibreHardwareMonitor, elevated, web server on.'],
            ['cpuLoad', 'CPU load', 'Free, straight from the OS.'],
            ['gpuTemp', 'GPU temperature', 'NVIDIA only, through nvidia-smi.'],
            ['gpuLoad', 'GPU load', 'NVIDIA only.'],
            ['memory', 'Memory', 'Free, straight from the OS.'],
            ['gpuVram', 'VRAM used', 'NVIDIA only.'],
            ['gpuPower', 'GPU power draw', 'NVIDIA only.'],
            ['gpuFan', 'GPU fan speed', 'NVIDIA only.'],
            ['disk', 'Disk used', 'The Windows drive.'],
            ['uptime', 'Uptime', 'Free, straight from the OS.']
          ] as [StatId, string, string][]
        ).map(([id, label, note]) => (
          <div class="row" key={id}>
            <label class="toggle">
              <input
                type="checkbox"
                checked={config.stats[id]}
                onChange={(event) =>
                  void patch({ stats: { ...config.stats, [id]: event.currentTarget.checked } })
                }
              />
              {label}
            </label>
            <span class="spacer" />
            <span class="todo-note">{note}</span>
          </div>
        ))}
        <div class="row">
          <span>CPU temperature limit</span>
          <input
            type="range"
            min="70"
            max="110"
            step="1"
            value={config.cpuTempLimit}
            onInput={(event) => void patch({ cpuTempLimit: Number(event.currentTarget.value) })}
          />
          <span class="value">{config.cpuTempLimit}°C</span>
        </div>
        <p class="hint">
          A bar turns amber within 10°C of the limit and red within 3°C, so the colour means act rather
          than simply "high". 95°C suits Ryzen 9000; Intel is often 100, and older X3D parts 89. Check
          your own chip's maximum operating temperature. The GPU needs no setting: its driver reports how
          much headroom it has left, and the card uses that.
        </p>
        <p class="hint">
          Memory, VRAM and disk go amber at 85% full and red at 95%, because running out is a real
          problem. Load and fan speed are never coloured: a GPU at 100% is the machine doing its job.
        </p>
        <p class="hint">
          The card is two columns filled in the order above, so heat and capacity land on the left and how
          hard something is working lands on the right. Switching one off closes the gap rather than
          leaving a hole.
        </p>
        <p class="hint">
          Refreshed every 5 seconds. GPU figures come from <code>nvidia-smi</code>, which installs with the
          driver and needs no permissions. There is no supported way to read a modern CPU's temperature on
          Windows. That one needs LibreHardwareMonitor running as administrator with its web server
          switched on, under Options, Remote Web Server. The panel reads it over HTTP on every
          refresh, so starting or closing it shows up within five seconds.
        </p>
      </section>

      <section>
        <h2>Wallpaper Engine</h2>
        <div class="row">
          <span>Glass</span>
          <div class="segmented">
            {GLASS_MODES.map(([mode, label]) => (
              <button
                key={mode}
                class={config.glassMode === mode ? 'active' : ''}
                onClick={() => void patch({ glassMode: mode })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p class="hint">{GLASS_NOTES[config.glassMode]}</p>
        <div class="row">
          <label class="toggle">
            <input
              type="checkbox"
              checked={config.alwaysOnTop}
              onChange={(event) => void patch({ alwaysOnTop: event.currentTarget.checked })}
            />
            Keep the panel above other windows
          </label>
        </div>
        <p class="hint">
          Never a true fullscreen window: Wallpaper Engine pauses under one. Changing glass mode
          rebuilds the window, so the panel blinks.
        </p>
      </section>

      <section>
        <h2>Theme</h2>
        <div class="preset-row">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              class={`preset${theme.preset === preset.id ? ' active' : ''}`}
              title={preset.note}
              onClick={() => void patch({ theme: { ...preset.theme, preset: preset.id } })}
            >
              <span class="swatches">
                <span class="swatch" style={{ background: preset.theme.cardBackground }} />
                <span class="swatch" style={{ background: preset.theme.text }} />
                <span class="swatch" style={{ background: preset.theme.accent }} />
              </span>
              {preset.label}
            </button>
          ))}
        </div>

        <p class="hint">
          <strong>Glass tint</strong> is the colour of the panes. Moving it across the light/dark line
          takes the text with it, so off-white glass gets dark text.
        </p>

        <div class="color-grid">
          {COLOR_FIELDS.map(([key, label]) => (
            <label class="color-field" key={key}>
              <input
                type="color"
                value={theme[key]}
                onChange={(event) => void patchColor(key, event.currentTarget.value)}
              />
              {label}
            </label>
          ))}
        </div>

        <div class="row">
          <span>Font</span>
          <select
            value={theme.fontFamily}
            onChange={(event) => void patchTheme({ fontFamily: event.currentTarget.value })}
          >
            {FONT_STACKS.map((font) => (
              <option key={font.id} value={font.stack}>
                {font.label}
              </option>
            ))}
          </select>
        </div>

        <div class="row">
          <span>Text size</span>
          <input
            type="range"
            min="0.75"
            max="1.4"
            step="0.05"
            value={theme.fontScale}
            onInput={(event) => void patchTheme({ fontScale: Number(event.currentTarget.value) })}
          />
          <span class="value">{Math.round(theme.fontScale * 100)}%</span>
        </div>

        <div class="row">
          <span>Card opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={theme.cardOpacity}
            onInput={(event) => void patchTheme({ cardOpacity: Number(event.currentTarget.value) })}
          />
          <span class="value">{Math.round(theme.cardOpacity * 100)}%</span>
        </div>

        <div class="row">
          <span>Space between cards</span>
          <input
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={theme.gapScale}
            onInput={(event) => void patchTheme({ gapScale: Number(event.currentTarget.value) })}
          />
          <span class="value">{Math.round(theme.gapScale * 100)}%</span>
        </div>
        <p class="hint">
          Sets the gutters and the panel's own inset together, so the wallpaper shows through evenly. At
          0% the cards meet and run to the edges of the screen.
        </p>

        <div class="row">
          <label class="toggle">
            <input
              type="checkbox"
              checked={theme.textShadow}
              onChange={(event) => void patchTheme({ textShadow: event.currentTarget.checked })}
            />
            Shadow behind text
          </label>
        </div>
      </section>

      <section>
        <h2>Alerts</h2>
        <div class="row">
          <span>Layout</span>
          <div class="segmented">
            {(['list', 'grid'] as AlertsLayout[]).map((layout) => (
              <button
                key={layout}
                class={config.alertsLayout === layout ? 'active' : ''}
                onClick={() => void patch({ alertsLayout: layout })}
              >
                {layout === 'list' ? 'Rows with text' : 'Icon tiles, 3 across'}
              </button>
            ))}
          </div>
        </div>
        {(Object.keys(SOURCE_LABELS) as SourceId[]).map((id) => (
          <div class="row" key={id}>
            <label class="toggle">
              <input
                type="checkbox"
                checked={config.sources[id].enabled}
                onChange={(event) =>
                  void patch({
                    sources: { ...config.sources, [id]: { enabled: event.currentTarget.checked } }
                  })
                }
              />
              {SOURCE_LABELS[id]}
            </label>
            <span class="spacer" />
            {NOT_YET_WIRED[id] && <span class="todo-note">{NOT_YET_WIRED[id]}</span>}
          </div>
        ))}
      </section>

      <section>
        <h2>Tasks</h2>
        <div class="row">
          <span>Store tasks in</span>
          <select
            value={config.taskProvider}
            onChange={(event) => void patch({ taskProvider: event.currentTarget.value as TaskProviderId })}
          >
            <option value="local">On this PC</option>
            <option value="microsoft">Microsoft To Do</option>
            <option value="google">Google Tasks (not built)</option>
          </select>
          <span class="spacer" />
          {config.taskProvider === 'microsoft' && microsoft?.connected && (
            <span class="badge on">Connected</span>
          )}
        </div>

        {config.taskProvider === 'google' && (
          <p class="notice warn">
            Google Tasks is not wired up. It would need the OAuth path that Calendar and mail were moved
            off, and the same weekly expiry with it.
          </p>
        )}

        {config.taskProvider === 'microsoft' && (
          <>
            {microsoft && !microsoft.encryptionAvailable && (
              <p class="notice error">
                Windows credential encryption is unavailable, so a token cannot be stored safely.
              </p>
            )}

            <details class="steps" open={!microsoft?.hasClientId}>
              <summary>Registering the app, once</summary>
              <ol>
                <li>
                  At <code>portal.azure.com</code>, open <strong>Microsoft Entra ID</strong>,{' '}
                  <strong>App registrations</strong>, <strong>New registration</strong>.
                </li>
                <li>
                  Supported account types: <strong>Personal Microsoft accounts only</strong>.
                </li>
                <li>
                  Redirect URI: platform <strong>Mobile and desktop applications</strong>, value{' '}
                  <code>http://localhost</code>. Any port on it is accepted, which is what this uses.
                </li>
                <li>
                  Register, then copy the <strong>Application (client) ID</strong> from the overview page.
                </li>
              </ol>
              <p class="hint">
                No client secret and no permissions to configure: this signs in as a public client with
                PKCE, and asks for Tasks.ReadWrite at sign-in for you to approve. Nothing needs review, and
                the sign-in does not expire while the panel keeps running.
              </p>
            </details>

            <div class="field">
              <span>Application (client) ID</span>
              <input
                type="text"
                value={clientIdDraft ?? config.microsoft.clientId}
                placeholder="00000000-0000-0000-0000-000000000000"
                onInput={(event) => setClientIdDraft(event.currentTarget.value)}
              />
            </div>
            <div class="row">
              <button
                class="action"
                disabled={!(clientIdDraft ?? config.microsoft.clientId).trim()}
                onClick={() => {
                  void patch({
                    microsoft: {
                      ...config.microsoft,
                      clientId: (clientIdDraft ?? config.microsoft.clientId).trim()
                    }
                  })
                  setClientIdDraft(null)
                }}
              >
                Save client ID
              </button>
              <span class="spacer" />
              <span class="value">{microsoft?.hasClientId ? 'On file' : 'Not set'}</span>
            </div>

            {microsoft?.connected ? (
              <div class="account">
                <span class="badge on">Signed in</span>
                <span class="who">{microsoft.account ?? 'Microsoft account'}</span>
                <span class="spacer" />
                <button class="action" onClick={() => void window.hyte.microsoftDisconnect().then(setMicrosoft)}>
                  Disconnect
                </button>
              </div>
            ) : (
              <div class="account">
                <button
                  class="action primary"
                  disabled={!microsoft?.hasClientId || !microsoft.encryptionAvailable || connecting}
                  onClick={() => void connectMicrosoft()}
                >
                  {connecting ? 'Waiting for your browser...' : 'Connect Microsoft account'}
                </button>
              </div>
            )}

            {microsoft?.connected && (
              <div class="row">
                <span>List</span>
                <select
                  value={config.microsoft.listId ?? ''}
                  onChange={(event) =>
                    void patch({
                      microsoft: { ...config.microsoft, listId: event.currentTarget.value || null }
                    })
                  }
                >
                  <option value="">Default list</option>
                  {microsoft.lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
                <button class="action" onClick={() => void window.hyte.microsoftLists().then(setMicrosoft)}>
                  Refresh
                </button>
              </div>
            )}

            {microsoft?.lastError && <p class="notice error">{microsoft.lastError}</p>}

            <p class="hint">
              Completed tasks are hidden, matching To Do's own view. Ticking one on the panel applies
              straight away and is sent afterwards, so a touch never waits on the network. Refreshed every
              2 minutes.
            </p>
          </>
        )}
      </section>

      <section>
        <h2>Behaviour</h2>
        <div class="row">
          <label class="toggle">
            <input
              type="checkbox"
              checked={config.autostart}
              onChange={(event) => void patch({ autostart: event.currentTarget.checked })}
            />
            Start with Windows
          </label>
        </div>
        <div class="row">
          <label class="toggle">
            <input
              type="checkbox"
              checked={config.hideTaskbar}
              onChange={(event) => void patch({ hideTaskbar: event.currentTarget.checked })}
            />
            Hide the Windows taskbar on the panel
          </label>
        </div>
        <p class="hint">
          Only on the panel: your other monitors keep theirs. Windows has no per-monitor switch for this,
          so the taskbar window is hidden directly, which the shell undoes whenever it rebuilds its
          taskbars. It is re-applied on display changes and every 5 minutes, and put back when Hyte Panel
          quits.
        </p>

        <div class="row">
          <label class="toggle">
            <input
              type="checkbox"
              checked={config.dim.enabled}
              onChange={(event) => void patch({ dim: { ...config.dim, enabled: event.currentTarget.checked } })}
            />
            Dim overnight
          </label>
          <span class="spacer" />
          <span class="value">
            {String(config.dim.startHour).padStart(2, '0')}:00 to{' '}
            {String(config.dim.endHour).padStart(2, '0')}:00
          </span>
        </div>
        <p class="hint">Nexus Link wants this display too. Turn its screen feature off if they fight.</p>
      </section>

      <section>
        <div class="row">
          <button class="badge" onClick={() => void window.hyte.closeSettings()}>
            Close
          </button>
          <span class="spacer" />
          <button class="badge" onClick={() => void window.hyte.quit()}>
            Quit Hyte Panel
          </button>
        </div>
      </section>
    </div>
  )
}
