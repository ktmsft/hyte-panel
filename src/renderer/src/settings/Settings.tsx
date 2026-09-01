import { useEffect, useState } from 'preact/hooks'
import type {
  AlertsLayout,
  AppConfig,
  DisplayInfo,
  GlassMode,
  SourceId,
  TaskProviderId,
  ThemeConfig
} from '@shared/types'
import { FONT_STACKS, THEME_PRESETS } from '@shared/themes'

const SOURCE_LABELS: Record<SourceId, string> = {
  gmail: 'Gmail',
  proton: 'Proton Mail',
  bluesky: 'Bluesky',
  discord: 'Discord'
}

/** Sources whose adapters do not exist yet. Shown, but honest about it. */
const NOT_YET_WIRED: Partial<Record<SourceId, string>> = {
  gmail: 'Adapter lands in phase 2',
  proton: 'Adapter lands in phase 3',
  bluesky: 'Adapter lands in phase 3',
  discord: 'Needs the toast helper, phase 5'
}

/** The colours worth exposing individually once a preset is not quite right. */
const COLOR_FIELDS = [
  ['text', 'Text'],
  ['muted', 'Secondary text'],
  ['faint', 'Labels'],
  ['accent', 'Accent'],
  ['cardBackground', 'Card fill'],
  ['cardBorder', 'Card border'],
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
  frosted:
    'Windows 11 acrylic blurs the wallpaper behind the whole panel, which is the only way to actually blur it. The trade is that the gaps between cards are frosted too, rather than showing the wallpaper sharp. Needs Transparency effects on in Windows Settings.',
  clear:
    'The wallpaper stays sharp everywhere and the cards are translucent over it. Nothing is blurred, so raise the card opacity if a busy wallpaper is fighting the text.',
  solid: 'The panel paints its own background and ignores the wallpaper entirely.'
}

export function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    void window.hyte.getConfig().then(setConfig)
    void window.hyte.listDisplays().then(setDisplays)
  }, [])

  async function patch(update: Partial<AppConfig>): Promise<void> {
    setConfig(await window.hyte.setConfig(update))
  }

  if (!config) return null

  const { theme } = config

  /** Any hand-edited value means this is no longer one of the presets. */
  async function patchTheme(update: Partial<ThemeConfig>): Promise<void> {
    await patch({ theme: { ...theme, ...update, preset: 'custom' } })
  }

  async function patchColor(key: ColorKey, value: string): Promise<void> {
    const next: ThemeConfig = { ...theme, preset: 'custom' }
    next[key] = value
    await patch({ theme: next })
  }

  return (
    <div class="settings">
      <h1>Hyte Panel</h1>
      <p class="lede">
        Settings open here on your desktop, not on the case display, so you can use a real keyboard.
      </p>

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
          Auto-detection looks for a {config.displayMatch.width} x {config.displayMatch.height} panel in
          either orientation, then for any non-primary display more than three times longer than it is
          wide. Pick one here to pin it.
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
          The panel is a borderless window at the display's exact bounds rather than a true fullscreen
          window, because Wallpaper Engine pauses the wallpaper under a focused fullscreen app. Changing
          the glass mode rebuilds the window, which is why the panel blinks. Each mode has a matching
          theme preset below: <strong>Frosted</strong>, <strong>Glass</strong> and{' '}
          <strong>Midnight</strong>.
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
          Google Tasks rides the same sign-in as Calendar. Microsoft To Do needs its own app registration.
          Both land in phase 4; the local list works today.
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
        <p class="hint">
          HYTE Nexus Link also wants this display. Turn its screen feature off if the two fight over
          which one is on top.
        </p>
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
