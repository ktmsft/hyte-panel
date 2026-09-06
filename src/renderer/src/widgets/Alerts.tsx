import type { AlertsLayout, SourceId, SourceState } from '@shared/types'
import { relativeAge } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { SourceIcon } from './icons'

interface Props {
  sources: SourceState[]
  layout: AlertsLayout
  /** Where each source opens. Empty means the tile is not worth tapping. */
  launch: Record<SourceId, string>
}

/** Only a source that reached its service has a real number. */
function hasValue(source: SourceState): boolean {
  return source.health === 'ok' || source.health === 'stale'
}

/** The line under the label. */
function note(source: SourceState, nowMs: number): { text: string; error: boolean } {
  switch (source.health) {
    case 'ok':
      return { text: source.items[0]?.title ?? `Checked ${relativeAge(source.checkedAt, nowMs)}`, error: false }
    case 'stale':
      return { text: `Last seen ${relativeAge(source.checkedAt, nowMs)}`, error: false }
    case 'error':
      return { text: source.message ?? 'Refresh failed', error: true }
    case 'setup-needed':
      return { text: source.message ?? 'Setup needed', error: false }
    default:
      return { text: source.message ?? 'Not connected', error: false }
  }
}

export function Alerts({ sources, layout, launch }: Props) {
  const now = useNow(30_000)
  const enabled = sources.filter((source) => source.enabled)

  function open(id: SourceId): void {
    if (launch[id]?.trim()) void window.hyte.launchSource(id)
  }

  return (
    <div class="card">
      <div class="card-title">
        <span>Alerts</span>
      </div>
      <div class="card-body">
        {enabled.length === 0 && <div class="empty">Every source is switched off.</div>}

        {layout === 'grid' ? (
          <div class="alert-grid">
            {enabled.map((source) => {
              const live = hasValue(source)
              const unread = live && source.count > 0
              return (
                <button
                  class={`alert-tile ${source.health}${unread ? ' unread' : ''}`}
                  key={source.id}
                  title={source.label}
                  onClick={() => open(source.id)}
                >
                  <SourceIcon id={source.id} class="alert-icon" />
                  {live ? (
                    source.count > 0 && <span class="alert-badge">{source.count}</span>
                  ) : (
                    <span class="alert-badge muted">!</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          enabled.map((source) => {
            const detail = note(source, now.getTime())
            const live = hasValue(source)
            return (
              <button class={`alert ${source.health}`} key={source.id} onClick={() => open(source.id)}>
                <span class={`alert-count${source.count === 0 || !live ? ' zero' : ''}`}>
                  {live ? source.count : '–'}
                </span>
                <span style="min-width:0">
                  <div class="alert-label">{source.label}</div>
                  <div class={`alert-note${detail.error ? ' error' : ''}`}>{detail.text}</div>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
