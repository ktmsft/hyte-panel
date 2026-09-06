import type { StatReading } from '@shared/types'

interface Props {
  stats: StatReading[]
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
                  <>
                    {/* A dash keeps the tile the same shape as the ones beside
                        it, so a stat that cannot be read looks unavailable
                        rather than broken. */}
                    <div class="stat-number absent">--</div>
                    <div class="stat-missing">{stat.note ?? 'Unavailable'}</div>
                  </>
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
                      // Judged in main, where the real limits are known.
                      class={`stat-fill ${stat.level}`}
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
