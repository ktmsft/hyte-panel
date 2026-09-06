import { execFile } from 'node:child_process'
import type { AppBadge } from '@shared/types'

/**
 * Reading an app's taskbar badge.
 *
 * The notification store answers "what is waiting in Action Center", which is
 * not the number Discord puts on its icon. Discord clears its toasts once you
 * have looked at the channel, so an unread conversation you have not opened
 * shows a badge and no toast at all, and the store honestly reports nothing.
 *
 * The badge itself is readable. Windows exposes each taskbar button through UI
 * Automation, and the overlay a shell puts on its icon lands in the button's
 * HelpText as "N notifications". That is the same glyph you are looking at, so
 * the panel and the taskbar agree by construction.
 *
 * What this counts is the app's own definition of a badge. For Discord that is
 * mentions and direct messages, not every unread channel.
 */

/** UIA is on the shell's UI thread; a wedged shell must not wedge the poll. */
const TIMEOUT_MS = 8_000

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$trayCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd')
$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $trayCondition)
if (-not $tray) { Write-Output 'notray'; exit }
$idCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'Appid: __AUMID__')
$button = $tray.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $idCondition)
if (-not $button) { Write-Output 'nobutton'; exit }
Write-Output ('help=' + $button.Current.HelpText)
`

function args(aumid: string): string[] {
  const script = SCRIPT.replace('__AUMID__', aumid.replace(/'/g, "''"))
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')
  ]
}

/**
 * A button with no overlay has empty HelpText, which is a badge of zero rather
 * than a failure: the app is pinned and simply has nothing waiting.
 */
function parse(stdout: string): AppBadge {
  const line = stdout.trim()
  if (line === 'notray' || line === 'nobutton') return { count: 0, pinned: false }

  const help = line.startsWith('help=') ? line.slice('help='.length).trim() : ''
  if (!help) return { count: 0, pinned: true }

  const digits = help.match(/\d+/)
  return { count: digits ? Number(digits[0]) : 0, pinned: true }
}

/**
 * The badge on a taskbar button, or null when the shell could not be asked.
 * `aumid` is the button's application id, such as `com.squirrel.Discord.Discord`.
 */
export function readTaskbarBadge(aumid: string): Promise<AppBadge | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      args(aumid),
      { windowsHide: true, timeout: TIMEOUT_MS },
      (err, stdout) => {
        if (err) {
          console.error('[badge] could not read the taskbar:', err.message)
          resolve(null)
          return
        }
        resolve(parse(String(stdout)))
      }
    )
  })
}
