import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { HyteApi } from '@shared/api'
import type { AppConfig, FeedsStatus, MicrosoftStatus, PanelState } from '@shared/types'

const api: HyteApi = {
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  onStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: PanelState): void => callback(state)
    ipcRenderer.on(IPC.stateChanged, handler)
    return () => {
      ipcRenderer.off(IPC.stateChanged, handler)
    }
  },
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  setConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke(IPC.configSet, patch),
  onConfigChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, config: AppConfig): void => callback(config)
    ipcRenderer.on(IPC.configChanged, handler)
    return () => {
      ipcRenderer.off(IPC.configChanged, handler)
    }
  },
  feedsStatus: () => ipcRenderer.invoke(IPC.feedsStatus),
  onFeedsStatusChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, status: FeedsStatus): void => callback(status)
    ipcRenderer.on(IPC.feedsStatusChanged, handler)
    return () => {
      ipcRenderer.off(IPC.feedsStatusChanged, handler)
    }
  },
  calendarAdd: (label: string, url: string) => ipcRenderer.invoke(IPC.calendarAdd, label, url),
  calendarSetUrl: (id: string, url: string) => ipcRenderer.invoke(IPC.calendarSetUrl, id, url),
  calendarRemove: (id: string) => ipcRenderer.invoke(IPC.calendarRemove, id),
  mailSetPassword: (password: string) => ipcRenderer.invoke(IPC.mailSetPassword, password),
  feedsRefresh: () => ipcRenderer.invoke(IPC.feedsRefresh),
  microsoftStatus: () => ipcRenderer.invoke(IPC.microsoftStatus),
  onMicrosoftStatusChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, status: MicrosoftStatus): void => callback(status)
    ipcRenderer.on(IPC.microsoftStatusChanged, handler)
    return () => {
      ipcRenderer.off(IPC.microsoftStatusChanged, handler)
    }
  },
  microsoftConnect: () => ipcRenderer.invoke(IPC.microsoftConnect),
  microsoftDisconnect: () => ipcRenderer.invoke(IPC.microsoftDisconnect),
  microsoftLists: () => ipcRenderer.invoke(IPC.microsoftLists),
  listDisplays: () => ipcRenderer.invoke(IPC.displaysList),
  setDisplay: (displayId: number) => ipcRenderer.invoke(IPC.panelSetDisplay, displayId),
  focusPanel: () => ipcRenderer.invoke(IPC.panelFocus),
  openSettings: () => ipcRenderer.invoke(IPC.settingsOpen),
  closeSettings: () => ipcRenderer.invoke(IPC.settingsClose),
  addTask: (title: string) => ipcRenderer.invoke(IPC.taskAdd, title),
  toggleTask: (id: string) => ipcRenderer.invoke(IPC.taskToggle, id),
  removeTask: (id: string) => ipcRenderer.invoke(IPC.taskRemove, id),
  quit: () => ipcRenderer.invoke(IPC.appQuit)
}

contextBridge.exposeInMainWorld('hyte', api)
