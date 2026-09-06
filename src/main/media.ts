import { net, protocol } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getConfig } from './config'

/**
 * Serves local pictures to the renderer, which has no file access and cannot use
 * `file://`. A scheme the renderer can name reads anything on disk unless it is
 * fenced, so every request is checked against what settings points at.
 */

export const MEDIA_SCHEME = 'hyte-media'

const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp'])

/** Must be called before the app is ready, or the scheme has no privileges. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function mediaUrl(file: string): string {
  return `${MEDIA_SCHEME}://local/?path=${encodeURIComponent(file)}`
}

function isPicture(file: string): boolean {
  return EXTENSIONS.has(extname(file).toLowerCase())
}

/**
 * The fence. A file is servable only if it is the chosen file, or sits directly
 * in the chosen folder. Nothing is resolved through the request itself, so a
 * path walking upwards lands outside the allowed root and is refused.
 */
function isAllowed(file: string): boolean {
  const image = getConfig().image
  if (!image.path.trim()) return false

  const asked = resolve(file)
  const root = resolve(image.path)
  if (!isPicture(asked)) return false
  if (image.source === 'file') return asked === root
  return dirname(asked) === root
}

export function handleMediaRequests(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const asked = new URL(request.url).searchParams.get('path')
    if (!asked) return new Response('no path', { status: 400 })
    if (!isAllowed(asked)) return new Response('outside the chosen picture source', { status: 403 })
    return net.fetch(pathToFileURL(resolve(asked)).toString())
  })
}

/**
 * Every picture the panel may show, in name order so a folder cycles the same
 * way twice. One entry for a single file, none when nothing is chosen.
 */
export async function listPictures(): Promise<string[]> {
  const image = getConfig().image
  const path = image.path.trim()
  if (!path) return []

  try {
    if (image.source === 'file') {
      const info = await stat(path)
      return info.isFile() && isPicture(path) ? [mediaUrl(resolve(path))] : []
    }

    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && isPicture(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => mediaUrl(resolve(join(path, name))))
  } catch (err) {
    console.error('[media]', err instanceof Error ? err.message : err)
    return []
  }
}
