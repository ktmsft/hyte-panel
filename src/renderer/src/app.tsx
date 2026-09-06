import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { AppConfig, PanelId, PanelState } from '@shared/types'
import { applyScale, applyTheme } from './lib/theme'
import { Clock } from './widgets/Clock'
import { Stats } from './widgets/Stats'
import { Agenda } from './widgets/Agenda'
import { Todos } from './widgets/Todos'
import { Alerts } from './widgets/Alerts'
import { Settings } from './settings/Settings'

/** Top to bottom, as stacked on the portrait panel. */
const PANEL_ORDER: PanelId[] = ['clock', 'stats', 'agenda', 'todos', 'alerts']

/**
 * Whichever of these is visible first takes the leftover height. The rows are
 * built from the visible set, so a hidden card leaves no gap behind it.
 */
const FILL_PRIORITY: PanelId[] = ['todos', 'agenda', 'alerts', 'clock']

/** Both windows load the same bundle. The hash decides which one this is. */
const isSettingsWindow = window.location.hash === '#settings'

function usePanelState(): PanelState | null {
  const [state, setState] = useState<PanelState | null>(null)
  useEffect(() => {
    void window.hyte.getState().then(setState)
    return window.hyte.onStateChanged(setState)
  }, [])
  return state
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

  useEffect(() => {
    document.body.classList.toggle('panel', !isSettingsWindow)
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
    clock: <Clock key="clock" mock={state.mock} onOpenSettings={openSettings} />,
    stats: <Stats key="stats" stats={state.stats} />,
    agenda: (
      <Agenda
        key="agenda"
        events={state.events}
        health={state.eventsHealth}
        note={state.eventsNote}
      />
    ),
    todos: <Todos key="todos" tasks={state.tasks} provider={state.taskProvider} />,
    alerts: <Alerts key="alerts" sources={state.sources} layout={config.alertsLayout} />
  }

  const visible = PANEL_ORDER.filter((id) => config.panels[id])
  const filler = FILL_PRIORITY.find((id) => config.panels[id])
  const gridTemplateRows = visible.map((id) => (id === filler ? 'minmax(20rem, 1fr)' : 'auto')).join(' ')

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
