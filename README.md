# Hyte Panel

A dashboard for the HYTE Y70 Touch Infinite's built-in display: today's calendar, a to-do list you can tick with a fingertip, and notification counts for the accounts that actually matter.

The case screen is an ordinary DisplayPort monitor (14.9", 10-point touch), mounted portrait at 682 x 2560, so this is just an Electron app pinned fullscreen to it.

```
+---------------------------+
| 09:41         Settings    |
| Monday, 1 September       |
| . Gmail          2m ago   |
| . Proton    unconfigured  |
+---------------------------+
| AGENDA                    |
| 10:15  Standup            |
| 13:00  Design review      |
+---------------------------+
| TO DO            3 open   |
| [ ] Ship the panel shell  |
| [ ] Wire Google OAuth     |
| [x] Mount the panel       |
|                           |
| + Add a task              |
+---------------------------+
| ALERTS                    |
|   3  Gmail                |
|  12  Bluesky              |
+---------------------------+
```

To-dos take whatever height the other three do not, which is what makes 2560px of screen worth having.

## Status

Phase 1 (the shell) is working: display detection, the fullscreen kiosk window, the four-widget layout, a settings window, and autostart. Every data source still shows placeholder values, marked in the UI with a `PREVIEW DATA` chip.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Shell, display detection, layout, settings | Done |
| 2 | Google OAuth, Calendar agenda, Gmail unread | Next |
| 3 | Bluesky and Proton Mail adapters | Planned |
| 4 | Task backends and the on-screen keyboard | Planned |
| 5 | Windows notification listener, Discord | Planned |
| 6 | Packaging, overnight dimming, burn-in drift | Planned |

## Running it

```sh
npm install
npm run dev            # fullscreen on the detected case panel
npm run dev:windowed   # a small desktop window, for working on the layout
npm run build          # typecheck both projects and bundle
```

Settings open on your **primary** monitor, not on the case display, because typing an app password on a 682px-tall on-screen keyboard is not a reasonable thing to ask of anyone.

If the panel opens on the wrong screen, pick the right one in settings. Auto-detection looks for a 2560 x 682 display first, then any non-primary display more than three times wider than it is tall.

### A note on VS Code terminals

VS Code exports `ELECTRON_RUN_AS_NODE=1` to its child processes. Electron honours it and boots as plain Node, and then `require('electron')` returns a file path instead of the API. `scripts/electron-vite.mjs` strips the variable before launching, so the npm scripts work the same from any terminal.

## What each source needs

| Source | How it reads | Setup |
| --- | --- | --- |
| Google Calendar | Calendar API, 5 min poll | Google Cloud project, desktop OAuth client |
| Gmail | `labels.get(INBOX)` unread count, 60s | same project |
| Proton Mail | Proton Mail Bridge local IMAP, IDLE push | Bridge running, paid Proton plan |
| Bluesky | `getUnreadCount`, 60s | an app password, never your real one |
| Discord | Windows notification listener | sparse-packaged helper, see below |

Two of these need explaining.

**Publish the Google consent screen to "In production".** Left in "Testing", Google revokes every refresh token after 7 days, which means re-authorising the panel weekly forever. An unverified production app shows a warning screen once and is capped at 100 users, which is ample for one person.

**Discord has no supported way to read your own unread count.** The RPC scope that exposes it (`rpc.notifications.read`) requires Discord to whitelist your application, and user-token "self-bots" violate their terms and risk the account. So Discord comes in through `UserNotificationListener` instead, a small .NET helper that reads Windows toast notifications system-wide and pipes them to the panel. That API refuses to run without package identity, so the helper ships with a sparse MSIX package. It is the one piece that can fail for environmental reasons, which is why nothing else depends on it: if it cannot attach, the Discord tile reports "setup needed" and the rest of the panel carries on.

## Layout

```
src/main/        Node side. Owns credentials, polling, and the helper process.
src/preload/     The contextBridge. The renderer sees this and nothing more.
src/renderer/    Preact UI. Never handles a token.
src/shared/      Types and IPC channel names used by both sides.
helper/          .NET notification listener (phase 5).
```

Sizing is in `rem` against a root font size derived from viewport height, so the same layout holds on the panel and in a small dev window without media queries.

Credentials never go in this repo. Tokens and passwords are encrypted with the OS keystore via Electron's `safeStorage` and stored under `userData`.

## Note on Nexus Link

HYTE's Nexus Link normally runs fullscreen on this display. Running Hyte Panel covers it; fan and RGB control still work from the Nexus Link window on your desktop. Turn off its display feature if the two start competing for the foreground.

## Licence

MIT.
