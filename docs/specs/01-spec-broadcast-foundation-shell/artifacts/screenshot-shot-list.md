# Screenshot shot list — owner capture

> **Status (2026-07-28): Set A was captured and reviewed but is NOT committed;
> Sets B and C are WAIVED.** All ten phone-width shots were taken and read, and
> their per-route observations are recorded in `../01-proofs/01-task-06-proofs.md`.
> The images themselves are **withheld from this public repository** because they
> show a live league table with identifiable third parties' full names — the same
> reason the desktop captures were withheld under waivers 1.10 and 4.12. The
> owner waived the remaining image artifacts to proceed to validation — see
> "Screenshot artifact waiver" at the top of
> `01-tasks-broadcast-foundation-shell.md` for the rationale and the substitute
> evidence for each.
>
> **If you re-capture:** mask or crop the owner and team-name columns before
> committing anything to this repo, or keep the files local.
>
> This document is kept as the specification for those shots, so anyone who
> later wants to close the gap has the list ready.
>
> **Note on width.** The captured set came in at **306 CSS px**, not 375px. That
> is fine — 306 is below the 320px floor, so it is a stricter case. If you
> capture more, type the width into Chrome's responsive-mode width field rather
> than dragging the window, and name the file for whatever width you actually
> used.

Spec 01 needs image artifacts that the agent session cannot produce: the Browser
pane renders screenshots into the conversation, not to the filesystem, and the
headless alternative would require a login (auth is an HttpOnly cookie, nothing
reusable in `localStorage`). So these are captured by hand.

Save every file into this directory:
`docs/specs/01-spec-broadcast-foundation-shell/artifacts/`

## Setup

1. Backend and frontend running; signed in.
2. App URL is `http://localhost:5173/espn-fantasy-stats/` — the bare origin
   shows a base-path warning page.
3. Set the browser viewport to the exact width listed (devtools device toolbar,
   responsive mode, typed width — not a dragged window).
4. Theme is set from the More sheet on mobile widths, or the sidebar toggle on
   desktop widths.

## Before you save anything — sanitization

The session is real, so these can leak. Crop or retake if any shot shows:

- the account email address
- an invite code (Manage Leagues, Account)
- devtools open with request headers or cookies visible
- browser autofill dropdowns or a password manager overlay

Owner display names and team names are fine — they are league data, already in
the app, and the point of several shots.

## Set A — task 6.4: nine destinations at 375px, dark theme

Full-page shots. The bottom tab bar must be visible in each.

| # | File | Route | Must show |
| --- | --- | --- | --- |
| 1 | `375-dark-season-stats.png` | `/` | aggregate table, tab bar |
| 2 | `375-dark-playoffs.png` | `/playoffs` | bracket contained, tab bar |
| 3 | `375-dark-scoreboard.png` | `/scoreboard` | matchup list, tab bar |
| 4 | `375-dark-positional.png` | `/positional` | the `.hub-tabs` strip, not overflowing the page |
| 5 | `375-dark-team-hub.png` | `/team_hub` | tab strip + roster table |
| 6 | `375-dark-compare.png` | `/compare` | both selects fitting inside the viewport |
| 7 | `375-dark-h2h.png` | `/h2h` | summary + matchups |
| 8 | `375-dark-leagues.png` | `/leagues` | **invite codes cropped or masked** |
| 9 | `375-dark-account.png` | `/account` | **email cropped or masked** |

### Plus Box Score — easy to miss

| # | File | How to reach | Must show |
| --- | --- | --- | --- |
| 10 | `375-dark-box-score.png` | From Scoreboard (or Playoffs), tap a matchup. There is no nav entry — the route is `/box_score/:year/:week/:teamA/:teamB`. | both lineups, page not overflowing |

## Set B — task 6.5: in-container table scroll at 375px

| File | How | Must show |
| --- | --- | --- |
| `375-dark-table-scroll.png` | Season Stats at 375px. Scroll the aggregate table sideways to roughly its midpoint, leaving the page itself unscrolled. | right-hand stat columns visible that were off-screen at rest, while the page edges and tab bar stay put |

Measured counterpart already recorded in `responsive-matrix.md`: the container
holds 991px of content in a 351px box while the page stays 375/375.

## Set C — retiring the earlier blocked sub-tasks

These were blocked only on there being no running app.

| Task | File | Width / theme | Must show |
| --- | --- | --- | --- |
| 1.10 | `1280-dark-season-stats.png` | 1280px, dark | Season Stats, full desktop shell |
| 1.10 | `1280-dark-playoffs.png` | 1280px, dark | Playoff History |
| 2.9 / 2.10 | `375-light-season-stats.png` | 375px, light | light palette applied |
| 2.9 / 2.10 | `375-light-after-reload.png` | 375px, light, **after a hard reload** | still light — proves `localStorage` persistence |
| 3.9 | `numerals-crop.png` | any width, dark, zoomed crop | a column of the aggregate table where `1` and `8` occupy the same width — the tabular-numeral proof |
| 4.12 | `1280-dark-sidebar-expanded.png` | 1280px, dark | sidebar expanded |
| 4.12 | `1280-dark-sidebar-collapsed.png` | 1280px, dark | sidebar collapsed to 36px |
| 4.12 | `320-dark-shell.png` | 320px, dark | mobile shell, no sidebar |
| 5.17 | `375-dark-more-sheet.png` | 375px, dark | More sheet open over the page |
| 5.17 | `375-dark-tabbar-focus.png` | 375px, dark | keyboard focus ring on a tab-bar item (Tab to it) |

## Still genuinely blocked

**5.16** — safe-area inset on a device with a home indicator. Needs a real phone
or an iOS simulator; this host has no Xcode (`xcrun simctl` absent). Not
capturable here by any means.

## What is left

Set A is committed. Still needed:

- **Set B** — the table-scroll shot (6.5).
- **Set C** — everything listed there *except* the three desktop shots below,
  which were captured but withheld.

**Retake needed:** the three desktop shots (1.10 dark Season Stats, 1.10 dark
Playoff History, 2.10 light Season Stats) were taken with the **Fiserv Fantasy**
league selected, whose table shows ten identifiable people's full names. Switch
the league selector to **Walter Payton Bertoni Bowl** — first names and
nicknames only, and consistent with the phone set — and retake. The originals
are held outside the repository, not deleted.

## When the files are in place

Re-run `/SDD-3-manage-tasks` and say the screenshots are captured. The agent will
verify each file exists, embed them into the task proof files with the required
context-before-evidence framing, re-check sanitization, and commit.
