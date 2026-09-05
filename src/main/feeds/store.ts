import type { FeedsStatus } from '@shared/types'
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

export function calendarUrl(id: string): string | null {
  return getSecret(CALENDAR_URL + id)
}

export function setCalendarUrl(id: string, url: string | null): void {
  setSecret(CALENDAR_URL + id, url ? url.trim() : null)
}

export function mailPassword(): string | null {
  return getSecret(MAIL_PASSWORD)
}

export function setMailPassword(password: string | null): void {
  // App passwords are shown with spaces in groups of four; IMAP wants them gone.
  setSecret(MAIL_PASSWORD, password ? password.replace(/\s+/g, '') : null)
}

export function noteError(message: string | null): void {
  lastError = message
}

export function feedsStatus(): FeedsStatus {
  const { feeds } = getConfig()
  return {
    calendarsWithUrl: feeds.calendars.filter((c) => calendarUrl(c.id) !== null).map((c) => c.id),
    mailPasswordSet: mailPassword() !== null,
    encryptionAvailable: encryptionAvailable(),
    lastError
  }
}
