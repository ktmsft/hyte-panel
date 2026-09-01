import { useEffect, useState } from 'preact/hooks'
import type { PanelState } from '@shared/types'
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

export function App() {
  const state = usePanelState()

  useEffect(() => {
    document.body.classList.toggle('panel', !isSettingsWindow)
  }, [])

  if (isSettingsWindow) return <Settings />
  if (!state) return null

  return (
    <div class="panel-grid">
      <Clock sources={state.sources} mock={state.mock} onOpenSettings={() => void window.hyte.openSettings()} />
      <Agenda events={state.events} health={state.eventsHealth} />
      <Todos tasks={state.tasks} provider={state.taskProvider} />
      <Alerts sources={state.sources} />
    </div>
  )
}
