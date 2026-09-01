import { render } from 'preact'
import { App } from './app'
import './styles.css'

/**
 * Everything is sized in rem and the root font size tracks the panel height, so
 * the same layout holds on the 682px case display and in a windowed dev session
 * without a pile of media queries.
 */
const DESIGN_HEIGHT = 682

function scaleToViewport(): void {
  const scale = window.innerHeight / DESIGN_HEIGHT
  document.documentElement.style.fontSize = `${16 * scale}px`
}

scaleToViewport()
window.addEventListener('resize', scaleToViewport)

render(<App />, document.getElementById('root') as HTMLElement)
