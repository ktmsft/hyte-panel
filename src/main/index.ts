import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import type { AppConfig, MailAccountId, PictureSource, SourceId } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getConfig, setConfig } from './config'
import { findPanelDisplay, listDisplays } from './display'
import {
  feedsStatus,
  migrateSecrets,
  noteError,
  onFeedsChanged,
  setBlueskyPassword,
  setCalendarUrl,
  setMailPassword
} from './feeds/store'
import { refreshNow, startPolling } from './poll'
import { handleMediaRequests, listPictures, registerMediaScheme } from './media'
import { forgetSession } from './sources/bluesky'
import { applyPanelTaskbar, restorePanelTaskbar } from './taskbar'
import { getState, subscribe, syncSourcesEnabled, syncTaskProvider } from './state'
import { addTask, refreshTasks, removeTask, toggleTask } from './tasks'
import * as microsoft from './tasks/microsoft'

/**
 * Above ordinary topmost windows. HYTE Nexus wants this display too and also
 * asks to be on top, which made it last-writer-wins and cost the panel its own
 * screen at random. This band outranks a plain topmost window outright.
 *
 * Safe despite the name: the window is pinned to the panel's bounds, so it can
 * never cover anything on another display.
 */
const PANEL_Z_LEVEL = 'screen-saver' as const

/** Nexus reclaims the display on its own schedule, so this is re-applied. */
const KEEP_ON_TOP_MS = 30_000

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
  thisWindow.once('ready-to-show', () => {
    thisWindow.show()
    if (!WINDOWED) {
      // Windows clamps a new window to the work area, which left a strip along
      // the bottom where the taskbar used to be. Re-applying the display's own
      // bounds takes the whole screen.
      thisWindow.setBounds(display.bounds)
      assertPanelOnTop()
    }
  })
  thisWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[panel] renderer gone:', details.reason)
  })
  thisWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.error('[panel renderer]', message)
  })
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
 * Everything a refresh actually depends on. Labels are left out on purpose:
 * they are typed a character at a time and change nothing that is fetched.
 */
function refreshKey(config: AppConfig): string {
  const { feeds } = config
  return JSON.stringify({
    days: feeds.calendarDays,
    detail: feeds.mailDetail,
    mail: feeds.mail,
    calendars: feeds.calendars.map((feed) => [feed.id, feed.enabled, feed.color])
  })
}

/** Re-claims the panel display. Cheap, in-process, and does not steal focus. */
function assertPanelOnTop(): void {
  if (WINDOWED || !panelWindow || panelWindow.isDestroyed()) return
  if (!getConfig().alwaysOnTop) return
  panelWindow.setAlwaysOnTop(true, PANEL_Z_LEVEL)
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
  panelWindow.setAlwaysOnTop(getConfig().alwaysOnTop, PANEL_Z_LEVEL)
  syncPanelTaskbar()
}

