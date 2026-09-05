import ICAL from 'ical.js'
import type { CalendarEvent } from '@shared/types'

/**
 * Calendars arrive as an iCalendar feed over plain HTTPS. Google calls the URL
 * the "secret address in iCal format": it carries a private token and no other
 * credential, which is why it lives in the vault rather than config.json.
 */

/** A runaway RRULE (no COUNT, no UNTIL) must not spin forever. */
const MAX_OCCURRENCES = 2000

/** Feeds are small, but a wrong URL should fail fast rather than hang the poll. */
const FETCH_TIMEOUT_MS = 20_000

export class FeedError extends Error {}

export interface FeedInfo {
  id: string
  label: string
  color: string
}

export async function fetchFeed(url: string): Promise<string> {
  // Calendar apps hand out webcal://, which is just https by another name.
  const normalised = url.trim().replace(/^webcal:\/\//i, 'https://')
  let parsed: URL
  try {
    parsed = new URL(normalised)
  } catch {
    throw new FeedError('That is not a valid calendar URL.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new FeedError(`Unsupported calendar URL scheme ${parsed.protocol}`)
  }

  const response = await fetch(parsed, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  if (!response.ok) {
    // A revoked or mistyped secret address comes back 404, not 401.
    const hint = response.status === 404 ? ' The secret address may have been reset in Google Calendar.' : ''
    throw new FeedError(`The calendar feed returned ${response.status}.${hint}`)
  }

  const text = await response.text()
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new FeedError('That URL did not return a calendar. Check it is the iCal address, not the web link.')
  }
  return text
}

/**
 * Date-only values have no zone, so `toJSDate` reads them as UTC midnight and
 * lands on the wrong day west of Greenwich. Build local midnight by hand.
 */
function toIso(time: ICAL.Time): string {
  if (time.isDate) return new Date(time.year, time.month - 1, time.day).toISOString()
  return time.toJSDate().toISOString()
}

/** Registers the feed's own VTIMEZONE blocks so TZID references resolve. */
function registerTimezones(calendar: ICAL.Component): void {
  for (const vtimezone of calendar.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(vtimezone)
    // Registers under the zone's own tzid. Argument order matters: the
    // (name, zone) form only still works through a compat shim due for removal.
    if (zone.tzid && !ICAL.TimezoneService.has(zone.tzid)) {
      ICAL.TimezoneService.register(zone)
    }
  }
}

function build(
  event: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  feed: FeedInfo
): CalendarEvent {
  const startIso = toIso(start)
  return {
    // Same meeting on two feeds should stay two rows, hence the feed prefix.
    id: `${feed.id}:${event.uid}:${startIso}`,
    title: event.summary?.trim() || '(no title)',
    start: startIso,
    end: toIso(end),
    allDay: start.isDate,
    // A room name fits the panel; a full street address does not.
    location: event.location?.split(',')[0]?.trim() || undefined,
    calendarColor: feed.color
  }
}

export function parseFeed(text: string, feed: FeedInfo, from: Date, to: Date): CalendarEvent[] {
  let calendar: ICAL.Component
  try {
    calendar = new ICAL.Component(ICAL.parse(text))
  } catch (err) {
    throw new FeedError(`Could not read the calendar feed: ${err instanceof Error ? err.message : String(err)}`)
  }

  registerTimezones(calendar)

  const all = calendar.getAllSubcomponents('vevent').map((component) => new ICAL.Event(component))
  const masters = all.filter((event) => !event.isRecurrenceException())
  const overrides = all.filter((event) => event.isRecurrenceException())

  // A moved or cancelled occurrence is a separate VEVENT tied back by UID.
  for (const master of masters) {
    for (const override of overrides) {
      if (override.uid === master.uid) master.relateException(override)
    }
  }

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const events: CalendarEvent[] = []

  for (const event of masters) {
    if (event.component.getFirstPropertyValue('status') === 'CANCELLED') continue

    if (!event.isRecurring()) {
      if (event.endDate.toJSDate().getTime() >= fromMs && event.startDate.toJSDate().getTime() <= toMs) {
        events.push(build(event, event.startDate, event.endDate, feed))
      }
      continue
    }

    const iterator = event.iterator()
    for (let seen = 0; seen < MAX_OCCURRENCES; seen++) {
      const next = iterator.next()
      if (!next) break
      if (next.toJSDate().getTime() > toMs) break

      const occurrence = event.getOccurrenceDetails(next)
      if (occurrence.endDate.toJSDate().getTime() < fromMs) continue
      events.push(build(occurrence.item, occurrence.startDate, occurrence.endDate, feed))
    }
  }

  // An override whose master sits outside the window still belongs on screen.
  const known = new Set(events.map((event) => event.id))
  for (const override of overrides) {
    const startMs = override.startDate.toJSDate().getTime()
    if (override.endDate.toJSDate().getTime() < fromMs || startMs > toMs) continue
    const candidate = build(override, override.startDate, override.endDate, feed)
    if (!known.has(candidate.id)) events.push(candidate)
  }

  return events
}

export async function fetchEvents(url: string, feed: FeedInfo, days: number): Promise<CalendarEvent[]> {
  const from = new Date()
  const to = new Date(Date.now() + days * 86_400_000)
  return parseFeed(await fetchFeed(url), feed, from, to)
}
