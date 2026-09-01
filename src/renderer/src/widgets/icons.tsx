import type { JSX } from 'preact'
import type { SourceId } from '@shared/types'

/** Simplified marks, not brand logos. Drawn in currentColor to follow the theme. */

type IconProps = { class?: string }

function Svg({ children, ...props }: IconProps & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class={props.class}>
      {children}
    </svg>
  )
}

/** Gmail. */
function Envelope(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2.5"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <path
        d="M3.5 7.5 12 13.5l8.5-6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </Svg>
  )
}

/** Proton. A padlock reads faster than a second envelope. */
function Padlock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="4"
        y="10.5"
        width="16"
        height="10"
        rx="2.5"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <path
        d="M7.75 10.5V8a4.25 4.25 0 0 1 8.5 0v2.5"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
    </Svg>
  )
}

/** Bluesky. */
function Butterfly(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 9.6C10.3 5.9 7.2 3.6 4.9 4.2 3.1 4.7 2.6 6.9 3.2 9.3c.5 2 1.8 3.4 3.5 3.9-1.8.5-2.9 1.6-2.6 3 .3 1.4 1.9 2 3.5 1.4 1.8-.7 3.4-2.4 4.4-4.4 1 2 2.6 3.7 4.4 4.4 1.6.6 3.2 0 3.5-1.4.3-1.4-.8-2.5-2.6-3 1.7-.5 3-1.9 3.5-3.9.6-2.4.1-4.6-1.7-5.1-2.3-.6-5.4 1.7-7.1 5.4Z"
        fill="currentColor"
      />
    </Svg>
  )
}

/** Discord. */
function ChatFace(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M15.4 5.4a15.6 15.6 0 0 1 3.9 1.2c1.5 2.8 2.4 6.3 2.1 10.4a13.5 13.5 0 0 1-4.2 2.1l-.9-1.4c.8-.3 1.5-.7 2.1-1.1a11.3 11.3 0 0 1-12.8 0c.6.4 1.3.8 2.1 1.1l-.9 1.4a13.5 13.5 0 0 1-4.2-2.1c-.2-3.5.5-7 2.3-10.4a15.6 15.6 0 0 1 3.9-1.2"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <ellipse cx="9.2" cy="12.8" rx="1.25" ry="1.55" fill="currentColor" />
      <ellipse cx="14.8" cy="12.8" rx="1.25" ry="1.55" fill="currentColor" />
    </Svg>
  )
}

const ICONS: Record<SourceId, (props: IconProps) => JSX.Element> = {
  gmail: Envelope,
  proton: Padlock,
  bluesky: Butterfly,
  discord: ChatFace
}

export function SourceIcon({ id, class: className }: { id: SourceId; class?: string }) {
  const Icon = ICONS[id]
  return <Icon class={className} />
}
