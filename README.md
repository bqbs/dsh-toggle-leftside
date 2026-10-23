# dsh-toggle-leftside

English | [中文](README.zh.md)

> A DSH client plugin that adds **hover-to-peek** to the **collapsed** left sidebar.

The shipped shell treats the sidebar as a binary `closed ⟷ expanded` toggle and
has no preview state. This plugin drives that same `ctx.layout.toggleSidebar()`
action from pointer focus, adding a temporary middle state, and while it is open
it renders the sidebar as a **floating drawer** on top of the main area so the
main area is never squeezed.

## Contents

- [🚀 Installation (2-minute setup)](#🚀-installation-2-minute-setup)
- [Features](#features)
- [Interaction & effect](#interaction--effect)
- [Keyboard & accessibility](#keyboard--accessibility)
- [What stays native](#what-stays-native)
- [Implementation notes](#implementation-notes)
- [Known limitations](#known-limitations)
- [Install & uninstall (full)](#install--uninstall-full)
- [Development & testing](#development--testing)
- [Version history](#version-history)
- [Requirements](#requirements)
- [License](#license)

## 🚀 Installation (2-minute setup)

Prerequisite: a DSH Profile that runs the Web client (the desktop App is itself a
Web client).

1. Add a `link:` dependency in that Profile's `package.json`, pointing at this repo:

```json
"dependencies": {
  "dsh-toggle-leftside": "link:<absolute path to this repo>"
}
```

2. Install inside the Profile directory (so `node_modules/dsh-toggle-leftside`
   links back to this repo):

```bash
pnpm install
# or pnpm i
```

3. Reload the DSH window (both the desktop App and the web client use "reload window").

4. Open **Settings → Compact left rail** and confirm *Hover to peek* is on (it is by default).

Verify: collapse the sidebar, move the pointer to the window's left edge or onto any
collapsed icon and dwell ~150ms — the sidebar should temporarily expand as a floating
drawer; moving away ~200ms auto-collapses it, and clicking the toggle pins it fully open.

## Features

- **Hover preview (PEEK):** near the left edge while collapsed, the sidebar temporarily
  expands while the main area keeps its full width.
- **Click to pin (PINNED):** clicking the toggle during a preview turns it into the
  native "pinned open" state; a second click collapses it.
- **Collapsed brand mark:** puts the product brand mark on the collapsed toggle in the
  Windows caption (the non-Windows rail already shows it natively and is left alone).
- **Settings switch:** a toggle under *Settings → Compact left rail*, stored in
  `localStorage`, effective immediately with no reload.
- **Tooltip restraint:** while a preview is up it empties the shell's own icon tooltip
  so it does not surface over the column it just opened.

## Interaction & effect

State machine:

```
COLLAPSED ──hover the left edge for 150ms──▶ PEEK
PEEK      ──pointer leaves for 200ms──────▶ COLLAPSED
PEEK      ──click the toggle──────────────▶ PINNED
PINNED    ──click the toggle──────────────▶ COLLAPSED   (shipped behaviour)
```

- **Floating drawer:** on entering PEEK the sidebar's inner `*_root` is lifted out of the
  grid flow (`position: fixed`) and overlaid on the main area, which keeps its collapsed
  geometry and width.
- **Animation:** the drawer opens/closes with a 180ms slide (`left: -12px → 0`) + fade
  (`opacity 0 → 1`), animating the drawer only — the main area never moves. The entrance
  plays once per peek.
- **Trigger zone:** a hot strip along the window's left edge plus the toggle itself. The
  strip is as wide as the collapsed column when that column is visible (the web icon rail,
  ~56px, so any icon opens it); on desktop the collapsed column has no width, so it falls
  back to a fixed, wider 28px edge strip.
- **Layering:** the drawer uses `z-index: 25` — above the main-area overlay (20) but below
  every shell menu layer (icon menu 70, dropdown/hovercard 100/101, and the portaled
  menu/tooltip/toast layer 1100), so shell menus always paint on top of the drawer.

## Keyboard & accessibility

- **Pointer-driven:** the hover preview is driven by `pointermove` / `pointerleave` and has
  no dedicated keyboard shortcut. But it is built **on top of the native toggle**, so the
  shell's own keyboard affordances (Tab to focus the toggle, Enter/Space to toggle, arrow
  navigation inside the nav) are unaffected.
- **Decorative noise suppressed:** the cloned brand mark is wrapped in an `aria-hidden="true"`
  container (visual only), and the settings switch carries an `aria-label`.
- **No special-casing:** the plugin does not adapt to `prefers-reduced-motion` (it still
  plays the 180ms motion), nor does it add a touch-specific gesture like long-press to open
  (touch pointer semantics differ from hover, so previews mostly trigger from edge drags).

> Note: the two points above are known limitations — see "Known limitations" below.

## What stays native

- **PINNED is the shell's own expanded state:** the plugin keeps no flag for it, so leaving
  a pinned sidebar alone can never collapse it — only an expansion this plugin started (PEEK)
  is ever undone. A pinned sidebar drops the float and becomes a normal expanded grid track,
  squeezing the main area exactly as the shipped shell does.
- **The drawer is the shell's own sidebar column:** it adds no shadow/border/background, so
  it looks identical to the shell's "wide" state and never reads as a separate layer.
- **Toggle hover flip preserved:** the shell's own rule re-shows the panel glyph on hover;
  the plugin reuses it, so the gesture still reads as "open the sidebar".
- **Reuses the native action:** PEEK drives `ctx.layout.toggleSidebar()`, so React mounts
  the full navigation the shell only renders when wide — identical to a native expand.
- **Non-Windows brand swap untouched:** the shell already shows the brand mark on the
  non-Windows rail; the plugin only fills the gap in the Windows caption.
- **Focus order, Tab order, and screen-reader access to the nav** all follow the shell
  natively; the plugin does not rewrite them.

## Implementation notes

- **Live pointer geometry:** the shell has no stable "is the sidebar open" API, so the
  plugin reads it from the sidebar's own DOM. Class names are CSS-module hashes, matched by
  suffix (`_root`/`_collapsed`/`_toggle`/`_frame`) rather than pinned to one build. On
  Windows the collapsed toggle is `position: fixed` in the caption while the expanded column
  is a grid track, so "inside" is the union of both boxes, measured on every event/timer
  instead of from a cached rectangle. A `pointerleave` must not re-measure the last position
  (the final `pointermove` was still on the column), or it would conclude the pointer never
  left.
- **Floating drawer without squeezing:** a custom property plus a stylesheet `!important`
  rule pins the frame's grid tracks to the **captured collapsed template** (first track keeps
  the collapsed width — 0 on desktop/macOS, 56 on the web rail — and the center/right tracks
  are preserved verbatim). React re-solves `gridTemplateColumns` to the widened value on every
  commit, so an inline override would lose the race; `!important` outranks a normal inline
  style and React never writes the custom property, so it is stable. The inner `*_root` is
  floated with `position: fixed`; the outer `sidebarCol` stays in flow, narrowed to the
  collapsed track. Height is set explicitly to `calc(100vh - <titlebar>)` rather than
  `top`+`bottom`, or the footer (user name/avatar) would be pushed out of view.
- **Animation never moves the workspace:** the frame's grid tracks are pinned with
  `transition: none`, so only the drawer animates. The slide uses `left`, **not
  `transform`** — on desktop the shell pins the toggle with `position: fixed; left: 12px`
  against the viewport, and a `transform` on an ancestor becomes the containing block for
  fixed descendants, re-anchoring the toggle to the drawer and moving it. A fixed element's
  negative `left` does not extend the scrollable area, so the 12px overshoot introduces no
  horizontal scrollbar.
- **The pin survives the close animation:** during the 180ms close, a `closingFloat` flag
  holds the grid pin and clears it together with the drawer's inline geometry only after the
  column has truly collapsed — otherwise the main area would jump wide mid-fade and snap
  back. On web the shell collapses in two steps (`wide` lingers ~150ms while the wide column
  fades, and `_collapsed` lands a frame later); `collapsingToRail` keeps the drawer's inline
  geometry intact until then, otherwise the rail paints twice. A `floatGeneration` token
  prevents a fast re-open from stripping the fresh drawer's geometry.
- **Brand mark cloned, not copied:** cloned from the shell's own brand row
  `[data-slot="sidebar.brand.mark"]`, so there is no second source of truth to drift. The
  shell mounts that row only when wide, so it is cached on every peek and reused while
  collapsed; before the first peek there is nothing to show, so the icon is left as shipped.
  Three guards avoid a doubled mark: removed on open, skipped if the shell already shows its
  own, and left untouched if no SVG is available to clone.
- **Tooltip restraint:** the shell's tooltip is a portal under `body`, unreachable by a
  descendant selector, so the visible bubble's text is emptied directly.

## Known limitations

- **Pointer-driven only:** no keyboard shortcut triggers a peek; on touch, because hover
  semantics differ, previews mostly rely on edge drags and feel less fluid than desktop hover.
- **Depends on shell DOM structure:** elements are located by class-name suffix. Renamed
  hashes are tolerated, but a structural change (e.g. how grid items are split) could break it.
- **Narrow desktop trigger:** on desktop the collapsed column has no width, so the trigger
  falls back to a 28px left-edge strip and must be hugged precisely.
- **Brand mark missing on first paint:** the collapsed-toggle brand mark only appears after
  the first peek caches the SVG; before any hover the original icon is shown.
- **Preference isolated per browser:** the switch lives in `localStorage` and is not synced
  across devices/browsers.
- **Single sidebar column only:** assumes one left column and does not handle multi-column or
  dynamic add/remove layouts.
- **No reduced-motion handling:** does not honor the system "reduce motion" preference and
  still plays the animation.
- **Reload required after edits:** `client.js` is loaded through `window.__ModuleLoader__` from
  a graph snapshot, so changes need a window reload.
- **No-op when already expanded:** when the sidebar is already open, the plugin adds nothing
  (PEEK can only start from the collapsed state).

## Install & uninstall (full)

### Install

1. The repo needs no build (`client.js` is a single bundle loaded via
   `window.__ModuleLoader__`; `index.js` is just a host placeholder).
2. In the target Profile's `package.json`, add (use an absolute or relative path to this repo):

```json
"dependencies": {
  "dsh-toggle-leftside": "link:/abs/path/to/dsh-toggle-leftside"
}
```

3. Run `pnpm install` in that Profile directory so `node_modules/dsh-toggle-leftside`
   links back to this repo:

```
$HOME/.dsh/profiles/<profile>/node_modules/dsh-toggle-leftside -> <this repo>
```

On Windows, `$HOME` is `%USERPROFILE%`.

4. Reload the DSH window. `cordis.patch.yml` and the `dsh.bundle.patch` / `dsh.client` fields
   in `package.json` make the shell inject and immediately enable this plugin.

> You can also install/enable this repo as a local bundle from the DSH Profile management card
> (equivalent to the `link:` dependency above).

### Uninstall

1. Remove `dsh-toggle-leftside` from the Profile's `package.json`.
2. Run `pnpm install` in the Profile directory (or manually remove
   `node_modules/dsh-toggle-leftside`).
3. Reload the window. The plugin is no longer injected and the collapsed state reverts to the
   shell's native behavior.

## Development & testing

- **No bundler:** the repo *is* the plugin — `client.js` is a single-file bundle.
- **Local iteration:** link the repo into a dev Profile as above; after editing `client.js`,
  **reload the window** to see the change (it comes from a graph snapshot, so HMR is not
  available).
- **Diagnostic tooling:** the `_diag/` directory contains layout-regression and probe scripts
  (e.g. `regress.cjs`, and the `*-client.js` / `probe_tooltip.js` helpers) for re-checking
  geometry and layering against a running shell.
- **Manual verification checklist:**
  1. Collapsed + hover the left edge → drawer floats out within ~150ms; main area width unchanged;
  2. Items inside the drawer click normally; moving away ~200ms auto-collapses;
  3. Click the toggle during a preview → pinned open (squeezes the main area), click again → collapsed;
  4. Shell menus (view menu, session menu) still paint above the drawer during open/close;
  5. Windows caption toggle shows the brand mark; hovering flips back to the panel glyph;
  6. Resizing the window re-measures the column so the drawer tracks it;
  7. With the settings switch off, the next hover no longer previews.
- **No automated tests:** there is currently no unit or end-to-end suite; regression is manual
  via the checklist and the `_diag/` scripts.

## Version history

Current version **0.1.0** (`package.json`). Development milestones (from the repo's commits):

| Commit | Change |
| --- | --- |
| `aeea704` | Add hover-to-peek for the collapsed left sidebar |
| `2f8356c` | Add English & Chinese README documentation |
| `d8ac82c` | Show the brand mark on the collapsed toggle |
| `d28b4cb` | Render the peek as a floating drawer over the main area |
| `e28c03f` | Drop the drawer geometry in the frame the peek collapses |
| `d34ccac` | Hold the drawer until the web rail actually lands (avoid double paint) |

## Requirements

- A DSH Profile running the **Web client** (both the desktop App and the web client qualify,
  since they share the Web client; `package.json` sets `dsh.client.platform` to `web`).
- A shell that supports **Cordis patch** injection (`cordis.patch.yml` + the
  `dsh.bundle.patch` in `package.json`) and client loading via `window.__ModuleLoader__`.
- Browser support for: `MutationObserver`, `requestAnimationFrame`, CSS custom properties,
  `position: fixed`, and Pointer Events.
- A Node.js / pnpm environment for the `link:` install (only the install step needs it).

## License

This project is intended for open source. A license file has not yet been added — see the
repository's `LICENSE` for the terms once it is published. Until then, all rights are
reserved by the author and the code is shared for review only.
