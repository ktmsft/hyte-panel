import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Credentials, encrypted at rest with safeStorage (DPAPI on Windows) and keyed
 * by name in one file next to config.json. Nothing in here is ever returned
 * over IPC: the renderer only learns whether a key is set.
 */

type Vault = Record<string, string>

let cache: Vault | null = null

function vaultPath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function load(): Vault {
  if (cache) return cache
  const path = vaultPath()
  if (existsSync(path)) {
    try {
      cache = JSON.parse(readFileSync(path, 'utf8')) as Vault
      return cache
    } catch (err) {
      // A corrupt vault means signing in again, not a dead app.
      console.error('[secrets] unreadable, starting empty:', err)
    }
  }
  cache = {}
  return cache
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function getSecret(key: string): string | null {
  const raw = load()[key]
  if (!raw) return null
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  } catch (err) {
    // DPAPI is scoped to the Windows account, so a vault copied from another
    // machine or user decrypts to nothing. Treat it as absent.
    console.error(`[secrets] cannot decrypt ${key}:`, err)
    return null
  }
}

export function setSecret(key: string, value: string | null): void {
  const vault = load()
  if (!value) {
    delete vault[key]
  } else {
    if (!encryptionAvailable()) {
      throw new Error('OS encryption is unavailable, so credentials cannot be stored safely.')
    }
    vault[key] = safeStorage.encryptString(value).toString('base64')
  }
  cache = vault
  const path = vaultPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(vault, null, 2), 'utf8')
}
