import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { BoxScorePage } from './pages/BoxScorePage'
import { ComparePage } from './pages/ComparePage'
import { HeadToHeadPage } from './pages/HeadToHeadPage'
import { HomePage } from './pages/HomePage'
import { PlayoffsPage } from './pages/PlayoffsPage'
import { ScoreboardPage } from './pages/ScoreboardPage'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="playoffs" element={<PlayoffsPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="h2h" element={<HeadToHeadPage />} />
          <Route path="scoreboard" element={<ScoreboardPage />} />
          <Route path="box_score/:year/:week/:teamA/:teamB" element={<BoxScorePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
