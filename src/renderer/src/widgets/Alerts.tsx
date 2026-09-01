import type { AlertsLayout, SourceState } from '@shared/types'
import { relativeAge } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { SourceIcon } from './icons'

interface Props {
  sources: SourceState[]
  layout: AlertsLayout
}

/** A source only has a real number to show when it has actually reached the service. */
function hasValue(source: SourceState): boolean {
  return source.health === 'ok' || source.health === 'stale'
}

/** What the row says under the label, depending on how healthy the source is. */
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

export function Alerts({ sources, layout }: Props) {
  const now = useNow(30_000)
  const enabled = sources.filter((source) => source.enabled)

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
                <div
                  class={`alert-tile ${source.health}${unread ? ' unread' : ''}`}
                  key={source.id}
                  title={source.label}
                >
                  <SourceIcon id={source.id} class="alert-icon" />
                  {live ? (
                    source.count > 0 && <span class="alert-badge">{source.count}</span>
                  ) : (
                    <span class="alert-badge muted">!</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          enabled.map((source) => {
            const detail = note(source, now.getTime())
            const live = hasValue(source)
            return (
              <div class={`alert ${source.health}`} key={source.id}>
                <span class={`alert-count${source.count === 0 || !live ? ' zero' : ''}`}>
                  {live ? source.count : '–'}
                </span>
                <span style="min-width:0">
                  <div class="alert-label">{source.label}</div>
                  <div class={`alert-note${detail.error ? ' error' : ''}`}>{detail.text}</div>
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
