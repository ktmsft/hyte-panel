import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import type { AppConfig } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getConfig, setConfig } from './config'
import { findPanelDisplay, listDisplays } from './display'
import { addTask, getState, removeTask, subscribe, toggleTask } from './state'

/** Set HYTE_WINDOWED=1 to develop in a normal resizable window on the desktop. */
const WINDOWED = process.env.HYTE_WINDOWED === '1'
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL

let panelWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let activeDisplayId: number | null = null
/** Suppresses the quit-on-last-window-closed rule while we swap the panel window. */
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
  const transparent = config.transparent && !WINDOWED

  panelWindow = new BrowserWindow({
    x: WINDOWED ? undefined : x,
    y: WINDOWED ? undefined : y,
    // Windowed mode keeps the panel's portrait proportions at 3/8 scale so the
    // layout can be judged on a desktop monitor.
    width: WINDOWED ? 256 : width,
    height: WINDOWED ? 960 : height,
    frame: WINDOWED,
    resizable: WINDOWED,
    movable: WINDOWED,
    hasShadow: false,
    /*
     * Deliberately NOT `fullscreen: true`. Wallpaper Engine pauses the wallpaper
     * under a focused fullscreen window, and a paused wallpaper is the whole
     * thing we are trying to avoid. A borderless window at the display's exact
     * bounds is visually identical and leaves the wallpaper running.
     */
    transparent,
    backgroundColor: transparent ? '#00000000' : config.theme.background,
    // Only pin above other windows once we are confident we are on the case panel,
    // otherwise a mis-detection would park an always-on-top window over the desktop.
    alwaysOnTop: !WINDOWED && detected && config.alwaysOnTop,
    // No taskbar button and no Alt+Tab entry. On the case panel this should read
    // as part of the machine, not as an app someone left open.
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
    // Dev mode keeps its small proportional window, just moved onto the chosen
    // display. Blowing it up to full bounds would misrepresent the real thing.
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
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  // Settings deliberately open on the primary monitor. Typing an app password on
  // a 682px-wide on-screen keyboard is not something anyone should have to do.
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

  if (previous.transparent !== next.transparent) {
    // Everything else can be applied live; this one cannot.
    rebuildPanelWindow()
    return
  }

  if (panelWindow && !WINDOWED) {
    if (previous.alwaysOnTop !== next.alwaysOnTop) {
      panelWindow.setAlwaysOnTop(next.alwaysOnTop)
    }
    if (!next.transparent && previous.theme.background !== next.theme.background) {
      panelWindow.setBackgroundColor(next.theme.background)
    }
  }
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
  ipcMain.handle(IPC.settingsOpen, () => openSettingsWindow())
  ipcMain.handle(IPC.settingsClose, () => settingsWindow?.close())
  ipcMain.handle(IPC.taskAdd, (_event, title: string) => addTask(title))
  ipcMain.handle(IPC.taskToggle, (_event, id: string) => toggleTask(id))
  ipcMain.handle(IPC.taskRemove, (_event, id: string) => removeTask(id))
  ipcMain.handle(IPC.appQuit, () => app.quit())
}

/** A second launch focuses the panel rather than opening a duplicate on the same screen. */
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
    createPanelWindow()

    // The case panel is often slower to enumerate than the desktop monitors at
    // boot, and it disappears entirely if the DisplayPort cable is pulled.
    screen.on('display-added', () => {
      const { display, detected } = findPanelDisplay(getConfig())
      if (detected && display.id !== activeDisplayId) movePanelToDisplay(display.id)
    })

    screen.on('display-removed', (_event, removed) => {
      if (removed.id !== activeDisplayId || !panelWindow) return
      const primary = screen.getPrimaryDisplay()
      panelWindow.setAlwaysOnTop(false)
      panelWindow.setBounds(primary.bounds)
      activeDisplayId = primary.id
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createPanelWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!rebuilding) app.quit()
  })
}
