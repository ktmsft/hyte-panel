import type { SourceItem } from '@shared/types'
import { getConfig } from '../config'
import { getSecret } from '../secrets'

/**
 * Bluesky's unread count, over the AT Protocol XRPC endpoints.
 *
 * An app password is all this needs: no OAuth, no consent screen, nothing to
 * submit for review. App passwords are made at bsky.app under Settings,
 * Privacy and security, and cannot change the account's real password.
 */

const KEY_APP_PASSWORD = 'bluesky.appPassword'
const TIMEOUT_MS = 10_000

/** How many notifications the Alerts card can list. */
const PREVIEW = 5

export class BlueskyError extends Error {}

interface Session {
  accessJwt: string
  refreshJwt: string
  handle: string
}

/**
 * Held in memory only. The app password is the durable credential, so a lost
 * session costs one extra request rather than a sign-in.
 */
let session: Session | null = null

function service(): string {
  return getConfig().bluesky.service.trim().replace(/\/+$/, '') || 'https://bsky.social'
}

async function xrpc<T>(
  method: string,
  init: RequestInit & { auth?: string } = {}
): Promise<T> {
  const { auth, ...rest } = init
  const response = await fetch(`${service()}/xrpc/${method}`, {
    ...rest,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...rest.headers
    }
  })

  if (response.ok) return (await response.json()) as T

  const text = await response.text()
  let detail = text.slice(0, 200)
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string }
    detail = parsed.message ?? parsed.error ?? detail
  } catch {
    // Not JSON; the raw body is the best available detail.
  }
  throw new BlueskyError(`${method} returned ${response.status}: ${detail}`)
}

async function signIn(): Promise<Session> {
  const handle = getConfig().bluesky.handle.trim().replace(/^@/, '')
  const password = getSecret(KEY_APP_PASSWORD)
  if (!handle) throw new BlueskyError('Add your Bluesky handle in settings first.')
  if (!password) throw new BlueskyError('Add a Bluesky app password in settings first.')

  return xrpc<Session>('com.atproto.server.createSession', {
    method: 'POST',
    body: JSON.stringify({ identifier: handle, password })
  })
}

/**
 * Access tokens are short-lived, so a stale one is refreshed rather than
 * re-authenticated. Anything else falls back to a fresh sign-in, which the app
 * password always allows.
 */
async function authorised(): Promise<string> {
  if (session) return session.accessJwt
  session = await signIn()
  return session.accessJwt
}

async function withSession<T>(run: (token: string) => Promise<T>): Promise<T> {
  try {
    return await run(await authorised())
  } catch (err) {
    const expired = err instanceof BlueskyError && /\b(401|ExpiredToken|InvalidToken)\b/i.test(err.message)
    if (!expired) throw err

    const stale = session
    session = null
    if (stale) {
      try {
        session = await xrpc<Session>('com.atproto.server.refreshSession', {
          method: 'POST',
          auth: stale.refreshJwt
        })
        return await run(session.accessJwt)
      } catch {
        session = null
      }
    }
    return run(await authorised())
  }
}

interface ApiNotification {
  reason?: string
  indexedAt?: string
  author?: { handle?: string; displayName?: string }
  record?: { text?: string }
}

/** Reason codes read as fragments, so they are spelled out for the card. */
const REASON_TEXT: Record<string, string> = {
  like: 'liked your post',
  repost: 'reposted you',
  follow: 'followed you',
  mention: 'mentioned you',
  reply: 'replied to you',
  quote: 'quoted you',
  'starterpack-joined': 'joined your starter pack'
}

function describe(notification: ApiNotification): SourceItem {
  const author =
    notification.author?.displayName?.trim() ||
    (notification.author?.handle ? `@${notification.author.handle}` : 'Someone')
  const what = REASON_TEXT[notification.reason ?? ''] ?? notification.reason ?? 'did something'
  const body = notification.record?.text?.replace(/\s+/g, ' ').trim()

  return {
    title: `${author} ${what}`,
    subtitle: body || undefined,
    at: notification.indexedAt ?? new Date().toISOString()
  }
}

export interface BlueskyResult {
  count: number
  items: SourceItem[]
  handle: string | null
}

export function isConfigured(): boolean {
  return getConfig().bluesky.handle.trim() !== '' && getSecret(KEY_APP_PASSWORD) !== null
}

export function forgetSession(): void {
  session = null
}

export async function fetchUnread(withItems: boolean): Promise<BlueskyResult> {
  const { count } = await withSession((token) =>
    xrpc<{ count: number }>('app.bsky.notification.getUnreadCount', { auth: token })
  )

  if (!withItems || count === 0) {
    return { count, items: [], handle: session?.handle ?? null }
  }

  const page = await withSession((token) =>
    xrpc<{ notifications?: ApiNotification[] }>(
      `app.bsky.notification.listNotifications?limit=${PREVIEW}`,
      { auth: token }
    )
  )

  return {
    count,
    // The list is newest first and includes read ones; the unread are at the top.
    items: (page.notifications ?? []).slice(0, PREVIEW).map(describe),
    handle: session?.handle ?? null
  }
}
