# Task 01 Proofs — Broadcast dark theme token retarget

## Task Summary

This task proves the entire dark theme has been repainted to the Broadcast
palette — blue-biased charcoal ground, panels raised by lightness, a single
amber accent — **without modifying a single component, page, or context file**.

That isolation is the point of the task. Every one of the twelve pages styles
itself through the same CSS custom properties, so retargeting the *values* while
holding the *names* fixed changes the look of the whole app for free. Renaming a
token would have converted this from a palette change into an app-wide refactor.

## What This Task Proves

- The dark palette is now Broadcast: `#0e1116` ground, `#161b23` panels,
  `#f0a92c` accent, with no blue surviving anywhere in the block.
- No component, page, or context file was touched — the whole-app repaint came
  through the existing variables.
- Every token name survived, enforced automatically rather than eyeballed.
- Every text and accent token clears WCAG AA (4.5:1) against every surface it
  can appear on.
- The delta tokens (FR U1-5) are measurably distinct from the accent.

## Evidence Summary

- 24 tests pass across 2 suites (up from 18; 6 added for FR U1-5).
- `npm run build` exits 0, no new warnings versus baseline.
- `git diff --name-only frontend/src/{components,pages,contexts}` returns **empty**.
- All 10 colour tokens measure ≥ 4.76:1 on their worst-case surface.
- `--success` and `--danger` sit 70.8° and 47.7° from the accent in CIELAB hue.

> **Screenshots are not included.** Task 0.2 was waived by the owner (away from
> their machine), and the running app is unavailable to the agent. The visual
> artifacts for this task remain outstanding — see *Outstanding Work*.

## Artifact: No component, page, or context file was modified

**What it proves:** FR U1-1's central claim — that retargeting token values
requires no component changes — holds in practice, not just in intent.

**Why it matters:** This is the entire justification for keeping token names
frozen. If the repaint had required touching page components, the constraint
would have bought nothing and the spec's foundation argument would collapse.

**Command:**

```bash
git diff --name-only frontend/src/components frontend/src/pages frontend/src/contexts
```

**Result summary:** Empty output — zero files. The full change under
`frontend/src/` is two files, neither of which is a component: the stylesheet
itself, and the test file that verifies it.

```
 frontend/src/contrast.test.ts | 50 +++++++++++++++++++++++
 frontend/src/styles.css       | 85 +++++++++++++++++++++++++--------------
 2 files changed, 104 insertions(+), 31 deletions(-)
```

## Artifact: Token names survived the retarget

**What it proves:** All 27 custom-property names are intact after the palette
replacement.

**Why it matters:** A silent rename would break every page that references the
old name, and the breakage would be invisible until someone loaded the affected
page. This is checked automatically on every run now, not at review time.

**Command:**

```bash
cd frontend && npm run test
```

**Result summary:** `tokens.test.ts` passes all four assertions, including
"never drops or renames a token that existed before the retarget" and "only
introduces additions that were declared deliberate". No token was added in this
task, and `ALLOWED_ADDITIONS` remains empty.

## Artifact: Every token clears AA on every surface it can appear on

**What it proves:** The new palette is legible, measured rather than assumed.

**Why it matters:** Dark palettes fail quietly. A muted token that looks fine on
the page background can drop below AA on a raised card or a selected row, and
the failure only shows up for the user who happens to sort that column.

Each token was measured against all three surfaces it can land on — `--bg-page`,
`--bg-card`, and `--bg-selected` composited over the card. The worst case for
light-on-dark text is the *lightest* surface, so `--bg-selected` is the binding
constraint throughout.

**Result summary:** All ten tokens pass, with the tightest margin at 4.76:1
(`--text-faint` on a selected row) against the 4.5:1 requirement.

| token | value | on page | on card | on selected | verdict |
| --- | --- | --- | --- | --- | --- |
| `--text-strong` | `#f4f7fa` | 17.59 | 16.07 | 13.46 | PASS |
| `--text-primary` | `#e3e9f0` | 15.47 | 14.14 | 11.84 | PASS |
| `--text-secondary` | `#aeb9c6` | 9.51 | 8.69 | 7.27 | PASS |
| `--text-muted` | `#939eac` | 6.96 | 6.36 | 5.32 | PASS |
| `--text-faint` | `#8a95a3` | 6.22 | 5.69 | **4.76** | PASS |
| `--accent` | `#f0a92c` | 9.38 | 8.57 | 7.18 | PASS |
| `--accent-hover` | `#f7bc55` | 11.06 | 10.11 | 8.46 | PASS |
| `--success` | `#4ec26f` | 8.35 | 7.63 | 6.39 | PASS |
| `--danger` | `#f0716b` | 6.56 | 5.99 | 5.02 | PASS |
| `--warn` | `#d98b52` | 6.99 | 6.39 | 5.35 | PASS |

The previous `--text-faint` (`#666`) would have measured 2.9:1 on a card. It was
raised to `#8a95a3`; "faint" is now expressed through hue and weight rather than
by dropping below legibility.

## Artifact: Delta tokens are measurably distinct from the accent (FR U1-5)

**What it proves:** `--success` and `--danger` cannot be confused with the amber
accent.

