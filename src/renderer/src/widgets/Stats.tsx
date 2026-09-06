import type { StatReading } from '@shared/types'

interface Props {
  stats: StatReading[]
}

/** Above this a bar turns warm, so a hot card is visible without reading it. */
const HOT = 0.85
const WARM = 0.7

function band(fraction: number): string {
  if (fraction >= HOT) return ' hot'
  if (fraction >= WARM) return ' warm'
  return ''
}

export function Stats({ stats }: Props) {
  return (
    <div class="card">
      <div class="card-title">
        <span>System</span>
      </div>
      <div class="card-body">
        {stats.length === 0 && <div class="empty">No stats switched on.</div>}

        {stats.map((stat) => (
          <div class="stat" key={stat.id}>
            <div class="stat-head">
              <span class="stat-label">{stat.label}</span>
              <span class={`stat-value${stat.value === null ? ' missing' : ''}`}>
                {stat.value ?? 'Unavailable'}
              </span>
            </div>
            {stat.fraction !== null && (
              <div class="stat-bar">
                <span
                  class={`stat-fill${band(stat.fraction)}`}
                  style={{ width: `${Math.round(Math.min(1, Math.max(0, stat.fraction)) * 100)}%` }}
                />
              </div>
            )}
            {stat.value === null && stat.note && <div class="stat-note">{stat.note}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
