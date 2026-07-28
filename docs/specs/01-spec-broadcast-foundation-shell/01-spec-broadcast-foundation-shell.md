# 01-spec-broadcast-foundation-shell.md

## Introduction/Overview

The ESPN Fantasy Stats frontend has no working mobile layout. Its stylesheet is 1,847 lines with exactly one media query (scoped to box scores), the app shell is a fixed `grid-template-columns: 220px 1fr` with `height: 100vh` panes, and the only concession to small screens is a button that collapses the sidebar to a 36px stub. On a phone the app is unusable.

This spec covers the **design foundation and responsive app shell** for the approved "Broadcast" visual direction: a retargeted color and typography token set, and a shell that adapts from a desktop sidebar to a mobile bottom tab bar. Because every existing page styles itself through CSS custom properties, retargeting the tokens changes the look of the entire app without touching page components.

This is the first of a planned series. Per-page work — converting 14-column stat tables into stat cards, the playoff bracket SVG, charts — is explicitly deferred to later specs.

## Goals

1. Establish the Broadcast token system (surfaces, text, borders, single amber accent, semantic up/down) for both dark and light themes, replacing the current blue-accent tokens without changing token *names*.
2. Make the app shell responsive: a usable layout at 320px width with no horizontal page scroll, and no regression to the desktop layout at ≥900px.
3. Replace the desktop sidebar with a thumb-reachable bottom tab bar on mobile, covering all nine existing navigation destinations.
4. Eliminate `100vh` layout traps in favor of small-viewport units so mobile browser toolbars do not clip content.
5. Introduce condensed tabular numerals for all statistical figures so digits align in columns.

## User Stories

- **As a league member checking standings on my phone**, I want the app to fit my screen so that I can read stats without pinch-zooming or scrolling sideways.
- **As a league member on my phone**, I want to reach navigation with my thumb so that I can move between Season Stats and Playoffs one-handed.
- **As a league member scanning a stat table**, I want digits to line up in columns so that I can compare figures down a column at a glance.
- **As a returning user who prefers light mode**, I want the light theme to feel as finished as the dark theme so that my preference is not a second-class experience.
- **As the developer maintaining this app**, I want the design system expressed as tokens so that later per-page specs can restyle pages without redefining colors.

## Demoable Units of Work

### Unit 1: Broadcast Token System

**Purpose:** Replace the existing blue-accent palette with the Broadcast palette across both themes, so the whole app takes on the new visual identity through the variables it already consumes.

**Functional Requirements:**

- The system shall redefine the values of the existing CSS custom properties on `:root` and `[data-theme="dark"]` to the Broadcast palette, retaining every current token name so that no page component requires modification.
- The system shall define dark as the designed default: a blue-biased charcoal ground (`#0e1116`), raised panels (`#161b23`), and a single amber accent (`#f0a92c`).
- The system shall define an equally considered light theme rather than a naive inversion, keeping the amber accent legible against a light ground by darkening it to meet contrast requirements.
- The system shall introduce a numeric type token applying a condensed face with `font-variant-numeric: tabular-nums`, and apply it to statistical figures in tables.
- The system shall express semantic status (positive/negative deltas) through tokens distinct from the accent token.
- The system shall preserve the existing `ThemeContext` behavior: toggle, `data-theme` attribute stamping, and persistence.
- All text/background pairings shall meet WCAG 2.1 AA contrast (4.5:1 for body text, 3:1 for large text and UI boundaries) in both themes.

**Proof Artifacts:**

- Screenshot: Season Stats at 1280px in dark theme demonstrates the Broadcast palette applied to an untouched page component.
- Screenshot: Season Stats at 1280px in light theme demonstrates the light theme is deliberately designed, not inverted.
- Screenshot: Theme toggle exercised in-session demonstrates `ThemeContext` still functions after token replacement.
- Contrast report: computed ratios for every text/surface token pairing in both themes demonstrates AA compliance.
- Build output: `npm run build` completes with no TypeScript or Vite errors demonstrates no regressions were introduced.

### Unit 2: Responsive App Shell

**Purpose:** Convert the fixed two-column shell into a layout that works from 320px to desktop, so that every page becomes reachable and readable on a phone.

