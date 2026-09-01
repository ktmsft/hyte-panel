import { useEffect, useState } from 'preact/hooks'
import type { AppConfig, DisplayInfo, SourceId, TaskProviderId } from '@shared/types'

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
          Auto-detection looks for a {config.displayMatch.width} x {config.displayMatch.height} panel, then
          for any non-primary display wider than three times its height. Pick one here to pin it.
        </p>
      </section>

      <section>
        <h2>Sources</h2>
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
          <span class="meta">
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
