# Hyte Panel

A dashboard for the HYTE Y70 Touch Infinite's built-in display: clock, system stats, calendar, to-dos and alerts.

The case screen is an ordinary DisplayPort monitor mounted portrait at 682x2560, so this is just an Electron app pinned to it.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Shell, display detection, layout, theming | Done |
| 2 | Calendar feeds, Gmail | Done |
| 3 | Bluesky, Proton | Done |
| 4 | Tasks | Done |
| 5 | Discord | Done |
| 6 | Packaging | Done |
| 7 | Overnight dimming | Done |

No Google sign-in, no Cloud project, no OAuth client. See [below](#why-not-the-google-api).

## Running

```sh
npm install
npm run dev            # borderless on the case panel
npm run dev:windowed   # small window for layout work
npm run dev:taps       # prints where every touch lands
npm run build

npm run check:ics      # recurrence, timezones, all-day
npm run check:stats    # read every stat source once
npm run check:badge    # read Discord's taskbar badge once
```

Settings open on the primary monitor, since the panel has no keyboard.

## Installing

```sh
npm run dist     # release/Hyte Panel Setup <version>.exe
```

Run the installer. It's per-user, so no admin prompt, and lands in
`%LOCALAPPDATA%\Programs\hyte-panel`.

Starting with Windows is on by default — Settings, Behaviour. Only a packaged
build registers itself; `npm run dev` deliberately leaves the setting alone,
since in dev the executable is Electron rather than the app.

The installed app and `npm run dev` share one config and credential vault, so
settings carry across. They also share a single-instance lock, so only one runs:
quit the installed app before `npm run dev`, or dev will just focus it and exit.

Changes reach the installed app only through `npm run dist` and reinstalling.

VS Code terminals export `ELECTRON_RUN_AS_NODE=1`, which makes Electron boot as plain Node. `scripts/electron-vite.mjs` strips it.

## Calendars

Settings, Calendars. One row per calendar, each holding an iCalendar URL.

In Google Calendar: hover the calendar, three-dot menu, **Settings and sharing**, then copy **Secret address in iCal format**. It ends in `/basic.ics`.

That address is a password in URL form, so it goes in the encrypted vault and is never shown again once saved. Reset it from the same page if it leaks.

Refreshed every 5 minutes. Google regenerates these feeds on its own schedule, so a new event can take a while to appear — the one real cost of not using the API.

Recurring events are expanded locally: `RRULE`, `EXDATE`, `RECURRENCE-ID` overrides, and `VTIMEZONE` so a meeting keeps its wall clock time across DST. One broken feed doesn't blank the others; the card shows `Stale`.

## Mail

Settings, Mail. Two mailboxes, both IMAP.

**Gmail** connects on `imap.gmail.com:993` and needs an **app password**, which needs 2-Step Verification on: `myaccount.google.com/apppasswords`.

**Proton** goes through Proton Bridge, which needs a paid plan and has to be running. It listens on `127.0.0.1:1143` and upgrades with STARTTLS. Its password is Bridge's own, shown beside the account in Bridge — not your Proton password.

Bridge signs its own certificate, accepted only on loopback.

Nothing is ever marked read: `EXAMINE` to open, `BODY.PEEK` for headers. Refreshed every 2 minutes. Subject lines cost no extra round trip, so they're on by default.

## Bluesky

Settings, Bluesky. Handle and an app password, made under Settings, Privacy and security, App passwords. An app password can't change or delete the account.

Sessions live in memory only; a lost one costs a single sign-in. Refreshed every 2 minutes.

## Discord

Nothing to set up. The Alerts card shows the number on Discord's taskbar icon.

That number is read from the icon itself. Windows also exposes a count in the taskbar button's accessibility text, but it disagrees with what's drawn — three DMs from two people read as "2 notifications" beside an icon showing 3. So the badge is matched against Discord's own `badge-N.ico` artwork, which is what the shell draws.

`PrintWindow` renders the taskbar even when a fullscreen game covers it, which is when the panel gets looked at.

This counts what Discord badges: mentions and DMs, not every unread channel. Above nine it draws "9+", so the panel shows 9 as a floor.

Discord has no supported way to read your unread count directly — RPC gates it behind a whitelisted OAuth scope.

## Tasks

Settings, Tasks. Microsoft To Do through Graph, or a local list on this PC.

The app registration is four fields at `portal.azure.com`: Entra ID, App registrations, New registration, **Personal Microsoft accounts only**, redirect URI **Mobile and desktop applications** pointing at `http://localhost`. Copy the **Application (client) ID** into settings. No secret, nothing to configure — it's a public client using PKCE.

Microsoft rather than Google because a public client needs no review, and its refresh tokens last 90 days.

Completed tasks are hidden. Edits apply to the panel first and send afterwards, so a checkbox doesn't wait on a round trip. Refreshed every 2 minutes.

## System stats

Settings, System stats. Each number has its own checkbox, and anything switched off is never read.

| Stat | Source |
| --- | --- |
| CPU load, memory, uptime | Node's `os` |
| Disk | `fs.statfs` |
| GPU temp, load, VRAM, power, fan | `nvidia-smi` |
| CPU temperature | LibreHardwareMonitor's web server |

Refreshed every 5 seconds.

### Colours

Amber and red mean act, not merely "high".

| Kind | Stats | Rule |
| --- | --- | --- |
| Temperature | CPU, GPU | Amber within 10°C of the limit, red within 3°C |
| Capacity | Memory, VRAM, disk | Amber at 85%, red at 95% |
| Utilisation | Load, fan, power | Never coloured |

A GPU at 100% load is doing its job; a disk at 100% is a problem.

The GPU's limit comes from `temperature.gpu.tlimit`, which reports remaining headroom. The CPU has no equivalent, so **CPU temperature limit** is a setting, defaulting to 95°C (AMD's max for Ryzen 9000; Intel is often 100, older X3D parts 89). A wrong limit means wrong colours.

