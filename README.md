# Hyte Panel

A dashboard for the HYTE Y70 Touch Infinite's built-in display: calendar, to-dos, and notification counts.

The case screen is an ordinary DisplayPort monitor mounted portrait at 682 x 2560, so this is just an Electron app pinned to it.

## Status

Phase 1 done. Data sources are still placeholders, marked `PREVIEW DATA` in the UI.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Shell, display detection, layout, theming | Done |
| 2 | Google OAuth, Calendar, Gmail | Next |
| 3 | Bluesky, Proton | Planned |
| 4 | Task backends, on-screen keyboard | Planned |
| 5 | Windows notification listener, Discord | Planned |
| 6 | Packaging, overnight dimming | Planned |

## Running

```sh
npm install
npm run dev            # borderless on the case panel
npm run dev:windowed   # small window for layout work
npm run build
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

## Sources

| Source | Reads via | Needs |
| --- | --- | --- |
| Calendar, Gmail | Google APIs | Cloud project, consent screen **In production** |
| Proton | Bridge local IMAP | paid Proton plan |
| Bluesky | `getUnreadCount` | app password |
| Discord | Windows toast listener | sparse MSIX helper |

Two gotchas. A Google consent screen left in **Testing** revokes refresh tokens every 7 days. And Discord has no supported way to read your own unread count, so it arrives through `UserNotificationListener` instead.

## Layout

```
src/main/      Node. Credentials, polling, helper process.
src/preload/   contextBridge.
src/renderer/  Preact UI. Never sees a token.
src/shared/    Types and IPC names.
helper/        .NET notification listener (phase 5).
```

Credentials are encrypted with `safeStorage` under `userData`, never in the repo.

Nexus Link also wants this display. Turn its screen feature off if the two fight.

**If touch does nothing**, Windows has the digitizer mapped to the wrong monitor. Run `TabletPC.cpl` → Setup, press Enter until the prompt appears on the panel, then touch it. Nothing in Device Manager will look wrong: the digitizer reports ready and `TouchGate` stays 1, the input just lands on another screen.

## Licence

MIT.
