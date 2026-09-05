import type { Health, Task } from '@shared/types'
import { getConfig } from '../config'
import { AuthError } from '../oauth'
import {
  addTask as localAdd,
  getState,
  removeTask as localRemove,
  setTasks,
  toggleTask as localToggle
} from '../state'
import * as microsoft from './microsoft'

/**
 * Routes task edits to whichever backend is selected. Microsoft edits are
 * applied to the panel first and sent afterwards: a touch panel that waits
 * ~300ms on Graph before ticking a checkbox feels broken. The refresh that
 * follows puts things right if the write did not land.
 */

function usingMicrosoft(): boolean {
  return getConfig().taskProvider === 'microsoft' && microsoft.isConnected()
}

function health(err: unknown, hadData: boolean): Health {
  if (hadData) return 'stale'
  return err instanceof AuthError ? 'setup-needed' : 'error'
}

export async function refreshTasks(): Promise<void> {
  if (getConfig().taskProvider !== 'microsoft') return
  if (!microsoft.isConnected()) {
    setTasks(null, 'unconfigured')
    return
  }

  const hadData = getState().tasks.length > 0
  try {
    const tasks = await microsoft.fetchTasks()
    setTasks(tasks, 'ok')
  } catch (err) {
    console.error('[tasks]', err instanceof Error ? err.message : err)
    setTasks(null, health(err, hadData))
  }
}

/** Local tasks are the fallback whenever Microsoft is not the live provider. */
export async function addTask(title: string): Promise<void> {
  const trimmed = title.trim()
  if (!trimmed) return
  if (!usingMicrosoft()) {
    localAdd(trimmed)
    return
  }

  localAdd(trimmed)
  try {
    await microsoft.addTask(trimmed)
  } catch (err) {
    console.error('[tasks] add failed:', err instanceof Error ? err.message : err)
  }
  await refreshTasks()
}

export async function toggleTask(id: string): Promise<void> {
  const wanted = !getState().tasks.find((task) => task.id === id)?.done
  localToggle(id)
  if (!usingMicrosoft() || !id.startsWith('ms:')) return

  try {
    await microsoft.setTaskDone(id, wanted)
  } catch (err) {
    console.error('[tasks] toggle failed:', err instanceof Error ? err.message : err)
  }
  await refreshTasks()
}

export async function removeTask(id: string): Promise<void> {
  localRemove(id)
  if (!usingMicrosoft() || !id.startsWith('ms:')) return

  try {
    await microsoft.removeTask(id)
  } catch (err) {
    console.error('[tasks] remove failed:', err instanceof Error ? err.message : err)
  }
  await refreshTasks()
}

export type { Task }
