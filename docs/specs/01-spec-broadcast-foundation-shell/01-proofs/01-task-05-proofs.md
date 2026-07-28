# Task 05 Proofs — mobile bottom tab bar with a More sheet, and one nav list feeding both shells

## Task Summary

Below 900px the shell had navigation but no way to reach it: task 4.6 hides
`.sidebar`, which held all nine destinations, the theme toggle, the league
selector, and Sign out. This task adds the mobile navigation surface — a fixed
bottom tab bar with four primary destinations plus a More trigger, and a bottom
sheet holding the remaining five destinations and the orphaned sidebar controls.

The destinations themselves moved out of JSX into `navDestinations.ts`, which the
sidebar and the tab bar now both render from, so a route added in one place
cannot go missing from the other.

## What This Task Proves

- All nine destinations are reachable below 900px: four in one tap, five in two
  (More → item).
- The active destination is marked with the accent token, and only one tab is
  ever active — `end` on `/` stops the index route matching everything.
- The sheet is a real modal: `role="dialog"`, `aria-modal`, focus moved in on
  open and restored to the More button on close, Tab trapped, Esc and
  backdrop-click dismissal, background scroll locked.
- Every interactive control the mobile shell renders clears its target floor —
  44×44 for tab bar targets, 24×24 for the rest — with two real defects found
  and fixed rather than annotated.
- The desktop shell is unchanged by the sidebar refactor: same nine links, same
  three headings, same order, tab bar `display: none`, `.content` padding
  untouched.
- The tab bar and sheet exist only in CSS terms below the breakpoint — no JS
  breakpoint detection was introduced that could disagree with the stylesheet.

## Evidence Summary

- `navDestinations.test.ts` adds 8 assertions and passes: nine destinations,
  exactly four primary, no duplicate path or label, every path a registered
  route, and — the inverse, which the task did not ask for — no registered route
  left unreachable from navigation.
- Measured in a running Chromium: tab targets are 75×55 at 375px and 64×55 at
  320px; sheet rows are 48px; the sheet's league control was raised from 30px to
  44px.
- Two genuine defects were found by driving the sheet rather than by reading it:
  Esc silently stopped working after a click on the panel body, and the league
  selector had no mobile home at all.
- `npm run test` passes 157 tests across 3 suites; `npm run build` exits 0 with
  no new warning versus `build-baseline.txt`.

## Measurement Environment — read before the artifacts

The authenticated app shell **could not be reached**: the backend was not
running (`curl http://localhost:8000/api/me` → connection refused), there is no
`backend/.venv`, no `.env`, and no ESPN credentials, so every route renders the
login page. This is the same owner-blocked condition recorded in tasks 0.2, 1.10,
2.10, 3.9, and 4.12.

Rather than defer all runtime verification again, the real `BottomTabBar`,
`MoreSheet`, and `Sidebar` components were mounted against the real `styles.css`
and the real `ThemeProvider`/`AuthProvider`/`LeagueProvider` in a temporary
harness (`frontend/harness.html` + `frontend/src/harness.tsx`), driven in
Chromium, and the harness was then deleted — it is not part of the commit.

What that means for a reviewer:

- **Trustworthy:** every layout measurement, computed style, focus/keyboard
  behaviour, and dismissal path below. These exercise shipped component code and
  shipped CSS.
- **Not covered:** the tab bar composited over real page content, controls that
  belong to page content (sortable `<th>`s), and anything requiring league data.
  These remain owner-blocked.
- **Screenshots were viewed live in-session but are not on disk** — the browser
  tool renders to the session, not the filesystem. The same limitation was
  recorded in task 3.0. Computed values below are the durable evidence.

## Artifact: navigation-destination integrity test

**What it proves:** FR U2-3 — nine destinations, four primary, every one wired to
a route that actually exists.

**Why it matters:** this is the failure a screenshot cannot catch. A route
renamed in `main.tsx` leaves a tab that navigates to a blank page, and the tab
still looks perfectly fine in a screenshot. The test transcribes the router's
paths by hand precisely so a rename breaks it.

**Command:**

~~~bash
cd frontend && npx vitest run --reporter=verbose
~~~

**Result summary:** All 8 assertions pass. The suite also asserts the inverse
direction — every registered route is reachable from navigation — which is what
would catch a destination being dropped from the list rather than added to it.

