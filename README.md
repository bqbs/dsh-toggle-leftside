# dsh-compact-left

English | [中文](README.zh.md)

A DSH client plugin that adds hover-to-peek to the collapsed left sidebar.

The shipped shell treats the sidebar as a binary `closed ⟷ expanded` toggle and
has no preview state. This plugin drives that same `ctx.layout.toggleSidebar()`
action from pointer focus, adding a temporary middle state.

## Behaviour

```
COLLAPSED ──hover the left edge for 150ms──────▶ PEEK
PEEK      ──pointer leaves for 200ms──────────▶ COLLAPSED
PEEK      ──click the toggle──────────────────▶ PINNED
PINNED    ──click the toggle──────────────────▶ COLLAPSED   (shipped behaviour)
```

- **PEEK** is a temporary expansion rendered as a **floating drawer**: the
  sidebar is lifted out of the grid flow (`position: fixed`) and overlays the
  main area, which keeps its full, unsqueezed width. The pointer can dwell inside
  to select items, and leaving collapses it again. Opening and closing are
  animated (slide + fade, 180ms) on the drawer only — the main area never moves.
- **PINNED** is the shell's own expanded state. The plugin keeps no flag for it,
  so leaving a pinned sidebar alone can never collapse it. Only an expansion the
  plugin itself started is ever undone by it. A pinned sidebar drops the float and
  becomes a normal expanded grid track, so it squeezes the main area exactly like
  the shipped shell does.
- The peek trigger is a hot strip along the window's left edge, plus the toggle
  button, so the pointer does not have to land on the small button. The strip is
  **as wide as the collapsed column**: on web that is the visible icon rail
  (~56px), so hovering any icon opens the drawer; on desktop the collapsed column
  has no width, so the strip falls back to a fixed, wider 28px.
- The plugin draws no tooltip of its own. While a peek is up it retires the
  shell's tooltip bubble, which would otherwise surface over the column the peek
  just opened.

## The collapsed toggle shows the brand mark

The shipped toggle renders a generic panel-left glyph. On the non-Windows rail
the shell swaps in the product's brand mark, but in the Windows caption it keeps
the glyph — so a collapsed column there reads as "some panel" instead of as the
product. This plugin fills that gap.

The artwork is **cloned from the shell's own brand row**
(`[data-slot="sidebar.brand.mark"]`), never copied: there is no second source of
truth to drift from. The shell mounts that row only while the column is wide, so
the artwork is cached during a peek and reused while collapsed — and until the
first peek there is nothing to show, in which case the icon is left exactly as
shipped rather than replaced with a look-alike.

Three guards keep it from ever doubling up:

1. the mark is removed as soon as the column opens;
2. if the shell already renders its own brand mark on the toggle, none is added;
3. with no artwork to clone, the icon is untouched.

React owns the button's children, so the mark is a sibling the shell never
touches and the shipped glyph is hidden by CSS rather than deleted. The shell's
own hover rule still flips the icon to the panel glyph on hover, so the gesture
keeps reading as "open the sidebar".

## Why pointer geometry is computed from live boxes

The shipped shell has no stable API for "is the sidebar open". The plugin reads
it from the sidebar's own DOM:

- Class names are CSS-module hashes, so they are matched by suffix
  (`_root`, `_collapsed`, `_toggle`, `_frame`) rather than pinned to one build.
- On Windows the collapsed toggle is `position: fixed` in the caption while the
  expanded column is a grid track, so "inside" is the union of both boxes,
  measured on every event and timer instead of from a cached rectangle.
- A window-leave (`pointerleave`) must not re-measure the last position: the
  final `pointermove` was still on the column, and re-reading it would conclude
  the pointer never left. That path decides on its own evidence instead.

## How the floating drawer avoids squeezing the main area

A peek still drives the shell's own `toggleSidebar()`, so the column expands and
React mounts the full navigation the shell only renders when wide — but the plugin
does not leave it as a widening grid track. The frame's direct grid items are the
sidebar column, the center, the right column and the bottom row as **separate**
items, so the trick is to keep the sidebar column *in* flow (its track held at the
collapsed template) while lifting only its **inner** `*_root` content out as an
overlay. While a peek is up:

- the frame's grid tracks are held at the **captured collapsed template** — the
  first track keeps the collapsed rail width (`0` on Windows/macOS, `56` on the web
  rail), and the center `minmax(400px,1fr)` and right tracks are preserved verbatim.
  React re-solves and overwrites `gridTemplateColumns` inline with a widened sidebar
  track on every commit, so an inline override would lose that race; the track list
  instead travels through a custom property consumed by a stylesheet `!important`
  rule, which outranks a normal inline style and is stable across commits; and
- the inner `*_root` column is floated with `position: fixed` (left `0`, top set to
  the frame's `padding-top` so it clears the titlebar, a width measured from the
  just-expanded column, and `transition: none` to suppress the shell's expand width
  tween). Its height is set explicitly to `calc(100vh - <titlebar>)`, never left to a
  `top`+`bottom` pair: the shell's `*_root` already carries `height: 100%`, and an
  explicit height wins over the stretch, which would push the footer — and with it the
  user name and avatar — below the viewport on desktop. The outer `sidebarCol` stays in
  flow behind it, narrowed to the collapsed track and visually empty.

