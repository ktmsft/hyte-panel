/**
 * Built once each, since a DateTimeFormat is not cheap and these are called for
 * every event on every repaint. hour12 is set explicitly rather than left to the
 * locale, so the setting decides and the clock and the agenda always agree.
 */
const TIME_FORMATS = {
  hour12: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }),
  hour24: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})

export function formatTime(iso: string, hour12: boolean): string {
  return (hour12 ? TIME_FORMATS.hour12 : TIME_FORMATS.hour24).format(new Date(iso))
}

export function formatDate(date: Date): string {
  return dateFormat.format(date)
}

/** Calendar-day difference, so 23:50 to 00:10 counts as tomorrow rather than "in 20 minutes". */
export function dayOffset(iso: string, now: Date = new Date()): number {
  const then = new Date(iso)
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

export function dayLabel(offset: number, iso: string): string {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' }).format(
    new Date(iso)
  )
}

/** Compact relative age for "checked 4m ago" style notes. */
export function relativeAge(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function isHappeningNow(start: string, end: string, now: number = Date.now()): boolean {
  return new Date(start).getTime() <= now && new Date(end).getTime() >= now
}