~~~text
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > exposes exactly nine destinations
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > marks exactly four destinations primary
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > routes the remaining five through the More sheet
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > never lists the same path twice
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > never lists a duplicate label
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > points every destination at a registered route
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > leaves no registered route unreachable from navigation
✓ src/components/navDestinations.test.ts > navigation destinations (FR U2-3) > groups destinations under the sidebar section headings
~~~

## Artifact: tab bar renders and marks the active destination with the accent

**What it proves:** the bar appears below the breakpoint, all five targets are
laid out, and the active tab is drawn in `var(--accent)` — with exactly one tab
active.

**Why it matters:** the `end` prop on `/` is the difference between one active
tab and five. Without it the index route matches every path.

**Command (in-page, at 375×812, after tapping Playoff History):**

~~~js
const a = document.querySelector('.tab-bar-item.active')
const cs = getComputedStyle(a)
;({ path: location.pathname, active: a.textContent, color: cs.color,
    borderTop: cs.borderTopColor, bg: cs.backgroundColor })
~~~

**Result summary:** Exactly one active item, styled in the light-theme accent
`#926100` (`rgb(146, 97, 0)`) on text, top border, and tint — the same accent
token the sidebar's active rule uses. Season Stats was correctly *not* active on
`/playoffs`.

~~~json
{
  "path": "/playoffs",
  "active": "Playoff History",
  "color": "rgb(146, 97, 0)",
  "borderTop": "rgb(146, 97, 0)",
  "bg": "rgba(146, 97, 0, 0.06)"
}
~~~

Re-checked in dark theme on `/`: Season Stats active in amber `#f0a92c` with the
accent top border and tint, the other four in `--text-secondary`. Viewed
in-session; not persisted (see Measurement Environment).

## Artifact: the bar reserves its own space and does not overflow the page

**What it proves:** `.content` reserves the bar's height plus the safe-area inset
as bottom padding, and adding a fixed bar did not introduce horizontal overflow
at the narrowest supported width.

**Why it matters:** a fixed bottom bar's classic failure is covering the last row
of every page. Success Metric 1 also forbids page-level horizontal scroll at
320px, and five flex children are exactly the kind of thing that breaks it.

**Command:**

~~~js
const d = document.documentElement
;({ scrollWidth: d.scrollWidth, clientWidth: d.clientWidth,
    pass: d.scrollWidth <= d.clientWidth,
    contentPaddingBottom: getComputedStyle(document.querySelector('.content')).paddingBottom,
    bar: document.querySelector('.tab-bar').getBoundingClientRect() })
~~~

**Result summary:** At 320px, `scrollWidth === clientWidth === 320` — no
overflow. `.content` bottom padding computes to 72px = 56px bar + 16px gutter
(plus the inset, 0px on this device). The bar's own `min-height` is pinned to the
same `--tab-bar-height` the padding is computed from, so the two cannot drift.

~~~json
{ "scrollWidth": 320, "clientWidth": 320, "pass": true,
  "contentPaddingBottom": "72px",
  "bar": { "x": 0, "width": 320, "height": 56 } }
~~~

## Artifact: the sheet behaves as a modal dialog

**What it proves:** FR-level accessibility for the sheet — dialog semantics,
focus moved in on open, background scroll locked, focus restored on close.

**Why it matters:** the sheet is the only route to five of nine destinations. If
a keyboard or screen-reader user cannot enter it, leave it, or get focus back,
more than half the app is unreachable on a phone.

**Command (with the sheet open at 375×812):**

~~~js
const s = document.querySelector('.sheet')
;({ role: s.getAttribute('role'), ariaModal: s.getAttribute('aria-modal'),
    ariaLabel: s.getAttribute('aria-label'),
    bodyOverflow: document.body.style.overflow,
    focused: document.activeElement.textContent,
    moreExpanded: document.querySelector('.tab-bar-more').getAttribute('aria-expanded') })
~~~

**Result summary:** All present. Focus lands on the first sheet row on open; the
More button reports `aria-expanded="true"`; `body` scroll is locked while open.

~~~json
{ "role": "dialog", "ariaModal": "true", "ariaLabel": "More destinations",
  "bodyOverflow": "hidden", "focused": "Positional Stats", "moreExpanded": "true" }
