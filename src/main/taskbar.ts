import { execFile, execFileSync } from 'node:child_process'

/**
 * Windows has no per-monitor taskbar switch: "Show my taskbar on all displays"
 * is all or nothing across every secondary. So the panel's own taskbar window
 * is hidden directly instead, leaving the other monitors alone.
 *
 * This is unsupported, and Windows undoes it whenever the shell rebuilds its
 * taskbars, so it is re-applied on display changes and on a slow timer.
 *
 * Electron cannot call user32 itself, hence PowerShell. The script is passed as
 * -EncodedCommand so no quoting or temp file is involved.
 */

export interface PanelSize {
  /** Physical pixels, so it can be compared with what user32 reports. */
  width: number
  height: number
}

/** Explorer rebuilds its taskbars on restart, which silently undoes this. */
const REASSERT_MS = 5 * 60_000

const SW_HIDE = 0
const SW_SHOW = 5

let timer: NodeJS.Timeout | null = null
let current: { size: PanelSize; hidden: boolean } | null = null

/**
 * Matches the taskbar by its monitor's physical size rather than its position,
 * because Electron reports display bounds in device-independent pixels and
 * user32 reports them in physical ones. The process is made per-monitor DPI
 * aware first so the two agree on mixed-scaling setups.
 */
const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class HyteTaskbar {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
  }
  public static int Apply(int width, int height, int command) {
    // PER_MONITOR_AWARE_V2. Fails harmlessly if the host already set awareness.
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {}
    int touched = 0;
    EnumWindows((h, l) => {
      var name = new StringBuilder(64);
      GetClassName(h, name, 64);
      if (name.ToString() != "Shell_SecondaryTrayWnd") return true;
      IntPtr monitor = MonitorFromWindow(h, 2); // MONITOR_DEFAULTTONEAREST
      var info = new MONITORINFO();
      info.cbSize = Marshal.SizeOf(info);
      if (!GetMonitorInfo(monitor, ref info)) return true;
      if (info.rcMonitor.Right - info.rcMonitor.Left != width) return true;
      if (info.rcMonitor.Bottom - info.rcMonitor.Top != height) return true;
      ShowWindow(h, command);
      touched++;
      return true;
    }, IntPtr.Zero);
    return touched;
  }
}
'@
[HyteTaskbar]::Apply(__WIDTH__, __HEIGHT__, __COMMAND__)
`

function args(size: PanelSize, hidden: boolean): string[] {
  const script = SCRIPT.replace('__WIDTH__', String(Math.round(size.width)))
    .replace('__HEIGHT__', String(Math.round(size.height)))
    .replace('__COMMAND__', String(hidden ? SW_HIDE : SW_SHOW))
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')
  ]
}

function run(size: PanelSize, hidden: boolean): void {
  if (process.platform !== 'win32') return

  execFile(
    'powershell.exe',
    args(size, hidden),
    { windowsHide: true, timeout: 20_000 },
    (err, stdout) => {
      if (err) {
        console.error('[taskbar] could not reach the panel taskbar:', err.message)
        return
      }
      const touched = Number(String(stdout).trim())
      // Zero is normal once hidden: a hidden window keeps matching, but a
      // display that has gone away has no taskbar to find at all.
      if (!Number.isNaN(touched) && touched === 0) {
        console.warn(`[taskbar] no taskbar found on a ${size.width}x${size.height} display`)
      }
    }
  )
}

/**
 * Applies the wanted state now and keeps re-applying it. Safe to call again
 * with a new size or state; the previous timer is replaced.
 */
export function applyPanelTaskbar(size: PanelSize, hidden: boolean): void {
  current = { size, hidden }
  if (timer) clearInterval(timer)
  timer = null

  run(size, hidden)

  // Only worth re-asserting a hidden taskbar. Showing one is a one-off.
  if (hidden) {
    timer = setInterval(() => run(size, true), REASSERT_MS)
    timer.unref()
  }
}

/**
 * Puts the taskbar back, for quit. Synchronous on purpose: an async spawn would
 * be killed with the app and leave the taskbar hidden with nothing to restore
 * it. Does nothing if it was never hidden.
 */
export function restorePanelTaskbar(): void {
  if (timer) clearInterval(timer)
  timer = null
  const previous = current
  current = null
  if (!previous?.hidden || process.platform !== 'win32') return

  try {
    execFileSync('powershell.exe', args(previous.size, false), {
      windowsHide: true,
      timeout: 20_000,
      stdio: 'ignore'
    })
  } catch (err) {
    console.error('[taskbar] could not restore the panel taskbar:', err)
  }
}
