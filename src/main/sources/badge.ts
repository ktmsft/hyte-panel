import { execFile } from 'node:child_process'
import { join } from 'node:path'
import type { AppBadge } from '@shared/types'

/**
 * Reading the number on an app's taskbar icon.
 *
 * The notification store answers "what is waiting in Action Center", which is
 * not this number. Discord withdraws a toast once you have looked at the
 * channel but keeps badging the icon until the message is read, so an unread
 * mention badges the taskbar and leaves the store empty.
 *
 * Windows also exposes a count in the taskbar button's HelpText, and that was
 * the obvious thing to read, but it disagrees with the icon: three direct
 * messages from two people gave "2 notifications" beside an icon showing 3. It
 * appears to count conversations. The icon is what you actually look at, so the
 * icon is what this reads.
 *
 * That means reading pixels. Two things make it reliable rather than a guess:
 *
 * - PrintWindow with PW_RENDERFULLCONTENT draws the taskbar even when a
 *   fullscreen game covers it, which is exactly when the panel gets glanced at.
 *   A plain screen grab returns whatever is on top instead.
 * - Discord ships the very images the shell draws, as badge-1.ico upward, so a
 *   digit is identified by comparing against the app's own artwork rather than
 *   by recognising glyphs. Both sides are framed to the red disc and put
 *   through the same shrink, so neither position nor blur is what gets
 *   measured.
 *
 * What this counts is the app's own badge: for Discord, mentions and direct
 * messages, not every unread channel.
 */

/** UIA runs on the shell's UI thread; a wedged shell must not wedge the poll. */
const TIMEOUT_MS = 10_000

/** Discord's stable build. Its PTB and Canary builds keep their own folders. */
export const DISCORD_AUMID = 'com.squirrel.Discord.Discord'

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing,UIAutomationClient,UIAutomationTypes,WindowsBase -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Automation;

public class HyteBadge {
  [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string win);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

  const int NORM = 24;
  const int PAD = 4;

  static bool IsBadgeRed(Color p) {
    return p.A > 120 && p.R > 110 && p.R > p.G * 1.5 && p.R > p.B * 1.5;
  }

  // Tight bounds of the red disc, so both sides are framed the same way.
  static Rectangle RedBox(Bitmap bm) {
    int minx = int.MaxValue, miny = int.MaxValue, maxx = -1, maxy = -1;
    for (int y = 0; y < bm.Height; y++)
      for (int x = 0; x < bm.Width; x++)
        if (IsBadgeRed(bm.GetPixel(x, y))) {
          if (x < minx) minx = x; if (y < miny) miny = y;
          if (x > maxx) maxx = x; if (y > maxy) maxy = y;
        }
    if (maxx < 0) return Rectangle.Empty;
    return new Rectangle(minx, miny, maxx - minx + 1, maxy - miny + 1);
  }

  static Bitmap Normalise(Bitmap src, Rectangle box) {
    Bitmap outp = new Bitmap(NORM, NORM);
    using (Graphics g = Graphics.FromImage(outp)) {
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.DrawImage(src, new Rectangle(0, 0, NORM, NORM), box, GraphicsUnit.Pixel);
    }
    return outp;
  }

  // Only pixels inside the disc are compared. Outside it the live badge shows
  // whatever the app icon put there, noise that would swamp the digit.
  static double Distance(Bitmap a, Bitmap b) {
    double sum = 0; int counted = 0;
    double mid = (NORM - 1) / 2.0, limit = (NORM * 0.44) * (NORM * 0.44);
    for (int y = 0; y < NORM; y++)
      for (int x = 0; x < NORM; x++) {
        double dx = x - mid, dy = y - mid;
        if (dx * dx + dy * dy > limit) continue;
        Color p = a.GetPixel(x, y), q = b.GetPixel(x, y);
        int dr = p.R - q.R, dg = p.G - q.G, db = p.B - q.B;
        sum += dr * dr + dg * dg + db * db;
        counted++;
      }
    return counted == 0 ? double.MaxValue : sum / counted;
  }

  // Nearest of the app's own badge images. Each is first shrunk to the size the
  // shell drew, so the comparison is of glyphs and not of sharpness.
  static int Match(Bitmap live, string iconDir, int drawnSize, out int scored) {
    int bestN = 0; double bestScore = double.MaxValue; scored = 0;
    for (int n = 1; n <= 11; n++) {
      string path = System.IO.Path.Combine(iconDir, "badge-" + n + ".ico");
      if (!System.IO.File.Exists(path)) continue;
      using (Icon ic = new Icon(path, new Size(32, 32)))
      using (Bitmap ib = ic.ToBitmap())
      using (Bitmap flat = new Bitmap(drawnSize, drawnSize)) {
        using (Graphics fg = Graphics.FromImage(flat)) {
          fg.Clear(Color.FromArgb(28, 28, 28));
          fg.InterpolationMode = InterpolationMode.HighQualityBicubic;
          fg.DrawImage(ib, new Rectangle(0, 0, drawnSize, drawnSize));
        }
        Rectangle rb = RedBox(flat);
        if (rb == Rectangle.Empty) continue;
        using (Bitmap norm = Normalise(flat, rb)) {
          double d = Distance(live, norm);
          scored++;
          if (d < bestScore) { bestScore = d; bestN = n; }
        }
      }
    }
    return bestN;
  }

