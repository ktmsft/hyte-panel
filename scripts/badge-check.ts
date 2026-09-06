/**
 * Prints the taskbar badge the panel would read for Discord.
 *
 * Run with: npm run check:badge
 *
 * A badge and an empty notification store are not a contradiction: Discord
 * withdraws its toast once a channel has been read, so the badge outlives it.
 */
import { readTaskbarBadge } from '../src/main/sources/badge.ts'
import { readNotifications } from '../src/main/sources/notifications.ts'

const AUMID = process.argv[2] ?? 'com.squirrel.Discord.Discord'

const badge = await readTaskbarBadge(AUMID)
console.log('aumid  ', AUMID)
console.log('badge  ', badge === null ? 'unreadable' : `${badge.count} (pinned: ${badge.pinned})`)

const store = readNotifications(/discord/i, 5)
if (store === null) {
  console.log('store   could not be read')
} else {
  console.log('store  ', `${store.count} toast(s), registered: ${store.known}`)
  for (const item of store.items) {
    console.log('        -', item.at, item.title, item.subtitle ? `| ${item.subtitle}` : '')
  }
}
