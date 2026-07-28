# Touch-target measurements — mobile shell at 375px and 320px

Measured with `getBoundingClientRect()` in a running Chromium at
375×812 and 320×640, dark and light themes (target sizes are
theme-independent — the same rules apply in both).

**Measurement context (read this first):** the authenticated app shell could not
be reached — the backend was not running and no ESPN credentials were available,
so `/` renders the login page. The tab bar and sheet were therefore mounted in a
temporary harness (`harness.html` + `src/harness.tsx`, deleted after
measurement) that renders the **real** `BottomTabBar`, `MoreSheet`, and `Sidebar`
components against the **real** `styles.css`. Every number below is a real
layout measurement of shipped code; what it cannot cover is controls that belong
to page content (sortable `<th>`s), because those need real data. Those rows are
marked `pending` and derived statically instead.

## Thresholds

| Control class | Floor | Source |
| --- | --- | --- |
| Bottom tab bar targets | 44×44 | FR U2-4 |
| All other interactive controls | 24×24 | WCAG 2.2 SC 2.5.8 |

## Bottom tab bar — 375×812

| Control | Element | Width | Height | Floor | Result |
| --- | --- | --- | --- | --- | --- |
| Season Stats | `a` | 75 | 55 | 44×44 | PASS |
| Playoff History | `a` | 75 | 55 | 44×44 | PASS |
| Scoreboard | `a` | 75 | 55 | 44×44 | PASS |
| Team Hub | `a` | 75 | 55 | 44×44 | PASS |
| More | `button` | 75 | 55 | 44×44 | PASS |

## Bottom tab bar — 320×640 (narrowest supported width)

Five equal tabs across 320px is the binding case for width.

| Control | Element | Width | Height | Floor | Result |
| --- | --- | --- | --- | --- | --- |
| Season Stats | `a` | 64 | 55 | 44×44 | PASS |
| Playoff History | `a` | 64 | 55 | 44×44 | PASS |
| Scoreboard | `a` | 64 | 55 | 44×44 | PASS |
| Team Hub | `a` | 64 | 55 | 44×44 | PASS |
| More | `button` | 64 | 55 | 44×44 | PASS |

## More sheet — 375×812, sheet open

| Control | Element | Width | Height | Floor | Result |
| --- | --- | --- | --- | --- | --- |
| League selector | `select` | 335 | 44 | 24×24 | PASS |
| + Add a league (no-leagues fallback) | `a` | 335 | 44 | 24×24 | PASS |
| Positional Stats | `a` | 375 | 48 | 24×24 | PASS |
| Team Comparison | `a` | 375 | 48 | 24×24 | PASS |
| Head to Head | `a` | 375 | 48 | 24×24 | PASS |
| Manage Leagues | `a` | 375 | 48 | 24×24 | PASS |
| Account | `a` | 375 | 48 | 24×24 | PASS |
| Dark/Light mode toggle | `button` | 375 | 48 | 24×24 | PASS |
| Sign out | `button` | 375 | 48 | 24×24 | PASS |

Sheet rows are held to 48px rather than the 24px floor SC 2.5.8 would allow:
they are the only route to five of the nine destinations, so they are primary
navigation in practice.

## Defects found and fixed during measurement

Both were fixed in `styles.css` rather than recorded as notes, per task 5.15.

| Control | Before | After | Fix |
| --- | --- | --- | --- |
| League `select` in the sheet | 30px tall (inherited from the sidebar's mouse-sized rule) | 44px | `.sheet-league select { min-height: 44px; padding: 8px 10px; font-size: 15px }` |
| `+ Add a league` fallback link | 27px tall | 44px | `.sheet-league .add-league-link { display: flex; align-items: center; min-height: 44px }` |

The league selector was also **absent** from the mobile shell entirely before
this task: it lives in `.sidebar`, which task 4.6 hides below 900px. It is now
lifted into the sheet — see the task 5 proof file.

## Not measured live

| Control | Status | Static derivation |
| --- | --- | --- |
| Sortable `<th>` in `.teams` (and the other four table classes) | pending — needs real league data | `table.teams th` is `padding: 8px 12px` on 13px text with `white-space: nowrap`. Height ≈ 8 + 16 + 8 = **32px**; the narrowest header (`W`) is ≈ 12 + 9 + 12 = **33px** wide. Both clear the 24×24 floor with margin, so no change was made. To be confirmed against the running app. |

Everything else interactive at 375px is accounted for above: with `.sidebar`
hidden, the tab bar and the sheet are the only chrome the mobile shell renders.
