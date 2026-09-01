import { formatDate } from '@/lib/format'
import { useNow } from '@/lib/useNow'

interface Props {
  mock: boolean
  onOpenSettings: () => void
}

/**
 * Time, date, and nothing else. Source health used to live here too, but the
 * alerts card already says the same thing lower down the panel.
 */
export function Clock({ mock, onOpenSettings }: Props) {
  const now = useNow(1000)

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
        {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
        <span class="clock-seconds">{String(now.getSeconds()).padStart(2, '0')}</span>
      </div>
      <div class="clock-date">{formatDate(now)}</div>
    </div>
  )
}
