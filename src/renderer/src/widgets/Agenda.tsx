import type { CalendarEvent, Health } from '@shared/types'
import { dayLabel, dayOffset, formatTime, isHappeningNow } from '@/lib/format'
import { useNow } from '@/lib/useNow'

interface Props {
  events: CalendarEvent[]
  health: Health
}

const MAX_EVENTS = 8

export function Agenda({ events, health }: Props) {
  const now = useNow(30_000)
  const nowMs = now.getTime()

  const upcoming = events
    .filter((event) => new Date(event.end).getTime() >= nowMs)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, MAX_EVENTS)

  // Group into Today / Tomorrow / weekday headings without repeating a heading.
  let lastGroup: string | null = null

  return (
    <div class="card">
      <div class="card-title">
        <span>Agenda</span>
        {health === 'unconfigured' && <span class="chip">Not connected</span>}
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
                      {formatTime(event.start)}
                      <span class="end">{formatTime(event.end)}</span>
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
