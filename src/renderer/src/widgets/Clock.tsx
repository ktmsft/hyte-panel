import type { SourceState } from '@shared/types'
import { formatDate, relativeAge } from '@/lib/format'
import { useNow } from '@/lib/useNow'

interface Props {
  sources: SourceState[]
  mock: boolean
  onOpenSettings: () => void
}

export function Clock({ sources, mock, onOpenSettings }: Props) {
  const now = useNow(1000)
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()

  return (
    <div class="card">
      <div class="card-title">
        <span>Hyte Panel</span>
        <span style="display:flex; align-items:center; gap:0.5rem">
          {mock && <span class="chip">Preview data</span>}
          <button class="gear" onClick={onOpenSettings} aria-label="Open settings">
            Settings
          </button>
        </span>
      </div>

      <div class="clock-time">
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}
        <span class="clock-seconds">{String(seconds).padStart(2, '0')}</span>
      </div>
      <div class="clock-date">{formatDate(now)}</div>

      <div class="clock-spacer" />

      {sources
        .filter((source) => source.enabled)
        .map((source) => (
          <div class="health-row" key={source.id}>
            <span class={`dot ${source.health}`} />
            <span>{source.label}</span>
            <span class="spacer" />
            <span>{source.health === 'ok' ? relativeAge(source.checkedAt, now.getTime()) : source.health}</span>
          </div>
        ))}
    </div>
  )
}
