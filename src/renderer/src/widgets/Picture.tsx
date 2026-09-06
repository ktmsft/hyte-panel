import { useEffect, useState } from 'preact/hooks'
import type { ImageConfig } from '@shared/types'

interface Props {
  urls: string[]
  intervalSeconds: number
  fit: ImageConfig['fit']
}

/** Below this a folder flickers rather than rotates. */
const MIN_INTERVAL_SECONDS = 2

export function Picture({ urls, intervalSeconds, fit }: Props) {
  const [index, setIndex] = useState(0)

  // Keyed on the list itself: a folder that gains or loses a picture should
  // start again rather than land on an index that no longer exists.
  const key = urls.join('|')

  useEffect(() => {
    setIndex(0)
    if (urls.length < 2) return undefined
    const every = Math.max(MIN_INTERVAL_SECONDS, intervalSeconds) * 1000
    const timer = setInterval(() => setIndex((current) => (current + 1) % urls.length), every)
    return () => clearInterval(timer)
  }, [key, intervalSeconds, urls.length])

  if (urls.length === 0) {
    return (
      <div class="card picture">
        <div class="empty">No picture chosen.</div>
      </div>
    )
  }

  return (
    <div class="card picture">
      {/* Decorative: it carries no information the panel depends on. */}
      <img class={`picture-img ${fit}`} src={urls[Math.min(index, urls.length - 1)]} alt="" />
    </div>
  )
}