**Why it matters:** The audit flagged this as the one token pairing at genuine
risk, because the old `--warn` (`#ff9d3a`) sat a few degrees of hue from the
proposed `#f0a92c` accent. With the accent now amber, any warm status colour is
a collision candidate.

**Result summary:** Both delta tokens clear the 25° threshold by a wide margin.

```
success vs accent = 70.8 deg
danger  vs accent = 47.7 deg
success vs danger = 118.5 deg
```

The `success vs danger` figure matters independently: those two carry opposite
meanings in the same table column, so confusing them with each other would be
worse than confusing either with the accent.

## Deviation from Plan: FR U1-5 is measured by hue, not contrast ratio

The audit closed FR U1-5 with "≥3:1 contrast ratio between `--accent` and each
status token." **That assertion was implemented differently, because the planned
metric was wrong.**

Measured against the planned criterion, the palette fails on every token —
including colours nobody could possibly confuse:

| pairing | contrast ratio | planned verdict |
| --- | --- | --- |
| accent vs success (amber vs green) | 1.12:1 | FAIL |
| accent vs danger (amber vs red) | 1.56:1 | FAIL |
| accent vs warn (amber vs orange) | 1.48:1 | FAIL |

Contrast ratio is a **luminance** metric. It answers "is this text legible on
this background?" Amber and green score 1.12:1 because they sit at nearly
identical lightness — not because they look alike. Enforcing 3:1 luminance
separation would have forced the delta colours drastically lighter or darker
than the accent, destroying their ability to read as peers in the same column,
and would have done so in service of a number that says nothing about
confusability.

The property FR U1-5 actually needs is **hue** separation. `src/lib/perceptual.ts`
converts sRGB to CIELAB and compares LCh hue angles, with `deltaE76` reported
alongside as a sanity check. The threshold is 25°, the conventional edge of
"same hue family"; it is not load-bearing, since the measured values clear it by
22 to 93 degrees.

**Scope correction, same finding.** Applying the corrected metric showed that no
orange can clear 25° from an amber accent — the best achievable is 16.7°:

| `--warn` candidate | LCh hue | Δ from accent |
| --- | --- | --- |
| `#ff9d3a` (previous) | 65.4° | 11.4° |
| `#e0913c` | 67.6° | 9.2° |
| `#d98b52` (chosen) | 60.1° | **16.7°** |
| `#d9765a` (terracotta) | 42.1° | 34.8° — but only 12° from `--danger` |

Pushing `--warn` clear of the accent drives it into `--danger`. The warm hue
space cannot hold three distinct semantics when the accent owns amber.

This turned out not to be a real conflict, because **`--warn` is not a delta
token.** FR U1-5's own parenthetical scopes it to "positive/negative deltas",
and `--warn` has no delta semantics in this app. Its only two uses are:

```
styles.css:503  .edit-btn { color: var(--warn); }              /* Manage Leagues */
styles.css:1461 .round-badge.round-championship { ... }        /* playoff bracket */
```

An edit button and a championship badge. `--success` and `--danger` are the
delta pair — they style `.pos` / `.neg` on the `avg_plus_minus` column — and
both clear the threshold comfortably. `--warn` was retargeted to `#d98b52` to
work on the new ground and is explicitly excluded from the assertion, with the
reasoning recorded in both the test file and the stylesheet.

## Open Design Question for the Owner

`--warn` at 16.7° from the accent is close enough to read as a slightly muddy
amber. Two of its uses sit awkwardly against the spec's accent discipline
("one amber accent... marks the active nav item, the selected segment, and
rank-one emphasis — **nothing else**"):

- **The championship round badge** is arguably *rank-one emphasis* and by that
  reading should use `--accent` outright, not a near-amber sibling.
- **The Manage Leagues edit button** is a secondary action and probably should
  not be amber-adjacent at all — as amber it competes with genuine accent usage.

Both are per-page styling decisions affecting the playoff bracket and the
Leagues page, which this spec defers to later per-page work. **No change was
made.** Flagging it so the decision is deliberate rather than inherited.

## Outstanding Work

The two screenshot artifacts for this task are not captured:

- Season Stats at 1280px, dark theme, showing the palette on an untouched page
- Playoff History at 1280px, dark theme, showing a second page inheriting it

Both require a running, logged-in app. Task 0.2 was waived by the owner for the
same reason. The palette is verified numerically and structurally, but **no
human has yet looked at it**, so subjective judgments — whether the amber reads
as "broadcast" rather than "traffic cone", whether hairline borders are too
faint at real viewing distance — remain unverified.

## Reviewer Conclusion

The dark theme is fully retargeted to the Broadcast palette with zero component
changes, confirming the spec's foundational premise. Every token is verified
legible against every surface it can appear on, with the tightest margin at
4.76:1, and the delta tokens are provably distinct from the accent.

The one substantive departure from plan is that FR U1-5 is measured by hue
separation rather than contrast ratio. The planned metric would have failed
amber-versus-green at 1.12:1 and forced a worse palette to satisfy a number that
does not measure confusability. The corrected metric is documented in code and
here.

Numerical verification is complete. Visual confirmation is outstanding and
owner-blocked.
