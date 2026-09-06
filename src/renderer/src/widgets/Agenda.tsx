import type { CalendarEvent, Health } from '@shared/types'
import { dayLabel, dayOffset, formatTime, isHappeningNow } from '@/lib/format'
import { useNow } from '@/lib/useNow'

interface Props {
  events: CalendarEvent[]
  health: Health
  note: string | null
  hour12: boolean
}

const MAX_EVENTS = 8

/** Silence when the agenda is healthy, a word when it is not. */
const HEALTH_CHIP: Partial<Record<Health, string>> = {
  unconfigured: 'Not connected',
  stale: 'Stale',
  error: 'Refresh failed',
  'setup-needed': 'Needs setup'
}

export function Agenda({ events, health, note, hour12 }: Props) {
  const now = useNow(30_000)
  const nowMs = now.getTime()

  const upcoming = events
    .filter((event) => new Date(event.end).getTime() >= nowMs)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, MAX_EVENTS)

  // Today / Tomorrow / weekday, without repeating a heading.
  let lastGroup: string | null = null

  return (
    <div class="card">
      <div class="card-title">
        <span>Agenda</span>
        {note ? <span class="chip">{note}</span> : HEALTH_CHIP[health] && <span class="chip">{HEALTH_CHIP[health]}</span>}
      </div>
      <div class="card-body">
        {upcoming.length === 0 && <div class="empty">Nothing scheduled.</div>}
        {upcoming.map((event) => {
          const group = dayLabel(dayOffset(event.start, now), event.start)
          const heading = group === lastGroup ? null : group
          lastGroup = group
          const live = !event.allDay && isHappeningNow(event.start, event.end, nowMs)

          return (
            <div key={event.id}>
              {heading && <div class="agenda-group">{heading}</div>}
              <div class={`event${live ? ' now' : ''}`}>
                <div class="event-time">
                  {event.allDay ? (
                    'All day'
                  ) : (
                    <>
                      {formatTime(event.start, hour12)}
                      <span class="end">{formatTime(event.end, hour12)}</span>
                    </>
                  )}
                </div>
                <div style="min-width:0">
                  <div class="event-title">{event.title}</div>
                  {event.location && <div class="event-location">{event.location}</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
