# 01-audit-broadcast-foundation-shell.md

Planning audit for [`01-tasks-broadcast-foundation-shell.md`](./01-tasks-broadcast-foundation-shell.md)
against [`01-spec-broadcast-foundation-shell.md`](./01-spec-broadcast-foundation-shell.md).

Audit run: 2 (post-remediation)
Date: 2026-07-25

## Executive Summary

- Overall Status: **PASS**
- Required Gate Failures: 0
- Flagged Risks: 0 open (2 resolved)

All three REQUIRED failures and both FLAG findings from run 1 are closed. The
user chose to build test infrastructure (option b) rather than record a
traceability deviation, so fifteen of fifteen functional requirements now map to
either an automated test or a recorded measurement artifact.

## Gateboard

| Gate | Status | Run 1 | Fix landed |
| --- | --- | --- | --- |
| Requirement-to-test traceability | PASS | FAIL | Task 0.0 adds Vitest; FR U1-5 and U2-4 gaps closed |
| Proof artifact verifiability | PASS | FAIL | Task 1.5/1.6 replace "visually separable" with a 3:1 assertion |
| Repository standards consistency | PASS | PASS | Standards confidence raised from LOW to MEDIUM |
| Open question resolution | PASS | PASS | — |
| Regression-risk blind spots | PASS | FLAG | Task 4.9 containment wrapper; 6.3 states the boundary |
| Non-goal leakage | PASS | FLAG | `## Repository Standards Applied` scopes FR U1-1 to task 1.0 |

## Re-Audit Delta

Changed gate statuses since run 1:

- Requirement-to-test traceability: FAIL → PASS
- Proof artifact verifiability: FAIL → PASS
- Regression-risk blind spots: FLAG → PASS
- Non-goal leakage: FLAG → PASS
- Repository standards consistency: PASS (unchanged status, confidence LOW → MEDIUM)

Still-failing REQUIRED gates: none.

Newly introduced findings: none at REQUIRED or FLAG level. Two observations
recorded under *Residual Risks* below — neither blocks handoff.

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
| --- | --- | --- | --- |
| `AGENTS.md` | not found | — | — |
| `CONTRIBUTING.md` | not found | — | — |
| `.github/pull_request_template.md` | not found (no `.github/` directory) | — | — |
| `README.md` | yes | React+Vite+TS frontend; push to `main` auto-deploys via Cloud Build + Vercel; `.pgdata`/`.env` stay local | none |
| `frontend/package.json` | yes | `npm run build` = `tsc && vite build`; no lint script; **no test script — addressed by task 0.4** | none |
| `frontend/tsconfig.json` | yes | `strict`, `noUnusedLocals`, `noUnusedParameters`; `include: ["src"]` means test files are type-checked by the build | none |
| `frontend/src/base.ts` | yes | `BASE_PATH = '/espn-fantasy-stats'`; route-aware code must honor prefix; keep in sync with `vite.config.ts` and `vercel.json` | none |
| `frontend/vite.config.ts` | yes | `base` mirrors `BASE_PATH`; dev proxy strips prefix for local FastAPI | none |
| `frontend/vercel.json` | yes | SPA rewrites under base path with `/index.html` fallback | none |
| `.gitignore` | yes | `.pgdata/`, `.env`, `dist/`, `node_modules/` untracked — confirms spec security precondition | none |
| `cloudbuild.yaml` | yes | backend-only pipeline; no frontend CI gate | none |

**Standards confidence: MEDIUM** (raised from LOW). Nine sources read. The repo
still has no written contributor guidance — no `AGENTS.md`, no `CONTRIBUTING.md`,
no `.github/` — so conventions remain inferred from configuration. What changed
is that the inferred testing convention is now *established by this spec* rather
than assumed: task 0.0 creates the harness, task 0.4 records the command, and the
`## Repository Standards Applied` section documents the deliberate Node-only,
no-jsdom scope so a later contributor does not have to reverse-engineer it.

## Requirement Traceability

Fifteen functional requirements. All fifteen map to an automated test or a
recorded measurement.

| FR | Requirement (abbreviated) | Mapped verification | Run 1 | Run 2 |
| --- | --- | --- | --- | --- |
| U1-1 | Redefine token values, retain names | `tokens.test.ts` vs committed fixture (0.10, 0.11) | OK | OK — now automated |
| U1-2 | Dark default: charcoal, panels, amber | 1.1–1.4 + 1280px screenshot | OK | OK |
| U1-3 | Light theme designed, accent darkened | 2.5, 2.6 + screenshot + recorded ratio | OK | OK |
| U1-4 | Numeric token, tabular-nums, applied | 3.1–3.8 + `getComputedStyle` across five table classes | OK | OK |
| U1-5 | Semantic status distinct from accent | `contrast.test.ts` ≥3:1 accent-vs-status (1.5, 1.6) | **GAP** | **CLOSED** |
| U1-6 | Preserve `ThemeContext` behavior | 2.9 + empty `git diff` on the file | OK | OK |
| U1-7 | AA contrast, both themes | `contrast.test.ts` + generated `contrast-report.md` | OK | OK — now enforced |
| U2-1 | Sidebar preserved ≥900px incl. collapse | 4.11 + two 1280px screenshots | OK | OK |
| U2-2 | Single column + bottom bar <900px | 4.6, 5.6, 5.8 + 375px screenshot | OK | OK |
| U2-3 | Nine destinations, five primary + More | `navDestinations.test.ts` (5.2) + sheet screenshot | OK | OK — now automated |
| U2-4 | Tabs ≥44×44; other controls ≥24×24 | 5.14, 5.15 — all interactive controls measured | **GAP** | **CLOSED** |
| U2-5 | `100vh` → small-viewport units | `tokens.test.ts` viewport case (4.4) | OK | OK — now enforced |
| U2-6 | No horizontal scroll at 320px | 4.10, 6.1–6.3 + 27-cell matrix | OK | OK |
| U2-7 | Safe-area insets | 4.1, 5.9, 5.16 | OK | OK |
| U2-8 | Active destination uses accent token | 5.10 + screenshot | OK (weak) | OK (weak — see Residual Risks) |

