import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { LeagueProvider } from './contexts/LeagueContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { BoxScorePage } from './pages/BoxScorePage'
import { ComparePage } from './pages/ComparePage'
import { HeadToHeadPage } from './pages/HeadToHeadPage'
import { HomePage } from './pages/HomePage'
import { LeaguesPage } from './pages/LeaguesPage'
import { LoginPage } from './pages/LoginPage'
import { PlayoffsPage } from './pages/PlayoffsPage'
import { PositionalStatsPage } from './pages/PositionalStatsPage'
import { ScoreboardPage } from './pages/ScoreboardPage'
import { TeamHubPage } from './pages/TeamHubPage'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <LeagueProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<App />}>
              <Route index element={<HomePage />} />
              <Route path="playoffs" element={<PlayoffsPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="h2h" element={<HeadToHeadPage />} />
              <Route path="team_hub" element={<TeamHubPage />} />
              <Route path="scoreboard" element={<ScoreboardPage />} />
              <Route path="positional" element={<PositionalStatsPage />} />
              <Route path="box_score/:year/:week/:teamA/:teamB" element={<BoxScorePage />} />
              <Route path="leagues" element={<LeaguesPage />} />
            </Route>
          </Routes>
          </LeagueProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
