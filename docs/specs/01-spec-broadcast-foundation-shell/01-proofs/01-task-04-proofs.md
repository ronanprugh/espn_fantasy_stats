# Task 04 Proofs — Responsive shell foundation

## Task Summary

This task proves the app shell now adapts from a fixed two-column desktop grid
to a single-column mobile layout at 900px, uses small-viewport units so mobile
browser toolbars cannot clip content, and produces no page-level horizontal
scroll at 320px — while leaving the desktop layout structurally unchanged.

The starting shell was `grid-template-columns: 220px 1fr` with `height: 100vh`
panes and no media query beyond one scoped to box scores. On a phone the sidebar
consumed 220px of a 320px viewport.

## What This Task Proves

- Below 900px the sidebar is gone, the layout is a single block, and the page
  scrolls naturally rather than through an internal pane.
- At and above 900px the desktop shell is unchanged, including the collapse
  control.
- A persisted `sidebar_collapsed: true` cannot leak a phantom 36px column into
  the mobile layout.
- `100svh` replaced every `100vh` and resolves correctly at runtime.
- No page-level horizontal overflow at 320px; wide tables scroll in-container.
- `viewport-fit=cover` is in place, the precondition for safe-area insets in 5.0.

## Evidence Summary

- Runtime measurements at 1280px, 375px, and 320px, all with a verified non-zero
  viewport.
- 149 tests pass (a `vh` regression assertion added); `npm run build` exits 0.
- `grep '100vh'` returns nothing; five rules migrated to `svh`.
- Only one breakpoint *value* in the stylesheet.

## Artifact: Shell behaviour measured at three widths

**What it proves:** The breakpoint switches the shell correctly, and the desktop
layout survives untouched.

**Why it matters:** FR U2-1 and FR U2-2 are a pair — the mobile layout must
appear *and* the desktop layout must not regress. Measuring only one of them
proves half the requirement.

**Method:** The shell only renders for an authenticated session, which is not
available here. Instead, markup mirroring `App.tsx` — `.layout.sidebar-collapsed`
wrapping `.sidebar` and `.content`, containing a 14-column `.teams` table — was
injected into the running app and measured with `getComputedStyle`. This tests
the real stylesheet against the real DOM structure.

**Result summary:** Every property flips as intended at the breakpoint, and the
desktop column layout is preserved.

| Measurement | 1280px (desktop) | 375px | 320px |
| --- | --- | --- | --- |
| `.layout` display | `grid` | `block` | `block` |
| `.layout` columns | `36px 1244px` | `none` | `none` |
| `.sidebar` display | `flex` | **`none`** | **`none`** |
| `.sidebar-collapse-btn` | `flex` | **`none`** | **`none`** |
| `.content` padding | `24px 32px` | `16px 12px` | `16px 12px` |
| `.content` overflow-y | `auto` | `visible` | `visible` |
| page `scrollWidth` | 1280 | 375 | 320 |
| page `clientWidth` | 1280 | 375 | 320 |
| **page overflow** | **false** | **false** | **false** |
| table scrolls in-container | true | true | true |

The desktop column reads `36px 1244px` because the probe deliberately applied
the `sidebar-collapsed` class — confirming the collapse control still produces
its 36px rail at desktop width.

## Artifact: The persisted-collapse leak is closed

**What it proves:** A user who collapsed the sidebar on desktop does not carry a
36px phantom column into the mobile layout.

**Why it matters:** `App.tsx` persists the collapsed flag to `localStorage` under
`sidebar_collapsed` and applies `.sidebar-collapsed` on every render regardless
of viewport. Since that class sets `grid-template-columns: 36px 1fr`, a returning
user would have seen every mobile page indented by 36px with nothing in the
gutter. The bug only reproduces for users with a specific stored value, which is
exactly the kind of defect that escapes manual testing.

**Result summary:** The probe applies `class="layout sidebar-collapsed"` at all
three widths. At 375px and 320px the computed `grid-template-columns` is `none`,
so the stored preference has no effect below the breakpoint.

## Artifact: svh migration complete and resolving

**What it proves:** No `vh` unit survives, and `svh` computes to a real height.

**Why it matters:** `100vh` on mobile is the height with browser toolbars
*hidden*, so a `100vh` pane is taller than the visible viewport whenever they are
shown, clipping the bottom of the layout. `svh` is the smallest viewport height
and always fits. `dvh` was rejected by the spec because it recalculates during
scroll and causes jitter.

