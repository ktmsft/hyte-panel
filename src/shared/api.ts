import type { AppConfig, DisplayInfo, FeedsStatus, PanelState } from './types'

/** The complete surface the renderer is allowed to reach. Nothing else crosses the bridge. */
export interface HyteApi {
  getState(): Promise<PanelState>
  /** Returns an unsubscribe function. */
  onStateChanged(callback: (state: PanelState) => void): () => void
  getConfig(): Promise<AppConfig>
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  /** Fires in every window when any window changes settings. Returns an unsubscribe function. */
  onConfigChanged(callback: (config: AppConfig) => void): () => void
  feedsStatus(): Promise<FeedsStatus>
  /** Fires whenever a feed credential changes. Returns an unsubscribe function. */
  onFeedsStatusChanged(callback: (status: FeedsStatus) => void): () => void
  /** Adds a calendar and stores its secret URL, which never comes back out. */
  calendarAdd(label: string, url: string): Promise<FeedsStatus>
  calendarSetUrl(id: string, url: string): Promise<FeedsStatus>
  calendarRemove(id: string): Promise<FeedsStatus>
  /** Stored in the OS-encrypted vault. An empty string keeps the saved one. */
  mailSetPassword(password: string): Promise<FeedsStatus>
  feedsRefresh(): Promise<void>
  listDisplays(): Promise<DisplayInfo[]>
  setDisplay(displayId: number): Promise<DisplayInfo[]>
  openSettings(): Promise<void>
  closeSettings(): Promise<void>
  addTask(title: string): Promise<PanelState>
  toggleTask(id: string): Promise<PanelState>
  removeTask(id: string): Promise<PanelState>
  quit(): Promise<void>
}

declare global {
  interface Window {
    hyte: HyteApi
  }
}
