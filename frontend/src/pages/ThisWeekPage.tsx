import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchPlayoffs,
  fetchScoreboard,
  fetchTeams,
  type LeagueSummary,
  type OwnerHistory,
  type ScoreboardMatchup,
  type SeasonScoreboard,
  type SeasonTeams,
} from '../api'
import { ErrorMessage } from '../components/ErrorMessage'
import {
  CardGridSkeleton,
  ListSkeleton,
  SkeletonBlock,
  SkeletonRegion,
  TableSkeleton,
} from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { YourTeamPrompt } from '../components/YourTeamPrompt'
import { useLeague } from '../contexts/LeagueContext'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { useYourTeam } from '../hooks/useYourTeam'
import { teamHubHref } from '../lib/links'
import { formatChange, weekLabel } from '../lib/powerRankings'
import { formatDashRecord } from '../lib/seasonStats'
import {
  champion,
  currentWeek,
  latestRankings,
  seasonPhase,
  standingsSnapshot,
  weekMatchups,
  yourTeamSummary,
  type Phase,
  type TeamGame,
} from '../lib/thisWeek'

type Latest = {
  year: number
  teams: SeasonTeams
  scoreboard: SeasonScoreboard
  /** From the playoffs endpoint; null if it couldn't be had (no line drawn). */
  playoffTeams: number | null
}

/**
 * The front page: what's going on in the league right now.
 *
 * In season: your team, this week's matchups, the standings in brief and the
 * latest power rankings. Once the season is over (or before the next one has
 * a game), last season's champion and final standings take the matchups'
 * place. Every block links to its full page.
 *
 * The latest season's teams, scoreboard and playoff settings load together,
 * alongside the power rankings, once the league's year list is in (shared
 * with every other page, so usually already there).
 */
