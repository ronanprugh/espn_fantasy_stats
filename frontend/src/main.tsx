/**
 * Entry point: mounts the app under BASE_PATH with its providers (theme,
 * auth, the selected league) and declares every route. Routes inside `<App />`
 * need a signed-in user; /login and /signup don't. A new page needs a route
 * here and a destination in components/navDestinations.ts
 * (navDestinations.test.ts checks the two agree).
 */
import React, { lazy, type ComponentType } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { BASE_PATH } from './base'
import { AuthProvider } from './contexts/AuthContext'
import { LeagueProvider } from './contexts/LeagueContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { FrontPage } from './pages/FrontPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { TradesRedirect } from './pages/TradesRedirect'
import './styles.css'

/**
 * A page loaded on first visit rather than with the app: each gets its own
 * chunk, and Recharts goes only with the pages that chart. App's <Suspense>
 * shows the loading placeholder meanwhile. This Week (the front page), login
 * and signup stay in the main bundle so the first screen paints at once.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const AccountPage = lazyPage(() => import('./pages/AccountPage'), 'AccountPage')
const AllTimePage = lazyPage(() => import('./pages/AllTimePage'), 'AllTimePage')
const BoxScorePage = lazyPage(() => import('./pages/BoxScorePage'), 'BoxScorePage')
const ComparePage = lazyPage(() => import('./pages/ComparePage'), 'ComparePage')
const HeadToHeadPage = lazyPage(() => import('./pages/HeadToHeadPage'), 'HeadToHeadPage')
const LeaguesPage = lazyPage(() => import('./pages/LeaguesPage'), 'LeaguesPage')
const PlayoffsPage = lazyPage(() => import('./pages/PlayoffsPage'), 'PlayoffsPage')
const PositionalStatsPage = lazyPage(() => import('./pages/PositionalStatsPage'), 'PositionalStatsPage')
const TransactionsPage = lazyPage(() => import('./pages/TransactionsPage'), 'TransactionsPage')
const PowerRankingsPage = lazyPage(() => import('./pages/PowerRankingsPage'), 'PowerRankingsPage')
const ScoreboardPage = lazyPage(() => import('./pages/ScoreboardPage'), 'ScoreboardPage')
const StandingsPage = lazyPage(() => import('./pages/StandingsPage'), 'StandingsPage')
const TeamHubPage = lazyPage(() => import('./pages/TeamHubPage'), 'TeamHubPage')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={BASE_PATH}>
      <ThemeProvider>
        <AuthProvider>
          <LeagueProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/" element={<App />}>
              <Route index element={<FrontPage />} />
              <Route path="standings" element={<StandingsPage />} />
              <Route path="all_time" element={<AllTimePage />} />
              <Route path="playoffs" element={<PlayoffsPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="h2h" element={<HeadToHeadPage />} />
              <Route path="team_hub" element={<TeamHubPage />} />
              <Route path="scoreboard" element={<ScoreboardPage />} />
              <Route path="positional" element={<PositionalStatsPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="trades" element={<TradesRedirect />} />
              <Route path="power_rankings" element={<PowerRankingsPage />} />
              <Route path="box_score/:year/:week/:teamA/:teamB" element={<BoxScorePage />} />
              <Route path="leagues" element={<LeaguesPage />} />
              <Route path="account" element={<AccountPage />} />
            </Route>
          </Routes>
          </LeagueProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