**Functional Requirements:**

- The system shall render the existing sidebar layout at viewport widths of 900px and above, preserving current desktop behavior including the collapse control.
- The system shall render a single-column layout with a fixed bottom tab bar at viewport widths below 900px.
- The bottom tab bar shall expose all nine navigation destinations, with the five most-used surfaced directly and the remainder reachable through a "More" affordance.
- Tab bar targets shall be at least 44×44 CSS pixels; all other interactive controls shall meet WCAG 2.2 SC 2.5.8 (24×24 CSS pixels, or 24px offset from adjacent targets).
- The system shall replace `height: 100vh` on the layout and its panes with small-viewport units so that mobile browser toolbars do not clip content.
- The system shall render without horizontal page scroll at 320px width; content that cannot narrow (wide tables) shall scroll within its own container.
- The bottom tab bar shall respect device safe-area insets so that controls are not obscured on devices with a home indicator.
- The system shall indicate the active destination in the tab bar using the accent token.

**Proof Artifacts:**

- Screenshot: app shell at 1280px demonstrates the desktop sidebar layout is unchanged.
- Screenshot: app shell at 375px demonstrates the bottom tab bar replaces the sidebar.
- Screenshot: app shell at 320px demonstrates no horizontal page scroll at the narrowest supported width.
- Screenshot: "More" affordance opened demonstrates the four overflow destinations are reachable.
- Measurement record: computed dimensions of tab bar targets demonstrates the 44×44 minimum is met.
- Browser check: `document.documentElement.scrollWidth <= clientWidth` at 320px demonstrates no page-level horizontal overflow.
- Build output: `npm run build` completes clean demonstrates the shell change compiles.

## Non-Goals (Out of Scope)

1. **Per-page table redesign**: Converting the 14-column stat tables into mobile stat cards is deferred to a later spec. In this spec wide tables scroll horizontally inside their container.
2. **Playoff bracket responsiveness**: The SVG bracket reconstruction keeps its current behavior.
3. **Chart responsiveness**: Recharts components in Team Comparison are untouched.
4. **Backend changes**: No FastAPI, SQLAlchemy, or database work.
5. **New features or navigation destinations**: The nine existing destinations are preserved exactly; none are added, removed, or merged.
6. **CSS architecture migration**: No move to Tailwind, CSS Modules, or a component library. The single `styles.css` plain-CSS approach is retained.
7. **Auth, login, and signup page styling**: These inherit token changes but receive no layout work.
8. **Removing the light theme**: Explicitly rejected during scoping; both themes ship.

## Design Considerations

The approved visual direction is "Broadcast," presented as mockup option 1 alongside two alternatives. Its defining characteristics:

- **Ground and panels**: blue-biased charcoal rather than neutral grey; panels raised by lightness, not by shadow.
- **Accent discipline**: one amber accent (`#f0a92c` dark). It marks the active nav item, the selected segment, and rank-one emphasis — nothing else. Semantic green/red for deltas is a separate concern and does not count as accent usage.
- **Density**: the design assumes the user came to read numbers. Chrome recedes; padding is tight; rules are hairline.
- **Numerals**: condensed, tabular. Digits must align down a column.
- **Mobile**: the table becomes stat cards (deferred to a later spec), and navigation drops to a bottom tab bar (this spec).

Breakpoint is set at 900px to match the one media query already present in the stylesheet, avoiding a second competing breakpoint value.

## Repository Standards

- **Styling**: single `frontend/src/styles.css`, plain CSS, custom properties for theming. No preprocessor, no utility framework. New rules follow the existing convention of grouping by component with a comment header.
- **Components**: React 18 function components with TypeScript, named exports, `.tsx` under `src/components/` and `src/pages/`.
- **State**: React Context for cross-cutting concerns (`AuthContext`, `LeagueContext`, `ThemeContext`). Follow this pattern if shell state needs sharing.
- **Routing**: `react-router-dom` v7 with `NavLink` for navigation; the `BASE_PATH` prefix in `src/base.ts` must be honored by any new route-aware code.
- **Build**: `npm run build` runs `tsc && vite build`. There is no linter and no test framework configured; the type check plus build is the only automated gate.
- **Commits**: Conventional Commit prefixes are used inconsistently in history (`feat:`, `style:`, `fix:` alongside plain sentences). Prefer the conventional form.

