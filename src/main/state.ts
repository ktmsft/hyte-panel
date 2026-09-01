import type { PanelState, SourceId, SourceState, Task } from '@shared/types'
import { getConfig } from './config'

/**
 * The single source of truth the renderer draws from. Phase 1 fills it with
 * placeholder data so the layout can be judged on the real panel before any
 * account is connected. Phases 2 to 5 replace each block with live adapters.
 */

type Listener = (state: PanelState) => void

const listeners = new Set<Listener>()

/**
 * Built on first read rather than at import time. Config lives under
 * app.getPath('userData'), which is not safe to touch while modules load.
 */
let state: PanelState | null = null

const SOURCE_LABELS: Record<SourceId, string> = {
  gmail: 'Gmail',
  proton: 'Proton',
  bluesky: 'Bluesky',
  discord: 'Discord'
}

function iso(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString()
}

function buildMockState(): PanelState {
  const config = getConfig()
  const sources: SourceState[] = (Object.keys(SOURCE_LABELS) as SourceId[]).map((id) => ({
    id,
    label: SOURCE_LABELS[id],
    enabled: config.sources[id]?.enabled ?? true,
    health: 'unconfigured',
    count: 0,
    items: [],
    checkedAt: null,
    message: 'Not connected yet'
  }))

  // Give a couple of tiles sample values so the layout is judged with real ink on it.
  sources[0] = { ...sources[0], health: 'ok', count: 3, checkedAt: iso(-1), message: undefined }
  sources[2] = { ...sources[2], health: 'stale', count: 12, checkedAt: iso(-46) }

  const tasks: Task[] = [
    { id: 'mock-1', title: 'Wire the Google OAuth consent screen', done: false },
    { id: 'mock-2', title: 'Copy the Proton Bridge IMAP password', done: false },
    { id: 'mock-3', title: 'Decide on Google Tasks or Microsoft To Do', done: false },
    { id: 'mock-4', title: 'Mount the panel and check the layout', done: true }
  ]

  return {
    sources,
    events: [
      { id: 'mock-e1', title: 'Standup', start: iso(35), end: iso(50), allDay: false },
      { id: 'mock-e2', title: 'Design review', start: iso(155), end: iso(215), allDay: false, location: 'Meet' },
      { id: 'mock-e3', title: 'Dentist', start: iso(430), end: iso(490), allDay: false, location: 'Dr Alvarez' },
      { id: 'mock-e4', title: 'Ship the panel shell', start: iso(1500), end: iso(1560), allDay: false }
    ],
    eventsHealth: 'unconfigured',
    tasks,
    taskProvider: config.taskProvider,
    tasksHealth: 'unconfigured',
    mock: true,
    updatedAt: new Date().toISOString()
  }
}

export function getState(): PanelState {
  if (!state) state = buildMockState()
  return state
}

export function updateState(patch: Partial<PanelState>): PanelState {
  const next = { ...getState(), ...patch, updatedAt: new Date().toISOString() }
  state = next
  for (const listener of listeners) listener(next)
  return next
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Placeholder task mutations so the widget is interactive before phase 4 lands. */
export function toggleTask(id: string): PanelState {
  return updateState({
    tasks: getState().tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
  })
}

export function addTask(title: string): PanelState {
  const trimmed = title.trim()
  if (!trimmed) return getState()
  const task: Task = { id: `local-${Date.now()}`, title: trimmed, done: false }
  return updateState({ tasks: [task, ...getState().tasks] })
}

export function removeTask(id: string): PanelState {
  return updateState({ tasks: getState().tasks.filter((t) => t.id !== id) })
}
