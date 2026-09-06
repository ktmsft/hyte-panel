import type { CalendarHealth, FeedsStatus, MailAccountId } from '@shared/types'
import { getConfig } from '../config'
import { encryptionAvailable, getSecret, setSecret } from '../secrets'

/**
 * The two credentials this app now holds: a secret iCal URL per calendar, and
 * one IMAP password. Both are bearer credentials, so both live in the encrypted
 * vault and neither is ever returned over IPC.
 */

const CALENDAR_URL = 'calendar.url.'
const MAIL_PASSWORD = 'mail.password.'
const BLUESKY_PASSWORD = 'bluesky.appPassword'

/** The pre-v4 key, when there was only one mailbox. */
const LEGACY_MAIL_PASSWORD = 'mail.password'

let lastError: string | null = null
const mailErrors: Partial<Record<MailAccountId, string | null>> = {}
let blueskyError: string | null = null

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

export function noteMailError(id: MailAccountId, error: string | null): void {
  if (mailErrors[id] === error) return
  mailErrors[id] = error
  notify()
}

export function mailPassword(id: MailAccountId): string | null {
  return getSecret(MAIL_PASSWORD + id)
}

export function setMailPassword(id: MailAccountId, password: string | null): void {
  // App passwords are shown in groups of four; IMAP wants the spaces gone.
  setSecret(MAIL_PASSWORD + id, password ? password.replace(/\s+/g, '') : null)
  mailErrors[id] = null
  notify()
}

export function blueskyPassword(): string | null {
  return getSecret(BLUESKY_PASSWORD)
}

export function setBlueskyPassword(password: string | null): void {
  setSecret(BLUESKY_PASSWORD, password ? password.replace(/\s+/g, '') : null)
  blueskyError = null
  notify()
}

export function noteBlueskyError(error: string | null): void {
  if (blueskyError === error) return
  blueskyError = error
  notify()
}

/**
 * The single mailbox became named ones in v4. Moves the old password across so
 * an upgrade does not silently sign Gmail out.
 */
export function migrateSecrets(): void {
  const legacy = getSecret(LEGACY_MAIL_PASSWORD)
  if (legacy && !getSecret(MAIL_PASSWORD + 'gmail')) {
    setSecret(MAIL_PASSWORD + 'gmail', legacy)
  }
  if (legacy) setSecret(LEGACY_MAIL_PASSWORD, null)
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
    mail: {
      gmail: { passwordSet: mailPassword('gmail') !== null, error: mailErrors.gmail ?? null },
      proton: { passwordSet: mailPassword('proton') !== null, error: mailErrors.proton ?? null }
    },
    bluesky: { passwordSet: blueskyPassword() !== null, error: blueskyError },
    encryptionAvailable: encryptionAvailable(),
    lastError
  }
}