### CPU temperature needs LibreHardwareMonitor

Windows has no supported way to read a modern desktop CPU's temperature — it needs a kernel driver. LibreHardwareMonitor ships one. Three things must be true:

1. It's **running**.
2. It's running **as administrator**, or the driver won't load.
3. Its **web server** is on: Options, Remote Web Server, Run. Port 8085.

To have it there without thinking about it, register a scheduled task that runs it at logon with highest privileges — the only way to start something elevated without a UAC prompt.

Sensor names vary. A 9800X3D reads `Core (Tctl/Tdie)`, with no "CPU" in the name, so sensors are matched by a preference list and fall back to the hottest CPU sensor. `npm run check:stats` prints what was found.

## Picture

Settings, Picture. One image, or a folder cycled through. GIFs animate. The only card with a height of its own.

The renderer has no file access, so pictures come through a scheme of the app's own, fenced to the chosen file or the chosen folder's direct children. Folders are read in name order and re-read when the source changes, not continuously.

## Panels

Settings, Panels. Every card can be switched off and dragged into order. Hidden cards leave no gap, and whichever of To-dos, Agenda or Alerts is still showing takes the leftover height.

The saved order is reconciled against the panels that exist, so an old order still picks up new cards.

The gear lives in the clock, so hiding the clock puts a settings button in the top corner instead.

## Alerts

Each tile opens something. Settings, Alerts, per source.

Anything with a scheme is handed to Windows, which is why Discord opens the app rather than the website. Anything without one is treated as a path. Empty means the tile does nothing.

| Source | Opens |
| --- | --- |
| Gmail | `https://mail.google.com/mail/u/0/#inbox` |
| Proton | `https://mail.proton.me/u/0/inbox` |
| Bluesky | `https://bsky.app/notifications` |
| Discord | `discord://` |

## Typing

No on-screen keyboard, on purpose — Windows has one, and the PC keyboard is nicer than poking at glass.

**Add a task** focuses the panel window before the field opens. Without that the field would take the caret while keystrokes went to whatever was active on another screen.

Enter adds and keeps the field open. Escape closes it, as does **Done**.

## Taskbar