~~~

Focus trap, verified by pressing Tab seven times from the first row: focus
cycled through all seven controls and wrapped back to `Positional Stats`,
staying inside `.sheet` throughout. The focus ring is drawn in the accent at
2px inset — confirmed both by `:focus-visible` matching and visually.

On close (Esc): sheet unmounted, `body.style.overflow` back to empty, focus
restored to the More button, `aria-expanded="false"`.

~~~json
{ "sheetPresent": false, "bodyOverflow": "(empty)",
  "focusRestoredTo": "More", "isMoreButton": true, "moreExpanded": "false" }
~~~

Backdrop click dismisses identically; a click on the sheet panel itself does
**not** dismiss (`stillOpenAfterPanelClick: true`), so the panel's own padding is
not an accidental close button.

## Artifact: two defects found by driving the sheet, not by reading it

**What it proves:** the verification step did real work — both of these look
correct in the source and fail in the browser.

**Why it matters:** each was a functional hole in the mobile shell, and neither
would have shown up in a screenshot.

### 1. Esc stopped working after clicking the panel body

The dismissal handler was a React `onKeyDown` on the panel. Clicking any
non-focusable part of the sheet — the drag handle, the padding between rows —
moves focus to `<body>`, so the keydown never reached the panel and both Esc and
the focus trap silently stopped working. Reproduced: click panel → focus is
`BODY` → Esc does nothing.

Fixed by binding `keydown` on `document` for the lifetime of the open sheet, and
by pulling focus back into the panel when Tab is pressed from outside it. The
listener is stored against a `useRef`-held `onClose` so the effect depends on
`open` alone — depending on the prop would re-run the whole open sequence on
every parent render.

Re-verified after the fix, same sequence:

~~~json
{ "sheetOpenAfterPanelClick": true, "focusNowOn": "BODY" }
{ "sheetClosedByEsc": true, "bodyOverflow": "(empty)", "focusRestoredTo": "More" }
{ "focusAfterTabFromBody": "Positional Stats", "insideSheet": true }
~~~

### 2. League switching was unreachable below 900px

The league `<select>` lives in `.sidebar`, which task 4.6 hides. Task 5.5 listed
only the theme toggle and Sign out as controls to lift, so the selector would
have been left with no mobile home at all — every stat page on a phone stuck on
whichever league was last chosen on a desktop. It is now lifted into the sheet
alongside the other two, including its `+ Add a league` empty-state fallback.

This is an addition beyond the task text; it is recorded as a deviation in the
task list.

## Artifact: touch-target measurement record

**What it proves:** FR U2-4 in both halves — 44×44 for tab bar targets and 24×24
for everything else the mobile shell renders.

**Why it matters:** this closes REQUIRED finding 2 from the planning audit, which
failed run 1 precisely because the 24×24 floor was unmeasured.

**Artifact path:** `docs/specs/01-spec-broadcast-foundation-shell/artifacts/touch-targets.md`

**Result summary:** Every measured control passes. Tab targets are 75×55 at
375px and 64×55 at 320px (width binds at 320px, height at neither). Sheet rows
are 375×48. Two controls failed on first measurement and were fixed in CSS: the
sheet's league `select` (30px → 44px) and the `+ Add a league` fallback (27px →
44px). Sortable `<th>`s could not be measured live — they need league data — and
are derived statically at ≈32×33px, comfortably over the floor, flagged
`pending` in the record.

## Artifact: desktop shell unchanged by the sidebar refactor

**What it proves:** rendering the sidebar from `NAV_DESTINATIONS` instead of
literal JSX produced the same nine links in the same order under the same three
headings, and the tab bar stays out of the desktop shell.

**Why it matters:** the refactor is what keeps the two shells in sync, and it
touches the component every desktop user sees. Section headings and ordering
were the easiest things to lose.

**Command (at 1280×800):**

~~~js
const nav = document.querySelector('.sidebar-nav')
;({ tabBarDisplay: getComputedStyle(document.querySelector('.tab-bar')).display,
    sidebarWidth: document.querySelector('.sidebar').getBoundingClientRect().width,
    contentPaddingBottom: getComputedStyle(document.querySelector('.content')).paddingBottom,
    order: [...nav.children].map(el => (el.className === 'nav-section' ? '## ' : '') + el.textContent.trim()),
    activeCount: document.querySelectorAll('.sidebar-nav a.active').length })
