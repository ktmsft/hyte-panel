import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { SourceItem } from '@shared/types'

/**
 * Reads Windows' notification store: the toasts sitting in Action Center, for
 * any app. This supplies the list of what arrived; the count comes from the
 * taskbar badge instead, see badge.ts.
 *
 * The alternative was UserNotificationListener, which wants package identity —
 * a sparse MSIX, a certificate and a WinRT helper — for the same data.
 */

const DB_PATH = join(
  process.env.LOCALAPPDATA ?? '',
  'Microsoft',
  'Windows',
  'Notifications',
  'wpndatabase.db'
)

/** Windows counts 100ns ticks from 1601; JavaScript counts milliseconds from 1970. */
const FILETIME_EPOCH_MS = 11644473600000n

export interface NotificationSummary {
  count: number
  items: SourceItem[]
  /** False when the app has never registered with Windows notifications. */
  known: boolean
}

interface Row {
  app: string
  arrival: bigint
  payload: unknown
}

/**
 * Payloads are stored as the decimal bytes of the XML, comma separated, rather
 * than as the XML itself.
 */
function decodePayload(payload: unknown): string {
  const raw = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload ?? '')
  if (!/^\d+(,\d+)*$/.test(raw.trim())) return raw
  return Buffer.from(raw.split(',').map((byte) => Number(byte) & 0xff)).toString('utf8')
}

/** Toast XML puts the title in the first text node and the body in the rest. */
function textNodes(xml: string): string[] {
  return [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) =>
      match[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim()
    )
    .filter(Boolean)
}

function toIso(arrival: bigint): string {
  return new Date(Number(arrival / 10000n - FILETIME_EPOCH_MS)).toISOString()
}

/**
 * Reads the notifications an app currently has waiting. `match` is tested
 * against the app's AUMID, so Discord, its PTB and Canary builds all count.
 *
 * Returns null only when the store cannot be read at all.
 */
export function readNotifications(match: RegExp, limit: number): NotificationSummary | null {
  if (!DB_PATH || !existsSync(DB_PATH)) return null

  // The service holds the file open, so it is opened read-only and immutable
  // rather than copied on every poll.
  const uri = `file:${DB_PATH.split(sep).join('/')}?immutable=1`
  let db: DatabaseSync
  try {
    db = new DatabaseSync(uri, { readOnly: true })
  } catch {
    return null
  }

  try {
    const handlers = db.prepare('SELECT RecordId, PrimaryId FROM NotificationHandler').all() as {
      RecordId: number
      PrimaryId: string
    }[]
    const wanted = handlers.filter((handler) => match.test(handler.PrimaryId ?? ''))
    if (wanted.length === 0) return { count: 0, items: [], known: false }

    const ids = wanted.map((handler) => handler.RecordId)
    const statement = db.prepare(
      `SELECT h.PrimaryId AS app, n.ArrivalTime AS arrival, n.Payload AS payload
         FROM Notification n
         JOIN NotificationHandler h ON n.HandlerId = h.RecordId
        WHERE n.HandlerId IN (${ids.map(() => '?').join(',')})
        ORDER BY n.ArrivalTime DESC`
    )
    // Arrival times are past the range a JavaScript number can hold exactly.
    statement.setReadBigInts(true)
    const rows = statement.all(...ids) as unknown as Row[]

    const items: SourceItem[] = rows.slice(0, limit).map((row) => {
      const texts = textNodes(decodePayload(row.payload))
      return {
        title: texts[0] || 'Notification',
        subtitle: texts.slice(1).join(' ') || undefined,
        at: toIso(row.arrival)
      }
    })

    return { count: rows.length, items, known: true }
  } catch (err) {
    console.error('[notifications]', err instanceof Error ? err.message : err)
    return null
  } finally {
    db.close()
  }
}
