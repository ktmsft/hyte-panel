// Shared across main, preload and renderer. Tokens never leave main.

export type SourceId = 'gmail' | 'proton' | 'bluesky' | 'discord'

/** `stale` is a real value whose last refresh failed, so the UI dims it. */
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
  /**
   * Set when some feeds loaded and others did not. The events shown are fresh,
   * just incomplete, which is not what `stale` means.
   */
  eventsNote: string | null
  /** Only the stats switched on, in the order the card shows them. */
  stats: StatReading[]
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
  /** 0.1 to 1. A CSS filter, so the backlight stays on. */
  level: number
}

/** `list` is one row per source with text. `grid` is icon tiles, three across. */
export type AlertsLayout = 'list' | 'grid'

/**
 * `clear` leaves the wallpaper sharp under translucent cards. `frosted` uses
 * Windows acrylic, the only real blur available, but it frosts the whole
 * window including the gaps. `solid` ignores the wallpaper.
 */
export type GlassMode = 'frosted' | 'clear' | 'solid'

export interface ThemeConfig {
  /** Id of the preset this came from, or 'custom' once edited. */
  preset: string
  /** Only painted in the Solid glass mode. */
  background: string
  /** Solid hex. Opacity is separate so a tint keeps its colour. */
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
  /** Multiplier on the type scale. 1 is the designed size. */
  fontScale: number
  /**
   * Multiplier on the space between cards, and on the panel's own inset.
   * 1 is the designed spacing; 0 makes the cards meet and reach the edges.
   */
  gapScale: number
  /** Halo behind text, for busy wallpapers. */
  textShadow: boolean
}

/** `subjects` costs one extra IMAP command; nothing else differs. */
export type MailDetail = 'count' | 'subjects'

/**
 * One iCalendar feed. The secret URL is a bearer credential, so it is kept in
 * the encrypted vault and referenced by id, never stored here.
 */
export interface CalendarFeed {
  id: string
  label: string
  /** Tint for this feed's events on the panel. */
  color: string
  enabled: boolean
}

/** IMAP over implicit TLS. Gmail is imap.gmail.com:993 with an app password. */
export interface MailAccount {
  host: string
  port: number
  user: string
  enabled: boolean
}

export interface FeedsConfig {
  calendars: CalendarFeed[]
  /** How far ahead the agenda looks. */
  calendarDays: number
  mail: MailAccount
  mailDetail: MailDetail
}

/** How one calendar feed fared on its last refresh. */
export interface CalendarHealth {
  id: string
  /** A secret URL is on file. The URL itself never crosses IPC. */
  hasUrl: boolean
  /** Null once it has loaded cleanly. */
  error: string | null
  /** Events found in the window, so a working feed can be told from an empty one. */
  events: number
  /** Null until it has been tried. */
  checkedAt: string | null
}

/** What the settings window may know. Credentials themselves never cross IPC. */
export interface FeedsStatus {
  calendars: CalendarHealth[]
  mailPasswordSet: boolean
  mailError: string | null
  /** False where safeStorage cannot encrypt, which blocks saving anything. */
  encryptionAvailable: boolean
  /** A failed credential write, as opposed to a failed refresh. */
  lastError: string | null
}

/** The cards on the panel, in the order they are stacked. */
export type PanelId = 'clock' | 'stats' | 'agenda' | 'todos' | 'alerts'

/**
 * One number on the System card. GPU figures come from nvidia-smi, which ships
 * with the driver; `cpuTemp` needs LibreHardwareMonitor, because Windows offers
 * no supported way to read a modern CPU's temperature.
 */
export type StatId =
  | 'cpuLoad'
  | 'cpuTemp'
  | 'memory'
  | 'gpuTemp'
  | 'gpuLoad'
  | 'gpuVram'
  | 'gpuPower'
  | 'gpuFan'
  | 'disk'
  | 'uptime'

/**
 * Whether a number is worth acting on, decided where the real limits are known
 * rather than from how far along a bar it happens to sit.
 */
export type StatLevel = 'normal' | 'warn' | 'critical'

export interface StatReading {
  id: StatId
  label: string
  /** The big number, on its own. Null when this machine cannot answer it. */
  value: string | null
  /** Set tight against the number: %, GB, W. */
  unit: string | null
  /** The small line underneath, such as "of 93.5 GB". */
  detail: string | null
  /** 0 to 1 against the thing's real limit, so a bar can be drawn. */
  fraction: number | null
  level: StatLevel
  /** Why the value is missing, shown in its place. Kept short: it sits in a tile. */
  note?: string
}

export interface MicrosoftConfig {
  /** Application (client) ID from the Entra app registration. Not a secret. */
  clientId: string
  /** Which To Do list to show. Null uses the account's default. */
  listId: string | null
}

export interface TodoList {
  id: string
  name: string
  isDefault: boolean
}

/** What the settings window may know. The refresh token never crosses IPC. */
export interface MicrosoftStatus {
  hasClientId: boolean
  connected: boolean
  account: string | null
  lists: TodoList[]
  encryptionAvailable: boolean
  lastError: string | null
}

export interface AppConfig {
  /** Bumped when a saved config needs migrating. */
  configVersion: number
  /** Electron display id chosen by the user. Null means auto-detect by size. */
  displayId: number | null
  /** Panel dimensions we look for when auto-detecting. Orientation-agnostic. */
  displayMatch: { width: number; height: number }
  /** Changing this rebuilds the window. */
  glassMode: GlassMode
  alwaysOnTop: boolean
  alertsLayout: AlertsLayout
  /** Which cards are on screen. Hiding them all is allowed. */
  panels: Record<PanelId, boolean>
  /** Which numbers the System card shows. */
  stats: Record<StatId, boolean>
  /**
   * Celsius at which the CPU is considered at its limit, used for the bar and
   * its colour. 95 suits Ryzen 9000; Intel is often 100, older X3D parts 89.
   * The GPU needs no equivalent: its driver reports its own headroom.
   */
  cpuTempLimit: number
  theme: ThemeConfig
  sources: Record<SourceId, { enabled: boolean }>
  feeds: FeedsConfig
  taskProvider: TaskProviderId
  microsoft: MicrosoftConfig
  autostart: boolean
  /**
   * Hides the Windows taskbar on the panel display only. Windows itself has no
   * per-monitor switch, so this reaches for the taskbar window directly.
   */
  hideTaskbar: boolean
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
