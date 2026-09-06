import type { StatReading } from '@shared/types'

interface Props {
  stats: StatReading[]
}

/** Above these a bar turns warm, so a hot machine reads without being read. */
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
        {stats.length === 0 ? (
          <div class="empty">No stats switched on.</div>
        ) : (
          <div class="stat-grid">
            {stats.map((stat) => (
              <div class="stat-tile" key={stat.id}>
                <div class="stat-label">{stat.label}</div>

                {stat.value === null ? (
                  <div class="stat-missing">{stat.note ?? 'Unavailable'}</div>
                ) : (
                  <>
                    <div class="stat-number">
                      {stat.value}
                      {stat.unit && <span class="stat-unit">{stat.unit}</span>}
                    </div>
                    {stat.detail && <div class="stat-detail">{stat.detail}</div>}
                  </>
                )}

                {stat.fraction !== null && (
                  <div class="stat-bar">
                    <span
                      class={`stat-fill${band(stat.fraction)}`}
                      style={{ width: `${Math.round(Math.min(1, Math.max(0, stat.fraction)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
