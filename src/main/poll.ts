import type { CalendarEvent, Health } from '@shared/types'
import { getConfig } from './config'
import { fetchEvents, FeedError } from './feeds/calendar'
import { fetchMail } from './feeds/mail'
import { calendarUrl, noteError } from './feeds/store'
import { ImapError } from './imap'
import { getState, goLive, setEvents, setSource } from './state'

/**
 * Refresh loops for the calendar feeds and the mail account. Calendar moves
 * slowly; the unread number is the one people watch, so it runs more often.
 */

const CALENDAR_MS = 5 * 60_000
const MAIL_MS = 2 * 60_000

let calendarTimer: NodeJS.Timeout | null = null
let mailTimer: NodeJS.Timeout | null = null

/**
 * Data already on screen is dimmed rather than blanked on a first failure.
 * With nothing to show, anything our own adapters recognised is something the
 * user has to go and fix; everything else is a plain error.
 */
function failure(err: unknown, hadData: boolean): { health: Health; message: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (hadData) return { health: 'stale', message }
  const known = err instanceof FeedError || err instanceof ImapError
  return { health: known ? 'setup-needed' : 'error', message }
}

/** Feeds that are switched on and have a secret URL saved. */
function activeCalendars(): { id: string; label: string; color: string; url: string }[] {
  return getConfig()
    .feeds.calendars.filter((feed) => feed.enabled)
    .map((feed) => ({ ...feed, url: calendarUrl(feed.id) ?? '' }))
    .filter((feed) => feed.url !== '')
}

async function pollCalendar(): Promise<void> {
  const feeds = activeCalendars()
  const { calendarDays } = getConfig().feeds

  if (feeds.length === 0) {
    if (!getState().mock) setEvents([], 'unconfigured')
    return
  }

  const hadData = getState().events.length > 0
  const results = await Promise.allSettled(
    feeds.map((feed) => fetchEvents(feed.url, { id: feed.id, label: feed.label, color: feed.color }, calendarDays))
  )

  const events: CalendarEvent[] = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )
  const failed = results.filter((result) => result.status === 'rejected')

  // One broken feed should not blank an agenda the others can still fill.
  if (failed.length === results.length) {
    const { health, message } = failure(
      (failed[0] as PromiseRejectedResult | undefined)?.reason,
      hadData
    )
    console.error('[calendar]', message)
    noteError(message)
    setEvents(null, health)
    return
  }

  if (failed.length > 0) {
    const reason = (failed[0] as PromiseRejectedResult).reason
    console.warn('[calendar] one feed failed:', reason instanceof Error ? reason.message : reason)
  }

  goLive()
  noteError(null)
  setEvents(
    events.sort((a, b) => a.start.localeCompare(b.start)),
    failed.length > 0 ? 'stale' : 'ok'
  )
}

async function pollMail(): Promise<void> {
  const { mail, mailDetail } = getConfig().feeds
  const enabled = mail.enabled && getConfig().sources.gmail.enabled

  if (!enabled || !mail.user.trim()) {
    if (!getState().mock) {
      setSource('gmail', {
        health: 'unconfigured',
        count: 0,
        items: [],
        checkedAt: null,
        message: 'Not connected yet'
      })
    }
    return
  }

  const hadData = getState().sources.some((source) => source.id === 'gmail' && source.checkedAt !== null)
  try {
    const { count, items } = await fetchMail(mail, mailDetail)
    goLive()
    setSource('gmail', {
      health: 'ok',
      count,
      items,
      checkedAt: new Date().toISOString(),
      message: undefined
    })
  } catch (err) {
    const { health, message } = failure(err, hadData)
    console.error('[mail]', message)
    noteError(message)
    setSource('gmail', { health, message })
  }
}

export function refreshNow(): void {
  void pollCalendar()
  void pollMail()
}

export function stopPolling(): void {
  if (calendarTimer) clearInterval(calendarTimer)
  if (mailTimer) clearInterval(mailTimer)
  calendarTimer = null
  mailTimer = null
}

/** Safe to call repeatedly: it restarts the loops and refreshes straight away. */
export function startPolling(): void {
  stopPolling()
  calendarTimer = setInterval(() => void pollCalendar(), CALENDAR_MS)
  mailTimer = setInterval(() => void pollMail(), MAIL_MS)
  refreshNow()
}
