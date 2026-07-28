# Task 00 Proofs — Verification infrastructure and pre-change baseline

## Task Summary

This task proves the repository now has an automated verification gate where it
previously had none, and that the pre-change state of the app has been recorded
before any visual change is made.

The repository had no test framework: `package.json` contained no `test` script
and no test dependency, and `cloudbuild.yaml` covers only the backend. Planning
audit run 1 raised this as a REQUIRED failure, and the user chose to build the
infrastructure rather than record a deviation. Task 0.0 delivers that
infrastructure, plus the baseline artifacts that the first token edit would
otherwise destroy.

## What This Task Proves

- `npm run test` exists, runs, and passes on the unmodified codebase — so any
  later failure is attributable to this spec's edits rather than to setup.
- The contrast math is correct against WCAG's own published fixed points, not
  merely self-consistent.
- Token-name stability (FR U1-1) is enforced automatically, and the enforcement
  demonstrably fails when a token is renamed.
- The pre-change build output is recorded, giving Success Metric 5 a real
  baseline to compare against.
- Adding the test harness does not change the production bundle.

## Evidence Summary

- 18 tests across 2 suites pass on the unmodified codebase.
- `npm run build` still exits 0 with test files present and type-checked.
- The production bundle hash is **unchanged** from baseline
  (`index-Cuz3KQLB.js`, 607.45 kB), confirming zero shipping impact.
- A simulated token rename makes the suite fail, proving the tripwire is armed.
- The build baseline records a **pre-existing** 500 kB chunk-size warning, so it
  is not later misread as a regression introduced by this spec.

> **Screenshot artifacts (0.2) are not included — see Outstanding Work below.**

## Artifact: Test suite passes on the unmodified codebase

**What it proves:** The harness is wired to real suites and runs green before any
token or layout change.

**Why it matters:** A green baseline is the whole point of this task. If the
suite were already failing, every later result would be ambiguous.

**Command:**

```bash
cd frontend && npm run test -- --reporter=verbose
```

**Result summary:** 18 tests in 2 files pass in 139 ms. The suite is not an empty
pass — every assertion is named and visible below.

```
 RUN  v4.1.10 /Users/rprugh/repos/espn_fantasy_stats/frontend

 ✓ src/lib/tokens.test.ts > token-name stability (FR U1-1) > parses both theme blocks 1ms
 ✓ src/lib/tokens.test.ts > token-name stability (FR U1-1) > never drops or renames a token that existed before the retarget 0ms
 ✓ src/lib/tokens.test.ts > token-name stability (FR U1-1) > only introduces additions that were declared deliberate 0ms
 ✓ src/lib/tokens.test.ts > token-name stability (FR U1-1) > defines the same token names in both themes 0ms
 ✓ src/lib/contrast.test.ts > contrast math known values > black on white is 21:1 1ms
 ✓ src/lib/contrast.test.ts > contrast math known values > a colour against itself is 1:1 0ms
 ✓ src/lib/contrast.test.ts > contrast math known values > is order independent 0ms
 ✓ src/lib/contrast.test.ts > contrast math known values > #767676 on white is the canonical AA boundary of ~4.54:1 0ms
 ✓ src/lib/contrast.test.ts > contrast math known values > white has luminance 1 and black 0 0ms
 ✓ src/lib/contrast.test.ts > parseColor > parses 6-digit hex 0ms
 ✓ src/lib/contrast.test.ts > parseColor > expands 3-digit hex 0ms
 ✓ src/lib/contrast.test.ts > parseColor > parses rgb() and rgba() 0ms
 ✓ src/lib/contrast.test.ts > parseColor > throws rather than guessing on unsupported notation 0ms
 ✓ src/lib/contrast.test.ts > compositeOver > a fully opaque colour is unchanged 0ms
 ✓ src/lib/contrast.test.ts > compositeOver > a fully transparent colour becomes the background 0ms
 ✓ src/lib/contrast.test.ts > compositeOver > 50% black over white is mid grey 0ms
 ✓ src/lib/contrast.test.ts > compositeOver > changes the outcome for low-alpha tokens 0ms
 ✓ src/lib/contrast.test.ts > ratioBetween > resolves translucent foregrounds against their surface 0ms

 Test Files  2 passed (2)
      Tests  18 passed (18)
   Duration  139ms
```

