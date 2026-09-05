import { shell } from 'electron'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * OAuth for a public client: PKCE plus a loopback redirect on a random port,
 * and no client secret. Microsoft registers the redirect as plain
 * `http://localhost` and accepts any port on it, which is what makes the random
 * port workable.
 */

const SIGN_IN_TIMEOUT_MS = 5 * 60_000

/** Something the user has to fix, as opposed to a network blip worth retrying. */
export class AuthError extends Error {}

export interface Endpoints {
  authorize: string
  token: string
}

export interface TokenSet {
  accessToken: string
  /** Microsoft issues a fresh one on every refresh; the old one must be replaced. */
  refreshToken: string | null
  expiresAt: number
  scope: string
  idToken?: string
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

/** Pulls a provider's own error description out of a body, else the raw text. */
export function describe(body: string): string {
  try {
    const json = JSON.parse(body) as { error_description?: string; error?: string }
    return json.error_description?.split(/\r?\n/)[0] ?? json.error ?? body
  } catch {
    return body.slice(0, 200)
  }
}

export async function postToken(endpoint: string, params: Record<string, string>): Promise<TokenSet> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`The sign-in service rejected the token request: ${describe(text)}`)

  const token = JSON.parse(text) as TokenResponse
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? '',
    idToken: token.id_token
  }
}

/**
 * The id_token arrives over TLS straight from the token endpoint, so the
 * signature adds nothing here. Read the claim and move on.
 */
export function claimFromIdToken(idToken: string | undefined, claim: string): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    const value = claims[claim]
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

function page(res: ServerResponse, title: string, detail: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    '<!doctype html><meta charset="utf-8"><title>Hyte Panel</title>' +
      '<body style="font:16px system-ui;background:#0d1117;color:#e6edf3;' +
      'display:grid;place-items:center;height:100vh;margin:0">' +
      '<div style="text-align:center;max-width:32rem;padding:2rem">' +
      `<h1 style="font-size:1.4rem;margin:0 0 .5rem">${title}</h1>` +
      `<p style="color:#8b949e;margin:0">${detail}</p></div>`
  )
}

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Listens on a random loopback port, opens the sign-in page in the real
 * browser, and resolves with the code the provider redirects back.
 */
function awaitAuthCode(
  buildAuthUrl: (redirectUri: string) => string,
  expectedState: string
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let redirectUri = ''

    const finish = (err: Error | null, code?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve({ code: code as string, redirectUri })
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/') {
        // Browsers ask for /favicon.ico on the way through.
        res.writeHead(404).end()
        return
      }

      const returned = url.searchParams.get('state') ?? ''
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      const code = url.searchParams.get('code')

      if (!sameState(returned, expectedState)) {
        page(res, 'Sign-in rejected', 'That reply did not match this request. Start again from settings.')
        finish(new Error('OAuth state did not match. Sign-in abandoned.'))
        return
      }
      if (error || !code) {
        page(res, 'Sign-in cancelled', 'Nothing was changed. You can close this tab.')
        finish(new Error(error ?? 'No authorisation code was returned.'))
        return
      }

      page(res, 'Connected', 'Hyte Panel has your account. You can close this tab.')
      finish(null, code)
    })

    const timer = setTimeout(
      () => finish(new Error('Timed out waiting for the sign-in to finish.')),
      SIGN_IN_TIMEOUT_MS
    )
    timer.unref()

    server.on('error', (err) => finish(err))
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      // Microsoft matches the registered http://localhost on host alone for
      // public clients, so the port can be whatever was free.
      redirectUri = `http://localhost:${port}`
      void shell.openExternal(buildAuthUrl(redirectUri))
    })
  })
}

/** Runs the whole interactive flow and returns the resulting tokens. */
export async function signIn(
  endpoints: Endpoints,
  clientId: string,
  scopes: string[]
): Promise<TokenSet> {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  const { code, redirectUri } = await awaitAuthCode((uri) => {
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: uri,
      response_mode: 'query',
      scope: scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    return `${endpoints.authorize}?${query.toString()}`
  }, state)

  const token = await postToken(endpoints.token, {
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri
  })

  if (!token.refreshToken) {
    throw new AuthError('No refresh token came back. Check that offline_access is among the scopes.')
  }
  return token
}
