import type {
  CalendarEvent,
  Health,
  PanelState,
  SourceId,
  SourceState,
  StatReading,
  Task
} from '@shared/types'
import { getConfig } from './config'

type Listener = (state: PanelState) => void

const listeners = new Set<Listener>()

/**
 * What the renderer draws. Placeholder data until an adapter reports, then
 * `goLive` clears it for good.
 * Built lazily: app.getPath('userData') is not safe at import time.
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

function blankSource(id: SourceId): SourceState {
  return {
    id,
    label: SOURCE_LABELS[id],
    enabled: getConfig().sources[id]?.enabled ?? true,
    health: 'unconfigured',
    count: 0,
    items: [],
    checkedAt: null,
    message: 'Not connected yet'
  }
}

function buildMockState(): PanelState {
  const config = getConfig()
  const sources = (Object.keys(SOURCE_LABELS) as SourceId[]).map(blankSource)

  // A couple of real values so the layout is judged with ink on it.
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
    eventsNote: null,
    stats: [],
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

/**
 * Throws the placeholders away the first time a real adapter reports. Silent on
 * purpose: the caller writes the real values in the same tick and notifies then,
 * so the panel never flashes an empty frame.
 */
export function goLive(): void {
  const current = getState()
  if (!current.mock) return
  state = {
    ...current,
    sources: current.sources.map((source) => blankSource(source.id)),
    events: [],
    eventsHealth: 'unconfigured',
    eventsNote: null,
    // Anything the user typed is theirs; the seeded examples are not.
    tasks: current.tasks.filter((task) => !task.id.startsWith('mock-')),
    mock: false
  }
}

/** `null` events keep whatever is on screen, for a refresh that failed. */
export function setEvents(
  events: CalendarEvent[] | null,
  health: Health,
  note: string | null = null
): PanelState {
  return updateState({ events: events ?? getState().events, eventsHealth: health, eventsNote: note })
}

/** `null` tasks keep whatever is on screen, for a refresh that failed. */
export function setTasks(tasks: Task[] | null, health: Health): PanelState {
  return updateState({ tasks: tasks ?? getState().tasks, tasksHealth: health })
}

/** The card labels itself with the provider, so it has to follow settings. */
export function syncTaskProvider(): PanelState {
  return updateState({ taskProvider: getConfig().taskProvider })
}

export function setStats(stats: StatReading[]): PanelState {
  return updateState({ stats })
}

export function setSource(id: SourceId, patch: Partial<SourceState>): PanelState {
  return updateState({
    sources: getState().sources.map((source) => (source.id === id ? { ...source, ...patch } : source))
  })
}

/** Mirrors the settings checkboxes onto the state the Alerts card filters on. */
export function syncSourcesEnabled(): PanelState {
  const config = getConfig()
  return updateState({
    sources: getState().sources.map((source) => ({
      ...source,
      enabled: config.sources[source.id]?.enabled ?? true
    }))
  })
}

/** Placeholder mutations so the widget works before phase 4. */
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