## Technical Considerations

- **Viewport units**: `svh`, `lvh`, and `dvh` reached Baseline Widely Available in June 2025 and are safe to use. Current guidance recommends `svh` as the default for full-height layout because `dvh` recalculates during scroll and can cause jitter. This spec therefore replaces `100vh` with `100svh` on the layout and its scrolling panes, and does not use `dvh`.
- **Touch targets**: WCAG 2.2 SC 2.5.8 (Level AA) requires 24×24 CSS pixels, not the widely-repeated 44×44 — 44×44 is the Level AAA criterion (2.5.5) and the Apple HIG recommendation. This spec requires 44×44 for the bottom tab bar, where thumb accuracy matters most, and holds the rest of the UI to the 24×24 AA floor. This deliberately exceeds the AA requirement in one place and should not be read as the AA baseline.
- **Safe-area insets**: the bottom tab bar must use `env(safe-area-inset-bottom)` padding, which requires `viewport-fit=cover` in the viewport meta tag. Verified: `frontend/index.html:5` currently reads `width=device-width, initial-scale=1.0` with no `viewport-fit`, so this tag must be amended as part of Unit 2.
- **Token-name stability is the core constraint.** Because every page styles through the existing variable names, keeping those names is what makes a whole-app visual change possible without touching twelve page components. Renaming a token converts this spec from a foundation change into an app-wide refactor.
- **Condensed numerals without a webfont**: no font CDN is in use and adding one introduces a network dependency and a layout-shift risk. Prefer a system stack (`"Roboto Condensed", "Arial Narrow", ui-sans-serif`) with `font-variant-numeric: tabular-nums`, accepting graceful degradation to a non-condensed tabular face where the condensed face is unavailable.
- **The collapse control becomes desktop-only.** The existing collapse-to-36px button is not a mobile answer and should be hidden below the breakpoint rather than reused.
- **Existing single media query**: the `max-width: 900px` rule for `.box-score-grid` already exists and must not be duplicated or contradicted.

## Security Considerations

- No credentials, tokens, or secrets are introduced or handled by this spec. The change is confined to presentation and layout.
- **Proof artifacts must not leak session state.** Screenshots are taken from a logged-in session; before committing any artifact, confirm it does not capture session cookies, invite codes, the account page's email address, or devtools showing request headers. Prefer cropping to the region under test.
- The `.pgdata` directory and any local `.env` files must remain untracked; verify `.gitignore` coverage before the planning commit.

## Success Metrics

1. **No horizontal page overflow**: `scrollWidth <= clientWidth` on `documentElement` at 320px, 375px, and 768px widths, on every one of the nine routes.
2. **Contrast compliance**: 100% of text/surface token pairings meet WCAG 2.1 AA in both themes, with computed ratios recorded.
3. **Desktop parity**: the ≥900px layout is visually unchanged in structure — sidebar present, collapse control functional, no shifted content.
4. **Navigation reachability**: all nine destinations reachable in at most two taps from any route at 375px width.
5. **Clean build**: `npm run build` produces no new TypeScript errors or Vite warnings relative to the pre-change baseline.

## Open Questions

1. Which five destinations occupy the primary tab bar slots? The mockup showed Stats / Playoffs / Scores / Teams / More, which pushes Positional Stats, Team Comparison, Head to Head, Manage Leagues, and Account behind "More". Confirm this ranking reflects actual usage.
2. Should the "More" affordance be a bottom sheet, a full-screen menu route, or an expanding panel? All three satisfy the requirements; the choice affects task breakdown.
3. Is 900px the right breakpoint, or should the shell switch earlier (e.g. 768px) so tablets keep the sidebar? 900px was chosen to match the existing media query rather than from tablet testing.
4. The light theme has no mockup — it will be designed during implementation from the Broadcast dark treatment. Should a light-theme mockup be reviewed before the token work is considered done?
