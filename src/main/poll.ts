import type { Health } from '@shared/types'
import { getConfig } from './config'
import { fetchEvents, FeedError } from './feeds/calendar'
import { fetchMail } from './feeds/mail'
import { calendarUrl, noteCalendar, noteMailError } from './feeds/store'
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

  // Each feed is recorded on its own, so settings can say which one is broken
  // rather than reporting one error for the lot.
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const events = await fetchEvents(
          feed.url,
          { id: feed.id, label: feed.label, color: feed.color },
          calendarDays
        )
        noteCalendar(feed.id, null, events.length)
        return events
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[calendar] ${feed.label}:`, message)
        noteCalendar(feed.id, message, 0)
        return null
      }
    })
  )

  const events = results.flatMap((result) => result ?? [])
  const failed = results.filter((result) => result === null).length

  if (failed === results.length) {
    setEvents(null, failure(new FeedError('every calendar failed'), hadData).health)
    return
  }

  goLive()
  // Fresh events from the feeds that worked. Saying `stale` here would claim
  // the data is old, when really it is only incomplete.
  setEvents(
    events.sort((a, b) => a.start.localeCompare(b.start)),
    'ok',
    failed > 0 ? `${failed} of ${results.length} calendars failed` : null
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
    noteMailError(null)
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
    noteMailError(message)
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
