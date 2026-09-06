import type { Health, MailAccountId } from '@shared/types'
import { getConfig } from './config'
import { fetchEvents, FeedError } from './feeds/calendar'
import { fetchMail } from './feeds/mail'
import { calendarUrl, noteBlueskyError, noteCalendar, noteMailError } from './feeds/store'
import { ImapError } from './imap'
import { BlueskyError, fetchUnread, isConfigured } from './sources/bluesky'
import { DISCORD_AUMID, readTaskbarBadge } from './sources/badge'
import { readNotifications } from './sources/notifications'
import { collectStats } from './stats'
import { getState, goLive, setEvents, setSource, setStats } from './state'
import { refreshTasks } from './tasks'

/**
 * Refresh loops for the calendar feeds and the mail account. Calendar moves
 * slowly; the unread number is the one people watch, so it runs more often.
 */

const CALENDAR_MS = 5 * 60_000
const MAIL_MS = 2 * 60_000
const TASKS_MS = 2 * 60_000
/** Fast enough to look live, slow enough that nvidia-smi costs nothing. */
const STATS_MS = 5_000
/** Toasts arrive when they arrive; a SQL query this cheap can look often. */
const DISCORD_MS = 20_000
const BLUESKY_MS = 2 * 60_000

let calendarTimer: NodeJS.Timeout | null = null
let mailTimer: NodeJS.Timeout | null = null
let tasksTimer: NodeJS.Timeout | null = null
let statsTimer: NodeJS.Timeout | null = null
let discordTimer: NodeJS.Timeout | null = null
let blueskyTimer: NodeJS.Timeout | null = null

/**
 * Data already on screen is dimmed rather than blanked on a first failure.
 * With nothing to show, anything our own adapters recognised is something the
 * user has to go and fix; everything else is a plain error.
 */
