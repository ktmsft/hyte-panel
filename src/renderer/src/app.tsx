import { useEffect, useState } from 'preact/hooks'
import type { AppConfig, PanelState } from '@shared/types'
import { applyScale, applyTheme } from './lib/theme'
import { Clock } from './widgets/Clock'
import { Agenda } from './widgets/Agenda'
import { Todos } from './widgets/Todos'
import { Alerts } from './widgets/Alerts'
import { Settings } from './settings/Settings'

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

  return (
    <div class="panel-grid">
      <Clock mock={state.mock} onOpenSettings={() => void window.hyte.openSettings()} />
      <Agenda events={state.events} health={state.eventsHealth} note={state.eventsNote} />
      <Todos tasks={state.tasks} provider={state.taskProvider} />
      <Alerts sources={state.sources} layout={config.alertsLayout} />
    </div>
  )
}
