# Responsive Matrix — Broadcast Foundation Shell

Cross-route horizontal-containment measurements for spec 01, task 6.0.

**Result: 27/27 cells pass.** No route produces page-level horizontal scroll at
320px, 375px, or 768px.

## Method

Measured in a live authenticated session against the Vite dev server at
`http://localhost:5173/espn-fantasy-stats/`, dark theme, with real league data
(10 seasons, 15 owners) — not fixtures, so column counts and owner-name widths
are the real worst case.

Routes were changed without a reload so React Router state stays warm:

```js
history.pushState({}, '', '/espn-fantasy-stats' + path);
dispatchEvent(new PopStateEvent('popstate'));
// settle 1600ms, then measure
const d = document.documentElement;
({ path, scrollWidth: d.scrollWidth, clientWidth: d.clientWidth,
   pass: d.scrollWidth <= d.clientWidth });
```

A cell passes when `document.documentElement.scrollWidth <= clientWidth` — the
page itself does not scroll sideways. Content that genuinely cannot narrow is
expected to scroll *inside its own container*; that is proven separately below.

## The 27 cells

Values are `scrollWidth / clientWidth` in CSS pixels.

| Route | 320px | 375px | 768px |
| --- | --- | --- | --- |
| `/` (Season Stats) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/playoffs` (Playoff History) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/scoreboard` | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/positional` (Positional Stats) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/team_hub` (Team Hub) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/compare` (Team Comparison) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/h2h` (Head to Head) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/leagues` (Manage Leagues) | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |
| `/account` | 320 / 320 ✅ | 375 / 375 ✅ | 768 / 768 ✅ |

## 768px is *below* the breakpoint — the mobile shell is correct there

The mobile shell breakpoint is `max-width: 900px`, reused deliberately from the
existing `.box-score-grid` rule rather than introducing a second definition of
"small". A portrait tablet at 768px therefore gets the **mobile** shell, not the
sidebar. This is the intended consequence of that decision, not a bug.

Computed values at 768px confirm it:

| Property | Value |
| --- | --- |
| `.tab-bar` `display` | `flex` (bottom tab bar shown) |
| `.sidebar` `display` | `none` |
| `.layout` `display` | `block` (page scrolls, not an internal pane) |

## Failures found and fixed during this pass

Two shared containers overflowed before this task; both were fixed with the
`min-width: 0` containment approach established in task 4.8, and the **full**
27-cell matrix was re-run after each fix rather than only the failing routes.

### 1. `.hub-tabs` — 448 vs 375 at 375px

The tab strip on Positional Stats and Team Hub is a `nowrap` flex row; its
buttons pushed the page 73px past the viewport. Fixed with `min-width: 0;
overflow-x: auto` on the strip and `flex: 0 0 auto` on the buttons, so the strip
scrolls in-container. After the fix `/positional` measures 375 / 375 while the
strip scrolls 436px of content inside a 351px box.

### 2. `.compare-controls .control` — 334 vs 320 at 320px

Failed identically on `/team_hub`, `/compare`, and `/h2h`, which is what pointed
at a single shared offender. `.compare-controls` was 296px wide but its first
`.control` child measured **322px** — wider than its own parent. The child holds
a `<select>` whose intrinsic width comes from its longest `<option>` (a full
team-plus-owner string), and the child defaulted to `min-width: auto`, so it
refused to shrink. `flex-wrap` cannot rescue this: the single item is already too
wide on its own.

```css
.compare-controls .control {
  min-width: 0;               /* let the flex child shrink below its content */
}

.compare-controls select {
  min-width: min(240px, 100%); /* keep the 240px desktop floor, drop it when narrower */
  max-width: 100%;             /* a select does not shrink from min-width alone */
}
```

## In-container scrolling still works (task 6.5)

Containment must not mean truncation. On Season Stats at 375px, the aggregate
table's wrapper scrolls its full width while the page does not move:

| Measurement | Value |
| --- | --- |
| Container | `.teams-wrap` |
| Container `scrollWidth` | 991px |
| Container `clientWidth` | 351px |
| Container `scrollLeft` after scrolling to end | 639.5px |
| Page `scrollWidth` / `clientWidth` | 375 / 375 |
| `window.scrollX` | 0 |

The table gives up 640px of horizontal travel inside its own box while the page
itself never scrolls sideways.

## Navigation reachability — every destination in ≤2 taps (task 6.6)

The bottom tab bar carries four primary destinations plus a More button; the More
sheet carries the remaining five, so the worst case is More + item = 2 taps.

| Destination | Path | Taps | Route |
| --- | --- | --- | --- |
| Season Stats | `/` | 1 | tab bar |
| Playoff History | `/playoffs` | 1 | tab bar |
| Scoreboard | `/scoreboard` | 1 | tab bar |
| Team Hub | `/team_hub` | 1 | tab bar |
| Positional Stats | `/positional` | 2 | More sheet |
| Team Comparison | `/compare` | 2 | More sheet |
| Head to Head | `/h2h` | 2 | More sheet |
| Manage Leagues | `/leagues` | 2 | More sheet |
| Account | `/account` | 2 | More sheet |

The More sheet also holds the theme toggle and Sign out, both at 2 taps.

This holds *from* every route, not just from the home route: on all nine routes
at 375px the tab bar computes to `display: flex` with 4 primary links and the
More button present.

| From route | `.tab-bar` display | Primary links | More button |
| --- | --- | --- | --- |
| `/` | flex | 4 | yes |
| `/playoffs` | flex | 4 | yes |
| `/scoreboard` | flex | 4 | yes |
| `/positional` | flex | 4 | yes |
| `/team_hub` | flex | 4 | yes |
| `/compare` | flex | 4 | yes |
| `/h2h` | flex | 4 | yes |
| `/leagues` | flex | 4 | yes |
| `/account` | flex | 4 | yes |

## Light-theme spot check at 375px (task 6.7)

The mobile shell is theme-independent. Toggling to light via the More sheet set
`data-theme="light"` and persisted `theme=light` to `localStorage`; three routes
were then re-measured at 375px.

| Route | `data-theme` | scrollWidth / clientWidth | `.tab-bar` | `body` background |
| --- | --- | --- | --- | --- |
| `/` | light | 375 / 375 ✅ | flex | `rgb(244, 242, 239)` |
| `/scoreboard` | light | 375 / 375 ✅ | flex | `rgb(244, 242, 239)` |
| `/compare` | light | 375 / 375 ✅ | flex | `rgb(244, 242, 239)` |

The background confirms the light palette is actually applied, and containment
and the tab bar behave identically to dark. The session was returned to dark
afterwards.

## Build and test gates

- `npm run build` → exit 0. Output captured in `build-final.txt`. Compared
  against `build-baseline.txt`: no new error or warning. The only warning is the
  pre-existing >500 kB chunk notice, present in the baseline too. Module count
  moved 772 → 775 from the components added across tasks 4.0–5.0.
- `npm run test` → 157 tests passed across 3 suites.

## Technique notes

Finding an overflow offender needs the parent-filtered list, not the raw one —
the raw filter returns ~84 elements because every descendant of a wide table also
overflows:

```js
const off = [...document.querySelectorAll('.content *')]
  .filter(el => { const r = el.getBoundingClientRect();
                  return r.right > innerWidth + 1 && r.width > 0 });
const topmost = off.filter(el => !off.includes(el.parentElement));
```
