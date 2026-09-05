import type { MailAccount, MailDetail, SourceItem } from '@shared/types'
import { ImapError, unseenCount, unseenHeaders, type ImapAccount } from '../imap'
import { mailPassword } from './store'

/** How many unread messages the Alerts card can show. */
const PREVIEW_COUNT = 5

export interface MailResult {
  count: number
  items: SourceItem[]
}

function resolve(account: MailAccount): ImapAccount {
  const password = mailPassword()
  if (!account.host.trim() || !account.user.trim()) {
    throw new ImapError('Add the mail server and address in settings first.')
  }
  if (!password) throw new ImapError('Add the mail app password in settings first.')
  return { host: account.host.trim(), port: account.port, user: account.user.trim(), password }
}

export async function fetchMail(account: MailAccount, detail: MailDetail): Promise<MailResult> {
  const resolved = resolve(account)

  if (detail !== 'subjects') return { count: await unseenCount(resolved), items: [] }

  // SEARCH already listed every unseen UID, so one session covers both.
  const { total, headers } = await unseenHeaders(resolved, PREVIEW_COUNT)

  return {
    count: total,
    items: headers.map((header): SourceItem => ({
      title: header.subject,
      subtitle: header.from || undefined,
      at: header.at
    }))
  }
}
