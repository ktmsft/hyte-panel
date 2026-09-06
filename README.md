# Hyte Panel

A dashboard for the HYTE Y70 Touch Infinite's built-in display: calendar, to-dos, and notification counts.

The case screen is an ordinary DisplayPort monitor mounted portrait at 682 x 2560, so this is just an Electron app pinned to it.

## Status

Phases 1 and 2 done. Calendar and mail are live once you paste in a feed address
and an app password; Bluesky and Discord are still placeholders. The `PREVIEW DATA`
badge clears the moment real data lands, and the seeded examples never come back.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Shell, display detection, layout, theming | Done |
| 2 | Calendar feeds, Gmail unread | Done |
| 3 | Bluesky, Proton | Done |
| 4 | Task backends, task entry | Done |
| 5 | Windows notification listener, Discord | Done |
| 6 | Packaging, overnight dimming | Planned |

There is no Google sign-in, no Cloud project and no OAuth client. That is
deliberate, and the reason is [below](#why-not-the-google-api).

## System stats

Settings, System stats. Each number has its own checkbox, and anything switched
off is never read, so the cost matches what is on screen.

| Stat | Source | Cost |
| --- | --- | --- |
| CPU load, memory, uptime | Node's `os` | free |
| Disk | `fs.statfs` | free |
| GPU temp, load, VRAM, power, fan | `nvidia-smi` | one small spawn per refresh |
| CPU temperature | LibreHardwareMonitor's web server | one HTTP call |

Refreshed every 5 seconds. `nvidia-smi` installs with the NVIDIA driver, sits on
`PATH`, and needs no permissions, which makes the GPU the one piece of real
hardware telemetry available for nothing.

### What the colours mean

Amber and red mean act, not merely "high". Which needs different rules per stat,
because the same number means different things:

| Kind | Stats | Rule |
| --- | --- | --- |
| Temperature | CPU, GPU | Amber within 10°C of the limit, red within 3°C |
| Capacity | Memory, VRAM, disk | Amber at 85% full, red at 95% |
| Utilisation | Load, fan, power | Never coloured |

A GPU at 100% load is the machine doing its job; a disk at 100% is a problem. So
utilisation gets a bar and no judgement.

The GPU's limit is not guessed: `temperature.gpu.tlimit` reports how many degrees
of headroom the card has left, so the throttle point is the current reading plus
that. On the 5090 here it works out at 91°C.

The CPU has no such source, so **CPU temperature limit** is a setting, at 95°C by
default. That is AMD's maximum operating temperature for Ryzen 9000. Intel is
often 100, and older X3D parts 89. A wrong limit means wrong colours, so it is
worth checking against your own chip.

**CPU temperature is the awkward one.** Windows has no supported way to read it
on a modern desktop CPU: it lives in registers that need a kernel driver.
`MSAcpi_ThermalZoneTemperature` answers "Not supported" on this class of machine,
and where it does answer it reports a chipset zone rather than the CPU, so it is
not used.

LibreHardwareMonitor ships the driver. Three things have to be true:

1. It is **running**. The sensors exist only while it is alive.
2. It is running **as administrator**, or it cannot load its driver.
3. Its **web server** is on: Options, Remote Web Server, Run. Port 8085.

The web server is used rather than its WMI provider. A plain HTTP GET beats
spawning PowerShell every few seconds, and recent builds publish no WMI
namespace at all, so the WMI route simply does not work.

To have it there without thinking about it, register a scheduled task that runs
it at logon with highest privileges: that is the only way to start something
elevated without a UAC prompt each boot. The panel re-reads on every refresh and
is not cached, so starting or closing it shows up within five seconds either way.

Sensor naming is not consistent. On a Ryzen 9800X3D the package reads
`Core (Tctl/Tdie)`, with no "CPU" anywhere in the name, so the reading is matched
by a list of preferences and falls back to the hottest CPU sensor rather than one
fixed string. `npm run check:stats` prints what was found.

HYTE Nexus knows the CPU temperature, since displaying it is the point of the
Y70's screen, and its local service does answer on `127.0.0.1`. It returns 401 to
everything, though, so reading it would mean reverse engineering a private,
undocumented API that any Nexus update could change. Not worth building on.

## Bluesky

Settings, Bluesky. A handle and an app password, made in Bluesky under Settings,
Privacy and security, App passwords. No OAuth, no consent screen, nothing to
submit.

An app password cannot change the account password or delete the account, which
is the whole reason to use one.

Sessions are held in memory only. Access tokens are short-lived, so a stale one
is refreshed, and anything else falls back to signing in again, which the app
password always permits. Nothing but the password is stored, so a lost session
costs one request rather than a sign-in.

Counts come from `app.bsky.notification.getUnreadCount`, with
`listNotifications` filling in who did what. Refreshed every 2 minutes.

## Discord

Nothing to set up. The Alerts card counts the Discord notifications currently
waiting in Windows' Action Center, read straight from the notification store at
`%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db`.

**This is not Discord's unread badge**, and cannot be. Discord's RPC transport
gates message access behind the `rpc` OAuth scope, which Discord grants by
whitelist only, and a taskbar badge is not readable by anything. What this counts
is notifications waiting for attention: dismissing them clears it, and a message
that arrives while Discord is focused never raises a toast at all. For something
you glance at across a room, "waiting for you" is arguably the better number, but
it is a different number and worth knowing that.

The planned route was `UserNotificationListener`, which needs package identity,
so a sparse MSIX, a trusted certificate and a WinRT helper, because Electron
cannot call WinRT. It yields the same set of notifications. This reads the same
data with a SQL query and no packaging at all.

Two details make it work. The store is held open by the notification service, so
it is opened read-only and immutable rather than copied on every poll. And
payloads are stored as the decimal bytes of the toast XML, comma separated,
rather than as XML, so they are reassembled before the text is read.

`node:sqlite` runs the query, which Electron 44 has built in, so this adds no
dependency. Arrival times are 100ns ticks since 1601 and exceed what a JavaScript
number holds exactly, so they are read as BigInt.

Matching takes any notification source whose name contains `discord`, so the PTB
and Canary builds count too.

## Typing on the panel

There is no on-screen keyboard, on purpose. Windows already has one, and the PC
keyboard is nicer than poking at glass.

Tapping **Add a task** asks the main process to focus the panel window before the
field opens. That call is the whole point of this: the panel is held above other
windows, and a window can be raised without being made active, so without it the
field would take the caret while the keystrokes went to whatever was active on
another screen.

Enter adds and keeps the field open, since lists are usually written in a run.
Escape closes it, as does **Done** for when the keyboard is out of reach.

## Tapping an alert

Each alert opens something. Settings, Alerts, per source.

Anything with a scheme is handed to Windows to route, which is why Discord opens
the app rather than the website: it registers `discord://`. The same works for
`spotify:`, `steam://` and anything else that registers a handler. Anything
without a scheme is treated as a path to a program or file. Empty means the tile
does nothing.

Defaults are the web inboxes, except Discord, which goes to the app.

| Source | Opens |
| --- | --- |
| Gmail | `https://mail.google.com/mail/u/0/#inbox` |
| Proton | `https://mail.proton.me/u/0/inbox` |
| Bluesky | `https://bsky.app/notifications` |
| Discord | `discord://` |

These live beside `sources` rather than inside it, because the config merge is
one level deep: a saved `sources` replaces the default wholesale, so a field
added in there would vanish on every existing install.

## Panels

Settings, Panels. Clock, System, Agenda, To-dos and Alerts can each be switched off. Rows
are built from the visible set rather than being fixed, so a hidden card leaves no
gap, and whichever of To-dos, Agenda or Alerts is still showing takes the leftover
height so the stack fills the screen.

The gear lives in the clock, so hiding the clock would stand the panel up with no
way back into settings. A settings button appears in the top corner instead.

## Backlog

- **Google Tasks.** Offered in settings but not built. It would need the OAuth
  path the rest of the app was moved off, and the weekly expiry with it.

## Running

```sh
npm install
npm run dev            # borderless on the case panel
npm run dev:windowed   # small window for layout work
npm run build
npm run check:ics      # parser checks: recurrence, timezones, all-day
npm run check:stats    # read every stat source once, against this machine
npm run dev:taps       # same as dev, but prints where every touch lands
```

Settings open on the primary monitor, since the panel has no keyboard.

VS Code terminals export `ELECTRON_RUN_AS_NODE=1`, which makes Electron boot as plain Node. `scripts/electron-vite.mjs` strips it.

## Glass modes

| Mode | Behaviour |
| --- | --- |
| **Clear** (default) | Translucent cards, wallpaper stays sharp |
| **Frosted** | Windows 11 acrylic blurs behind the whole window, gaps included |
| **Solid** | Paints its own background |

Frosted needs `transparent: false` plus `backgroundColor: '#00000000'`. Setting `transparent: true` blocks the acrylic. CSS `backdrop-filter` cannot blur the desktop, so frosted cards over a sharp wallpaper is not possible in one window.

The panel is never a true fullscreen window, because Wallpaper Engine pauses the wallpaper under one.

## Theming

Colours are CSS custom properties written from config, so edits repaint live. Presets, per-colour pickers, font, text size, card opacity, text shadow.

Moving the glass tint across the light/dark line takes the ink with it, so off-white glass gets dark text.

## Calendars

Settings, Calendars. Add one row per calendar, each holding an iCalendar URL.

In Google Calendar: hover the calendar in the sidebar, three-dot menu, **Settings
and sharing**, then copy **Secret address in iCal format**. It ends in `/basic.ics`.

That address is a password in URL form. Anyone holding it can read the calendar,
so it is kept in the encrypted vault, never written to `config.json`, and never
shown again once saved. Reset it from the same page if it leaks.

Refreshed every 5 minutes. Google regenerates these feeds on its own schedule, so
an event added seconds ago can take a while to show up. That is the one real cost
of this approach over the API.

Recurring events are expanded locally, honouring `RRULE`, `EXDATE`, and moved or
cancelled occurrences carried as separate `RECURRENCE-ID` entries. `VTIMEZONE`
blocks in the feed are registered before expansion, so a meeting keeps its wall
clock time across a DST boundary. `npm run check:ics` exercises all of that
against a fixture.

One broken feed does not blank an agenda the others can still fill; the Agenda
card shows `Stale` instead.

## Mail

Settings, Mail. Two mailboxes, both IMAP; only the way in differs.

**Gmail** connects encrypted on `imap.gmail.com:993` and needs an **app
password**, which needs 2-Step Verification switched on:
`myaccount.google.com/security`, then `myaccount.google.com/apppasswords`.

**Proton** goes through Proton Bridge, which needs a paid plan and has to be
running: it is what turns the account into something IMAP can read. Bridge
listens on `127.0.0.1:1143` and starts unencrypted, upgrading with STARTTLS, so
`imap.ts` speaks both. Its password is Bridge's own, shown in Bridge beside the
account, not the Proton password.

Bridge signs its own certificate. That is accepted only when the host is
loopback, so the exception cannot follow the setting to a real server.

Read-only by construction: the mailbox is opened with `EXAMINE` and headers are
read with `BODY.PEEK`, so nothing is ever marked as read. The count is the number
of unseen messages in `INBOX`. Refreshed every 2 minutes.

Subject lines cost one extra IMAP command and nothing else, so they are on by
default. `UID SEARCH UNSEEN` already returns every unseen id, which is where the
count comes from, so subjects need no second round trip.

## Why not the Google API

The API path was written and working before being abandoned on purpose. It is not
in the history: it was written and removed inside one working session, so nothing
of it survived to a commit.

Calendar and Gmail scopes are classed sensitive or restricted. An unverified app
asking for them can only sign in while the consent screen is in **Testing**, and
Testing issues a refresh token *"expiring in 7 days, unless the only OAuth scopes
requested are a subset of name, email address, and user profile"*. Publishing to
production without verification does not lift that, it replaces it with a hard
block at sign-in:

> Access blocked: this app has not completed the Google verification process

So the choice was a weekly reconnect, or verification with a homepage, a privacy
policy, domain ownership and a review. For something that sits in a case and is
meant to be looked at rather than maintained, a secret iCal URL and an IMAP app
password do the same job and never expire.

Phase 4's Google Tasks option would need OAuth back, and would have to be written
again. The Microsoft To Do path uses its own loopback flow in `src/main/oauth.ts`,
which is close enough to start from.

## Tasks

Settings, Tasks. Microsoft To Do through Graph, or a local list held on this PC.

The app registration is four fields at `portal.azure.com`: Entra ID, App
registrations, New registration, **Personal Microsoft accounts only**, redirect
URI **Mobile and desktop applications** pointing at `http://localhost`. Copy the
**Application (client) ID** into settings. There is no secret and no permission to
configure: this is a public client using PKCE, and `Tasks.ReadWrite` is approved
by you at sign-in.

Microsoft rather than Google for the reason above. A public client needs no
consent screen to publish and nothing to submit for review, and its refresh tokens
last 90 days and are replaced on every use, so a panel that polls all day never
signs in twice.

Completed tasks are hidden, matching To Do's own view. Edits are applied to the
panel first and sent afterwards: a checkbox that waits on a round trip feels
broken under a finger, and the refresh that follows corrects anything that did not
land. Refreshed every 2 minutes.

## Sources

| Source | Reads via | Needs |
| --- | --- | --- |
| Calendar | Secret iCal URL | Nothing. Done, see above |
| Gmail | IMAP | App password, so 2-Step Verification on. Done, see above |
| Proton | Bridge local IMAP | paid Proton plan, Bridge running. Done, see above |
| Bluesky | `getUnreadCount` | app password. Done, see above |
| Discord | Windows notification store | nothing. Done, see above |

Discord has no supported way to read your own unread count. See below for what
arrives instead.

## Taskbar

Settings, Behaviour, **Hide the Windows taskbar on the panel**. Off by default: a
fresh install should not quietly rearrange the desktop.

Windows has no per-monitor switch. Its own setting, *Show my taskbar on all
displays* (`MMTaskbarEnabled`), is all or nothing across every secondary, so
turning it off would strip the taskbar from other monitors too. Instead the
panel's own taskbar window is hidden directly, and the rest are left alone.

`src/main/taskbar.ts` finds the `Shell_SecondaryTrayWnd` whose monitor matches
the panel's size and calls `ShowWindow(SW_HIDE)`. Electron cannot call user32, so
it shells out to PowerShell, passed as `-EncodedCommand` to avoid quoting and
temp files. Matching is by monitor size rather than position, because Electron
reports display bounds in device-independent pixels and user32 in physical ones;
the script sets per-monitor DPI awareness first so the two agree.

This is unsupported and Windows undoes it whenever the shell rebuilds its
taskbars, so it is re-applied at startup, on display changes, and every 5
minutes. It is put back when the app quits.

**If the taskbar is ever left hidden**, the app was killed rather than closed, so
its restore never ran. Restart Explorer, or start the app and quit it properly.

## Layout

```
src/main/      Node. Credentials, polling, helper process.
src/main/feeds/   iCalendar and IMAP adapters.
src/main/imap.ts  Minimal IMAP client, reused by Proton in phase 3.
src/main/taskbar.ts  Hides the panel display's taskbar. See above.
src/main/oauth.ts    Loopback PKCE flow for a public client.
src/main/tasks/    Microsoft To Do, and the local fallback.
src/main/stats/    CPU, memory, disk and GPU readings.
src/main/sources/  Windows notification store, for Discord.
src/preload/   contextBridge.
src/renderer/  Preact UI. Never sees a token.
src/shared/    Types and IPC names.
helper/        .NET notification listener (phase 5).
```

Credentials are encrypted with `safeStorage` (DPAPI) in `secrets.json` under `userData`,
next to `config.json`, never in the repo. DPAPI is scoped to the Windows account, so that
file is useless if copied elsewhere. The renderer only ever learns whether a credential is
set, never its value.

Two runtime dependencies: `preact`, and `ical.js` for feed parsing. Recurrence expansion
and `VTIMEZONE` resolution are not worth hand-rolling. `ical.js` is MPL-2.0, which is
file-level copyleft and does not affect this project's MIT licence as long as its own files
are left unmodified. IMAP is hand-rolled, because the parts needed here are small and phase
3 needs the same client for Proton Bridge.

Nexus Link also wants this display. Turn its screen feature off if the two fight.

**If a tap does nothing**, run `npm run dev:taps` and touch the thing that will
not respond. Coordinates in the console mean the touch arrived, and the problem
is above that line. Silence means it never reached the window, and the mapping
below is the first thing to check.

**If touch does nothing at all**, Windows has the digitizer mapped to the wrong monitor. Run `TabletPC.cpl` → Setup, press Enter until the prompt appears on the panel, then touch it. Nothing in Device Manager will look wrong: the digitizer reports ready and `TouchGate` stays 1, the input just lands on another screen.

## Licence

MIT.