~~~

**Result summary:** Identical to the pre-refactor markup: three headings in
order, nine links in their original positions, one active item. Sidebar still
220px, `.content` bottom padding still the desktop 24px, tab bar `display: none`.

~~~json
{
  "tabBarDisplay": "none",
  "sidebarWidth": 220,
  "contentPaddingBottom": "24px",
  "order": ["## Season Data", "Season Stats", "Playoff History", "Scoreboard",
            "Positional Stats", "## Team Data", "Team Hub", "Team Comparison",
            "Head to Head", "## Account", "Manage Leagues", "Account"],
  "activeCount": 1,
  "activeLabel": "Season Stats"
}
~~~

## Artifact: no JS breakpoint was introduced

**What it proves:** visibility is decided in one place — the stylesheet.

**Why it matters:** a `matchMedia` check or resize listener would have to agree
with `max-width: 900px` forever, and the spec's single-breakpoint rule exists to
prevent exactly that kind of drift.

**Command:**

~~~bash
cd frontend && grep -rn "matchMedia\|resize\|innerWidth" src/ ; grep -c "max-width: 900px" src/styles.css
~~~

**Result summary:** No breakpoint logic in JS. The only two hits are a comment in
`BottomTabBar.tsx` saying so, and `ThemeContext.tsx`'s pre-existing
`matchMedia('(prefers-color-scheme: dark)')`, which is a theme query and not a
width query. `900px`
appears twice in the stylesheet: the pre-existing `.box-score-grid` rule and the
mobile-shell block from task 4.5, which this task extended with
`.tab-bar { display: flex }`. No third breakpoint value was introduced.

One ordering note worth recording: the first version of the stylesheet change
declared `.tab-bar { display: none }` *after* the media block that shows it, so
the bar never appeared at any width — same specificity, later rule won. The base
rules were moved above the media block. Caught by looking at the rendered page;
the CSS reads correctly either way.

## Artifact: gates

**What it proves:** the JSX and CSS additions compile and the whole suite still
passes.

**Command:**

~~~bash
cd frontend && npm run test && npm run build
~~~

**Result summary:** 157 tests across 3 suites pass. Build exits 0. The only
warning is the pre-existing >500 kB chunk notice, which is present in
`artifacts/build-baseline.txt` as well — no new warning.

~~~text
Test Files  3 passed (3)
     Tests  157 passed (157)

dist/index.html                   0.54 kB │ gzip:   0.32 kB
dist/assets/index-CvzeqVpB.css   29.90 kB │ gzip:   5.70 kB
dist/assets/index-VC5waDsb.js   611.53 kB │ gzip: 183.09 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.21s
~~~

## Outstanding — owner action required

| Sub-task | What is missing | Why |
| --- | --- | --- |
| 5.16 | Safe-area verification on a device with a home indicator | No Xcode on this host (`xcrun simctl` not installed) and the iOS simulator tool could not start. Static evidence only: `index.html` carries `viewport-fit=cover` (task 4.1) and both `.tab-bar` and `.sheet` set `padding-bottom: env(safe-area-inset-bottom, 0px)`. Chromium on desktop resolves the 0px fallback, which proves the fallback and not the inset. |
| 5.17 | Screenshots on disk | The browser tool renders to the session, not the filesystem; and the real shell needs an authenticated session in any case. |
| Live `<th>` measurement | Sortable header targets against the 24px floor | Needs real league data. Derived statically in `touch-targets.md`. |

## Reviewer Conclusion

The mobile navigation surface works: nine destinations reachable in at most two
taps, active state on the accent token, a sheet that behaves as a modal for
keyboard and pointer alike, and every target measured against its floor with two
real defects fixed rather than filed. The desktop shell is provably unchanged,
and the sidebar and tab bar now render from one list, so they cannot drift.

What a reviewer should still withhold judgment on is the composite: this shell
has never been seen over real page content in an authenticated session, and the
safe-area inset has not been observed non-zero on real hardware. Both are
recorded above as owner-blocked, and neither is a code question.
