# Task 03 Proofs — Condensed tabular numerals

## Task Summary

This task proves statistical figures across all six table sites now render in a
condensed face with `font-variant-numeric: tabular-nums`, so digits occupy equal
width and columns stop shifting between rows.

Unlike tasks 1.0 and 2.0, this one **required component edits**. The numeric
`<td>` cells carried no class — `AggregateTable.tsx` rendered bare
`<td>{o.wins}</td>` — so there was no hook for CSS to target without also
condensing owner and team names.

This is also the first task verified in a **running browser**. The Vite dev
server runs without the backend, so the login page renders and computed styles
can be read directly rather than inferred from the stylesheet.

## What This Task Proves

- `.num` cells resolve to Roboto Condensed with `tabular-nums` at runtime.
- Non-numeric cells are unaffected — no bleed onto owner or team names.
- The two deliberately-centred head-to-head tables keep their alignment.
- No font CDN, `@import`, or network dependency was added.
- Both themes render correctly in a real browser (first visual confirmation in
  this spec).
- `ThemeContext` persistence works at runtime, closing the runtime half of
  sub-task 2.9.

## Evidence Summary

- Runtime `getComputedStyle` confirms font, variant, and alignment on real markup.
- 50 numeric cells and 10 numeric headers across 6 files.
- 148 tests pass; `npm run build` exits 0.
- Zero font CDN references in `styles.css` or `index.html`.
- Dark and light themes both rendered and screenshotted live.

## Artifact: Runtime computed styles confirm the rule applies

**What it proves:** The numeric token reaches real cells with the correct font,
variant, and alignment — and does not leak onto text columns.

**Why it matters:** A CSS rule existing in the stylesheet proves nothing about
what the browser computes. Specificity conflicts are the likely failure here:
`table.teams th, table.teams td` sets `text-align: left` at (0,1,2) specificity,
so a naive `.num { text-align: right }` at (0,1,0) would silently lose.

**Command:** executed in the running app at `http://localhost:5173`

```js
const probe = document.createElement('div')
probe.innerHTML =
  '<table class="teams"><tbody><tr>' +
  '<td class="num" id="p1">1</td><td id="p2">x</td></tr></tbody></table>' +
  '<table class="h2h-table"><tbody><tr><td class="num" id="p3">1</td></tr></tbody></table>'
document.body.appendChild(probe)
// getComputedStyle on each
```

**Result summary:** The numeric cell picks up the condensed face, tabular
figures, and right alignment. The adjacent plain cell is untouched. The
head-to-head cell gets the numerals but keeps its centring.

| Probe | font-family | font-variant-numeric | text-align |
| --- | --- | --- | --- |
| `.teams td.num` | `"Roboto Condensed"` | `tabular-nums` | **right** |
| `.teams td` (plain) | `system-ui` | `normal` | left |
| `.h2h-table td.num` | `"Roboto Condensed"` | `tabular-nums` | **center** |

The middle row is the important one: it proves the change is scoped. Owner names
and team names still render in the UI sans at normal width.

## Artifact: Centred comparison tables keep their alignment

**What it proves:** Right alignment was applied only where it helps.

**Why it matters:** The obvious implementation — right-align every `.num` cell —
would have damaged two tables. `.h2h-table` and `.h2h-matchups-table` are
`text-align: center` by design: they compare two owners side by side, and
centring is what pairs each figure with the team heading above it. Right-aligning
them would shove both owners' scores toward their right edges and break that
pairing.

**Result summary:** Alignment conventions were checked per table before applying
anything.

| Table | Existing alignment | Treatment |
| --- | --- | --- |
| `table.teams` | left | numerals + right-align |
| `.lineup-table` | left | numerals + right-align |
| `.schedule-table` | left | numerals + right-align |
| `.h2h-table` | **center** | numerals only |
| `.h2h-matchups-table` | **center** | numerals only |

The exclusion is recorded in the stylesheet next to the rule, so a later reader
does not "fix" the apparent inconsistency.

## Artifact: Coverage across all six table sites

**What it proves:** The requirement was applied everywhere statistical figures
appear, not just the headline table.

**Why it matters:** FR U1-4 says "apply it to statistical figures in tables" —
plural. Partial application would leave the alignment defect visible on five
pages while the demo page looked fixed.

**Command:**

