import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchScoreboard,
  type ScoreboardMatchup,
  type SeasonScoreboard,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { RoundBadge } from '../components/RoundBadge'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { Loading } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'

type BracketRound = 'playoff' | 'semifinal' | 'championship'
const ROUND_ORDER: BracketRound[] = ['playoff', 'semifinal', 'championship']
const ROUND_NAME: Record<BracketRound, string> = {
  playoff: 'Playoffs',
  semifinal: 'Semifinals',
  championship: 'Championship',
}

export function ScoreboardPage() {
  const { leagueId, years } = useLeagueYears()
  // Year and week live in the URL, so a box score's back link, the browser's
  // Back button and a shared link all return to the same week.
  const [params, update] = useUrlState()
  const year: number | '' = numberParam(params, 'year') ?? ''
  const week: number | '' = numberParam(params, 'week') ?? ''
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
    if (year === '' && years.length) update({ year: String(years[years.length - 1]) })
  }, [years, year, update])

  // ...and on its latest played week, once that season's data is in. Matching
  // on seasonData.year matters: right after a year change, the previous year's
  // data is still loaded and would pick that year's week.
  useEffect(() => {
    if (!seasonData || seasonData.year !== year || week !== '') return
    const played = seasonData.matchups.filter((m) => !isUnplayed(m)).map((m) => m.week)
    const latest = played.length ? Math.max(...played) : seasonData.weeks[0]
    if (latest !== undefined) update({ week: String(latest) })
  }, [seasonData, year, week, update])

  if (!leagueId) return <NoLeagueSelected />

  const yearsDesc = [...years].reverse()
  const weeks = seasonData?.weeks ?? []
  // Each playoff week's championship-bracket round, so the week list says
  // which weeks are the playoffs. Consolation games don't name the week.
  const roundOfWeek = new Map<number, BracketRound>()
  for (const m of seasonData?.matchups ?? []) {
    if (!(m.round_label in ROUND_NAME)) continue
    const r = m.round_label as BracketRound
    const prev = roundOfWeek.get(m.week)
    if (!prev || ROUND_ORDER.indexOf(r) > ROUND_ORDER.indexOf(prev)) roundOfWeek.set(m.week, r)
  }
  const weekMatchups =
    seasonData && week !== '' ? seasonData.matchups.filter((m) => m.week === week) : []

  const boxScoreHref = (m: ScoreboardMatchup) =>
    `/box_score/${year}/${m.week}/${m.team_a_id}/${m.team_b_id}`

  const boxScoresAvailable = year !== '' && (year as number) >= 2019

  return (
    <div className="page">
      <header className="page-header">
        <h2>Scoreboard</h2>
      </header>

      {error && <ErrorMessage message={error} />}

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="sb-year">Year</label>
          <select
            id="sb-year"
            value={year}
            onChange={(e) => update({ year: e.target.value || null, week: null })}
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
            onChange={(e) => update({ week: e.target.value || null })}
            disabled={!weeks.length}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {roundOfWeek.has(w) && ` · ${ROUND_NAME[roundOfWeek.get(w)!]}`}
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
                href={boxScoreHref(m)}
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
  href,
  disabled,
}: {
  matchup: ScoreboardMatchup
  href: string
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

  const content = (
    <>
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
    </>
  )

  // A real link when clickable: keyboard focus, screen readers, and
  // open-in-new-tab all work, which an onClick on a div gave none of.
  return disabled ? (
    <div className="scoreboard-card disabled">{content}</div>
  ) : (
    <Link to={href} className="scoreboard-card clickable" title="View box score">
      {content}
    </Link>
  )
}
