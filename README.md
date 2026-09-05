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
| 3 | Bluesky, Proton | Next |
| 4 | Task backends, on-screen keyboard | Tasks done, keyboard planned |
| 5 | Windows notification listener, Discord | Planned |
| 6 | Packaging, overnight dimming | Planned |

There is no Google sign-in, no Cloud project and no OAuth client. That is
deliberate, and the reason is [below](#why-not-the-google-api).

## Panels

Settings, Panels. Clock, Agenda, To-dos and Alerts can each be switched off. Rows
are built from the visible set rather than being fixed, so a hidden card leaves no
gap, and whichever of To-dos, Agenda or Alerts is still showing takes the leftover
height so the stack fills the screen.

The gear lives in the clock, so hiding the clock would stand the panel up with no
way back into settings. A settings button appears in the top corner instead.

## Backlog

- **On-screen keyboard.** Adding a to-do on the panel needs one; there is no
  keyboard on a case display.
- **Google Tasks.** Offered in settings but not built. It would need the OAuth
  path the rest of the app was moved off, and the weekly expiry with it.

## Running

```sh
npm install
npm run dev            # borderless on the case panel
npm run dev:windowed   # small window for layout work
npm run build
npm run check:ics      # parser checks: recurrence, timezones, all-day
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

Settings, Mail. IMAP over implicit TLS, `imap.gmail.com:993`.

Gmail needs an **app password**, which needs 2-Step Verification switched on:
`myaccount.google.com/security`, then `myaccount.google.com/apppasswords`.

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
| Proton | Bridge local IMAP | paid Proton plan, and STARTTLS in `imap.ts` |
| Bluesky | `getUnreadCount` | app password |
| Discord | Windows toast listener | sparse MSIX helper |

Discord has no supported way to read your own unread count, so it arrives through
`UserNotificationListener` instead.

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

**If touch does nothing**, Windows has the digitizer mapped to the wrong monitor. Run `TabletPC.cpl` → Setup, press Enter until the prompt appears on the panel, then touch it. Nothing in Device Manager will look wrong: the digitizer reports ready and `TouchGate` stays 1, the input just lands on another screen.

## Licence

MIT.