function openSettingsWindow(): void {
  // A destroyed window left in this handle used to throw here, which the
  // renderer's `void` swallowed: no settings window, and nothing logged.
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = null
  console.log('[settings] opening')

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

  // Without these a renderer that fails to load leaves a window that never
  // fires ready-to-show, so nothing appears and nothing is said.
  settingsWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[settings] failed to load ${url}: ${description} (${code})`)
    settingsWindow?.show()
  })
  settingsWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[settings] renderer gone:', details.reason)
  })
  settingsWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.error('[settings renderer]', message)
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
    // Renaming a calendar used to refetch every feed on each keystroke.
    if (refreshKey(previous) !== refreshKey(next)) refreshNow()
  }
  if (previous.hideTaskbar !== next.hideTaskbar) syncPanelTaskbar()
  if (JSON.stringify(previous.stats) !== JSON.stringify(next.stats)) refreshNow()
  if (previous.panels.stats !== next.panels.stats) refreshNow()
  if (previous.taskProvider !== next.taskProvider) {
    syncTaskProvider()
    void refreshTasks()
  }
  if (previous.microsoft.listId !== next.microsoft.listId) void refreshTasks()
  if (JSON.stringify(previous.bluesky) !== JSON.stringify(next.bluesky)) {
    forgetSession()
    refreshNow()
  }
  if (previous.microsoft.clientId !== next.microsoft.clientId) {
    broadcast(IPC.microsoftStatusChanged, microsoft.status())
  }

  if (previous.glassMode !== next.glassMode) {
    // Transparency is fixed at construction. Everything else applies live.
    rebuildPanelWindow()
    return
  }

  if (panelWindow && !WINDOWED) {
    if (previous.alwaysOnTop !== next.alwaysOnTop) {
      panelWindow.setAlwaysOnTop(next.alwaysOnTop, PANEL_Z_LEVEL)
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
  ipcMain.handle(IPC.mailSetPassword, (_event, id: MailAccountId, password: string) =>
    withFeedWrite(() => {
      if (password.trim()) setMailPassword(id, password)
    })
  )
  ipcMain.handle(IPC.blueskySetPassword, (_event, password: string) =>
    withFeedWrite(() => {
      if (password.trim()) setBlueskyPassword(password)
    })
  )
  ipcMain.handle(IPC.feedsRefresh, () => refreshNow())
  ipcMain.handle(IPC.microsoftStatus, () => microsoft.status())
  // Connect and disconnect report failure through `status.lastError` rather
  // than rejecting, so settings shows a sentence instead of an IPC trace.
  ipcMain.handle(IPC.microsoftConnect, async () => {
    try {
      await microsoft.connect()
      await microsoft.fetchLists()
    } catch (err) {
      console.error('[microsoft] sign-in failed:', err)
    }
    await refreshTasks()
    const status = microsoft.status()
    broadcast(IPC.microsoftStatusChanged, status)
    return status
  })
  ipcMain.handle(IPC.microsoftDisconnect, async () => {
    microsoft.disconnect()
    await refreshTasks()
    const status = microsoft.status()
    broadcast(IPC.microsoftStatusChanged, status)
    return status
  })
  ipcMain.handle(IPC.microsoftLists, async () => {
    try {
      await microsoft.fetchLists()
    } catch (err) {
      console.error('[microsoft] could not read lists:', err)
    }
    const status = microsoft.status()
    broadcast(IPC.microsoftStatusChanged, status)
    return status
  })
  ipcMain.handle(IPC.panelFocus, () => {
    if (!panelWindow || panelWindow.isDestroyed()) return
    // show() before focus(): a window kept above others is not necessarily the
    // active one, and only the active window receives keystrokes.
    panelWindow.show()
    panelWindow.focus()
  })
  ipcMain.handle(IPC.sourceLaunch, async (_event, id: SourceId) => {
    const target = getConfig().launch[id]?.trim()
    if (!target) return
    try {
      // Anything with a scheme is for the shell to route, which is what makes
      // discord:// open the app rather than the website. The rest is a path.
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
        await shell.openExternal(target)
      } else {
        const problem = await shell.openPath(target)
        if (problem) console.error('[launch]', problem)
      }
    } catch (err) {
      console.error('[launch]', err instanceof Error ? err.message : err)
    }
  })
  ipcMain.handle(IPC.pictureChoose, async (_event, source: PictureSource) => {
    const result = await dialog.showOpenDialog({
      title: source === 'folder' ? 'Choose a folder of pictures' : 'Choose a picture',
      properties: [source === 'folder' ? 'openDirectory' : 'openFile'],
      filters:
        source === 'folder'
          ? undefined
          : [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] }]
    })
    const chosen = result.canceled ? null : result.filePaths[0]
    if (!chosen) return getConfig()

    const previous = getConfig()
    const next = setConfig({ image: { ...previous.image, source, path: chosen } })
    applyConfig(previous, next)
    broadcast(IPC.configChanged, next)
    return next
  })
  ipcMain.handle(IPC.pictureList, () => listPictures())
  ipcMain.handle(IPC.settingsOpen, () => {
    try {
      openSettingsWindow()
    } catch (err) {
      // Never let this reject silently again.
      console.error('[settings] could not open:', err)
    }
  })
  ipcMain.handle(IPC.settingsClose, () => settingsWindow?.close())
  // These now reach a backend, so they answer once the write is on its way.
  ipcMain.handle(IPC.taskAdd, async (_event, title: string) => {
    await addTask(title)
    return getState()
  })
  ipcMain.handle(IPC.taskToggle, async (_event, id: string) => {
    await toggleTask(id)
    return getState()
  })
  ipcMain.handle(IPC.taskRemove, async (_event, id: string) => {
    await removeTask(id)
    return getState()
  })
  ipcMain.handle(IPC.appQuit, () => app.quit())
}

registerMediaScheme()

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
    // The single mailbox became named ones; move the old password across.
    migrateSecrets()

    handleMediaRequests()
    registerIpc()
    subscribe((state) => broadcast(IPC.stateChanged, state))
    // A refresh result is news for the settings window too.
    onFeedsChanged(() => broadcast(IPC.feedsStatusChanged, feedsStatus()))
    createPanelWindow()
    syncTaskProvider()
    // Lists are needed before tasks can be read, and warm the settings picker.
    if (microsoft.isConnected()) {
      void microsoft.fetchLists().then(() => broadcast(IPC.microsoftStatusChanged, microsoft.status()))
    }
    startPolling()
    syncPanelTaskbar()
    setInterval(assertPanelOnTop, KEEP_ON_TOP_MS).unref()

    // The panel enumerates late at boot and vanishes if unplugged.
    // A shell that rebuilds its taskbars undoes the hiding, and these are the
    // moments it most often does.
    screen.on('display-added', () => {
      const { display, detected } = findPanelDisplay(getConfig())
      if (detected && display.id !== activeDisplayId) movePanelToDisplay(display.id)
      syncPanelTaskbar()
    })

    screen.on('display-metrics-changed', () => {
      syncPanelTaskbar()
      assertPanelOnTop()
    })

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
