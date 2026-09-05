import type { CalendarHealth, FeedsStatus } from '@shared/types'
import { getConfig } from '../config'
import { encryptionAvailable, getSecret, setSecret } from '../secrets'

/**
 * The two credentials this app now holds: a secret iCal URL per calendar, and
 * one IMAP password. Both are bearer credentials, so both live in the encrypted
 * vault and neither is ever returned over IPC.
 */

const CALENDAR_URL = 'calendar.url.'
const MAIL_PASSWORD = 'mail.password'

let lastError: string | null = null
let mailError: string | null = null

/** Per-feed refresh results, keyed by calendar id. */
const calendarHealth = new Map<string, Omit<CalendarHealth, 'id' | 'hasUrl'>>()

type Listener = () => void
const listeners = new Set<Listener>()

/** Lets the poller tell the settings window that a refresh changed something. */
export function onFeedsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function calendarUrl(id: string): string | null {
  return getSecret(CALENDAR_URL + id)
}

export function setCalendarUrl(id: string, url: string | null): void {
  setSecret(CALENDAR_URL + id, url ? url.trim() : null)
  // A replaced URL invalidates whatever the old one reported.
  calendarHealth.delete(id)
  notify()
}

export function noteCalendar(id: string, error: string | null, events: number): void {
  calendarHealth.set(id, { error, events, checkedAt: new Date().toISOString() })
  notify()
}

export function noteMailError(error: string | null): void {
  if (mailError === error) return
  mailError = error
  notify()
}

export function mailPassword(): string | null {
  return getSecret(MAIL_PASSWORD)
}

export function setMailPassword(password: string | null): void {
  // App passwords are shown with spaces in groups of four; IMAP wants them gone.
  setSecret(MAIL_PASSWORD, password ? password.replace(/\s+/g, '') : null)
  mailError = null
  notify()
}

export function noteError(message: string | null): void {
  lastError = message
  notify()
}

export function feedsStatus(): FeedsStatus {
  const { feeds } = getConfig()
  return {
    calendars: feeds.calendars.map((feed) => ({
      id: feed.id,
      hasUrl: calendarUrl(feed.id) !== null,
      error: calendarHealth.get(feed.id)?.error ?? null,
      events: calendarHealth.get(feed.id)?.events ?? 0,
      checkedAt: calendarHealth.get(feed.id)?.checkedAt ?? null
    })),
    mailPasswordSet: mailPassword() !== null,
    mailError,
    encryptionAvailable: encryptionAvailable(),
    lastError
  }
}
