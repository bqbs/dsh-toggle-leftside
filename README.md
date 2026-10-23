# dsh-toggle-leftside

English | [中文](README.zh.md)

> A DSH client plugin that adds **hover-to-peek** to the **collapsed** left sidebar.

The shipped shell treats the sidebar as a binary `closed ⟷ expanded` toggle and
has no preview state. This plugin drives that same `ctx.layout.toggleSidebar()`
action from pointer focus, adding a temporary middle state, and while it is open
it renders the sidebar as a **floating drawer** on top of the main area so the
main area is never squeezed.

## Contents

- [Installation](#installation)
- [Features](#features)
- [Interaction & effect](#interaction--effect)
- [Known limitations](#known-limitations)
- [Version history](#version-history)
- [License](#license)

## Installation

### DSH plugin

deepseek harness → Plugins → search `github:bqbs/dsh-toggle-leftside` → install.

### Commands

- web

```bash
dsh plugin --profile web add github:bqbs/dsh-toggle-leftside
```

- desktop

```bash
dsh plugin --profile desktop add github:bqbs/dsh-toggle-leftside
```

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

## Version history

Current version **0.1.0**

## License

Released under the [MIT License](LICENSE). See the `LICENSE` file for the full text.
