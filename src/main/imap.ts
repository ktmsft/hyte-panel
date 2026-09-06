import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'

/**
 * Just enough IMAP4rev1 for a dashboard: sign in, count unseen mail, and read a
 * few headers.
 *
 * Two ways in. Implicit TLS on 993, which is Gmail. And STARTTLS, which begins
 * in the clear and upgrades, which is Proton Bridge on loopback.
 */

export interface ImapAccount {
  host: string
  port: number
  user: string
  password: string
  /** `tls` connects encrypted; `starttls` upgrades an open connection. */
  security: 'tls' | 'starttls'
  /**
   * Proton Bridge presents a certificate it signed itself, for a connection
   * that never leaves the machine. Only ever set for loopback.
   */
  allowSelfSigned?: boolean
}

export interface UnseenPreview {
  /** Every unseen message, not just the ones headers were read for. */
  total: number
  headers: MailHeader[]
}

export interface MailHeader {
  subject: string
  from: string
  at: string
}

export class ImapError extends Error {}

const CONNECT_TIMEOUT_MS = 15_000
const COMMAND_TIMEOUT_MS = 20_000

/**
 * RFC 6066 forbids an IP address as the TLS server name, and Node has said it
 * will start ignoring it. Bridge is reached at 127.0.0.1, so the field is simply
 * left off there; it means nothing for a certificate that names an address.
 */
function serverName(host: string): string | undefined {
  const isAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
  return isAddress ? undefined : host
}

/** IMAP quoted strings escape backslash and quote, and nothing else. */
function quote(value: string): string {
  return `"${value.replace(/([\\"])/g, '\\$1')}"`
}

interface Reply {
  /** Untagged `*` lines, with any literals already spliced in. */
  untagged: string[]
}

type Settle = { resolve(reply: Reply): void; reject(err: Error): void }

class Connection {
  private socket: TLSSocket
  private buffer = Buffer.alloc(0)
  /** Holds the head of a line whose literal has been spliced in mid-parse. */
  private partial: string | null = null
  private counter = 0
  private untagged: string[] = []
  private waiting: (Settle & { tag: string }) | null = null
  private greetingSettle: { resolve(): void; reject(err: Error): void } | null = null
  private greeted = false
  private failure: Error | null = null

  constructor(socket: TLSSocket, greeted = false) {
    this.socket = socket
    // After a STARTTLS upgrade the server does not greet again.
    this.greeted = greeted
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.drain()
    })
    socket.on('error', (err) => this.fail(err))
    socket.on('close', () => this.fail(new ImapError('The mail server closed the connection.')))
  }

  private fail(err: Error): void {
    if (this.failure) return
    this.failure = err
    this.waiting?.reject(err)
    this.waiting = null
    this.greetingSettle?.reject(err)
    this.greetingSettle = null
  }

  /**
   * Pulls whole logical lines out of the byte buffer. A line ending in `{n}` is
   * followed by exactly n octets of literal, which must be sliced by byte count:
   * a subject with an emoji in it has more octets than characters.
   */
  private drain(): void {
    for (;;) {
      const end = this.buffer.indexOf('\r\n')
      if (end === -1) return

      const line = this.buffer.subarray(0, end).toString('utf8')
      const literal = /\{(\d+)\}$/.exec(line)

      if (literal) {
        const size = Number(literal[1])
        const start = end + 2
        if (this.buffer.length < start + size) return // literal still arriving
        const body = this.buffer.subarray(start, start + size).toString('utf8')
        this.buffer = this.buffer.subarray(start + size)
        this.partial = (this.partial ?? '') + line.slice(0, literal.index) + body
        continue
      }

      this.buffer = this.buffer.subarray(end + 2)
      const full = (this.partial ?? '') + line
      this.partial = null
      this.accept(full)
    }
  }

  private accept(line: string): void {
    if (line.startsWith('* ')) {
      const body = line.slice(2)
      // The server speaks first; that greeting is not a reply to anything.
      if (!this.greeted && /^(OK|PREAUTH)\b/.test(body)) {
        this.greeted = true
        this.greetingSettle?.resolve()
        this.greetingSettle = null
        return
      }
      if (!this.greeted && /^BYE\b/.test(body)) {
        this.fail(new ImapError(`The mail server refused the connection: ${body}`))
        return
      }
      this.untagged.push(body)
      return
    }

    const waiting = this.waiting
    if (!waiting || !line.startsWith(`${waiting.tag} `)) return

    const rest = line.slice(waiting.tag.length + 1)
    const untagged = this.untagged
    this.untagged = []
    this.waiting = null

    if (/^OK\b/.test(rest)) waiting.resolve({ untagged })
    else waiting.reject(new ImapError(rest.replace(/^(NO|BAD)\s*/, '')))
  }

  greeting(): Promise<void> {
    if (this.greeted) return Promise.resolve()
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new ImapError('The mail server did not send a greeting.')),
        CONNECT_TIMEOUT_MS
      )
      this.greetingSettle = {
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      }
    })
  }

  send(command: string): Promise<Reply> {
    if (this.failure) return Promise.reject(this.failure)
    const tag = `a${++this.counter}`
    const name = command.split(' ')[0]
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new ImapError(`The mail server did not answer ${name}.`)), COMMAND_TIMEOUT_MS)
      this.waiting = {
        tag,
        resolve: (reply) => {
          clearTimeout(timer)
          resolve(reply)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      }
      this.socket.write(`${tag} ${command}\r\n`)
    })
  }

  close(): void {
    this.socket.destroy()
  }
}