```bash
grep -o 'num[ "`]' <file> | wc -l
```

**Result summary:** 50 numeric cells and 10 numeric headers across six files.

| File | Numeric cells | Numeric headers |
| --- | --- | --- |
| `AggregateTable.tsx` | 12 | via `numeric` prop |
| `TeamList.tsx` | 12 | via `numeric` prop |
| `PositionalStatsPage.tsx` | 8 | 8 |
| `HeadToHeadPage.tsx` | 6 | — (centred table) |
| `TeamHubPage.tsx` | 8 | 3 |
| `BoxScorePage.tsx` | 4 | 2 |

`.stat-value` on Team Hub also received the condensed face.

## Artifact: No network dependency introduced

**What it proves:** The condensed face comes from a system stack, not a webfont.

**Why it matters:** The spec explicitly forbids adding a font CDN — it would
introduce a network dependency and a layout-shift risk for a purely typographic
gain.

**Command:**

```bash
grep -rE '@import|fonts.googleapis|<link.*font' src/styles.css index.html
```

**Result summary:** No matches. The token resolves to a fallback chain ending in
a generic family, verified in the built bundle:

```
--font-numeric: "Roboto Condensed", "Arial Narrow", ui-sans-serif, system-ui, sans-serif
```

Where no condensed face is installed this degrades to the UI sans — still
tabular, just not condensed, which is the documented accepted trade-off.

## Artifact: First visual confirmation of both themes

**What it proves:** The Broadcast palette renders as intended in a real browser,
in both themes, and theme persistence survives a reload.

**Why it matters:** Tasks 1.0 and 2.0 were verified entirely numerically. Nobody
had seen either theme. The dev server runs without the backend, so the login
page renders and provides genuine visual evidence plus a live `ThemeContext`
check.

**Result summary — dark:** charcoal ground `rgb(14, 17, 22)` = `#0e1116`, card
raised above it, amber `#f0a92c` on the primary button and the invite link.
Renders as designed.

**Result summary — light:** after `localStorage.setItem('theme','light')` and a
reload, the app came back in light theme — warm paper ground `rgb(244, 242, 239)`
= `#f4f2ef`, white card, accent `rgb(146, 97, 0)` = `#926100`.

```json
{
  "persistedTheme": "light",
  "dataThemeAttr": "light",
  "bodyBg": "rgb(244, 242, 239)",
  "accent": "#926100",
  "submitButtonBg": "rgb(146, 97, 0)"
}
```

This closes the runtime half of sub-task 2.9: `data-theme` is stamped on the root
element and the choice survives a full page reload. The `toggle()` function
itself still has not been exercised — its only trigger lives in the sidebar,
which requires an authenticated session.

**Screenshots were viewed live in-session but are not persisted to disk.** The
browser tool renders to the session rather than the filesystem, so these are not
committed artifacts. The computed values above are the durable, reproducible
evidence.

## Observation for the Owner: the light accent reads brown

Seen rendered rather than measured, `#926100` as a large filled button reads
closer to **brown or olive** than to amber. It passes contrast comfortably
(4.74:1 worst case) and holds the correct hue family on paper, but at button
scale the amber identity that anchors the dark theme is weak.

This is exactly the class of problem the waived light-theme design review would
have caught, and it is not something the contrast report can flag. Options if you
want it addressed: raise chroma while holding luminance, reserve the solid fill
for dark theme and use an outline treatment in light, or accept it.

**No change made** — this is a design judgment, and the numbers do not justify
overriding your earlier decision unilaterally.

## Deviations from Plan

**1. `SortableTh` gained a `numeric` prop.** The plan listed only "add `num`
classes to cells". But headers are rendered by a shared `SortableTh` component
that accepted no `className`, so right-aligned numbers would have sat under
left-aligned labels. The component now takes an optional `numeric?: boolean`.
This is a component edit beyond the letter of the plan, consistent with the
sanctioned-edit scope already recorded for tasks 3.3–3.7.

**2. `--font-numeric` added to `ALLOWED_ADDITIONS`.** Expected: the task 0.0
tripwire required an explicit declaration before the new token would pass. It
worked as designed.

**3. `.stat-value` already had `font-variant-numeric: tabular-nums`.** Only the
condensed face was missing. My first edit duplicated the property; corrected.

## Note for Task 6.0: a measurement trap

While verifying, `document.documentElement.scrollWidth > clientWidth` reported
`true` on the login page — an apparent horizontal-overflow failure. It was
spurious: the tab had not been explicitly sized, and `clientWidth` and
`window.innerWidth` were both **0**, so `100vh` resolved to `0px` and every
measurement was meaningless.

After `resize_window(1280, 800)` the same check returned `scrollWidth: 1280`,
`clientWidth: 1280`, no overflow.

**Task 6.0's responsive matrix must assert `clientWidth > 0` before trusting any
cell.** Without that guard, all 27 measurements can silently report against a
zero-width viewport — producing either false failures or, worse, false passes
that look like evidence.

## Reviewer Conclusion

Condensed tabular numerals are applied across all six table sites and verified in
a running browser rather than inferred from the stylesheet. The change is
correctly scoped: text columns are untouched, and the two centred comparison
tables keep their alignment. No network dependency was introduced.

The task also produced the first visual confirmation of both themes and closed
the runtime half of the `ThemeContext` check. One subjective finding is raised
for the owner: the light accent reads brown at button scale, which measurement
cannot detect and the waived design review would have caught.