The drawer adds **no styling of its own** — no box-shadow, no border, no background.
It is the shell's own sidebar column, so it must look exactly like the sidebar does
when expanded; any extra chrome makes it read as a separate layer. (An earlier build
shadowed `div[class*="_root"]`, a selector broad enough to hit every `*_root` panel in
the frame, which is why unrelated panes appeared layered.)

The center therefore keeps exactly its collapsed position and width, and the drawer
(which is wider than the rail) simply covers its left edge. Two mistakes are both
avoided: floating the **outer** `sidebarCol` out of flow would let the center
auto-place into the first track and collapse to zero (a flash-and-vanish); and
leaving the widened sidebar track would shove the center aside (a squeeze).

`resize` re-pins the frame and re-measures the column so the drawer tracks the
window. A click that pins the peek removes the float (`peeking` becomes false) and
the column resumes the shell's normal expanded track — which is why a pinned sidebar
does squeeze the main area, exactly as the shipped shell does.

## Why the animation never moves the workspace

The drawer animates with a short slide (`left: -12px → 0`) and a fade
(`opacity 0 → 1`) over 180ms. Only the drawer is animated: the frame's grid tracks
are pinned with `transition: none`, so the center column keeps its collapsed
geometry for the whole motion and nothing in the workspace shifts. Closing plays the
same motion in reverse and collapses the column only after it finishes, so the close
reads as a slide-out instead of a snap. The entrance plays once per peek — the
pointer-move reconciliation refreshes geometry without replaying it, which would
otherwise make the drawer blink as the mouse moves.

**The slide must not use `transform`.** On desktop the shell pins the toggle with
`position: fixed; left: 12px`, i.e. against the **viewport**. Per CSS, a `transform`
on an ancestor turns that ancestor into the containing block for `position: fixed`
descendants — so animating the drawer with a transform re-anchored the toggle to the
drawer and made it move while the peek was open. The slide therefore animates `left`,
an ordinary layout offset that creates no containing block. (A fixed element's
negative `left` does not extend the document's scrollable area, so the 12px overshoot
cannot introduce a horizontal scrollbar.)

**The pin must survive the close animation.** Releasing the grid pin at the start of
the close (the obvious place, next to the fade-out) restores React's widened sidebar
track while the drawer is still fading, so the main area jumps wide and then snaps
back when the column collapses — a visible flicker on both web and desktop. The pin
is therefore held by a `closingFloat` flag for the whole animation and dropped in the
same step as the drawer's inline geometry, after the collapse has landed. A floating
drawer is also authoritative over the shell's `_collapsed` class: the shell settles
that class a frame later, and treating a lingering `_collapsed` as "collapsed" would
release the float mid-slide.

## Why the brand mark is not swapped while peeking

The brand-mark swap belongs to the **collapsed rail** only. A peek floats the
expanded column, and on desktop the shell keeps rendering its own toggle glyph in the
caption while the column is wide. An unguarded swap therefore drew this plugin's
brand mark next to the shell's glyph, and the two overlapped. `syncBrandMark` treats
"floating" as expanded and removes the mark for the duration of the peek, restoring
the swap once the column is collapsed again.

## Why the drawer never covers the shell's menus

The drawer's `z-index` is deliberately **low** (25): above the frame's own overlay
layer (20) so it paints over the center column, but below every shell menu layer —
the icon menu at `70`, dropdown/hovercard lists at `100`/`101`, and the portaled
menu, tooltip and toast layer at `1100`. Those menus are portals under `body`, so
only a drawer with a *lower* z-index lets them paint on top. An earlier build used a
near-maximum value, which is why the workspace's view menu and the session menus were
hidden behind the drawer.

## Layout

| Path | Purpose |
| --- | --- |
| `index.js` | Host half of the bundle; the Client module owns rendering. |
| `client.js` | The whole client plugin: peek state machine, tooltip restraint, settings section. |
| `cordis.patch.yml` | Inserts the plugin into the DSH loader. |
| `locale/*.json` | Plugin title and description. |
| `icon.svg` | Sidebar artwork. |

## Settings

The plugin registers one switch under *Settings → Compact left rail*, stored in
`localStorage` as `dsh-compact-left:hoverPeek`. It is read at the moment of use,
so toggling it takes effect on the next hover without a reload.

## Development

The plugin is linked into a DSH profile rather than published. Add a `link:`
dependency to that profile's `package.json` and install it:

```json
"dependencies": {
  "@local/dsh-compact-left": "link:<path to this repo>"
}
```

Once installed, the profile resolves it as a link to this repository:

```
$HOME/.dsh/profiles/<profile>/node_modules/@local/dsh-compact-left
  -> <path to this repo>
```

On Windows, `$HOME` is `%USERPROFILE%`.

`client.js` is loaded as a single bundle through `window.__ModuleLoader__`, so in
a running DSH it is resolved from a graph snapshot: **edit it, then reload the
window** to see a change.
