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

  panelWindow = new BrowserWindow({
    x: WINDOWED ? undefined : x,
    y: WINDOWED ? undefined : y,
    width: WINDOWED ? 1280 : width,
    height: WINDOWED ? 341 : height,
    frame: WINDOWED,
    fullscreen: !WINDOWED,
    // Only pin above other windows once we are confident we are on the case panel,
    // otherwise a mis-detection would park an always-on-top window over the desktop.
    alwaysOnTop: !WINDOWED && detected,
    backgroundColor: '#07090c',
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

  panelWindow.once('ready-to-show', () => panelWindow?.show())
  panelWindow.on('closed', () => {
    panelWindow = null
    activeDisplayId = null
  })

  // Keep navigation inside the app. External links go to the real browser.
  panelWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!detected) {
    console.warn(
      `[display] No panel matching ${config.displayMatch.width}x${config.displayMatch.height} found. ` +
        'Opening on the primary display. Pick the right one in settings.'
    )
  }

  loadRoute(panelWindow, 'panel')
}

function movePanelToDisplay(displayId: number): void {
  const display = screen.getAllDisplays().find((d) => d.id === displayId)
  if (!display || !panelWindow) return

  setConfig({ displayId })
  activeDisplayId = display.id

  const { x, y, width, height } = display.bounds
  panelWindow.setFullScreen(false)
  panelWindow.setBounds({ x, y, width, height })
  if (!WINDOWED) {
    panelWindow.setFullScreen(true)
    panelWindow.setAlwaysOnTop(true)
  }
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  // Settings deliberately open on the primary monitor. Typing an app password on
  // a 682px-tall on-screen keyboard is not something anyone should have to do.
  const primary = screen.getPrimaryDisplay()
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 760,
    x: Math.round(primary.bounds.x + (primary.bounds.width - 900) / 2),
    y: Math.round(primary.bounds.y + (primary.bounds.height - 760) / 2),
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

function registerIpc(): void {
  ipcMain.handle(IPC.stateGet, () => getState())
  ipcMain.handle(IPC.configGet, () => getConfig())
  ipcMain.handle(IPC.configSet, (_event, patch: Partial<AppConfig>) => {
    const next = setConfig(patch)
    app.setLoginItemSettings({ openAtLogin: next.autostart })
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

function broadcastState(): void {
  subscribe((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC.stateChanged, state)
    }
  })
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
    broadcastState()
    createPanelWindow()

    // The case panel is often slower to enumerate than the desktop monitors at
    // boot, and it disappears entirely if the DisplayPort cable is pulled.
    screen.on('display-added', () => {
      const config = getConfig()
      const { display, detected } = findPanelDisplay(config)
      if (detected && display.id !== activeDisplayId) movePanelToDisplay(display.id)
    })

    screen.on('display-removed', (_event, removed) => {
      if (removed.id !== activeDisplayId || !panelWindow) return
      const primary = screen.getPrimaryDisplay()
      panelWindow.setAlwaysOnTop(false)
      panelWindow.setFullScreen(false)
      panelWindow.setBounds(primary.bounds)
      activeDisplayId = primary.id
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createPanelWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