function failure(err: unknown, hadData: boolean): { health: Health; message: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (hadData) return { health: 'stale', message }
  const known = err instanceof FeedError || err instanceof ImapError || err instanceof BlueskyError
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

/** Both mailboxes are IMAP; only the way in differs. */
const MAIL_IDS: MailAccountId[] = ['gmail', 'proton']

async function pollMailbox(id: MailAccountId): Promise<void> {
  const { mail, mailDetail } = getConfig().feeds
  const account = mail[id]
  const enabled = account.enabled && getConfig().sources[id].enabled

  if (!enabled || !account.user.trim()) {
    if (!getState().mock) {
      setSource(id, {
        health: 'unconfigured',
        count: 0,
        items: [],
        checkedAt: null,
        message: 'Not connected yet'
      })
    }
    return
  }

  const hadData = getState().sources.some((source) => source.id === id && source.checkedAt !== null)
  try {
    const { count, items } = await fetchMail(id, account, mailDetail)
    goLive()
    noteMailError(id, null)
    setSource(id, {
      health: 'ok',
      count,
      items,
      checkedAt: new Date().toISOString(),
      message: undefined
    })
  } catch (err) {
    const { health, message } = failure(err, hadData)
    console.error(`[mail:${id}]`, message)
    noteMailError(id, message)
    setSource(id, { health, message })
  }
}

function pollMail(): void {
  for (const id of MAIL_IDS) void pollMailbox(id)
}

async function pollBluesky(): Promise<void> {
  if (!getConfig().sources.bluesky.enabled) return

  if (!isConfigured()) {
    if (!getState().mock) {
      setSource('bluesky', {
        health: 'unconfigured',
        count: 0,
        items: [],
        checkedAt: null,
        message: 'Not connected yet'
      })
    }
    return
  }

  const hadData = getState().sources.some((source) => source.id === 'bluesky' && source.checkedAt !== null)
  try {
    const { count, items } = await fetchUnread(true)
    goLive()
    noteBlueskyError(null)
    setSource('bluesky', {
      health: 'ok',
      count,
      items,
      checkedAt: new Date().toISOString(),
      message: undefined
    })
  } catch (err) {
    const { health, message } = failure(err, hadData)
    console.error('[bluesky]', message)
    noteBlueskyError(message)
    setSource('bluesky', { health, message })
  }
}

/** Discord, its PTB and Canary builds all register under names containing it. */
const DISCORD_APPS = /discord/i

/** How many toasts the Alerts card can list. */
const DISCORD_PREVIEW = 5

async function pollDiscord(): Promise<void> {
  if (!getConfig().sources.discord.enabled) return

  const summary = readNotifications(DISCORD_APPS, DISCORD_PREVIEW)
  if (summary === null) {
    setSource('discord', {
      health: 'error',
      message: 'Could not read the Windows notification store.'
    })
    return
  }

  // The badge is the number on the icon, and the one worth showing: Discord
  // withdraws a toast once the channel has been read, so an unread mention you
  // have not opened badges the taskbar while leaving the store empty. The
  // store is still where the list of what arrived comes from. Only the stable
  // build carries the badge id; the toast list covers PTB and Canary too.
  const badge = await readTaskbarBadge(DISCORD_AUMID)

  if (!summary.known && !badge?.pinned) {
    setSource('discord', {
      health: 'unconfigured',
      count: 0,
      items: [],
      checkedAt: null,
      message: 'Discord has not posted a Windows notification yet.'
    })
    return
  }

  goLive()
  setSource('discord', {
    health: 'ok',
    count: badge?.pinned ? badge.count : summary.count,
    items: summary.items,
    checkedAt: new Date().toISOString(),
    message: undefined
  })
}

async function pollStats(): Promise<void> {
  // Nothing is read while the card is hidden, so no spawns happen either.
  if (!getConfig().panels.stats) return
  try {
    setStats(await collectStats())
  } catch (err) {
    console.error('[stats]', err instanceof Error ? err.message : err)
  }
}

export function refreshNow(): void {
  void pollCalendar()
  void pollMail()
  void refreshTasks()
  void pollStats()
  void pollDiscord()
  void pollBluesky()
}

export function stopPolling(): void {
  if (calendarTimer) clearInterval(calendarTimer)
  if (mailTimer) clearInterval(mailTimer)
  if (tasksTimer) clearInterval(tasksTimer)
  if (statsTimer) clearInterval(statsTimer)
  if (discordTimer) clearInterval(discordTimer)
  if (blueskyTimer) clearInterval(blueskyTimer)
  calendarTimer = null
  mailTimer = null
  tasksTimer = null
  statsTimer = null
  discordTimer = null
  blueskyTimer = null
}

/**
 * One line at boot saying what is actually configured. Every silent failure in
 * this app so far has looked identical to "switched off", and this separates
 * the two without needing to open settings.
 */
function describeSources(): void {
  const config = getConfig()
  const parts: string[] = []

  const calendars = config.feeds.calendars.filter((feed) => feed.enabled && calendarUrl(feed.id))
  parts.push(`calendars ${calendars.length}/${config.feeds.calendars.length}`)

  for (const id of MAIL_IDS) {
    const account = config.feeds.mail[id]
    const ready = account.enabled && account.user.trim() !== ''
    parts.push(`${id} ${ready ? account.user.trim() : 'off'}`)
  }

  parts.push(`bluesky ${isConfigured() ? config.bluesky.handle.trim() : 'off'}`)
  parts.push(`tasks ${config.taskProvider}`)
  console.log('[sources]', parts.join(', '))
}

/** Safe to call repeatedly: it restarts the loops and refreshes straight away. */
export function startPolling(): void {
  stopPolling()
  describeSources()
  calendarTimer = setInterval(() => void pollCalendar(), CALENDAR_MS)
  mailTimer = setInterval(() => void pollMail(), MAIL_MS)
  tasksTimer = setInterval(() => void refreshTasks(), TASKS_MS)
  statsTimer = setInterval(() => void pollStats(), STATS_MS)
  discordTimer = setInterval(() => void pollDiscord(), DISCORD_MS)
  blueskyTimer = setInterval(() => void pollBluesky(), BLUESKY_MS)
  refreshNow()
}
