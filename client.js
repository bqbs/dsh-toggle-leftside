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
     *
     * The strip is as wide as the collapsed column when that column is visible
     * (the web icon rail, ~56px), so hovering anywhere on the rail opens the
     * drawer; when the collapsed column has no width (desktop, where the rail is
     * hidden and only the caption toggle remains) the strip falls back to
     * `EDGE_DESKTOP_PX`, which is deliberately wider than the bare edge so the
     * trigger is comfortable to hit.
     */
    const EDGE_DESKTOP_PX = 28;
    /**
     * Drawer slide/fade timing. The frame's grid tracks are pinned with
     * `transition: none`, so the main area never animates; only the floating
     * drawer does, which keeps the motion from pushing the workspace around.
     */
    const FLOAT_DURATION_MS = 180;
    const FLOAT_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    /**
     * How far the drawer starts left of its resting position while opening.
     * Animated through `left` (not `transform`): see `floatColumn` -- a transform
     * on the drawer would become the containing block for the shell's
     * `position: fixed` toggle and move it.
     */
    const FLOAT_SLIDE_PX = 12;
    const FLOAT_TRANSITION = `left ${FLOAT_DURATION_MS}ms ${FLOAT_EASING}, opacity ${FLOAT_DURATION_MS}ms ease`;

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
     * Attribute marking the toggle button whose shipped panel-left icon this
     * plugin has replaced with the brand mark.
     */
    const BRANDED_ATTR = 'data-dsh-compact-left-branded';
    /**
     * Attribute the shell puts on the element that renders the brand mark, and
     * the selector this plugin reads to find the brand artwork.
     */
    const BRAND_SLOT_ATTR = 'data-slot';
    const BRAND_SLOT = 'sidebar.brand.mark';

    /**
     * Marker set on the sidebar column while a peek is up. The shell's tooltip
     * bubble is a portal child of `body`, so it is not inside the column and a
     * descendant rule cannot reach it; the visible bubble is emptied instead.
     * The attribute documents the state and keeps the rule available for any
     * bubble that does mount inside the column.
     */
    const PEEK_ATTR = 'data-dsh-compact-left-peek';
    /**
     * Marker on the layout frame while a peek is rendered as a floating
     * drawer. While set, the sidebar column is taken out of the grid flow
     * (`position: fixed`) and the main area keeps its full width, so the
     * peek never squeezes the content -- it overlays it instead.
     */
    const FLOAT_ATTR = 'data-dsh-compact-left-float';
    /**
     * The collapsed toggle carries the brand mark instead of the shipped panel
     * glyph. The shell already ships a rule that does exactly this for the
     * non-Windows case (`.collapsed .toggle .railMark` shown, `.panelIcon`
     * hidden, flipped on hover), but it keys off `windowsTitlebar`, where it
     * leaves the panel glyph in place. These rules extend the same behaviour to
     * the Windows caption toggle, and keep the hover flip the shell defines:
     * hovering the toggle shows the panel glyph again, so the gesture still
     * reads as "open the sidebar".
     */
    const CSS = [
      `[${PEEK_ATTR}] [role="tooltip"] { display: none !important; }`,
      // The brand mark replaces the panel glyph only while collapsed.
      `[${BRANDED_ATTR}] ._2H3hWW_panelIcon { display: none !important; }`,
      // The shell's hover rule re-shows the panel glyph; match it so hover
      // still flips the icon, exactly as it does on the non-Windows rail.
      `[${BRANDED_ATTR}]:hover ._2H3hWW_panelIcon { display: inline !important; }`,
      `[${BRANDED_ATTR}]:hover [data-dsh-compact-left-brand-mark] { display: none !important; }`,
      // NOTE: the drawer deliberately adds NO box-shadow (or any other chrome).
      // The drawer is the shell's own sidebar column, lifted out of the grid; the
      // shell already paints its border and background, and adding a shadow made
      // the drawer read as a separate layer instead of the same sidebar. A broad
      // `div[class*="_root"]` selector here also matched every other `*_root`
      // panel inside the frame, which is why unrelated panes appeared shadowed.
      // Hold the frame's grid tracks at the collapsed template for as long as
      // a peek floats. React writes the (widened) value to the SAME inline
      // property on every commit, so an inline override loses the race and the
      // center gets squeezed again. A stylesheet `!important` declaration beats
      // a normal inline style, so this rule wins deterministically; the track
      // list itself travels through a custom property, which React never writes.
      // `transition: none` suppresses the shell's expand tween so the center does
      // not animate either.
      `[${FLOAT_ATTR}] { grid-template-columns: var(--dsh-compact-left-cols) !important; transition: none !important; }`,
    ].join('\n');

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
          /**
           * Generation token for the drawer's close animation. A close schedules
           * an inline-style cleanup; if the pointer re-enters before it fires, the
           * new float bumps this token so the stale cleanup is skipped instead of
           * stripping the fresh drawer's geometry.
           */
          let floatGeneration = 0;
          /**
           * True while the drawer is playing its close animation and the column has
           * not collapsed yet. During that window the grid-track pin must survive
           * `syncToggle` (which would otherwise release it the moment `peeking`
           * turned false) so the main area does not jump wide mid-fade.
           */
          let closingFloat = false;
          /**
           * The grid template the frame uses while collapsed, captured live from
           * the computed style. Re-applying it while a peek is floating forces
           * the main area back to its collapsed width, so the floating drawer
           * overlays rather than squeezes it.
           */
          let collapsedTemplate = null;
          /** Width the floating column is pinned to; refreshed on resize. */
          let floatWidth = 0;
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
          /**
           * The outer grid item that wraps the sidebar column. The shell nests the
           * `*_root` column inside a `BynINW_sidebarCol` div that is the actual
           * participant in the frame's grid (the `*_root` is only its child). To
           * lift the sidebar out of the grid flow during a peek, this outer item —
           * not the inner column — must become `position: fixed`; fixing only the
           * inner column leaves the outer grid item still claiming its (now wider)
           * track, which is exactly what pushes the main area aside.
           */
          const sidebarColEl = () => {
            const column = columnEl();
            if (column === null) return null;
            const parent = column.parentElement;
            // The outer grid item must be a real element we can style; guard
            // against a missing parent (or a text node) so a degenerate DOM
            // never throws inside the effect.
            if (parent == null || typeof parent.style !== 'object' || parent.style === null) return null;
            return parent;
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

          /**
           * The brand artwork the shell renders in its brand row.
           *
           * Cloned rather than copied, so the collapsed toggle always carries
           * exactly what the product shows: there is no second source of truth to
           * drift. The clone keeps the original's gradient id on purpose -- it must
           * reference the same <defs> the brand row paints with, and that id lives
           * in the document, so both marks resolve to one definition.
           *
           * The shell renders the brand row only while the column is wide, so a
           * collapsed column has nothing to read. The artwork is therefore cached
           * whenever it is available -- on every peek, while the row is mounted --
           * and reused while the column is collapsed. Until the first peek the
           * cache is empty and the icon is left as shipped, which is the intended
           * fallback.
           */
          let brandMarkCache = null;
          const cacheBrandMark = () => {
            const slot = doc.querySelector(`[${BRAND_SLOT_ATTR}="${BRAND_SLOT}"]`);
            if (slot === null) return;
            const svg = slot.querySelector('svg');
            if (svg === null || typeof svg.cloneNode !== 'function') return;
            brandMarkCache = svg.cloneNode(true);
          };
          const brandMarkSource = () => brandMarkCache;

          /**
           * Put the brand mark on the collapsed toggle, and take it off again
           * when the column opens.
           *
           * The shipped toggle always renders the panel-left glyph. On the
           * non-Windows rail the shell already swaps in its own brand mark, so
           * this plugin leaves that alone; on the Windows caption the shell keeps
           * the panel glyph, and that is the gap this fills.
           *
           * When the shell's brand row is not mounted there is no artwork to
           * clone, and the icon is left exactly as shipped rather than replaced
           * with a look-alike.
           *
           * React owns the button's children, so the mark is added and removed as
           * a sibling the shell never touches, and the shipped glyph is hidden
           * by CSS rather than deleted -- deleting it would fight React on its
           * next render. The swap follows the column's own class, so it survives
           * re-renders without any hook into React's lifecycle.
           */
          const syncBrandMark = () => {
            const toggle = toggleEl();
            if (toggle === null) return;
            const existing = toggle.querySelector('[data-dsh-compact-left-brand-mark]');
            // The brand-mark swap belongs to the COLLAPSED rail only. A peek floats
            // the expanded column, and on desktop the shell keeps rendering the
            // collapsed toggle glyph in the caption while the column is wide -- so
            // an unguarded swap put this plugin's brand mark next to the shell's
            // own glyph, and the two overlapped. Treat "floating" as expanded.
            if (!isCollapsed() || isFloating()) {
              // Column open (or peeked): the panel glyph belongs here, as the
              // shell renders it.
              existing?.remove();
              toggle.removeAttribute(BRANDED_ATTR);
              return;
            }
            if (existing !== null) return;
            // The shell already puts its own brand mark on this toggle, so this
            // plugin must not add a second one.
            if (toggle.querySelector('[class*="_railMark"]') !== null) {
              toggle.removeAttribute(BRANDED_ATTR);
              return;
            }
            const source = brandMarkSource();
            // No brand artwork mounted: keep the shipped icon untouched.
            if (source === null) {
              toggle.removeAttribute(BRANDED_ATTR);
              return;
            }
            toggle.setAttribute(BRANDED_ATTR, '');
            const holder = doc.createElement('span');
            holder.setAttribute('data-dsh-compact-left-brand-mark', '');
            holder.setAttribute('aria-hidden', 'true');
            holder.style.cssText = 'display:inline-flex;justify-content:center;align-items:center;flex:none';
            holder.appendChild(source.cloneNode(true));
            toggle.appendChild(holder);
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
           * Width of the collapsed hot strip, in CSS pixels.
           *
           * On web the collapsed column is a visible icon rail (~56px), so the
           * whole rail is a trigger: hovering any icon opens the drawer, and the
           * trigger area matches what the user sees. On desktop the rail has no
           * width (the column is hidden and only the caption toggle remains), so
           * the measured width is 0 and the fixed `EDGE_DESKTOP_PX` fallback is
           * used, which is wider than a bare edge and easier to hit.
           *
           * Measured live rather than hard-coded: the rail width differs by
           * platform/breakpoint and the shell may change it.
           */
          const openRegionWidth = () => {
            const column = columnEl();
            if (column !== null) {
              const width = Math.round(column.getBoundingClientRect().width);
              if (width > 0) return width;
            }
            return EDGE_DESKTOP_PX;
          };

          /**
           * The hot zone that starts a peek: the left strip (the collapsed rail
           * width, or the desktop fallback), plus the toggle itself (it floats in
           * the caption on Windows, so its box may sit away from the column).
           */
          const inOpenRegion = (x, y) => {
            if (x >= 0 && x <= openRegionWidth()) return true;
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

          /**
           * Snapshot the grid template the frame uses while the column is
           * collapsed, so it can be re-applied verbatim (except for a pinned
           * first track) whenever a peek floats. The template is read from the
           * live computed style because the shell may use different breakpoints
           * (e.g. a wider collapsed rail on narrow windows), and copying it
           * keeps every other track untouched -- the main area never resizes.
           */
          const captureCollapsedTemplate = () => {
            const frame = frameEl();
            if (frame === null) return;
            const view = doc.defaultView;
            if (view == null || typeof view.getComputedStyle !== 'function') return;
            const value = view.getComputedStyle(frame).gridTemplateColumns;
            if (typeof value === 'string' && value.trim() !== '') {
              collapsedTemplate = value.trim();
            }
          };

          /**
           * Hold the frame's grid tracks at the collapsed template while a peek is
           * floating. The template is re-applied verbatim -- the first track keeps
           * the collapsed rail width (0 on Windows/macOS, 56 on the web rail), so the
           * center column keeps EXACTLY its collapsed position and size. That is the
           * "no squeeze" guarantee: nothing about the main area moves, and the
           * drawer (fixed, wider than the rail) simply covers its left edge.
           *
           * The track list travels through a custom property consumed by a
           * stylesheet `!important` rule. The indirection is essential: React
           * re-solves `gridTemplateColumns` from the layout store on every commit
           * and writes the widened value to the frame's inline style, so writing
           * that same inline property here would lose the race. A stylesheet
           * `!important` declaration outranks a normal inline style, and React never
           * writes the custom property, so this override is stable.
           */
          const pinFrameToCollapsed = () => {
            const frame = frameEl();
            if (frame === null || collapsedTemplate === null) return;
            const tracks = collapsedTemplate.split(/\s+/).filter(Boolean);
            if (tracks.length < 2) return;
            setStyle(frame, '--dsh-compact-left-cols', tracks.join(' '));
            if (!frame.hasAttribute(FLOAT_ATTR)) frame.setAttribute(FLOAT_ATTR, '');
          };

          /**
           * Set one inline property only when it actually changes. The frame's
           * `style` MutationObserver watches the subtree, so writing identical
           * values on every pass would keep waking it; comparing first keeps the
           * observer converged after a single callback.
           */
          const setStyle = (el, prop, value) => {
            if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
          };

          /**
           * The drawer's z-index. It must sit above the center column's own
           * stacking (the frame's overlay layer is 20) but BELOW the shell's
           * portaled menus (70 / 100 / 1100), or the workspace's view menu and the
           * session menus paint under the drawer. A huge value (2^31-ish) made the
           * drawer cover them, which was the reported occlusion.
           */
          const FLOAT_Z_INDEX = '25';
          /**
           * Float the sidebar's INNER content over the main area during a peek.
           * Only the inner `*_root` is lifted; the OUTER `sidebarCol` grid item is
           * left in flow (its track is held at the collapsed template by
           * `pinFrameToCollapsed`), so the center keeps its own full-width track and
           * is never squeezed. Position/top/width are inline so they survive the
           * shell's class changes. `top` is the frame's padding-top so the drawer
           * clears the Windows titlebar chrome.
           *
           * The height is set explicitly (`calc(100vh - topPad)`), never left to
           * `top`+`bottom`. The shell's `*_root` carries `height: 100%` with
           * `box-sizing: border-box`, and an explicit height wins over the
           * top/bottom stretch: the element then grows a full viewport from `top`
           * downwards and its bottom (the account/footer area) is pushed out of
           * view. Sizing it to the viewport minus the titlebar offset keeps the
           * footer, and therefore the user name and avatar, visible.
           *
           * Motion: the drawer slides in from its left edge with a small offset and
           * fades from 0 to 1. Only the drawer animates -- the frame's grid tracks
           * are pinned with `transition: none` -- so the workspace never moves.
           *
           * The slide uses `left`, NOT `transform`. On desktop the shell's toggle is
           * `position: fixed; left: 12px`, i.e. positioned against the VIEWPORT; any
           * `transform` on an ancestor makes that ancestor the containing block for
           * fixed descendants, so a transform on the drawer would re-anchor the
           * toggle to the drawer and visibly move it while the peek is open. `left`
           * is an ordinary layout offset, creates no containing block, and gives the
           * same visual slide. A fixed element's negative `left` does not extend the
           * document's scrollable area, so the 12px of overshoot cannot introduce a
           * horizontal scrollbar.
           */
          const floatColumn = () => {
            const column = columnEl();
            if (column === null) return;
            // Invalidate any close-animation cleanup still pending from an earlier
            // peek, so it cannot strip this drawer's geometry mid-slide.
            floatGeneration += 1;
            const frame = frameEl();
            let topPad = 0;
            const view = doc.defaultView;
            if (frame !== null && view != null && typeof view.getComputedStyle === 'function') {
              topPad = parseFloat(view.getComputedStyle(frame).paddingTop) || 0;
            }
            const rect = column.getBoundingClientRect();
            floatWidth = Math.round(rect.width) || 280;
            // `syncToggle` re-runs this on every pointer move and observer tick, so
            // the entrance animation must fire only on the transition from
            // not-floating to floating. While already floating, just refresh the
            // geometry: replaying the "from" state here would make the drawer
            // blink on every mouse move. The column's own inline `position` is the
            // signal -- the frame's float marker is already set by
            // `pinFrameToCollapsed` before this runs.
            const entering = column.style.getPropertyValue('position') !== 'fixed';
            setStyle(column, 'position', 'fixed');
            setStyle(column, 'top', `${topPad}px`);
            setStyle(column, 'bottom', 'auto');
            setStyle(column, 'height', `calc(100vh - ${topPad}px)`);
            setStyle(column, 'width', `${floatWidth}px`);
            setStyle(column, 'z-index', FLOAT_Z_INDEX);
            if (!entering) {
              setStyle(column, 'left', '0px');
              return;
            }
            // First paint the closed state (offset left, transparent) with no
            // transition, then move to the open state on the next frame so the
            // browser has a "from" value to interpolate.
            setStyle(column, 'transition', 'none');
            setStyle(column, 'left', `${-FLOAT_SLIDE_PX}px`);
            setStyle(column, 'opacity', '0');
            const raf = typeof window.requestAnimationFrame === 'function'
              ? window.requestAnimationFrame
              : (fn) => window.setTimeout(fn, 0);
            raf(() => {
              const live = columnEl();
              if (live === null || !peeking) return;
              live.style.setProperty('transition', FLOAT_TRANSITION);
              live.style.setProperty('left', '0px');
              live.style.setProperty('opacity', '1');
            });
          };

          /**
           * Undo every inline change a floating peek made. When `animated` is set
           * the drawer first slides back out and only then drops its inline
           * geometry, so the close reads as a motion instead of a snap. The caller
           * then collapses the column after the duration.
           *
           * `keepPin` leaves the frame's grid-track pin in place for the duration
           * of the close animation. Dropping it early would restore React's widened
           * sidebar track while the drawer is still fading out, making the main
           * area jump wide and then snap narrow when the column collapses.
           */
          const releaseFloat = (animated = false, options = {}) => {
            const column = columnEl();
            if (animated && column !== null) {
              column.style.setProperty('transition', FLOAT_TRANSITION);
              column.style.setProperty('left', `${-FLOAT_SLIDE_PX}px`);
              column.style.setProperty('opacity', '0');
            }
            const frame = frameEl();
            const dropPin = () => {
              if (frame === null) return;
              frame.style.removeProperty('--dsh-compact-left-cols');
              frame.removeAttribute(FLOAT_ATTR);
            };
            if (!options.keepPin) dropPin();
            const clearInline = () => {
              const live = columnEl();
              if (live !== null) {
                for (const prop of ['position', 'left', 'top', 'bottom', 'height', 'width', 'z-index', 'transition', 'transform', 'opacity']) {
                  live.style.removeProperty(prop);
                }
              }
              // The pin is dropped together with the drawer's own geometry, so the
              // main area changes width exactly once, after the animation.
              dropPin();
              // The close animation owns the pin until here; release that claim so
              // later reconciliations behave normally.
              closingFloat = false;
            };
            if (animated) {
              // Bump the generation so a close that is overtaken by a fast
              // re-open does not strip the new drawer's inline geometry.
              const token = ++floatGeneration;
              // Land the inline cleanup just AFTER the collapse has been requested
              // (both are scheduled at FLOAT_DURATION_MS), so the pin is dropped
              // once, after the column has already collapsed -- never while the
              // drawer is still fading.
              window.setTimeout(() => {
                if (token !== floatGeneration) return;
                clearInline();
              }, FLOAT_DURATION_MS + 40);
            } else {
              floatGeneration += 1;
              clearInline();
            }
            floatWidth = 0;
          };

          /** True when the frame is currently floating a peek. */
          const isFloating = () => {
            const frame = frameEl();
            return frame !== null && frame.hasAttribute(FLOAT_ATTR);
          };

          /**
           * Reconcile everything the plugin shows on the toggle with the shell's
           * current state. Both the peek marker and the brand mark follow the
           * column's own classes, so this is the single place the DOM is fixed
           * up after the shell re-renders.
           *
           * The brand artwork is cached here, while the column is wide and the
           * shell still renders its brand row -- after the collapse that row is
           * gone, and the mark this plugin shows is the only copy left.
           *
           * The floating drawer is also reconciled here. A peek that is still up
           * lifts the expanded column out of the grid (main area keeps its width);
           * anything that is not a peek, or a peek that already collapsed, drops
           * the inline float changes so the shell's own layout takes over -- this
           * is how a pinned (clicked) peek becomes a normal expanded track again.
           */
          const syncToggle = () => {
            // A floating drawer is authoritative over the class: while it floats,
            // the shell can momentarily still carry `_collapsed` (its own state
            // settles a frame later). Treating that stale class as "collapsed"
            // would release the float mid-slide and let the two glyphs overlap.
            const floating = isFloating();
            const collapsed = isCollapsed() && !floating;
            if (collapsed) {
              // A collapsed column can never stay floating. This branch is only
              // reached when `floating` was already false, so there is nothing to
              // release here; clearing the flag is enough. (`releaseFloat` runs
              // from the close path and from `releaseAll` on teardown.)
              closingFloat = false;
              captureCollapsedTemplate();
            } else {
              cacheBrandMark();
            }
            if (peeking && !collapsed) {
              pinFrameToCollapsed();
              floatColumn();
            } else if (isFloating() && !closingFloat && !peeking) {
              // `closingFloat` means the close animation owns the pin right now;
              // releasing it here would widen the main area mid-fade.
              releaseFloat();
            }
            syncBrandMark();
            syncPeekMark();
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
              // Capture the collapsed template now -- while the column is still
              // collapsed -- so the frame can be pinned back to it the instant the
              // column expands, even on the very first peek.
              captureCollapsedTemplate();
              layout.toggleSidebar();
              // The expand just mounted the wide column; float it before the
              // shell paints its width tween so the main area never resizes.
              pinFrameToCollapsed();
              floatColumn();
            }
            // The column may have been opened by the user meanwhile; either way
            // hovering it must not schedule a collapse.
            clearClose();
            syncToggle();
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
              syncToggle();
              return;
            }
            peeking = false;
            over = false;
            // Animate the drawer out, then collapse the column once the slide has
            // finished. The frame's grid tracks MUST stay pinned for the whole
            // animation: releasing the pin here would restore React's widened
            // sidebar track immediately, so the main area would jump wide while the
            // drawer is still fading, then snap back when the column finally
            // collapses -- the flicker this avoids. `releaseFloat(true)` therefore
            // animates only the drawer and keeps the pin; the pin is dropped with
            // the rest of the inline state once the collapse has landed.
            const floating = isFloating();
            if (floating) {
              closingFloat = true;
              releaseFloat(true, { keepPin: true });
            }
            syncToggle();
            const collapse = () => {
              // Only undo an expansion this plugin started, and only if the
              // column is still open: a click that pinned it must not be
              // reversed here.
              if (isCollapsed()) {
                closingFloat = false;
                return;
              }
              const layout = ctx.get('layout');
              if (layout === undefined) {
                closingFloat = false;
                return;
              }
              layout.toggleSidebar();
              // Keep `closingFloat` set: the column now reports collapsed, but the
              // pinned inline state is still on the frame for a few more ms. If
              // this flag were cleared here, the very next `syncToggle` would take
              // the "not floating" branch and release the pin while the collapsed
              // grid is still settling. The cleanup timer (FLOAT_DURATION_MS + 40)
              // drops the pin and clears the flag together.
              syncToggle();
            };
            if (floating) {
              window.setTimeout(collapse, FLOAT_DURATION_MS);
            } else {
              collapse();
            }
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
            syncToggle();
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
            syncToggle();
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
            syncToggle();
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

          /**
           * Keep the floating drawer correct across window resizes. While not
           * peeking we just refresh the collapsed template (the shell may have
           * crossed a breakpoint and changed the collapsed rail width). While a
           * peek is floating, re-pin the frame and re-measure the column width so
           * the drawer tracks the window instead of keeping a stale size.
           */
          const onResize = () => {
            if (!peeking) {
              if (isCollapsed()) captureCollapsedTemplate();
              return;
            }
            if (isFloating()) {
              pinFrameToCollapsed();
              floatColumn();
            }
          };

          doc.addEventListener('pointermove', onPointerMove, { passive: true });
          doc.addEventListener('pointerleave', onPointerExitWindow);
          doc.addEventListener('pointerdown', onPointerDownCapture, true);
          doc.addEventListener('click', onToggleClickCapture, true);
          if (typeof window.addEventListener === 'function') {
            window.addEventListener('resize', onResize, { passive: true });
          }

          // The shell re-renders on every state change, so the drawer's inline
          // geometry (width/top) and the peek/brand markers are re-applied after
          // each React commit. The grid override itself is a stylesheet
          // `!important` rule, so React rewriting `gridTemplateColumns` cannot
          // undo it; `style` is still watched because a React commit can replace
          // the column element (a slot remount) and the float must move onto the
          // new node. `class` covers `_collapsed`/`data-animating`.
          //
          // The observer is rooted on the frame and walks the subtree so it also
          // catches React replacing the column or toggle outright (a slot remount,
          // a plugin reload). Every callback re-resolves elements from the live DOM.
          let observer = null;
          const observedRoot = frameEl() ?? columnEl() ?? doc.body;
          if (typeof MutationObserver === 'function') {
            observer = new MutationObserver(() => syncToggle());
            observer.observe(observedRoot, {
              attributes: true,
              attributeFilter: ['class', 'style', 'data-animating'],
              subtree: true,
              childList: true,
            });
          }

          // Apply the mark once now, so a column that is already collapsed shows
          // it without waiting for a pointer event.
          syncToggle();

          return () => {
            clearOpen();
            clearClose();
            observer?.disconnect();
            // Release the mark even when the column is gone, or the next
            // activation would inherit a stale peek.
            releaseFloat();
            for (const el of doc.querySelectorAll('[' + PEEK_ATTR + ']')) {
              el.removeAttribute(PEEK_ATTR);
            }
            for (const el of doc.querySelectorAll('[' + BRANDED_ATTR + ']')) {
              el.removeAttribute(BRANDED_ATTR);
              el.querySelector('[data-dsh-compact-left-brand-mark]')?.remove();
            }
            style.remove();
            doc.removeEventListener('pointermove', onPointerMove);
            doc.removeEventListener('pointerleave', onPointerExitWindow);
            doc.removeEventListener('pointerdown', onPointerDownCapture, true);
            doc.removeEventListener('click', onToggleClickCapture, true);
            if (typeof window.removeEventListener === 'function') {
              window.removeEventListener('resize', onResize);
            }
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
