import { useEffect, useState } from 'preact/hooks'
import type {
  AlertsLayout,
  AppConfig,
  DisplayInfo,
  FeedsStatus,
  GlassMode,
  MailDetail,
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
  proton: 'Adapter lands in phase 3',
  bluesky: 'Adapter lands in phase 3',
  discord: 'Needs the toast helper, phase 5'
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
  const [passwordDraft, setPasswordDraft] = useState('')

  useEffect(() => {
    void window.hyte.getConfig().then(setConfig)
    void window.hyte.listDisplays().then(setDisplays)
    void window.hyte.feedsStatus().then(setFeeds)
    // Adding or removing a calendar changes the config in main, not here.
    // Without this the local copy goes stale, the list renders empty, and the
    // next patch writes that empty list back over the real one.
    const stopConfig = window.hyte.onConfigChanged(setConfig)
    const stopFeeds = window.hyte.onFeedsStatusChanged(setFeeds)
    return () => {
      stopConfig()
      stopFeeds()
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

  async function saveMailPassword(): Promise<void> {
    setFeeds(await window.hyte.mailSetPassword(passwordDraft))
    setPasswordDraft('')
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
        <p class="lede">Unread count over IMAP. No OAuth, nothing to verify.</p>

        <details class="steps" open={!feeds?.mailPasswordSet}>
          <summary>Making a Gmail app password</summary>
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

        <div class="row">
          <span>Server</span>
          <input
            type="text"
            class="grow"
            value={feedsConfig.mail.host}
            onInput={(event) =>
              void patch({
                feeds: { ...feedsConfig, mail: { ...feedsConfig.mail, host: event.currentTarget.value } }
              })
            }
          />
          <input
            type="text"
            class="port"
            value={String(feedsConfig.mail.port)}
            onInput={(event) =>
              void patch({
                feeds: {
                  ...feedsConfig,
                  mail: { ...feedsConfig.mail, port: Number(event.currentTarget.value) || 993 }
                }
              })
            }
          />
        </div>
        <div class="field">
          <span>Address</span>
          <input
            type="text"
            value={feedsConfig.mail.user}
            placeholder="you@gmail.com"
            onInput={(event) =>
              void patch({
                feeds: { ...feedsConfig, mail: { ...feedsConfig.mail, user: event.currentTarget.value } }
              })
            }
          />
        </div>
        <div class="field">
          <span>App password</span>
          <input
            type="password"
            value={passwordDraft}
            placeholder={feeds?.mailPasswordSet ? 'Stored. Type only to replace it.' : 'sixteen characters'}
            onInput={(event) => setPasswordDraft(event.currentTarget.value)}
          />
        </div>
        <div class="row">
          <button class="action" disabled={!passwordDraft.trim()} onClick={() => void saveMailPassword()}>
            Save password
          </button>
          <span class="spacer" />
          <span class="value">{feeds?.mailPasswordSet ? 'On file' : 'Not set'}</span>
        </div>

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

        {feeds?.mailError && <p class="notice error">{feeds.mailError}</p>}
        {feeds?.mailPasswordSet && !feeds.mailError && (
          <p class="notice ok">Signed in. The unread count is live.</p>
        )}
        {feeds?.lastError && <p class="notice error">{feeds.lastError}</p>}
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
            <option value="google">Google Tasks</option>
            <option value="microsoft">Microsoft To Do</option>
          </select>
        </div>
        <p class="hint">
          Google Tasks rides the Calendar sign-in. Microsoft To Do needs its own app registration. Both
          land in phase 4.
        </p>
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