**Command:**

```bash
grep -n '100vh' frontend/src/styles.css   # no matches
```

**Result summary:** Five rules migrated — `.layout`, `.sidebar`, `.content`
(height) and `.bootstrap-loading`, `.login-wrap` (min-height). At a 320×568
viewport all three shell rules resolve to `568px`:

```json
{ "innerHeight": 568, "layoutMinHeight": "568px",
  "contentMinHeight": "568px", "loginWrapMinHeight": "568px" }
```

This is guarded going forward by a new assertion in `tokens.test.ts` that fails
on any `\d+vh` in the stylesheet, so a later spec cannot silently reintroduce it.

## Artifact: Horizontal containment without touching non-goals

**What it proves:** Wide content scrolls inside its own container while the page
does not overflow.

**Why it matters:** Success Metric 1 requires no page-level horizontal scroll at
320px on every route, but non-goals 1–3 defer table redesign, the bracket SVG,
and chart responsiveness to later specs. The resolution is containment: the
content keeps its width and scrolls locally.

**Result summary:** With a 14-column table at 320px, `.teams-wrap` reports
`scrollWidth > clientWidth` (it scrolls) while `documentElement.scrollWidth`
equals `clientWidth` (the page does not). Containers audited and fixed:

| Container | Was | Now |
| --- | --- | --- |
| `.teams-wrap` | `overflow-x: auto` | unchanged |
| `.bracket-section` | `overflow-x: auto` | unchanged |
| `.h2h-summary`, `.h2h-matchups` | **no containment** | `overflow-x: auto; min-width: 0` |
| `.hub-roster`, `.hub-schedule` | **no containment** | `overflow-x: auto; min-width: 0` |
| `.chart-wrap`, `.chart-with-averages` | **no containment** | `min-width: 0`, `overflow-x: auto` |

`min-width: 0` is as important as `overflow-x`: a flex or grid child defaults to
`min-width: auto` and refuses to shrink below its content, pushing the page wider
regardless of any overflow setting. `.chart-with-averages` is a flex container,
so its chart child would have done exactly that.

The chart fix is the **containment-only** resolution the audit called for:
`ComparisonChart.tsx` is untouched, and no Recharts prop or dimension changed.
Only the parent's ability to shrink was corrected.

## Artifact: One breakpoint value

**What it proves:** No competing definition of "small" was introduced.

**Why it matters:** The spec warns against a second breakpoint. The stylesheet
now has two `@media (max-width: 900px)` blocks — the new mobile shell and the
pre-existing `.box-score-grid` rule — but they share one *value*, which is what
the constraint is about. They were deliberately not merged so each stays next to
the rules it governs.

## Deviation from Plan

**Mobile uses page scroll, not an internal scroller.** The plan said to set
`.layout` to `grid-template-columns: 1fr` and `display: block`. It also becomes
`height: auto; min-height: 100svh; overflow: visible`, with `.content` switching
from `overflow-y: auto` to `visible`.

The desktop shell is a fixed-height grid whose `.content` scrolls internally.
Carrying that to mobile would defeat the point of the `svh` migration: an
internal scroller prevents mobile browser toolbars from collapsing on scroll, so
the layout would be sized for toolbars that never retract. Below the breakpoint
the page itself scrolls instead.

## Outstanding Work

**Sub-task 4.12 (screenshots of the real shell) is owner-blocked.** The shell
renders only for an authenticated session. Evidence here comes from injected
markup measured against the real stylesheet — strong for CSS behaviour, but it
does not show the actual sidebar, navigation, or page content reflowing.

The login page *is* verified end-to-end at 320px (no overflow, renders correctly
in light theme), but it does not exercise the shell.

## Reviewer Conclusion

The shell now switches cleanly at 900px: sidebar and collapse control hidden
below it, single-column block layout, page-level scrolling, and no horizontal
overflow at 320px with a 14-column table present. Desktop remains a grid with a
working collapse control.

Three defects were found and fixed that manual inspection would likely have
missed: the persisted-collapse phantom column, four containers with no
horizontal containment at all, and two flex parents that could not shrink. The
`vh` migration is complete and now regression-guarded by a test.

Real-shell screenshots remain outstanding and owner-blocked.