/** Reads from a raw socket until the pattern appears, for the pre-TLS exchange. */
function waitFor(socket: Socket, pattern: RegExp, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let seen = ''
    const done = (err?: Error): void => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', done)
      if (err) reject(err)
      else resolve()
    }
    const onData = (chunk: Buffer): void => {
      seen += chunk.toString('utf8')
      if (pattern.test(seen)) done()
    }
    const timer = setTimeout(() => done(new ImapError(`The mail server did not ${what}.`)), CONNECT_TIMEOUT_MS)
    socket.on('data', onData)
    socket.once('error', done)
  })
}

function openSocket(account: ImapAccount): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: account.host, port: account.port }, () => {
      socket.setTimeout(0)
      resolve(socket)
    })
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy()
      reject(new ImapError(`No answer from ${account.host}:${account.port}.`))
    })
    socket.once('error', reject)
  })
}

/**
 * Greets in the clear, asks for STARTTLS, then wraps the same socket. The
 * exchange happens before the Connection exists, because nothing may be sent
 * unencrypted afterwards and the greeting must not be read twice.
 */
async function upgradeSocket(account: ImapAccount): Promise<TLSSocket> {
  const plain = await openSocket(account)
  try {
    await waitFor(plain, /^\* (OK|PREAUTH)\b/m, 'send a greeting')
    plain.write('s0 STARTTLS\r\n')
    await waitFor(plain, /^s0 OK\b/m, 'accept STARTTLS')
  } catch (err) {
    plain.destroy()
    throw err
  }

  return new Promise<TLSSocket>((resolve, reject) => {
    const secure = tlsConnect(
      {
        socket: plain,
        servername: serverName(account.host),
        rejectUnauthorized: account.allowSelfSigned !== true
      },
      () => resolve(secure)
    )
    secure.once('error', reject)
  })
}

function implicitSocket(account: ImapAccount): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      { host: account.host, port: account.port, servername: serverName(account.host) },
      () => {
        socket.setTimeout(0)
        resolve(socket)
      }
    )
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy()
      reject(new ImapError(`No answer from ${account.host}:${account.port}.`))
    })
    socket.once('error', reject)
  })
}

async function open(account: ImapAccount): Promise<Connection> {
  if (account.security === 'starttls') {
    // The greeting was consumed before the upgrade, so do not wait for another.
    return new Connection(await upgradeSocket(account), true)
  }

  const connection = new Connection(await implicitSocket(account))
  await connection.greeting()
  return connection
}

