import { render } from 'preact'
import { App } from './app'
import './styles.css'

/**
 * The Y70 Touch Infinite panel is mounted portrait: 682 wide by 2560 tall.
 * Width is the tight dimension, so the root font size tracks it and everything
 * else is sized in rem. The same layout then holds on the panel and in a small
 * portrait dev window without a pile of media queries.
 */
const DESIGN_WIDTH = 682

function scaleToViewport(): void {
  const scale = window.innerWidth / DESIGN_WIDTH
  document.documentElement.style.fontSize = `${16 * scale}px`
}

// The settings window is an ordinary desktop window and wants ordinary sizing.
if (window.location.hash === '#settings') {
  document.documentElement.style.fontSize = '16px'
} else {
  scaleToViewport()
  window.addEventListener('resize', scaleToViewport)
}

render(<App />, document.getElementById('root') as HTMLElement)
