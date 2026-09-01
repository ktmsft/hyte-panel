import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { HyteApi } from '@shared/api'
import type { AppConfig, PanelState } from '@shared/types'

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
  listDisplays: () => ipcRenderer.invoke(IPC.displaysList),
  setDisplay: (displayId: number) => ipcRenderer.invoke(IPC.panelSetDisplay, displayId),
  openSettings: () => ipcRenderer.invoke(IPC.settingsOpen),
  closeSettings: () => ipcRenderer.invoke(IPC.settingsClose),
  addTask: (title: string) => ipcRenderer.invoke(IPC.taskAdd, title),
  toggleTask: (id: string) => ipcRenderer.invoke(IPC.taskToggle, id),
  removeTask: (id: string) => ipcRenderer.invoke(IPC.taskRemove, id),
  quit: () => ipcRenderer.invoke(IPC.appQuit)
}

contextBridge.exposeInMainWorld('hyte', api)