## Artifact: Contrast math validated against WCAG fixed points

**What it proves:** `contrastRatio` and `relativeLuminance` produce correct
absolute values, not just internally consistent ones.

**Why it matters:** This is the load-bearing check for the entire spec. Tasks 1.0
and 2.0 accept or reject the whole Broadcast palette based on this function. A
subtly wrong implementation would pass every token pairing and report full AA
compliance while shipping unreadable text — the failure would be invisible until
a user complained.

**Result summary:** Four independent fixed points from the WCAG 2.1 definition
all hold: black-on-white is exactly 21:1, a colour against itself is 1:1, the
function is order-independent, and `#767676` on white lands on the canonical
4.54:1 AA boundary. Luminance endpoints are exactly 1 and 0.

The compositing behaviour is separately asserted, because it is the most likely
source of a falsely-passing suite:

```ts
it('changes the outcome for low-alpha tokens', () => {
  const raw = contrastRatio(parseColor('rgba(255,255,255,0.05)'), BLACK)
  const composited = contrastRatio(
    compositeOver(parseColor('rgba(255,255,255,0.05)'), BLACK), BLACK,
  )
  expect(raw).toBeGreaterThan(20)      // measured naively: reads as pure white
  expect(composited).toBeLessThan(1.2) // measured correctly: nearly invisible
})
```

Four tokens in this stylesheet are low-alpha `rgba()` — `--bg-subtle`,
`--bg-hover`, `--bg-row-stripe`, `--accent-soft`. Measured without compositing
they report ~21:1 instead of ~1.1:1, a 19-point error in the safe direction,
which would mask genuine failures.

## Artifact: Token-name tripwire demonstrably fires

**What it proves:** FR U1-1's enforcement is real. The test detects a rename
rather than passing vacuously.

**Why it matters:** Token-name stability is the core constraint of the spec —
every page styles through these variable names, so a rename silently converts a
token retarget into an app-wide visual break. A tripwire that has never been
seen to fail is not evidence of anything.

**Command:**

```bash
# temporarily rename --accent-hover -> --accent-hovr, run tests, restore
sed -i '' 's/^  --accent-hover:/  --accent-hovr:/' src/styles.css
npm run test
```

**Result summary:** The rename fails **two** assertions at once — the token
appears as a removal *and* as an undeclared addition. That dual signal is
deliberate: it means a rename cannot be silently accepted by appending the new
name to the allow-list, because the removal assertion still fails.

```
 ❯ src/lib/tokens.test.ts (4 tests | 2 failed) 6ms
     × never drops or renames a token that existed before the retarget 4ms
     × only introduces additions that were declared deliberate 0ms

 FAIL  src/lib/tokens.test.ts > never drops or renames a token that existed before the retarget
AssertionError: expected [ '--accent-hover' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "--accent-hover",
+ ]
```

`styles.css` was restored immediately afterwards; `git diff --stat src/styles.css`
reports no changes.

## Artifact: Token-name fixture captured pre-change

**What it proves:** The rename tripwire is armed against the genuine pre-change
token set.

**Why it matters:** The fixture is only meaningful if captured before task 1.0
touches the palette. Captured afterwards it would encode whatever the retarget
produced, including any accidental rename.

**Command:**

```bash
grep -oE '^[[:space:]]*--[a-z0-9-]+:' src/styles.css | tr -d ' :' | sort -u \
  > src/lib/token-names.fixture.txt
```

**Artifact path:** `frontend/src/lib/token-names.fixture.txt`

**Result summary:** 27 custom-property names recorded from the unmodified
stylesheet at commit `a4d1956`.

```
--accent          --bg-selected     --danger          --text-faint
--accent-hover    --bg-subtle       --danger-soft     --text-muted
--accent-soft     --border          --success         --text-primary
--accent-softer   --border-divider  --success-soft    --text-secondary
--accent-tint     --border-soft     --success-tint    --text-strong
--bg-card         --border-strong   --warn            (27 total)
--bg-hover        --bg-page         --warn-soft
--bg-row-stripe
```

## Artifact: Build baseline for Success Metric 5

