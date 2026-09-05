/**
 * Spot-checks the iCalendar parser against the cases that are easy to get
 * wrong: all-day boundaries, a named timezone, recurrence with an exception and
 * a moved occurrence, and a cancelled event.
 *
 *   node scripts/ics-check.ts
 */
import { parseFeed } from '../src/main/feeds/calendar.ts'

const FEED = { id: 'test', label: 'Test', color: '#7aa2f7' }

/** YYYYMMDD for a day offset from today, in local time. */
function day(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:allday-1
SUMMARY:Conference
DTSTART;VALUE=DATE:${day(1)}
DTEND;VALUE=DATE:${day(2)}
END:VEVENT
BEGIN:VEVENT
UID:zoned-1
SUMMARY:Design review
LOCATION:Room 4, 100 Long Street, Springfield, IL
DTSTART;TZID=America/Chicago:${day(1)}T140000
DTEND;TZID=America/Chicago:${day(1)}T150000
END:VEVENT
BEGIN:VEVENT
UID:standup-1
SUMMARY:Standup
DTSTART;TZID=America/Chicago:${day(0)}T090000
DTEND;TZID=America/Chicago:${day(0)}T091500
RRULE:FREQ=DAILY;COUNT=6
EXDATE;TZID=America/Chicago:${day(2)}T090000
END:VEVENT
BEGIN:VEVENT
UID:standup-1
RECURRENCE-ID;TZID=America/Chicago:${day(3)}T090000
SUMMARY:Standup (moved)
DTSTART;TZID=America/Chicago:${day(3)}T110000
DTEND;TZID=America/Chicago:${day(3)}T111500
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
SUMMARY:Should not appear
STATUS:CANCELLED
DTSTART;TZID=America/Chicago:${day(1)}T160000
DTEND;TZID=America/Chicago:${day(1)}T170000
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n')

const from = new Date()
from.setHours(0, 0, 0, 0)
const to = new Date(from.getTime() + 7 * 86_400_000)

const events = parseFeed(ICS, FEED, from, to)

let failures = 0
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

console.log(`\nparsed ${events.length} events\n`)
for (const event of events) {
  const when = new Date(event.start)
  console.log(
    `  ${when.toLocaleString()}  ${event.allDay ? '[all day] ' : ''}${event.title}` +
      `${event.location ? `  @ ${event.location}` : ''}`
  )
}
console.log()

const allDay = events.find((e) => e.id.includes('allday-1'))
check('all-day event is present', Boolean(allDay))
check('all-day flag is set', allDay?.allDay === true)
check(
  'all-day starts at local midnight',
  allDay !== undefined && new Date(allDay.start).getHours() === 0,
  allDay && `got ${new Date(allDay.start).toLocaleString()}`
)

const zoned = events.find((e) => e.id.includes('zoned-1'))
const zonedHour = zoned
  ? Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        hour12: false
      }).format(new Date(zoned.start))
    )
  : -1
check('TZID event lands at 14:00 Chicago time', zonedHour === 14, `got hour ${zonedHour}`)
check('location is trimmed to its first segment', zoned?.location === 'Room 4', `got ${zoned?.location}`)

const standups = events.filter((e) => e.title.startsWith('Standup'))
check('recurrence expands, minus the EXDATE', standups.length === 5, `got ${standups.length}`)
check('the moved occurrence uses its override', standups.some((e) => e.title === 'Standup (moved)'))
check(
  'the moved occurrence is at 11:00, not 09:00',
  standups.some((e) => e.title === 'Standup (moved)' && new Date(e.start).getHours() === 11)
)
check(
  'the excluded day is gone',
  !standups.some((e) => e.start.startsWith(day(2).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) && e.title === 'Standup')
)

check('cancelled event is dropped', !events.some((e) => e.title === 'Should not appear'))
check('every event carries the feed colour', events.every((e) => e.calendarColor === '#7aa2f7'))
check('ids are unique', new Set(events.map((e) => e.id)).size === events.length)

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`)
process.exit(failures === 0 ? 0 : 1)
