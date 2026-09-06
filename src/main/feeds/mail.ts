import type { MailAccount, MailAccountId, MailDetail, SourceItem } from '@shared/types'
import { ImapError, unseenCount, unseenHeaders, type ImapAccount } from '../imap'
import { mailPassword } from './store'

/** How many unread messages the Alerts card can show. */
const PREVIEW_COUNT = 5

export interface MailResult {
  count: number
  items: SourceItem[]
}

/** Loopback only: Bridge signs its own certificate for a local connection. */
function isLoopback(host: string): boolean {
  return /^(127\.\d+\.\d+\.\d+|localhost|::1)$/i.test(host.trim())
}

function resolve(id: MailAccountId, account: MailAccount): ImapAccount {
  const password = mailPassword(id)
  if (!account.host.trim() || !account.user.trim()) {
    throw new ImapError('Add the mail server and address in settings first.')
  }
  if (!password) throw new ImapError('Add the mail password in settings first.')
  return {
    host: account.host.trim(),
    port: account.port,
    user: account.user.trim(),
    password,
    security: account.security,
    allowSelfSigned: account.security === 'starttls' && isLoopback(account.host)
  }
}

export async function fetchMail(
  id: MailAccountId,
  account: MailAccount,
  detail: MailDetail
): Promise<MailResult> {
  const resolved = resolve(id, account)

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
