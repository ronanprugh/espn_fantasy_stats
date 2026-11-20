/**
 * Scoreboard: a week's matchups as score cards, with Top and Low score
 * badges and power ranks. Step or swipe through weeks; each card opens its box
 * score. `?year=&week=`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchScoreboard,
  type ScoreboardMatchup,
  type SeasonScoreboard,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { PrBadge } from '../components/PrBadge'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { rankLookup, type RankLookup } from '../lib/powerRankings'
import { RoundBadge } from '../components/RoundBadge'
import { SeasonPicker } from '../components/SeasonPicker'
import { WeekStepper } from '../components/WeekStepper'
import { isLive, isUnplayed, weekExtremes } from '../lib/scoreboard'
import { TeamLink } from '../components/TeamLink'
import { useTeamOwners } from '../hooks/useTeamOwners'
import { useSwipe } from '../hooks/useSwipe'
import { useFromHere } from '../hooks/useFromHere'
import { isYours, useYourTeam } from '../hooks/useYourTeam'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { CardGridSkeleton } from '../components/Loading'
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
  const pr = usePowerRankings(leagueId)
  const ownerOf = useTeamOwners(leagueId, year === '' ? [] : [year])
  // The swipe handler calls whatever stepWeek the latest render defined.
  const stepWeekRef = useRef<(dir: -1 | 1) => void>(() => {})
  const swipe = useSwipe((dir) => stepWeekRef.current(dir === 'left' ? 1 : -1))
  const yourTeam = useYourTeam()
  const isYourMatchup = (m: ScoreboardMatchup) =>
    year !== '' &&
    (isYours(yourTeam, ownerOf(year, m.team_a_id)) || (!m.is_bye && isYours(yourTeam, ownerOf(year, m.team_b_id))))
  const look = useMemo(() => (pr.hasData ? rankLookup(pr.data) : undefined), [pr.data, pr.hasData])

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
  // Your matchup first; the rest keep ESPN's order (sort is stable).
  const weekMatchups =
    seasonData && week !== ''
      ? seasonData.matchups
          .filter((m) => m.week === week)
          .sort((a, b) => Number(isYourMatchup(b)) - Number(isYourMatchup(a)))
      : []

  const boxScoreHref = (m: ScoreboardMatchup) =>
    `/box_score/${year}/${m.week}/${m.team_a_id}/${m.team_b_id}`

  const boxScoresAvailable = year !== '' && (year as number) >= 2019
  const extremes = weekExtremes(weekMatchups)

  // On phones, a sideways swipe across the cards steps the week, like the
  // arrows. The URL update replaces the history entry, so Back still leaves
  // the page rather than walking back through weeks.
  const stepWeek = (dir: -1 | 1) => {
    const i = week === '' ? -1 : weeks.indexOf(week)
    const next = weeks[i + dir]
    if (i >= 0 && next !== undefined) update({ week: String(next) })
  }
  stepWeekRef.current = stepWeek

  return (
    <div className="page">
      <header className="page-header">
        <h2>Scoreboard</h2>
      </header>

      {error && <ErrorMessage message={error} />}

      <SeasonPicker
        years={years}
        value={year === '' ? null : year}
        onChange={(y) => update({ year: String(y), week: null })}
      />

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="sb-week">Week</label>
          <WeekStepper
            id="sb-week"
            weeks={weeks}
            value={week === '' ? null : week}
            onChange={(w) => update({ week: String(w) })}
            labelOf={(w) => `Week ${w}${roundOfWeek.has(w) ? ` · ${ROUND_NAME[roundOfWeek.get(w)!]}` : ''}`}
          />
        </div>
      </div>

      {loading && <CardGridSkeleton count={5} />}

      {!loading && year !== '' && week !== '' && weekMatchups.length > 0 && (
        <>
          {!boxScoresAvailable && <p className="subtitle">Box scores start in 2019.</p>}
          <div
            className="scoreboard-list"
            onTouchStart={swipe.onTouchStart}
            onTouchEnd={swipe.onTouchEnd}
          >
            {weekMatchups.map((m, i) => (
              <ScoreboardCard
                key={i}
                matchup={m}
                rank={look ? (teamId) => look(year as number, m.week, teamId) : undefined}
                owner={(teamId) => ownerOf(year as number, teamId)}
                year={year as number}
                yours={isYourMatchup(m)}
                extremes={extremes}
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


function ScoreboardCard({
  matchup,
  href,
  disabled,
  rank,
  owner,
  year,
  yours = false,
  extremes,
}: {
  matchup: ScoreboardMatchup
  href: string
  disabled: boolean
  /** Each team's power rank going into the week, when the league has them. */
  rank?: (teamId: number) => ReturnType<RankLookup>
  /** Each team's owner, for the Team Hub links. */
  owner: (teamId: number) => string | undefined
  year: number
  /** Your team plays in it: outlined. */
  yours?: boolean
  /** The week's top and low scorers, badged. */
  extremes: { top: Set<number>; low: Set<number> }
}) {
  const scoreBadge = (teamId: number) =>
    extremes.top.has(teamId) ? (
      <span className="score-badge top">Top score</span>
    ) : extremes.low.has(teamId) ? (
      <span className="score-badge low">Low score</span>
    ) : null
  const mine = yours ? ' your-matchup' : ''
  const fromHere = useFromHere('Scoreboard')
  const name = (teamId: number, teamName: string) => (
    <TeamLink ownerId={owner(teamId)} year={year}>
      {teamName}
    </TeamLink>
  )
  const badge = (teamId: number) => {
    const r = rank?.(teamId)
    return r ? <PrBadge rank={r.entry.rank} assumed={r.assumed} sourceWeek={r.sourceWeek} /> : null
  }
  const aWon = matchup.winner_id === matchup.team_a_id
  const bWon = matchup.winner_id === matchup.team_b_id
  // Scoreboard-style: team A on the left, team B mirrored on the right, the
  // two scores facing each other in the middle with the game's status under.
  const status = matchup.is_bye
    ? 'Bye'
    : isUnplayed(matchup)
      ? 'Upcoming'
      : isLive(matchup)
        ? 'Live'
        : 'Final'
  const side = (teamId: number, teamName: string, ownerName: string, align: 'left' | 'right') => (
    <div className={`sb-team ${align}`}>
      <div className="team-name">
        {align === 'left' && badge(teamId)} {name(teamId, teamName)} {align === 'right' && badge(teamId)}
      </div>
      <div className="team-owner">
        {align === 'right' && <span className="sb-rank-sm">{badge(teamId)}</span>}
        {ownerName}
        {align === 'left' && <span className="sb-rank-sm">{badge(teamId)}</span>}
      </div>
      {scoreBadge(teamId)}
    </div>
  )
  const score = (value: number, won: boolean, lost: boolean) => (
    <span className={`sb-score${won ? ' won' : ''}${lost ? ' lost' : ''}`}>{value.toFixed(1)}</span>
  )

  const content = (
    <>
      <div className="sb-head">
        <RoundBadge round={matchup.round_label} hideRegular />
      </div>
      <div className="sb-row">
        {side(matchup.team_a_id, matchup.team_a_name, matchup.team_a_owner, 'left')}
        <div className="sb-middle">
          <div className="sb-scores">
            {score(matchup.team_a_score, aWon, bWon)}
            {matchup.is_bye ? null : (
              <>
                <span className="sb-dash" aria-hidden="true">–</span>
                {score(matchup.team_b_score, bWon, aWon)}
              </>
            )}
          </div>
          <div className={`sb-status ${status.toLowerCase()}`}>{status}</div>
        </div>
        {matchup.is_bye ? (
          <div className="sb-team right sb-bye">BYE</div>
        ) : (
          side(matchup.team_b_id, matchup.team_b_name, matchup.team_b_owner, 'right')
        )}
      </div>
    </>
  )

  if (matchup.is_bye) {
    return <div className={`scoreboard-card bye${mine}`}>{content}</div>
  }

  // The box score is a real link (keyboard focus, screen readers and
  // open-in-new-tab all work) laid over the whole card. It can't wrap the card,
  // because the team names inside are links too and links can't nest; they sit
  // above the cover instead (see .card-cover in styles.css).
  return disabled ? (
    <div className={`scoreboard-card disabled${mine}`}>{content}</div>
  ) : (
    <div className={`scoreboard-card clickable${mine}`}>
      <Link
        to={href}
        state={fromHere}
        className="card-cover"
        title="View box score"
        aria-label={`Box score: ${matchup.team_a_name} vs ${matchup.team_b_name}`}
      />
      {content}
    </div>
  )
}
