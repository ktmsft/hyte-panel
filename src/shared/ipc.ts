/** Channel names shared by main and preload so a typo fails the build, not the app. */
export const IPC = {
  stateGet: 'state:get',
  stateChanged: 'state:changed',
  configGet: 'config:get',
  configSet: 'config:set',
  configChanged: 'config:changed',
  displaysList: 'displays:list',
  panelSetDisplay: 'panel:set-display',
  settingsOpen: 'settings:open',
  settingsClose: 'settings:close',
  taskAdd: 'task:add',
  taskToggle: 'task:toggle',
  taskRemove: 'task:remove',
  appQuit: 'app:quit'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
