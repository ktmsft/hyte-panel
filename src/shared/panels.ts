import type { PanelId } from './types'

/** Every panel, in the order they ship in. */
export const ALL_PANELS: PanelId[] = ['clock', 'stats', 'agenda', 'todos', 'alerts', 'image']

export const PANEL_LABELS: Record<PanelId, string> = {
  clock: 'Clock',
  stats: 'System stats',
  agenda: 'Agenda',
  todos: 'To-dos',
  alerts: 'Alerts',
  image: 'Picture'
}

/**
 * A saved order can be stale in both directions: it may name a panel that no
 * longer exists, and it will not name one added since. Keep what it knows, in
 * its order, then append anything it has not heard of.
 */
export function resolveOrder(saved: PanelId[] | undefined): PanelId[] {
  const known = (saved ?? []).filter((id) => ALL_PANELS.includes(id))
  const seen = new Set(known)
  return [...known, ...ALL_PANELS.filter((id) => !seen.has(id))]
}
