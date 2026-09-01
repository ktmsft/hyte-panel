/**
 * Types shared across the main process, the preload bridge and the renderer.
 * The renderer only ever sees these shapes. Tokens and passwords never leave main.
 */

export type SourceId = 'gmail' | 'proton' | 'bluesky' | 'discord'

/**
 * `stale` means we have a real value but the last refresh failed, so the UI
 * dims it and shows when it was last true. `unconfigured` means the user has
 * not supplied credentials. `setup-needed` is for the toast helper, which can
 * be configured but still blocked by Windows.
 */
export type Health = 'ok' | 'stale' | 'error' | 'unconfigured' | 'setup-needed'

export interface SourceItem {
  title: string
  subtitle?: string
  at: string
}

export interface SourceState {
  id: SourceId
  label: string
  enabled: boolean
  health: Health
  count: number
  items: SourceItem[]
  /** ISO timestamp of the last successful refresh, null if never. */
  checkedAt: string | null
  /** Human-readable reason when health is not ok. */
  message?: string
}

export interface CalendarEvent {
  id: string
  title: string
  /** ISO timestamp. For all-day events this is midnight local. */
  start: string
  end: string
  allDay: boolean
  location?: string
  calendarColor?: string
}

export interface Task {
  id: string
  title: string
  done: boolean
  /** ISO date (no time) when the task is due. */
  due?: string
  notes?: string
}

export type TaskProviderId = 'local' | 'google' | 'microsoft'

export interface PanelState {
  sources: SourceState[]
  events: CalendarEvent[]
  eventsHealth: Health
  tasks: Task[]
  taskProvider: TaskProviderId
  tasksHealth: Health
  /** True while widgets are showing placeholder data (phase 1). */
  mock: boolean
  updatedAt: string
}

export interface DimConfig {
  enabled: boolean
  /** Local hour (0-23) the panel dims at, and the hour it returns to full. */
  startHour: number
  endHour: number
  /** 0.1 to 1. Applied as a CSS filter so the backlight stays on. */
  level: number
}

/** `list` is one row per source with text. `grid` is icon tiles, three across. */
export type AlertsLayout = 'list' | 'grid'

export interface ThemeConfig {
  /** Id of the preset this came from, or 'custom' once edited. */
  preset: string
  /** Page background. Ignored while transparent mode is on. */
  background: string
  /** Card fill, as a solid hex. Opacity is applied separately so it can be
   *  dialled down over a wallpaper without losing the colour. */
  cardBackground: string
  cardOpacity: number
  cardBorder: string
  text: string
  muted: string
  faint: string
  accent: string
  ok: string
  warn: string
  err: string
  fontFamily: string
  /** Multiplier on the whole type scale. 1 is the designed size. */
  fontScale: number
  /** Drop shadow behind text. Earns its keep over a busy wallpaper. */
  textShadow: boolean
}

export interface AppConfig {
  /** Electron display id chosen by the user. Null means auto-detect by size. */
  displayId: number | null
  /** Panel dimensions we look for when auto-detecting. Orientation-agnostic. */
  displayMatch: { width: number; height: number }
  /** Let the desktop wallpaper show through. Requires a window rebuild to change. */
  transparent: boolean
  alwaysOnTop: boolean
  alertsLayout: AlertsLayout
  theme: ThemeConfig
  sources: Record<SourceId, { enabled: boolean }>
  taskProvider: TaskProviderId
  autostart: boolean
  dim: DimConfig
}

export interface DisplayInfo {
  id: number
  label: string
  width: number
  height: number
  primary: boolean
  /** True for the display we are currently drawing the panel on. */
  active: boolean
}
