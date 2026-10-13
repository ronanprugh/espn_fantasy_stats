import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchScoreboard,
  type ScoreboardMatchup,
  type SeasonScoreboard,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { RoundBadge } from '../components/RoundBadge'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { Loading } from '../components/Loading'

export function ScoreboardPage() {
  const navigate = useNavigate()
  const { leagueId, years } = useLeagueYears()
  const [year, setYear] = useState<number | ''>('')
  const [week, setWeek] = useState<number | ''>('')
  const [seasonData, setSeasonData] = useState<SeasonScoreboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId || year === '') {
      setSeasonData(null)
      return
    }
    setLoading(true)
    setError(null)
    fetchScoreboard(leagueId, year as number)
      .then(setSeasonData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [leagueId, year])

  // Open on the latest season rather than an empty "pick a year" screen.
  useEffect(() => {
    if (year === '' && years.length) setYear(years[years.length - 1])
  }, [years, year])

  // ...and on its latest played week, once that season's data is in. Matching
  // on seasonData.year matters: right after a year change, the previous year's
  // data is still loaded and would pick that year's week.
  useEffect(() => {
    if (!seasonData || seasonData.year !== year || week !== '') return
    const played = seasonData.matchups.filter((m) => !isUnplayed(m)).map((m) => m.week)
    const latest = played.length ? Math.max(...played) : seasonData.weeks[0]
    if (latest !== undefined) setWeek(latest)
  }, [seasonData, year, week])

  if (!leagueId) return <NoLeagueSelected />

  const yearsDesc = [...years].reverse()
  const weeks = seasonData?.weeks ?? []
  const weekMatchups =
    seasonData && week !== '' ? seasonData.matchups.filter((m) => m.week === week) : []

  const goToBoxScore = (m: ScoreboardMatchup) => {
    if (m.is_bye) return
    if ((year as number) < 2019) return
    if (m.round_label === 'consolation') return
    navigate(`/box_score/${year}/${m.week}/${m.team_a_id}/${m.team_b_id}`)
  }

  const boxScoresAvailable = year !== '' && (year as number) >= 2019

  return (
    <div className="page">
      <header className="page-header">
        <h2>Scoreboard</h2>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="sb-year">Year</label>
          <select
            id="sb-year"
            value={year}
            onChange={(e) => {
              setYear(e.target.value ? Number(e.target.value) : '')
              setWeek('')
            }}
          >
            {yearsDesc.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="control">
          <label htmlFor="sb-week">Week</label>
          <select
            id="sb-week"
            value={week}
            onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : '')}
            disabled={!weeks.length}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <Loading />}

      {!loading && year !== '' && week !== '' && weekMatchups.length > 0 && (
        <>
          {!boxScoresAvailable && (
            <p className="subtitle">
              Box scores are only available for seasons 2019 and later. Click is disabled.
            </p>
          )}
          <div className="scoreboard-list">
            {weekMatchups.map((m, i) => (
              <ScoreboardCard
                key={i}
                matchup={m}
                onClick={() => goToBoxScore(m)}
                disabled={
                  !boxScoresAvailable || m.is_bye || m.round_label === 'consolation' || isUnplayed(m)
                }
              />
            ))}
          </div>
        </>
      )}

      {!loading && year !== '' && week === '' && (
        <p className="subtitle" style={{ marginTop: 24 }}>
          Pick a week to see that week's matchups.
        </p>
      )}

      {!loading && year === '' && (
        <p className="subtitle" style={{ marginTop: 24 }}>
          Pick a year and week to view scoreboards.
        </p>
      )}
    </div>
  )
}

/** A future week: no points on either side and no result. Its box score
 * would be ESPN's current week under the wrong label, so it isn't offered. */
function isUnplayed(m: ScoreboardMatchup): boolean {
  return m.team_a_score === 0 && m.team_b_score === 0 && m.winner_id === null
}

function ScoreboardCard({
  matchup,
  onClick,
  disabled,
}: {
  matchup: ScoreboardMatchup
  onClick: () => void
  disabled: boolean
}) {
  if (matchup.is_bye) {
    return (
      <div className="scoreboard-card bye">
        <div className="card-badge">
          <RoundBadge round={matchup.round_label} hideRegular />
        </div>
        <div className="card-row">
          <div className="team">
            <div className="team-name">{matchup.team_a_name}</div>
            <div className="team-owner">{matchup.team_a_owner}</div>
          </div>
          <div className="score">{matchup.team_a_score.toFixed(1)}</div>
        </div>
        <div className="bye-label">BYE</div>
      </div>
    )
  }

  const aWon = matchup.winner_id === matchup.team_a_id
  const bWon = matchup.winner_id === matchup.team_b_id

  return (
    <div
      className={`scoreboard-card ${disabled ? 'disabled' : 'clickable'}`}
      onClick={disabled ? undefined : onClick}
      title={disabled ? '' : 'View box score'}
    >
      <div className="card-badge">
        <RoundBadge round={matchup.round_label} hideRegular />
      </div>
      <div className={`card-row ${aWon ? 'winner' : ''}`}>
        <div className="team">
          <div className="team-name">{matchup.team_a_name}</div>
          <div className="team-owner">{matchup.team_a_owner}</div>
        </div>
        <div className="score">{matchup.team_a_score.toFixed(1)}</div>
      </div>
      <div className={`card-row ${bWon ? 'winner' : ''}`}>
        <div className="team">
          <div className="team-name">{matchup.team_b_name}</div>
          <div className="team-owner">{matchup.team_b_owner}</div>
        </div>
        <div className="score">{matchup.team_b_score.toFixed(1)}</div>
      </div>
    </div>
  )
}
