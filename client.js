window.__ModuleLoader__.load({
  id: '@local/dsh-compact-left',
  factory(require) {
    const React = require('react');

    /**
     * Hover-to-peek for the collapsed sidebar.
     *
     * The shipped shell exposes `ctx.layout.toggleSidebar()` as a binary
     * closed ⟷ expanded toggle and has no preview state. This plugin adds a
     * temporary middle state, driven entirely by pointer events:
     *
     *   COLLAPSED ──hover the left edge for HOVER_OPEN_MS──▶ PEEK
     *   PEEK ──pointer leaves the sidebar for HOVER_CLOSE_MS──▶ COLLAPSED
     *   PEEK ──click the toggle──▶ PINNED      (the click holds it open)
     *   PINNED ──click the toggle──▶ COLLAPSED (shipped behaviour)
     *
     * PINNED is the shell's own expanded state: the plugin keeps no flag for it,
     * so leaving a pinned sidebar alone can never collapse it. Only an
     * expansion this plugin started (PEEK) is ever undone by it.
     *
     * The collapsed toggle lives in the caption on Windows (`position: fixed`)
     * while the expanded column is a grid track, so "inside" is computed from
     * live boxes on every event and timer, never from a cached rectangle.
     * Nothing here relies on model-specific geometry beyond those boxes.
     */
    const HOVER_OPEN_MS = 150;
    const HOVER_CLOSE_MS = 200;
    /**
     * Hot strip along the window's left edge. Hovering anywhere in it starts a
     * peek, so the pointer does not have to land on the small toggle button.
     * It only exists while the column is collapsed.
     */
    const EDGE_PX = 8;

    /**
     * Preference storage. A single boolean in `localStorage` keeps the switch
     * across restarts without needing a Host route; the value is read at every
     * pointer event so flipping it takes effect immediately, with no reload.
     */
    const PREF_KEY = 'dsh-compact-left:hoverPeek';
    const readEnabled = () => {
      try {
        return window.localStorage.getItem(PREF_KEY) !== 'off';
      } catch {
        return true;
      }
    };
    const writeEnabled = (value) => {
      try {
        window.localStorage.setItem(PREF_KEY, value ? 'on' : 'off');
      } catch {
        // A blocked storage area only costs persistence, not the feature.
      }
    };

    /**
     * The shipped sidebar's class names are CSS-module hashes, so they are
     * matched by suffix rather than pinned to one build's hash: a renamed hash
     * keeps working, and a removed class simply stops matching.
     */
    const endsWithClass = (el, suffix) => {
      for (const name of el.classList) {
        if (name.endsWith(suffix)) return true;
      }
      return false;
    };

    const within = (rect, x, y) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

    /**
     * Marker set on the sidebar column while a peek is up. The shell's tooltip
     * bubble is a portal child of `body`, so it is not inside the column and a
     * descendant rule cannot reach it; the visible bubble is emptied instead.
     * The attribute documents the state and keeps the rule available for any
     * bubble that does mount inside the column.
     */
    const PEEK_ATTR = 'data-dsh-compact-left-peek';
    const CSS = `[${PEEK_ATTR}] [role="tooltip"] { display: none !important; }`;

    return {
      /**
       * `slots` is a hard dependency: the settings page below registers through
       * `ctx.slots`. Without the declaration the service is absent, `apply`
       * throws, and the whole plugin (hover included) never activates.
       */
      inject: ['slots'],

      apply(ctx) {
        ctx.effect(() => {
          const doc = document;
          const style = doc.createElement('style');
          style.dataset.plugin = '@local/dsh-compact-left';
          style.dataset.pluginCss = '@local/dsh-compact-left/hover-peek.css';
          style.textContent = CSS;
          doc.head.appendChild(style);

          /** True while the expanded column is this plugin's temporary peek. */
          let peeking = false;
          let openTimer = 0;
          let closeTimer = 0;
          /** Last pointer position; -1 means no pointer has been seen yet. */
          let lastX = -1;
          let lastY = -1;
          /** Mirrors the last computed "inside the peek surfaces" verdict. */
          let over = false;

          /**
           * The layout frame: the grid container that carries the column tracks.
           * Matched by class suffix, like the sidebar's own classes.
           */
          const frameEl = () => {
            for (const el of doc.querySelectorAll('div[class*="_frame"]')) {
              if (endsWithClass(el, '_frame')) return el;
            }
            return null;
          };

          /**
           * The sidebar column: first `*_root` element inside the layout frame,
           * falling back to a document-wide search. The frame itself is skipped:
           * its class also ends in `_root`, so it would shadow the column.
           */
          const columnEl = () => {
            const frame = frameEl();
            const scopes = frame === null ? [doc.body] : [frame, doc.body];
            for (const scope of scopes) {
              if (scope === null) continue;
              for (const el of scope.querySelectorAll('div[class]')) {
                if (el === frame) continue;
                if (endsWithClass(el, '_root')) return el;
              }
            }
            return null;
          };
          const toggleEl = () => {
            const column = columnEl();
            if (column === null) return null;
            for (const el of column.querySelectorAll('button[class]')) {
              if (endsWithClass(el, '_toggle')) return el;
            }
            return null;
          };
          /** Whether the shipped column currently reports itself collapsed. */
          const isCollapsed = () => {
            const el = columnEl();
            return el !== null && endsWithClass(el, '_collapsed');
          };
          const clearOpen = () => {
            window.clearTimeout(openTimer);
            openTimer = 0;
          };
          const clearClose = () => {
            window.clearTimeout(closeTimer);
            closeTimer = 0;
          };

          /**
           * The hot zone that starts a peek: the left-edge strip, plus the
           * toggle itself (it floats in the caption on Windows, so its box may
           * sit away from the column).
           */
          const inOpenRegion = (x, y) => {
            if (x >= 0 && x <= EDGE_PX) return true;
            const toggle = toggleEl();
            return toggle !== null && within(toggle.getBoundingClientRect(), x, y);
          };

          /**
           * Whether the pointer is still on the surfaces a peek may occupy: the
           * expanded column, the toggle, or the left-edge strip. Leaving all of
           * them is what ends a peek.
           */
          const inPeekSurfaces = (x, y) => {
            if (inOpenRegion(x, y)) return true;
            const column = columnEl();
            return column !== null && within(column.getBoundingClientRect(), x, y);
          };

          /** Keep the column marker and the shipped tooltip in step with a peek. */
          const syncPeekMark = () => {
            const column = columnEl();
            if (column === null) return;
            if (!peeking) {
              column.removeAttribute(PEEK_ATTR);
              return;
            }
            column.setAttribute(PEEK_ATTR, '');
            // The shell arms its tooltip on pointer entry and would surface it
            // over the column this peek just opened; emptying the visible bubble
            // retires it immediately instead of waiting for its own dismissal.
            for (const bubble of doc.querySelectorAll('[role="tooltip"]')) {
              if (bubble.getClientRects().length === 0) continue;
              bubble.textContent = '';
            }
          };

          const openNow = () => {
            openTimer = 0;
            // The preference is read here, at the moment of use, so switching it
            // off in Settings takes effect on the very next hover.
            if (!readEnabled()) return;
            if (isCollapsed()) {
              const layout = ctx.get('layout');
              if (layout === undefined) return;
              peeking = true;
              layout.toggleSidebar();
            }
            // The column may have been opened by the user meanwhile; either way
            // hovering it must not schedule a collapse.
            clearClose();
            syncPeekMark();
          };

          /**
           * End a peek if it is still one.
           *
           * `pointerLeft` marks a close that came from leaving the window. There
           * is no position to re-measure then -- the last `pointermove` was still
           * on the column -- so that path decides on its own evidence rather
           * than re-reading stale coordinates and concluding nothing changed.
           */
          const closeNow = (pointerLeft) => {
            closeTimer = 0;
            if (!peeking) return;
            if (!pointerLeft && lastX >= 0 && inPeekSurfaces(lastX, lastY)) {
              // A stationary pointer never fires `pointermove`; keep the peek.
              over = true;
              syncPeekMark();
              return;
            }
            peeking = false;
            over = false;
            syncPeekMark();
            // Only undo an expansion this plugin started, and only if the column
            // is still open: a click that pinned it must not be reversed here.
            if (isCollapsed()) return;
            const layout = ctx.get('layout');
            if (layout === undefined) return;
            layout.toggleSidebar();
          };

          const scheduleClose = (pointerLeft) => {
            clearOpen();
            if (closeTimer !== 0) return;
            closeTimer = window.setTimeout(() => closeNow(pointerLeft === true), HOVER_CLOSE_MS);
          };

          const onPointerMove = (event) => {
            lastX = event.clientX;
            lastY = event.clientY;
            const inside = inPeekSurfaces(lastX, lastY);
            over = inside;
            syncPeekMark();
            if (!inside) {
              scheduleClose();
              return;
            }
            clearClose();
            // Switched off: never arm the open timer, and drop any armed one.
            if (!readEnabled()) {
              clearOpen();
              return;
            }
            // Only a collapsed column can be peeked open, and only from the zone
            // that starts one.
            if (!isCollapsed() || openTimer !== 0) return;
            if (!inOpenRegion(lastX, lastY)) return;
            openTimer = window.setTimeout(openNow, HOVER_OPEN_MS);
          };

          const onPointerExitWindow = () => {
            over = false;
            syncPeekMark();
            scheduleClose(true);
          };

          // Clicking the toggle while a peek is up pins it: the click is the
          // "make this real" gesture, so the column must stay expanded and the
          // shipped toggle must not flip it back. The claim runs in the document
          // capture phase, which precedes React 18's root-phase listener, so
          // stopping it there keeps it from reaching the sidebar's own onClick.
          //
          // A click on a column that was not peeked keeps the shipped meaning,
          // because no peek is pending.
          const onToggleClickCapture = (event) => {
            const toggle = toggleEl();
            if (toggle === null || !toggle.contains(event.target)) return;
            if (!peeking) return;
            peeking = false;
            clearOpen();
            clearClose();
            syncPeekMark();
            event.stopPropagation();
            event.preventDefault();
          };

          // Reaching the toggle at all cancels a pending hover open, so a press
          // never races the open timer.
          const onPointerDownCapture = (event) => {
            const toggle = toggleEl();
            if (toggle === null || !toggle.contains(event.target)) return;
            clearOpen();
          };

          doc.addEventListener('pointermove', onPointerMove, { passive: true });
          doc.addEventListener('pointerleave', onPointerExitWindow);
          doc.addEventListener('pointerdown', onPointerDownCapture, true);
          doc.addEventListener('click', onToggleClickCapture, true);

          return () => {
            clearOpen();
            clearClose();
            // Release the mark even when the column is gone, or the next
            // activation would inherit a stale peek.
            for (const el of doc.querySelectorAll('[' + PEEK_ATTR + ']')) {
              el.removeAttribute(PEEK_ATTR);
            }
            style.remove();
            doc.removeEventListener('pointermove', onPointerMove);
            doc.removeEventListener('pointerleave', onPointerExitWindow);
            doc.removeEventListener('pointerdown', onPointerDownCapture, true);
            doc.removeEventListener('click', onToggleClickCapture, true);
          };
        }, 'dsh-compact-left: hover to peek');

        // ------------------------------------------------------------------
        // Settings page: one switch for the hover feature.
        // ------------------------------------------------------------------
        const h = React.createElement;
        const LABELS = {
          en: { title: 'Compact left rail', hint: 'Hovering the left edge peeks the sidebar open; clicking the toggle pins it open.', enable: 'Hover to peek' },
          zh: { title: '左侧折叠栏', hint: '鼠标靠近左侧边缘时临时展开侧边栏，点击折叠按钮可将其固定为完全展开。', enable: '悬停展开侧边栏' },
        };
        const labelSet = () => {
          const locale = ctx.get('locale');
          if (locale === undefined) return LABELS.en;
          try {
            const active = String(locale.getLocale().active);
            return active.startsWith('zh') ? LABELS.zh : LABELS.en;
          } catch {
            return LABELS.en;
          }
        };

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-compact-left',
          order: 111,
          label: () => labelSet().title,
        }, function CompactLeftSettings() {
          const [enabled, setEnabled] = React.useState(readEnabled);
          const text = labelSet();
          const onChange = (event) => {
            const next = event.target.checked;
            setEnabled(next);
            writeEnabled(next);
          };
          return h('section', { style: { display: 'grid', gap: '12px', padding: '16px 0' } },
            h('div', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '24px',
              },
            },
              h('div', { style: { display: 'grid', gap: '2px' } },
                h('span', { style: { color: 'var(--dsw-alias-label-primary)' } }, text.enable),
                h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' } }, text.hint),
              ),
              h('input', {
                type: 'checkbox',
                checked: enabled,
                onChange,
                'aria-label': text.enable,
                style: { width: '16px', height: '16px', cursor: 'pointer', flex: 'none' },
              }),
            ),
          );
        }));
      },
    };
  },
});
