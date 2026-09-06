import { formatDate } from '@/lib/format'
import { useNow } from '@/lib/useNow'

interface Props {
  mock: boolean
  hour12: boolean
  onOpenSettings: () => void
}

export function Clock({ mock, hour12, onOpenSettings }: Props) {
  const now = useNow(1000)
  const hours = now.getHours()
  // Midnight and noon are 12, not 0. A 12-hour clock is not zero-padded either.
  const shown = hour12 ? String(hours % 12 || 12) : String(hours).padStart(2, '0')

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
        {shown}:{String(now.getMinutes()).padStart(2, '0')}
        <span class="clock-seconds">{String(now.getSeconds()).padStart(2, '0')}</span>
        {hour12 && <span class="clock-meridiem">{hours < 12 ? 'AM' : 'PM'}</span>}
      </div>
      <div class="clock-date">{formatDate(now)}</div>
    </div>
  )
}