**What it proves:** The pre-change build output is on record, including its
existing warnings.

**Why it matters:** Success Metric 5 requires "no new TypeScript errors or Vite
warnings **relative to the pre-change baseline**." This build already emits a
chunk-size warning at 607 kB. Without this artifact, a reviewer at task 6.0 would
see that warning and reasonably attribute it to the redesign.

**Artifact path:** `docs/specs/01-spec-broadcast-foundation-shell/artifacts/build-baseline.txt`

**Result summary:** Build exits 0 at commit `a4d1956` with one pre-existing
chunk-size advisory and no errors.

```
commit: a4d19568f38d380998de37c3b564e623439ebb93
node: v26.0.0  npm: 11.12.1

dist/index.html                   0.52 kB │ gzip:   0.31 kB
dist/assets/index-B51xVQPC.css   26.52 kB │ gzip:   4.99 kB
dist/assets/index-Cuz3KQLB.js   607.45 kB │ gzip: 182.04 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.23s
exit: 0
```

## Artifact: Test harness does not affect the production bundle

**What it proves:** Adding Vitest and three `src/lib` modules leaves the shipped
output byte-identical.

**Why it matters:** `tsconfig.json` has `include: ["src"]`, so test files are
type-checked by `npm run build`. That is desirable for correctness but raises the
question of whether they also get bundled and shipped to users.

**Command:**

```bash
cd frontend && npm run build
```

**Result summary:** The JS bundle hash is `index-Cuz3KQLB.js` both before and
after — identical filename, identical 607.45 kB size. Vite builds from
`index.html` → `main.tsx`, so nothing reachable only from a `.test.ts` file
enters the graph. Test code is checked but never shipped.

| | Baseline (a4d1956) | After task 0.0 |
| --- | --- | --- |
| JS bundle | `index-Cuz3KQLB.js` 607.45 kB | `index-Cuz3KQLB.js` 607.45 kB |
| CSS bundle | `index-B51xVQPC.css` 26.52 kB | `index-B51xVQPC.css` 26.52 kB |
| Exit code | 0 | 0 |

## Deviation from Plan

**Token-name assertion is superset, not exact equality.**

The audit specified that the parsed token set "exactly equals the fixture." That
was implemented as two assertions instead: no fixture token may disappear (hard
failure), and any addition must be declared in an `ALLOWED_ADDITIONS` list.

Exact equality would have failed at task 3.1, which legitimately introduces
`--font-numeric`. FR U1-1 requires "retaining every current token name" — it
constrains renames and removals, not additions. The two-assertion form enforces
exactly that while still catching a rename, as demonstrated above.

`ALLOWED_ADDITIONS` is currently empty. Task 3.1 must add `--font-numeric` to it,
which is the intended forcing function: a new token requires a deliberate edit
declaring it.

## Outstanding Work

**Sub-task 0.2 (pre-change screenshots) is not complete and is not blocked on
code.** Capturing them requires a running, logged-in app, and none of the
prerequisites are available in this environment:

| Prerequisite | State |
| --- | --- |
| Docker daemon | not running |
| `backend/.venv` | does not exist |
| `backend/.env` (`SECRET_KEY`, `ENCRYPTION_KEY`) | missing |
| Backend on `:8000` | not listening |
| Populated league data | requires real ESPN `espn_s2` / `SWID` cookies |

Standing this up additionally requires creating a user account with a password
and supplying real ESPN session credentials. Both are owner actions, so **all
screenshot artifacts in this spec must be captured by the repository owner.**

This affects the two `before-*` images referenced by tasks 3.0 and 6.0. Because
task 1.0 changes the dark palette, the pre-change screenshots must be captured
**before** task 1.0 is committed, or the comparison evidence is lost permanently.

## Reviewer Conclusion

The repository now has a working automated verification gate where it had none.
The contrast math is validated against WCAG's own fixed points rather than
assumed correct, and the token-name tripwire has been observed failing on a
simulated rename, so both gates are known to be real rather than vacuous. The
pre-change build baseline is recorded with its existing warnings, and the test
harness is confirmed to add nothing to the shipped bundle.

The code portion of task 0.0 is complete and verified. The screenshot portion is
owner-blocked and is called out above so it is not mistaken for an oversight.