Settings, Behaviour, **Hide the Windows taskbar on the panel**. Off by default.

Windows has no per-monitor switch — its own setting is all or nothing across every secondary — so the panel's own taskbar window is hidden directly and the rest are left alone.

This is unsupported, and Windows undoes it whenever the shell rebuilds its taskbars, so it's re-applied at startup, on display changes, and every 5 minutes. It's put back on quit.

**If the taskbar is left hidden**, the app was killed rather than closed. Restart Explorer, or start the app and quit it properly.

## Appearance

| Glass mode | Behaviour |
| --- | --- |
| **Clear** (default) | Translucent cards, wallpaper stays sharp |
| **Frosted** | Windows 11 acrylic, blurs the whole window including gaps |
| **Solid** | Paints its own background |

Frosted needs `transparent: false`. CSS `backdrop-filter` can't blur the desktop, so frosted cards over a sharp wallpaper isn't possible in one window.

The panel is never truly fullscreen, because Wallpaper Engine pauses the wallpaper under one.

**Dim overnight** (Settings, Behaviour) fades the page between two hours, 23:00 to 07:00 by default. It dims the page rather than the backlight, so the screen never has to wake up and a glance still reads. The window may wrap past midnight.

Colours are CSS custom properties written from config, so edits repaint live. Moving the glass tint across the light/dark line takes the ink with it.

## Why not the Google API

Calendar and Gmail scopes are classed sensitive or restricted. An unverified app can only sign in while the consent screen is in **Testing**, and Testing issues refresh tokens expiring in 7 days. Publishing without verification doesn't lift that — it replaces it with a hard block:

> Access blocked: this app has not completed the Google verification process

So: a weekly reconnect, or verification with a homepage, privacy policy, domain ownership and a review. A secret iCal URL and an IMAP app password do the same job and never expire.

Google Tasks is offered in settings but not built, for the same reason. `src/main/oauth.ts` has the loopback PKCE flow if it's ever wanted.

## Layout

```
src/main/           Node. Credentials, polling, windows.
src/main/feeds/     iCalendar and IMAP adapters.
src/main/sources/   Discord badge, Windows notifications, Bluesky.
src/main/stats/     CPU, memory, disk and GPU readings.
src/main/tasks/     Microsoft To Do, and the local fallback.
src/main/imap.ts    Minimal IMAP client, shared by Gmail and Proton.
src/main/oauth.ts   Loopback PKCE flow for a public client.
src/main/taskbar.ts Hides the panel display's taskbar.
src/preload/        contextBridge.
src/renderer/       Preact UI. Never sees a token.
src/shared/         Types and IPC names.
scripts/            Check harnesses, and the electron-vite wrapper.
build/              App icon, picked up by electron-builder.
```

Credentials are encrypted with `safeStorage` (DPAPI) in `secrets.json` under `userData`, never in the repo. DPAPI is scoped to the Windows account, so the file is useless if copied elsewhere. The renderer only learns whether a credential is set, never its value.

Two runtime dependencies: `preact`, and `ical.js` for feed parsing. IMAP is hand-rolled — the parts needed here are small.

## Troubleshooting

**A tap does nothing.** Run `npm run dev:taps` and touch it. Coordinates in the console mean the touch arrived and the problem is above that line; silence means it never reached the window.

**Touch does nothing at all.** Windows has the digitizer mapped to the wrong monitor. Run `TabletPC.cpl` → Setup, press Enter until the prompt appears on the panel, then touch it. Nothing in Device Manager will look wrong.

**The panel is the wrong size.** Changing any display's scale factor makes Windows rescale this window too. It re-fits itself, but a restart settles it.

**Nexus Link fights for the display.** Turn its screen feature off.

**The installed app exits immediately when launched from a terminal.** VS Code
terminals export `ELECTRON_RUN_AS_NODE=1`, which makes the exe boot as plain
Node and quit. It only affects launches from that shell — Explorer and startup
are fine. `Remove-Item Env:\ELECTRON_RUN_AS_NODE` first if you need to.

## Licence

MIT.
