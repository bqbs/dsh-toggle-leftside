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

- **PEEK** is a temporary expansion: the pointer can dwell inside to select
  items, and leaving collapses it again.
- **PINNED** is the shell's own expanded state. The plugin keeps no flag for it,
  so leaving a pinned sidebar alone can never collapse it. Only an expansion the
  plugin itself started is ever undone by it.
- The peek trigger is a hot strip along the window's left edge (`EDGE_PX`), plus
  the toggle button, so the pointer does not have to land on the small button.
- The plugin draws no tooltip of its own. While a peek is up it retires the
  shell's tooltip bubble, which would otherwise surface over the column the peek
  just opened.

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
