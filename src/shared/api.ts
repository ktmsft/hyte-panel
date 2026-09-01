import type { AppConfig, DisplayInfo, PanelState } from './types'

/** The complete surface the renderer is allowed to reach. Nothing else crosses the bridge. */
export interface HyteApi {
  getState(): Promise<PanelState>
  /** Returns an unsubscribe function. */
  onStateChanged(callback: (state: PanelState) => void): () => void
  getConfig(): Promise<AppConfig>
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  /** Fires in every window when any window changes settings. Returns an unsubscribe function. */
  onConfigChanged(callback: (config: AppConfig) => void): () => void
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