  public static string Read(string aumid, string iconDir) {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {}

    AutomationElement root = AutomationElement.RootElement;
    AutomationElement trayEl = root.FindFirst(TreeScope.Children,
      new PropertyCondition(AutomationElement.ClassNameProperty, "Shell_TrayWnd"));
    if (trayEl == null) return "notray";
    AutomationElement button = trayEl.FindFirst(TreeScope.Descendants,
      new PropertyCondition(AutomationElement.AutomationIdProperty, "Appid: " + aumid));
    if (button == null) return "nobutton";

    // The overlay is a second Image child. A button with no badge has only its
    // own icon, which is how "nothing waiting" is told from "cannot read".
    System.Windows.Rect overlay = System.Windows.Rect.Empty;
    double smallest = double.MaxValue;
    int images = 0;
    TreeWalker walker = TreeWalker.RawViewWalker;
    for (AutomationElement k = walker.GetFirstChild(button); k != null; k = walker.GetNextSibling(k)) {
      if (k.Current.ControlType != ControlType.Image) continue;
      images++;
      System.Windows.Rect r = k.Current.BoundingRectangle;
      if (r.Width * r.Height < smallest) { smallest = r.Width * r.Height; overlay = r; }
    }
    if (images < 2 || overlay.IsEmpty) return "count=0";

    IntPtr tray = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Shell_TrayWnd", null);
    RECT tr;
    if (tray == IntPtr.Zero || !GetWindowRect(tray, out tr)) return "notray";

    using (Bitmap shot = new Bitmap(tr.Right - tr.Left, tr.Bottom - tr.Top)) {
      using (Graphics g = Graphics.FromImage(shot)) {
        IntPtr dc = g.GetHdc();
        bool ok = PrintWindow(tray, dc, 2); // PW_RENDERFULLCONTENT
        g.ReleaseHdc(dc);
        if (!ok) return "noprint";
      }
      int cx = Math.Max(0, (int)overlay.X - tr.Left - PAD);
      int cy = Math.Max(0, (int)overlay.Y - tr.Top - PAD);
      int cw = Math.Min(shot.Width - cx, (int)overlay.Width + PAD * 2);
      int ch = Math.Min(shot.Height - cy, (int)overlay.Height + PAD * 2);
      if (cw <= 0 || ch <= 0) return "offscreen";
      using (Bitmap crop = shot.Clone(new Rectangle(cx, cy, cw, ch), shot.PixelFormat)) {
        Rectangle box = RedBox(crop);
        if (box == Rectangle.Empty) return "count=0";
        using (Bitmap live = Normalise(crop, box)) {
          int scored;
          int n = Match(live, iconDir, Math.Max(box.Width, box.Height), out scored);
          if (scored == 0) return "noicons";
          return "count=" + (n == 10 ? "9+" : n == 11 ? "dot" : n.ToString());
        }
      }
    }
  }
}
'@
[HyteBadge]::Read('__AUMID__', '__ICONDIR__')
`

function args(aumid: string, iconDir: string): string[] {
  const script = SCRIPT.replace('__AUMID__', aumid.replace(/'/g, "''")).replace(
    '__ICONDIR__',
    iconDir.replace(/'/g, "''")
  )
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
 * `dot` is a badge with nothing to count: something is unread but the app is
 * not saying how much, so there is no number to show.
 */
function parse(stdout: string): AppBadge | null {
  const line = stdout.trim().split(/\r?\n/).pop()?.trim() ?? ''
  if (!line.startsWith('count=')) {
    // A missing button is an answer: the app is not on the taskbar to badge.
    if (line === 'nobutton' || line === 'notray') return { count: 0, pinned: false }
    console.error('[badge] could not read the taskbar:', line || 'no output')
    return null
  }

  const value = line.slice('count='.length)
  if (value === 'dot') return { count: 0, pinned: true }
  // "9+" is the app's own cap, so nine is a floor rather than the true number.
  if (value === '9+') return { count: 9, pinned: true }

  const count = Number(value)
  return Number.isFinite(count) ? { count, pinned: true } : null
}

/**
 * The badge on a taskbar button, or null when it could not be read at all.
 * `iconDir` holds the app's own badge artwork, which the digit is matched to.
 */
export function readTaskbarBadge(
  aumid: string,
  iconDir = join(process.env.APPDATA ?? '', 'discord')
): Promise<AppBadge | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      args(aumid, iconDir),
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