export function ThisWeekPage() {
  const { selectedLeague } = useLeague()
  const { leagueId, years, error: yearsError } = useLeagueYears()
  const latestYear = years.length ? years[years.length - 1] : null
  const pr = usePowerRankings(leagueId)
  const yourOwner = useYourTeam()
  const [latest, setLatest] = useState<Latest | null>(null)
  // Before a new season's first game, the page shows the season before.
  const [previous, setPrevious] = useState<SeasonTeams | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId || latestYear === null) return
    let cancelled = false
    setLatest(null)
    setPrevious(null)
    setError(null)
    Promise.all([
      fetchTeams(leagueId, latestYear),
      fetchScoreboard(leagueId, latestYear),
      fetchPlayoffs(leagueId, latestYear).then((p) => p.playoff_team_count, () => null),
    ])
      .then(([teams, scoreboard, playoffTeams]) => {
        if (cancelled) return
        setLatest({ year: latestYear, teams, scoreboard, playoffTeams })
        const priorYear = years[years.length - 2]
        if (seasonPhase(teams, scoreboard) === 'preseason' && priorYear !== undefined) {
          fetchTeams(leagueId, priorYear)
            .then((t) => !cancelled && setPrevious(t))
            .catch(() => {})
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
    // `years` only matters through latestYear and the year before it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, latestYear])

  if (!selectedLeague || !leagueId) return <NoLeagueSelected />

  const ready = latest && latest.year === latestYear ? latest : null
  const phase: Phase | null = ready ? seasonPhase(ready.teams, ready.scoreboard) : null
  // The season the standings and your team come from: the latest, unless it
  // hasn't started, in which case the one before (once it's in).
  const shown = phase === 'preseason' ? previous : ready?.teams ?? null
  const status = ready && phase === 'season' ? currentWeek(ready.scoreboard) : null

  return (
    <div className="page this-week">
      <header className="page-header">
        <h2>This Week</h2>
        {ready && (
          <span className="league">
            {phase === 'season' && status
              ? `${ready.year} · Week ${status.week}${status.live ? ' · live' : ''}`
              : phase === 'preseason'
                ? `${ready.year} season starts soon`
                : `${ready.year} season complete`}
          </span>
        )}
      </header>

      {(error || yearsError) && <ErrorMessage message={(error || yearsError)!} />}

      <div className="tw-grid">
        <div className="tw-col">
          <YourTeamBlock
            league={selectedLeague}
            ownerId={yourOwner}
            teams={shown}
            scoreboard={phase === 'season' ? ready!.scoreboard : null}
            loading={!shown && !error}
          />
          {!ready && !error && <CardGridSkeleton count={4} />}
          {ready && phase === 'season' && status && (
            <MatchupsBlock
              year={ready.year}
              week={status.week}
              live={status.live}
              matchups={weekMatchups(
                ready.scoreboard,
                status.week,
                ready.teams.teams.find((t) => t.owners[0]?.id === yourOwner)?.team_id ?? null,
              )}
              yourOwner={yourOwner}
              teams={ready.teams}
            />
          )}
          {shown && phase !== 'season' && <ChampionBlock teams={shown} />}
        </div>

        <div className="tw-col">
          {shown ? (
            <StandingsBlock
              teams={shown}
              yourOwner={yourOwner}
              playoffTeams={phase === 'season' ? ready!.playoffTeams : null}
            />
          ) : (
            !error && <TableSkeleton rows={7} cols={4} />
          )}
          <RankingsBlock pr={pr} />
        </div>
      </div>
    </div>
  )
}

/** A block's heading, with a link to the full page on the right. */
function BlockHeader({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="tw-block-head">
      <h3>{title}</h3>
      <Link to={to} className="tw-more">
        {linkLabel} <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}

function YourTeamBlock({
  league,
  ownerId,
  teams,
  scoreboard,
  loading,
}: {
  league: LeagueSummary
  ownerId: string | null
  teams: SeasonTeams | null
  scoreboard: SeasonScoreboard | null
  loading: boolean
}) {
  const [picked, setPicked] = useState('')
  // YourTeamPrompt takes the owner list Team Hub uses; this season's teams
  // carry everything it reads.
  const owners = useMemo<OwnerHistory[]>(
    () =>
      (teams?.teams ?? [])
        .filter((t) => t.owners[0])
        .map((t) => ({
          owner_id: t.owners[0].id,
          owner_name: `${t.owners[0].first_name} ${t.owners[0].last_name}`.trim(),
          current_team_name: t.team_name,
          seasons: [],
        }))
        .sort((a, b) => a.current_team_name.localeCompare(b.current_team_name)),
    [teams],
  )

  if (loading) {
    return (
      <section className="tw-block tw-you">
        <SkeletonRegion className="tw-you-skeleton">
          <SkeletonBlock width="60%" height={22} />
          <SkeletonBlock width="80%" height={15} className="skeleton-gap" />
          <SkeletonBlock width="70%" height={15} className="skeleton-gap" />
        </SkeletonRegion>
      </section>
    )
  }
  if (!teams) return null

  if (!ownerId) {
    return (
      <section className="tw-block tw-you">
        <h3>Your team</h3>
        {/* The prompt underneath asks the question; the select carries it as
          * its name. */}
        <select
          id="tw-team"
          aria-label="Which team is yours?"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
        >
          <option value="">— pick your team —</option>
          {owners.map((o) => (
            <option key={o.owner_id} value={o.owner_id}>
              {o.current_team_name} — {o.owner_name}
            </option>
          ))}
        </select>
        <YourTeamPrompt league={league} owners={owners} selectedOwnerId={picked} />
      </section>
    )
  }

  const summary = yourTeamSummary(teams, scoreboard, ownerId)
  const hub = teamHubHref(ownerId)
  if (!summary) {
    return (
      <section className="tw-block tw-you">
        <BlockHeader title="Your team" to={hub} linkLabel="Team Hub" />
        <p className="subtitle">Your team didn't play in {teams.year}.</p>
      </section>
    )
  }

  return (
    <section className="tw-block tw-you">
      <BlockHeader title="Your team" to={hub} linkLabel="Team Hub" />
      <Link to={hub} className="tw-you-name">
        {summary.teamName}
      </Link>
      <p className="tw-you-line">
        <strong>{summary.record}</strong> · {summary.standing}
        {summary.streak && <> · {summary.streak} streak</>}
      </p>
      {summary.game && <GameLine label={`Week ${summary.game.week}`} game={summary.game} />}
      {summary.next && <GameLine label={`Next · Week ${summary.next.week}`} game={summary.next} />}
    </section>
  )
}

function GameLine({ label, game }: { label: string; game: TeamGame }) {
  const score = `${game.ownScore.toFixed(1)}–${game.oppScore.toFixed(1)}`
  const result =
    game.status === 'upcoming' ? null : game.status === 'live' ? (
      <span className="tw-live">Live {score}</span>
    ) : (
      <span className={`result-tag ${game.status === 'W' ? 'won' : game.status === 'L' ? 'lost' : ''}`}>
        {game.status} {score}
      </span>
    )
  return (
    <p className="tw-game">
      <span className="tw-game-label">{label}</span> vs {game.opponentName} {result}
    </p>
  )
}

function MatchupsBlock({
  year,
  week,
  live,
  matchups,
  yourOwner,
  teams,
}: {
  year: number
  week: number
  live: boolean
  matchups: ScoreboardMatchup[]
  yourOwner: string | null
  teams: SeasonTeams
}) {
  const href = `/scoreboard?year=${year}&week=${week}`
  const ownerOf = (teamId: number) => teams.teams.find((t) => t.team_id === teamId)?.owners[0]?.id
  return (
    <section className="tw-block">
      <BlockHeader title={`Week ${week} matchups${live ? ' · live' : ''}`} to={href} linkLabel="Scoreboard" />
      <div className="tw-matchups">
        {matchups.map((m, i) => {
          const yours = !!yourOwner && (ownerOf(m.team_a_id) === yourOwner || ownerOf(m.team_b_id) === yourOwner)
          const side = (id: number, name: string, score: number) => (
            <div className={`tw-m-row${m.winner_id === id ? ' winner' : ''}`}>
              <span className="tw-m-team">{name}</span>
              <span className="tw-m-score">{score.toFixed(1)}</span>
            </div>
          )
          return (
            <Link
              key={i}
              to={href}
              className={`tw-matchup${yours ? ' your-matchup' : ''}`}
              aria-label={`${m.team_a_name} ${m.team_a_score.toFixed(1)}, ${m.is_bye ? 'bye' : `${m.team_b_name} ${m.team_b_score.toFixed(1)}`}: open the scoreboard`}
            >
              {side(m.team_a_id, m.team_a_name, m.team_a_score)}
              {m.is_bye ? (
                <div className="tw-m-row tw-m-bye">Bye</div>
              ) : (
                side(m.team_b_id, m.team_b_name, m.team_b_score)
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function ChampionBlock({ teams }: { teams: SeasonTeams }) {
  const champ = champion(teams)
  if (!champ) return null
  const owner = champ.owners[0]
  return (
    <section className="tw-block tw-champion">
      <BlockHeader title={`${teams.year} champion`} to={`/playoffs?year=${teams.year}`} linkLabel="Playoffs" />
      <div className="tw-champion-body">
        <span className="tw-trophy" aria-hidden="true">
          🏆
        </span>
        <div>
          <Link to={teamHubHref(owner?.id ?? '', { year: teams.year })} className="tw-you-name">
            {champ.team_name}
          </Link>
          <p className="tw-you-line">
            {owner ? `${owner.first_name} ${owner.last_name}`.trim() : ''} ·{' '}
            {formatDashRecord(champ.wins, champ.losses, champ.ties)} in the regular season
          </p>
        </div>
      </div>
    </section>
  )
}

function StandingsBlock({
  teams,
  yourOwner,
  playoffTeams,
}: {
  teams: SeasonTeams
  yourOwner: string | null
  playoffTeams: number | null
}) {
  const rows = standingsSnapshot(teams, yourOwner, playoffTeams)
  const over = !teams.teams.some((t) => !t.final_standing)
  return (
    <section className="tw-block">
      <BlockHeader
        title={over ? `${teams.year} final standings` : 'Standings'}
        to={`/standings?year=${teams.year}`}
        linkLabel="Standings"
      />
      <table className="tw-standings">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Team</th>
            <th className="num">Record</th>
            <th className="num">PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.team.team_id}
              className={[r.yours && 'your-team', r.playoffLine && 'playoff-line', r.gapBefore && 'gap-before']
                .filter(Boolean)
                .join(' ')}
            >
              <td className="num">{r.place}</td>
              <td>
                <Link to={teamHubHref(r.team.owners[0]?.id ?? '', { year: teams.year })} className="team-link">
                  {r.team.team_name}
                </Link>
              </td>
              <td className="num">{formatDashRecord(r.team.wins, r.team.losses, r.team.ties)}</td>
              <td className="num">{r.team.points_for.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {playoffTeams !== null && rows.some((r) => r.playoffLine) && (
        <p className="tw-note">The line marks the last playoff place ({playoffTeams} teams make it).</p>
      )}
    </section>
  )
}

function RankingsBlock({ pr }: { pr: ReturnType<typeof usePowerRankings> }) {
  if (pr.loading && !pr.data) return <ListSkeleton rows={5} />
  const latest = pr.hasData ? latestRankings(pr.data) : null
  if (!latest) return null
  const { season, week, top } = latest
  const nameOf = (teamId: number) => season.teams.find((t) => t.team_id === teamId)?.team_name ?? `Team ${teamId}`
  return (
    <section className="tw-block">
      <BlockHeader
        title={`Power rankings · ${weekLabel(week.week)}${season.live ? '' : `, ${season.season}`}`}
        to={`/power_rankings?year=${season.season}&week=${week.week}`}
        linkLabel="Power Rankings"
      />
      <ol className="tw-rankings">
        {top.map((e) => (
          <li key={e.team_id}>
            <span className="tw-rank">{e.rank}</span>
            <span className="tw-rank-team">{nameOf(e.team_id)}</span>
            <span
              className={`pr-move ${e.change == null ? '' : e.change > 0 ? 'pos' : e.change < 0 ? 'neg' : 'flat'}`}
              aria-label={
                e.change == null ? undefined : e.change === 0 ? 'no change' : e.change > 0 ? `up ${e.change}` : `down ${-e.change}`
              }
            >
              {formatChange(e.change)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
