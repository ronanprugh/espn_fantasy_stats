# Frontend

React 18 + TypeScript + Vite, with React Router and Recharts. Setup and running
it locally are in the [root README](../README.md); this page is how the code
fits together.

```bash
npm run dev       # http://localhost:5173/espn-fantasy-stats/, proxying /api to localhost:8000
npm run lint      # ESLint (React hook rules)
npm test          # Vitest
npm run build     # type check (tsc) + production build
```

## Layout

```
src/
├── main.tsx          routes and providers
├── App.tsx           signed-in shell: sidebar / tab bar + the page
├── api.ts            every backend call and response type
├── base.ts           BASE_PATH (/espn-fantasy-stats)
├── styles.css        all styles; theme tokens at the top
├── contexts/         Auth, League (selected league), Theme
├── hooks/            data and URL hooks shared by pages
├── lib/              pure logic: stats, formatting, links (with tests)
├── components/       shared UI: tables, charts, nav, pickers, badges
└── pages/            one component per route
```

## Conventions

- **Pages own their data.** A page reads the selected league from
  `useLeague()` (or `useLeagueYears()`), fetches with a function from
  `api.ts`, and shows `ErrorMessage` on failure and a shaped placeholder from
  `components/Loading.tsx` while it waits.
- **State that should survive a reload or be shareable lives in the URL**:
  year, week, team and tab, through `useUrlState()` (`?year=2024&week=3`).
  Links between pages are built in `lib/links.ts`, so everyone agrees on the
  parameter names.
- **Logic worth testing goes in `lib/`** as pure functions with a `.test.ts`
  next to it (run in Node). **Page behaviour** gets a `.test.tsx` next to the
  page, rendered with Testing Library in jsdom (`vitest.config.ts` runs the two
  as separate projects). Those tests mock the `api.ts` calls and the context
  hooks a page uses, and render it in a `MemoryRouter`; see
  `pages/TransactionsPage.test.tsx`. `src/test/setup.ts` cleans up between
  tests and stands in for browser APIs jsdom lacks.
- **Shared fetches are cached per visit** in module-level maps: league years
  (`useLeagueYears`), power rankings (`usePowerRankings`) and team owners
  (`useTeamOwners`). Several pages need the same payload.
- **Types mirror the backend by hand.** `api.ts` types follow
  `backend/app/schemas.py`; change both together.
- **Mobile is CSS first.** The shell switches at 900px in `styles.css`. Pages
  use `useIsMobile()` only when the phone layout is a different structure.
- **Colours are tokens.** Use the CSS custom properties defined for both
  themes at the top of `styles.css`. Tests check their contrast
  (`lib/contrast.test.ts`) and that token names stay stable
  (`lib/tokens.test.ts`).

## Adding a page

1. Create `src/pages/MyPage.tsx`.
2. Add a `<Route>` in `main.tsx`.
3. Add a destination in `components/navDestinations.ts` (group, label and
   path). `navDestinations.test.ts` fails until the route and the
   destination agree.
4. Add any fetches and types to `api.ts`, and any logic to `lib/` with tests.

## Deployment

Vercel builds this directory on every push to `main`. The app is served under
`/espn-fantasy-stats`. `vercel.json` rewrites `/espn-fantasy-stats/api/*` to
the Render backend and every other path to `index.html`. The base path is set
in three places that must agree: `src/base.ts`, `vite.config.ts` and
`vercel.json`.
