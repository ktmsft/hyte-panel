import type { MicrosoftStatus, Task } from '@shared/types'
import { getConfig } from '../config'
import { AuthError, claimFromIdToken, describe, postToken, signIn, type Endpoints } from '../oauth'
import { encryptionAvailable, getSecret, setSecret } from '../secrets'

/**
 * Microsoft To Do through Graph. A public client with PKCE and no secret, which
 * is all the identity platform asks of a desktop app.
 *
 * Refresh tokens last 90 days and are replaced on every use, so a panel that
 * polls all day never has to sign in again. That is the whole reason tasks went
 * to Microsoft rather than Google, whose unverified apps expire weekly.
 */

// The consumers tenant: personal Microsoft accounts, not work or school.
const ENDPOINTS: Endpoints = {
  authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
}

const GRAPH = 'https://graph.microsoft.com/v1.0'

const SCOPES = ['offline_access', 'openid', 'email', 'Tasks.ReadWrite']

const KEY_REFRESH = 'microsoft.refreshToken'
const KEY_ACCOUNT = 'microsoft.account'

/** How many open tasks the card can use. */
const MAX_TASKS = 50

let access: { token: string; expiresAt: number } | null = null
let refreshing: Promise<string> | null = null
let lastError: string | null = null
let lists: MicrosoftStatus['lists'] = []

export function isConnected(): boolean {
  return getSecret(KEY_REFRESH) !== null
}

export function status(): MicrosoftStatus {
  return {
    hasClientId: getConfig().microsoft.clientId.trim() !== '',
    connected: isConnected(),
    account: getSecret(KEY_ACCOUNT),
    lists,
    encryptionAvailable: encryptionAvailable(),
    lastError
  }
}

function forget(): void {
  setSecret(KEY_REFRESH, null)
  setSecret(KEY_ACCOUNT, null)
  access = null
  lists = []
}

export function disconnect(): void {
  forget()
  lastError = null
}

function clientId(): string {
  const id = getConfig().microsoft.clientId.trim()
  if (!id) throw new AuthError('Add the Microsoft application (client) ID in settings first.')
  return id
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getSecret(KEY_REFRESH)
  if (!refreshToken) throw new AuthError('Not signed in to Microsoft.')

  let token
  try {
    token = await postToken(ENDPOINTS.token, {
      client_id: clientId(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES.join(' ')
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // invalid_grant is terminal: revoked, or unused past the 90 day life.
    if (/invalid_grant|AADSTS70008|AADSTS50173/i.test(message)) {
      forget()
      lastError = 'Microsoft sign-in expired or was revoked. Connect again in settings.'
      throw new AuthError(lastError)
    }
    throw err
  }

  // Every refresh mints a new one and the old is discarded, so it must be kept.
  if (token.refreshToken) setSecret(KEY_REFRESH, token.refreshToken)
  access = { token: token.accessToken, expiresAt: token.expiresAt }
  lastError = null
  return access.token
}

/** Refreshes a minute early, and only once even if several callers ask at once. */
async function getAccessToken(): Promise<string> {
  if (access && access.expiresAt - Date.now() > 60_000) return access.token
  if (!refreshing) {
    refreshing = refreshAccessToken().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const send = async (token: string): Promise<Response> =>
    fetch(`${GRAPH}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers
      }
    })

  let response = await send(await getAccessToken())
  if (response.status === 401) {
    // The cached token may have been revoked. One retry with a fresh one.
    access = null
    response = await send(await getAccessToken())
  }

  if (!response.ok) {
    const detail = describe(await response.text())
    if (response.status === 403) {
      throw new AuthError(`Microsoft withheld a permission this needs. Connect again. (${detail})`)
    }
    throw new Error(`Graph ${path} returned ${response.status}: ${detail}`)
  }

  // DELETE and some PATCHes answer 204 with an empty body.
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export async function connect(): Promise<void> {
  if (!encryptionAvailable()) {
    throw new AuthError('Windows credential encryption is unavailable, so the token cannot be stored.')
  }
  try {
    const token = await signIn(ENDPOINTS, clientId(), SCOPES)
    setSecret(KEY_REFRESH, token.refreshToken)
    setSecret(KEY_ACCOUNT, claimFromIdToken(token.idToken, 'email'))
    access = { token: token.accessToken, expiresAt: token.expiresAt }
    lastError = null
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    throw err
  }
}

// ---------------------------------------------------------------- lists

interface ApiList {
  id: string
  displayName: string
  wellknownListName?: string
}

export async function fetchLists(): Promise<MicrosoftStatus['lists']> {
  const page = await graph<{ value?: ApiList[] }>('/me/todo/lists')
  lists = (page.value ?? []).map((list) => ({
    id: list.id,
    name: list.displayName,
    isDefault: list.wellknownListName === 'defaultList'
  }))
  return lists
}

/** The chosen list, or the account's default one, or simply the first. */
async function activeListId(): Promise<string> {
  const chosen = getConfig().microsoft.listId
  const known = lists.length > 0 ? lists : await fetchLists()
  if (chosen && known.some((list) => list.id === chosen)) return chosen
  const fallback = known.find((list) => list.isDefault) ?? known[0]
  if (!fallback) throw new AuthError('That Microsoft account has no To Do lists.')
  return fallback.id
}

// ---------------------------------------------------------------- tasks

interface ApiTask {
  id: string
  title?: string
  status?: string
  body?: { content?: string; contentType?: string }
  dueDateTime?: { dateTime?: string; timeZone?: string }
}

/**
 * Graph gives a due date as a local-looking timestamp in a named zone. The
 * panel only shows the day, so take the date part rather than converting.
 */
function dueDate(due: ApiTask['dueDateTime']): string | undefined {
  return due?.dateTime?.slice(0, 10) || undefined
}

/** Ids carry their list, so a task can be written back without a second lookup. */
function toTask(task: ApiTask, listId: string): Task {
  const notes = task.body?.content?.trim()
  return {
    id: `ms:${listId}:${task.id}`,
    title: task.title?.trim() || '(untitled)',
    done: task.status === 'completed',
    due: dueDate(task.dueDateTime),
    notes: notes && task.body?.contentType === 'text' ? notes : undefined
  }
}

function split(id: string): { listId: string; taskId: string } | null {
  const match = /^ms:([^:]+):(.+)$/.exec(id)
  return match ? { listId: match[1], taskId: match[2] } : null
}

export async function fetchTasks(): Promise<Task[]> {
  const listId = await activeListId()
  // Completed tasks are dropped by To Do's own view too; the panel matches it.
  const query = `$filter=${encodeURIComponent("status ne 'completed'")}&$top=${MAX_TASKS}`
  const page = await graph<{ value?: ApiTask[] }>(`/me/todo/lists/${listId}/tasks?${query}`)
  return (page.value ?? []).map((task) => toTask(task, listId))
}

export async function addTask(title: string): Promise<void> {
  const listId = await activeListId()
  await graph(`/me/todo/lists/${listId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title })
  })
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const parts = split(id)
  if (!parts) throw new Error(`Not a Microsoft task id: ${id}`)
  await graph(`/me/todo/lists/${parts.listId}/tasks/${parts.taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: done ? 'completed' : 'notStarted' })
  })
}

export async function removeTask(id: string): Promise<void> {
  const parts = split(id)
  if (!parts) throw new Error(`Not a Microsoft task id: ${id}`)
  await graph(`/me/todo/lists/${parts.listId}/tasks/${parts.taskId}`, { method: 'DELETE' })
}
