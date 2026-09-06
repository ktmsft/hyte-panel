import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { resolveOrder } from '@shared/panels'
import type { AppConfig, PanelId, PanelState } from '@shared/types'
import { applyScale, applyTheme } from './lib/theme'
import { Clock } from './widgets/Clock'
import { Picture } from './widgets/Picture'
import { Stats } from './widgets/Stats'
import { Agenda } from './widgets/Agenda'
import { Todos } from './widgets/Todos'
import { Alerts } from './widgets/Alerts'
import { Settings } from './settings/Settings'

/**
 * Whichever of these is visible first takes the leftover height. The rows are
 * built from the visible set, so a hidden card leaves no gap behind it.
 */
const FILL_PRIORITY: PanelId[] = ['todos', 'agenda', 'alerts', 'clock']

/** Both windows load the same bundle. The hash decides which one this is. */
const isSettingsWindow = window.location.hash === '#settings'

/** Set HYTE_TAP_LOG=1 alongside the dev script to trace where touches land. */
const tapLogging = import.meta.env.VITE_HYTE_TAP_LOG === '1'

function usePanelState(): PanelState | null {
  const [state, setState] = useState<PanelState | null>(null)
  useEffect(() => {
    void window.hyte.getState().then(setState)
    return window.hyte.onStateChanged(setState)
  }, [])
  return state
}

/**
 * The renderer cannot read the disk, so the list of pictures comes from main.
 * Re-read whenever the source changes, or the card would keep showing whatever
 * the last folder held.
 */
function usePictures(config: AppConfig | null): string[] {
  const [urls, setUrls] = useState<string[]>([])
  const source = config ? `${config.image.source}:${config.image.path}` : ''
  const shown = config?.panels.image ?? false

  useEffect(() => {
    if (!shown) {
      setUrls([])
      return
    }
    void window.hyte.listPictures().then(setUrls)
  }, [source, shown])

  return urls
}

function useConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null)
  useEffect(() => {
    void window.hyte.getConfig().then(setConfig)
    return window.hyte.onConfigChanged(setConfig)
  }, [])
  return config
}

export function App() {
  const state = usePanelState()
  const config = useConfig()
  const pictures = usePictures(config)

  useEffect(() => {
    document.body.classList.toggle('panel', !isSettingsWindow)
  }, [])

  /**
   * Taps that never arrive look exactly like taps whose handler did not fire,
   * and telling those apart has cost hours. With HYTE_TAP_LOG=1 every touch
   * prints where it landed, which answers it in one tap: wrong coordinates mean
   * a mapping problem, silence means the touch never reached the window.
   *
   * Off by default, since it is one line per touch.
   */
  useEffect(() => {
    if (isSettingsWindow || !tapLogging) return undefined
    const seen = (event: PointerEvent): void => {
      console.warn(`[tap] ${event.pointerType} at ${Math.round(event.clientX)},${Math.round(event.clientY)}`)
    }
    window.addEventListener('pointerdown', seen)
    return () => window.removeEventListener('pointerdown', seen)
  }, [])

  useEffect(() => {
    if (!config) return undefined

    // The settings window is an ordinary opaque desktop window, but it still
    // wears the theme so colour changes can be judged before they hit the panel.
    applyTheme(config.theme, isSettingsWindow ? 'solid' : config.glassMode)

    if (isSettingsWindow) {
      document.documentElement.style.fontSize = '16px'
      return undefined
    }

    const rescale = (): void => applyScale(config.theme.fontScale)
    rescale()
    window.addEventListener('resize', rescale)
    return () => window.removeEventListener('resize', rescale)
  }, [config])

  if (isSettingsWindow) return <Settings />
  if (!state || !config) return null

  const openSettings = (): void => void window.hyte.openSettings()

  const cards: Record<PanelId, JSX.Element> = {
    clock: (
      <Clock key="clock" mock={state.mock} hour12={config.clockHour12} onOpenSettings={openSettings} />
    ),
    stats: <Stats key="stats" stats={state.stats} />,
    image: (
      <Picture
        key="image"
        urls={pictures}
        intervalSeconds={config.image.intervalSeconds}
        fit={config.image.fit}
      />
    ),
    agenda: (
      <Agenda
        key="agenda"
        events={state.events}
        health={state.eventsHealth}
        note={state.eventsNote}
        hour12={config.clockHour12}
      />
    ),
    todos: <Todos key="todos" tasks={state.tasks} provider={state.taskProvider} />,
    alerts: (
      <Alerts
        key="alerts"
        sources={state.sources}
        layout={config.alertsLayout}
        launch={config.launch}
      />
    )
  }

  const visible = resolveOrder(config.panelOrder).filter((id) => config.panels[id])
  const filler = FILL_PRIORITY.find((id) => config.panels[id])
  // The picture is the one card with a height of its own; the rest are sized by
  // their content, bar whichever takes the slack.
  const gridTemplateRows = visible
    .map((id) => {
      if (id === 'image') return `${config.image.heightRem}rem`
      return id === filler ? 'minmax(20rem, 1fr)' : 'auto'
    })
    .join(' ')

  return (
    <>
      <div class="panel-grid" style={{ gridTemplateRows }}>
        {visible.map((id) => cards[id])}
      </div>
      {/* The only way into settings is the clock's gear, so hiding the clock
          would strand the panel with no way back. */}
      {!config.panels.clock && (
        <button class="settings-escape" onClick={openSettings} aria-label="Open settings">
          Settings
        </button>
      )}
    </>
  )
}
