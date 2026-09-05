import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import type { AppConfig } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getConfig, setConfig } from './config'
import { findPanelDisplay, listDisplays } from './display'
import { feedsStatus, noteError, onFeedsChanged, setCalendarUrl, setMailPassword } from './feeds/store'
import { refreshNow, startPolling } from './poll'
import { applyPanelTaskbar, restorePanelTaskbar } from './taskbar'
import { addTask, getState, removeTask, subscribe, syncSourcesEnabled, toggleTask } from './state'

/** HYTE_WINDOWED=1 gives a normal resizable window for layout work. */
const WINDOWED = process.env.HYTE_WINDOWED === '1'
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL

let panelWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let activeDisplayId: number | null = null
/** Suppresses quit-on-last-window-closed while swapping the panel window. */
let rebuilding = false

function loadRoute(window: BrowserWindow, route: 'panel' | 'settings'): void {
  const hash = route === 'settings' ? '#settings' : ''
  if (RENDERER_URL) {
    void window.loadURL(`${RENDERER_URL}/${hash}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.slice(1) })
  }
}

function createPanelWindow(): void {
  const config = getConfig()
  const { display, detected } = findPanelDisplay(config)
  activeDisplayId = display.id

  const { x, y, width, height } = display.bounds
  const mode = WINDOWED ? 'solid' : config.glassMode

  panelWindow = new BrowserWindow({
    x: WINDOWED ? undefined : x,
    y: WINDOWED ? undefined : y,
    // Portrait proportions at 3/8 scale.
    width: WINDOWED ? 256 : width,
    height: WINDOWED ? 960 : height,
    frame: WINDOWED,
    resizable: WINDOWED,
    movable: WINDOWED,
    hasShadow: false,
    // Never `fullscreen: true`: Wallpaper Engine pauses under a focused
    // fullscreen window. Borderless at exact bounds looks the same.
    // Frosted needs transparent false, or Electron's layered-window flags stop
    // DWM painting the acrylic.
    transparent: mode === 'clear',
    backgroundColor: mode === 'solid' ? config.theme.background : '#00000000',
    backgroundMaterial: mode === 'frosted' ? 'acrylic' : 'none',
    // Only pin on top once we know we found the panel, not the desktop.
    alwaysOnTop: !WINDOWED && detected && config.alwaysOnTop,
    skipTaskbar: !WINDOWED,
    autoHideMenuBar: true,
    show: false,
    title: 'Hyte Panel',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const thisWindow = panelWindow
  thisWindow.once('ready-to-show', () => thisWindow.show())
  thisWindow.on('closed', () => {
    // Guard against a rebuild's old window nulling out its replacement.
    if (panelWindow === thisWindow) {
      panelWindow = null
      activeDisplayId = null
    }
  })

  // Keep navigation inside the app. External links go to the real browser.
  thisWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!detected) {
    console.warn(
      `[display] No panel matching ${config.displayMatch.width}x${config.displayMatch.height} found. ` +
        'Opening on the primary display. Pick the right one in settings.'
    )
  }

  loadRoute(thisWindow, 'panel')
}

/**
 * Keeps the panel display's taskbar matching the setting. Skipped in windowed
 * dev mode, where the small window is not really on the panel.
 */
function syncPanelTaskbar(): void {
  if (WINDOWED) return
  const display = screen.getAllDisplays().find((d) => d.id === activeDisplayId)
  if (!display) return
  // Electron reports display size in device-independent pixels; user32 works in
  // physical ones, and the script matches on physical.
  const { size, scaleFactor } = display
  applyPanelTaskbar(
    { width: Math.round(size.width * scaleFactor), height: Math.round(size.height * scaleFactor) },
    getConfig().hideTaskbar
  )
}

/** `transparent` is fixed at construction time, so changing it means a new window. */
function rebuildPanelWindow(): void {
  rebuilding = true
  panelWindow?.destroy()
  panelWindow = null
  createPanelWindow()
  setImmediate(() => {
    rebuilding = false
  })
}

function movePanelToDisplay(displayId: number): void {
  const display = screen.getAllDisplays().find((d) => d.id === displayId)
  if (!display || !panelWindow) return

  setConfig({ displayId })
  activeDisplayId = display.id

  if (WINDOWED) {
    // Keep the small dev window, just move it onto the chosen display.
    const current = panelWindow.getBounds()
    panelWindow.setBounds({
      x: display.bounds.x + 40,
      y: display.bounds.y + 40,
      width: current.width,
      height: current.height
    })
    return
  }

  panelWindow.setBounds(display.bounds)
  panelWindow.setAlwaysOnTop(getConfig().alwaysOnTop)
  syncPanelTaskbar()
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  // Primary monitor: the panel has no keyboard.
  const primary = screen.getPrimaryDisplay()
  settingsWindow = new BrowserWindow({
    width: 960,
    height: 820,
    x: Math.round(primary.bounds.x + (primary.bounds.width - 960) / 2),
    y: Math.round(primary.bounds.y + (primary.bounds.height - 820) / 2),
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    title: 'Hyte Panel settings',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  loadRoute(settingsWindow, 'settings')
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function applyConfig(previous: AppConfig, next: AppConfig): void {
  app.setLoginItemSettings({ openAtLogin: next.autostart })

  // Data first: a glass change rebuilds the window and returns early below.
  if (JSON.stringify(previous.sources) !== JSON.stringify(next.sources)) {
    syncSourcesEnabled()
    refreshNow()
  }
  if (JSON.stringify(previous.feeds) !== JSON.stringify(next.feeds)) {
    broadcast(IPC.feedsStatusChanged, feedsStatus())
    refreshNow()
  }
  if (previous.hideTaskbar !== next.hideTaskbar) syncPanelTaskbar()

  if (previous.glassMode !== next.glassMode) {
    // Transparency is fixed at construction. Everything else applies live.
    rebuildPanelWindow()
    return
  }

  if (panelWindow && !WINDOWED) {
    if (previous.alwaysOnTop !== next.alwaysOnTop) {
      panelWindow.setAlwaysOnTop(next.alwaysOnTop)
    }
    if (next.glassMode === 'solid' && previous.theme.background !== next.theme.background) {
      panelWindow.setBackgroundColor(next.theme.background)
    }
  }
}

/** Default tints handed to new calendars, in order. */
const CALENDAR_COLOURS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#7dcfff']

/**
 * Every feed credential write goes through here: it reports a failed write as
 * `status.lastError` rather than rejecting, so settings shows a sentence
 * instead of an IPC trace, and it always broadcasts the new state.
 */
function withFeedWrite(write: () => void): ReturnType<typeof feedsStatus> {
  try {
    write()
    noteError(null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[feeds]', message)
    noteError(message)
  }
  broadcast(IPC.configChanged, getConfig())
  const status = feedsStatus()
  broadcast(IPC.feedsStatusChanged, status)
  refreshNow()
  return status
}

function registerIpc(): void {
  ipcMain.handle(IPC.stateGet, () => getState())
  ipcMain.handle(IPC.configGet, () => getConfig())
  ipcMain.handle(IPC.configSet, (_event, patch: Partial<AppConfig>) => {
    const previous = getConfig()
    const next = setConfig(patch)
    applyConfig(previous, next)
    broadcast(IPC.configChanged, next)
    return next
  })
  ipcMain.handle(IPC.displaysList, () => listDisplays(activeDisplayId))
  ipcMain.handle(IPC.panelSetDisplay, (_event, displayId: number) => {
    movePanelToDisplay(displayId)
    return listDisplays(activeDisplayId)
  })
  ipcMain.handle(IPC.feedsStatus, () => feedsStatus())
  ipcMain.handle(IPC.calendarAdd, (_event, label: string, url: string) => {
    const { feeds } = getConfig()
    const id = `cal-${Date.now().toString(36)}`
    const color = CALENDAR_COLOURS[feeds.calendars.length % CALENDAR_COLOURS.length]
    return withFeedWrite(() => {
      setCalendarUrl(id, url)
      setConfig({
        feeds: {
          ...feeds,
          calendars: [...feeds.calendars, { id, label: label.trim() || 'Calendar', color, enabled: true }]
        }
      })
    })
  })
  ipcMain.handle(IPC.calendarSetUrl, (_event, id: string, url: string) =>
    // An empty box means the stored URL stays, so a label can be fixed alone.
    withFeedWrite(() => {
      if (url.trim()) setCalendarUrl(id, url)
    })
  )
  ipcMain.handle(IPC.calendarRemove, (_event, id: string) => {
    const { feeds } = getConfig()
    return withFeedWrite(() => {
      setCalendarUrl(id, null)
      setConfig({ feeds: { ...feeds, calendars: feeds.calendars.filter((feed) => feed.id !== id) } })
    })
  })
  ipcMain.handle(IPC.mailSetPassword, (_event, password: string) =>
    withFeedWrite(() => {
      if (password.trim()) setMailPassword(password)
    })
  )
  ipcMain.handle(IPC.feedsRefresh, () => refreshNow())
  ipcMain.handle(IPC.settingsOpen, () => openSettingsWindow())
  ipcMain.handle(IPC.settingsClose, () => settingsWindow?.close())
  ipcMain.handle(IPC.taskAdd, (_event, title: string) => addTask(title))
  ipcMain.handle(IPC.taskToggle, (_event, id: string) => toggleTask(id))
  ipcMain.handle(IPC.taskRemove, (_event, id: string) => removeTask(id))
  ipcMain.handle(IPC.appQuit, () => app.quit())
}

/** A second launch focuses the panel instead of duplicating it. */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (panelWindow) {
      if (panelWindow.isMinimized()) panelWindow.restore()
      panelWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('dev.bitofcode.hytepanel')
    app.setLoginItemSettings({ openAtLogin: getConfig().autostart })

    registerIpc()
    subscribe((state) => broadcast(IPC.stateChanged, state))
    // A refresh result is news for the settings window too.
    onFeedsChanged(() => broadcast(IPC.feedsStatusChanged, feedsStatus()))
    createPanelWindow()
    startPolling()
    syncPanelTaskbar()

    // The panel enumerates late at boot and vanishes if unplugged.
    // A shell that rebuilds its taskbars undoes the hiding, and these are the
    // moments it most often does.
    screen.on('display-added', () => {
      const { display, detected } = findPanelDisplay(getConfig())
      if (detected && display.id !== activeDisplayId) movePanelToDisplay(display.id)
      syncPanelTaskbar()
    })

    screen.on('display-metrics-changed', () => syncPanelTaskbar())

    screen.on('display-removed', (_event, removed) => {
      if (removed.id !== activeDisplayId || !panelWindow) return
      const primary = screen.getPrimaryDisplay()
      panelWindow.setAlwaysOnTop(false)
      panelWindow.setBounds(primary.bounds)
      activeDisplayId = primary.id
    })

    // Leaving the desktop as we found it.
    app.on('before-quit', () => restorePanelTaskbar())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createPanelWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!rebuilding) app.quit()
  })
}