## Resolution Detail

**REQUIRED 1 — FR U1-5 unverifiable.** Closed by tasks 1.5 and 1.6. The check is
now an assertion in `contrast.test.ts` requiring ≥3:1 between `--accent` and each
of `--warn`, `--success`, `--danger` in both themes. Task 1.5 directs writing the
test *before* adjusting the status tokens so the collision is observed failing
rather than assumed absent — `--warn` is currently `#ff9d3a` against a proposed
`#f0a92c` accent and is expected to fail on first run.

**REQUIRED 2 — 24×24 floor unmeasured.** Closed by tasks 5.14 and 5.15. The
measurement snippet now selects all visible interactive controls rather than
`.bottom-tab-bar` descendants, records them to `touch-targets.md`, and 5.15
makes a sub-floor result a defect to fix rather than a note. The league `<select>`
and sortable `<th>`s are named as the expected first failures.

**REQUIRED 3 — no test framework.** Closed by user decision (option b). Task 0.0
adds Vitest with `@types/node`, a `vitest run` script, Node environment, and
three suites. Scope is bounded in `## Repository Standards Applied`: no jsdom, no
Testing Library, no component render tests. Task 0.9 seeds known-value assertions
(21:1, 1:1, 4.54:1) so a buggy ratio function cannot silently pass the palette —
without those, the contrast suite would be self-confirming.

**FLAG 1 — Recharts vs non-goal 3.** Closed by task 4.9, which adds an
`overflow-x: auto` / `min-width: 0` containment wrapper while explicitly barring
changes to Recharts props or dimensions, and by 6.3, which names that wrapper as
the sanctioned fix if `/compare` fails the matrix.

**FLAG 2 — component-edit scope.** Closed by a bullet in
`## Repository Standards Applied` scoping FR U1-1's no-modification constraint to
task 1.0 and naming 3.3–3.7 and 5.3 as sanctioned edits with justification.

## Residual Risks (Non-blocking)

1. **FR U2-8 is verified by screenshot only.** That the active tab uses the
   *accent token* — rather than a hardcoded amber that merely looks identical —
   is not asserted anywhere. A `getComputedStyle` comparison against
   `getPropertyValue('--accent')` would close it. Left as-is: low consequence,
   and task 5.10 specifies the token in the implementation instruction.
2. **Task ordering is now load-bearing.** 0.0 must precede 1.0 (baseline capture
   and the token-name fixture are both destroyed by the first token edit), and
   4.1 must precede 5.9 (without `viewport-fit=cover` the safe-area padding
   silently resolves to zero and 5.16 would pass a broken implementation).
   Both dependencies are stated in the task text; `/SDD-3` should not reorder.

## Chain-of-Verification Check

1. **Initial assessment:** all REQUIRED gates pass; both FLAGs closed.
2. **Self-questioning:** do all REQUIRED gates pass with explicit evidence? Yes —
   each closure points to a numbered task with a named artifact.
3. **Fact-checking:** verified against source. `tsconfig.json` confirmed to have
   `include: ["src"]` and `lib: ["ES2020", "DOM", "DOM.Iterable"]`, which is why
   task 0.3 adds `@types/node` and 0.6 addresses type resolution — a plan that
   omitted this would fail at `npm run build`, not at `npm run test`.
   `package.json` confirmed to have no `test` script pre-change. Run 1's claim
   that `--warn: #ff9d3a` sits near the proposed accent re-verified at
   `styles.css:73`.
4. **Inconsistency resolution:** an earlier draft of this run marked
   Requirement-to-test traceability PASS on the strength of task 0.0 alone. That
   was insufficient — the gate is per-requirement, and U1-5 and U2-4 needed their
   own closures (1.5/1.6 and 5.14/5.15). Corrected before publishing. Also
   corrected: run 1 referenced the `Sidebar` refactor as task 5.2; after
   remediation inserted the `navDestinations` test, it is task 5.3.
5. **Final synthesis:** planning is cleared for `/SDD-3-manage-tasks`.

## User-Approved Remediation Plan

- **Completed.** User approved option (b) for REQUIRED 3 on 2026-07-25 and
  delegated the remaining four resolutions. All five applied to the task list.