/** Opens, signs in, runs, and always closes. Every export below goes through this. */
async function session<T>(account: ImapAccount, run: (c: Connection) => Promise<T>): Promise<T> {
  const connection = await open(account)
  try {
    try {
      await connection.send(`LOGIN ${quote(account.user)} ${quote(account.password)}`)
    } catch (err) {
      // Gmail answers a plain account password with a long help URL, and
      // Bridge with a terse refusal. Neither says what to do about it.
      const detail = err instanceof Error ? err.message : String(err)
      const hint =
        account.security === 'starttls'
          ? 'Proton Bridge has its own password, shown in Bridge under the account, not your Proton password.'
          : 'Gmail needs an app password, with 2-step verification switched on, not your account password.'
      throw new ImapError(`Sign-in refused. ${hint} (${detail})`)
    }
    const result = await run(connection)
    await connection.send('LOGOUT').catch(() => undefined)
    return result
  } finally {
    connection.close()
  }
}

/** `* STATUS "INBOX" (UNSEEN 3)` */
export async function unseenCount(account: ImapAccount): Promise<number> {
  return session(account, async (c) => {
    const reply = await c.send('STATUS "INBOX" (UNSEEN)')
    for (const line of reply.untagged) {
      const match = /UNSEEN\s+(\d+)/i.exec(line)
      if (match) return Number(match[1])
    }
    throw new ImapError('The server did not report an unseen count.')
  })
}

/** Decodes the RFC 2047 encoded words used for non-ASCII subject lines. */
function decodeWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (whole, charset: string, kind: string, text: string) => {
      try {
        const bytes =
          kind.toUpperCase() === 'B'
            ? Buffer.from(text, 'base64')
            : Buffer.from(
                text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
                  String.fromCharCode(parseInt(hex, 16))
                ),
                'binary'
              )
        return new TextDecoder(charset.toLowerCase()).decode(bytes)
      } catch {
        return whole
      }
    }
  )
}

function headerValue(block: string, name: string): string {
  // Long headers fold onto continuation lines that begin with whitespace.
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ')
  const match = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(unfolded)
  return decodeWords(match?.[1]?.trim() ?? '')
}

/** `"Ada Lovelace" <ada@example.com>` becomes `Ada Lovelace`. */
function senderName(from: string): string {
  const named = /^\s*"?([^"<]*?)"?\s*</.exec(from)
  return (named?.[1]?.trim() || from.replace(/[<>]/g, '').trim()).trim()
}

export async function unseenHeaders(account: ImapAccount, limit: number): Promise<UnseenPreview> {
  return session(account, async (c) => {
    // EXAMINE, not SELECT: read-only, so nothing gets marked as seen.
    await c.send('EXAMINE "INBOX"')
    const search = await c.send('UID SEARCH UNSEEN')
    const uids = (search.untagged.find((line) => /^SEARCH/i.test(line)) ?? '')
      .replace(/^SEARCH\s*/i, '')
      .split(/\s+/)
      .filter(Boolean)
    if (uids.length === 0) return { total: 0, headers: [] }

    // SEARCH returns ascending UIDs, so the newest are at the end.
    const wanted = uids.slice(-limit).reverse()
    const fetch = await c.send(
      `UID FETCH ${wanted.join(',')} (INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`
    )

    const headers: MailHeader[] = []
    for (const entry of fetch.untagged) {
      if (!/FETCH/i.test(entry)) continue
      const stamp = /INTERNALDATE "([^"]+)"/i.exec(entry)?.[1]
      const at = stamp ? new Date(stamp) : new Date()
      headers.push({
        subject: headerValue(entry, 'Subject') || '(no subject)',
        from: senderName(headerValue(entry, 'From')),
        at: (Number.isNaN(at.getTime()) ? new Date() : at).toISOString()
      })
    }
    // SEARCH listed every unseen UID, so the count is free and needs no STATUS.
    return { total: uids.length, headers }
  })
}
