import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchOwnerHistory,
  fetchTeamHub,
  fetchTeams,
  type SeasonTeams,
  type OwnerHistory,
  type RecordEntry,
  type TeamHub,
  type TeamHubGame,
  type TeamHubPlayer,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { RoundBadge } from '../components/RoundBadge'
import { TeamPowerRankings } from '../components/TeamPowerRankings'
import { YourTeamPrompt } from '../components/YourTeamPrompt'
import { SeasonPicker } from '../components/SeasonPicker'
import { H2HLink } from '../components/TeamLink'
import { useTeamOwners } from '../hooks/useTeamOwners'
import { useFromHere } from '../hooks/useFromHere'
import { hubHeadline } from '../lib/teamHub'
import { boxScoreHref, noBoxScoreReason } from '../lib/links'
import { useLeague } from '../contexts/LeagueContext'
import { Loading } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { ownerSeasonStats, ownerStats } from '../lib/powerRankings'

const STARTER_ORDER = ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'WR/TE', 'OP', 'FLEX', 'K', 'D/ST']

function isStarter(slot: string): boolean {
  return slot !== 'BE' && slot !== 'IR' && slot !== ''
}

function slotRank(slot: string): number {
  const i = STARTER_ORDER.indexOf(slot)
  return i === -1 ? STARTER_ORDER.length : i
}

function sortRoster(roster: TeamHubPlayer[]): TeamHubPlayer[] {
  return [...roster].sort((a, b) => {
    const aS = isStarter(a.lineup_slot)
    const bS = isStarter(b.lineup_slot)
    if (aS !== bS) return aS ? -1 : 1
    if (aS) return slotRank(a.lineup_slot) - slotRank(b.lineup_slot)
    if (a.lineup_slot !== b.lineup_slot) return a.lineup_slot === 'BE' ? -1 : 1
    return b.total_points - a.total_points
  })
}

type HubTab = 'summary' | 'roster' | 'schedule' | 'power'
const HUB_TABS: HubTab[] = ['summary', 'roster', 'schedule', 'power']

export function TeamHubPage() {
  const { selectedLeague } = useLeague()
  const fromHere = useFromHere('Team Hub')
  const [owners, setOwners] = useState<OwnerHistory[]>([])
  // ?team=<owner id>&year=. No year means the hub's default (most recent),
  // which is shown but not written back, so a link stays exactly as shared.
  const [params, update] = useUrlState()
  const ownerId = params.get('team') ?? ''
  const selectedYear = numberParam(params, 'year')
  const [hub, setHub] = useState<TeamHub | null>(null)
  // ?tab= so Power Rankings can link straight to a team's rankings.
  const tab: HubTab = HUB_TABS.find((t) => t === params.get('tab')) ?? 'summary'
  const setTab = (t: HubTab) => update({ tab: t === 'summary' ? null : t })
  const powerRankings = usePowerRankings(selectedLeague?.espn_league_id ?? null)
  const prAll = powerRankings.hasData && powerRankings.data
    ? ownerStats(powerRankings.data).find((o) => o.ownerId === ownerId)
    : undefined
  const prSeason = powerRankings.hasData && powerRankings.data && hub
    ? ownerSeasonStats(powerRankings.data).get(`${hub.selected_year}:${ownerId}`)
    : undefined
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The selected season's teams, for the headline's standing and PF rank.
  const [seasonTeams, setSeasonTeams] = useState<SeasonTeams | null>(null)
  useEffect(() => {
    if (!selectedLeague || !hub) return
    let cancelled = false
    fetchTeams(selectedLeague.espn_league_id, hub.selected_year)
      .then((s) => !cancelled && setSeasonTeams(s))
      .catch(() => !cancelled && setSeasonTeams(null))
    return () => {
      cancelled = true
    }
  }, [selectedLeague?.espn_league_id, hub?.selected_year])
  const formats = hub
    ? (
        [
          ['PPR', hub.ppr_avg_pf],
          ['Half PPR', hub.half_ppr_avg_pf],
          ['Standard', hub.standard_avg_pf],
        ] as [string, number | null][]
      ).filter((f): f is [string, number] => f[1] != null)
    : []
  const headline =
    hub && seasonTeams?.year === hub.selected_year
      ? hubHeadline(seasonTeams, hub.selected_team_id, hub.schedule)
      : null
  // Opponents arrive as per-season team ids; Head to Head links need their
  // owners, from every season the schedule, last matchup and records mention.
  const recordYears = hub
    ? [hub.records.highest_score, hub.records.lowest_score, hub.records.biggest_win_margin, hub.records.biggest_loss_margin]
        .filter((r): r is RecordEntry => !!r)
        .map((r) => r.year)
    : []
  const ownerOf = useTeamOwners(
    selectedLeague?.espn_league_id,
    hub ? [hub.selected_year, ...(hub.last_matchup ? [hub.last_matchup.year] : []), ...recordYears] : [],
  )
  /** An opponent's name, linking to Head to Head against them. */
  const opponent = (year: number, teamId: number | null, name: ReactNode) =>
    hub ? (
      <H2HLink ownerId={hub.owner_id} opponentId={ownerOf(year, teamId)} title="Head to Head">
        {name}
      </H2HLink>
    ) : (
      name
    )

  useEffect(() => {
    if (!selectedLeague) return
    fetchOwnerHistory(selectedLeague.espn_league_id)
      .then((h) => {
        setOwners(h.owners)
        if (!ownerId && selectedLeague.favorite_owner_id) {
          const fav = h.owners.find((o) => o.owner_id === selectedLeague.favorite_owner_id)
          if (fav) update({ team: fav.owner_id })
        }
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.espn_league_id])

  useEffect(() => {
    if (!selectedLeague || !ownerId) {
      setHub(null)
      return
    }
    setLoading(true)
    setError(null)
    fetchTeamHub(
      selectedLeague.espn_league_id,
      ownerId,
      selectedYear ?? undefined,
    )
      .then(setHub)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedLeague?.espn_league_id, ownerId, selectedYear])

  if (!selectedLeague) return <NoLeagueSelected />

  return (
    <div className="page">
      <header className="page-header">
        <h2>Team Hub</h2>
      </header>

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="hub-owner">Team</label>
          <select
            id="hub-owner"
            value={ownerId}
            // A new team starts on its own most recent season.
            onChange={(e) => update({ team: e.target.value || null, year: null })}
          >
            <option value="">— pick a team —</option>
            {owners.map((o) => (
              <option key={o.owner_id} value={o.owner_id}>
                {o.current_team_name} — {o.owner_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Only this team's seasons. With no ?year= the hub shows its most recent
       * one, highlighted here but not written to the URL. */}
      {hub && hub.available_years.length > 0 && (
        <SeasonPicker
          years={hub.available_years}
          value={selectedYear ?? hub.selected_year}
          onChange={(y) => update({ year: String(y) })}
        />
      )}

      <YourTeamPrompt league={selectedLeague} owners={owners} selectedOwnerId={ownerId} />

      {error && <ErrorMessage message={error} />}
      {loading && <Loading />}

      {!loading && hub && (
        <>
          <section className="hub-header">
            <div className="hub-header-main">
              <h3 className="hub-team-name">{hub.current_team_name}</h3>
              {/* Record and standing first: what you open Team Hub to see. */}
              {headline && (
                <div className="hub-headline">
                  <span className="hub-headline-year">{hub.selected_year}</span>{' '}
                  <strong>{headline.record}</strong> · {headline.standing}
                  {headline.pfRank && <> · {headline.pfRank}</>}
                  {headline.streak && <> · {headline.streak} streak</>}
                </div>
              )}
              <div className="hub-owner">
                {hub.owner_name} · {hub.seasons_played} seasons played
                {hub.selected_team_name !== hub.current_team_name && (
                  <> · {hub.selected_year}: <em>{hub.selected_team_name}</em></>
                )}
              </div>
            </div>
            <TrophyCabinet accolades={hub.accolades} />
          </section>

          <nav className="hub-tabs">
            <button
              className={tab === 'summary' ? 'active' : ''}
              onClick={() => setTab('summary')}
            >
              Summary
            </button>
            <button
              className={tab === 'roster' ? 'active' : ''}
              onClick={() => setTab('roster')}
            >
              Roster
            </button>
            <button
              className={tab === 'schedule' ? 'active' : ''}
              onClick={() => setTab('schedule')}
            >
              Schedule
            </button>
            {powerRankings.hasData && (
              <button
                className={tab === 'power' ? 'active' : ''}
                onClick={() => setTab('power')}
              >
                Power Rankings
              </button>
            )}
          </nav>

          {tab === 'summary' && (
            <>
              {/* At most five cards. The season's place is in the headline above,
               * worded for a season in progress; points per game is one card
               * for the season (all-time beneath), plus one listing each
               * scoring format when the owner has played more than one. */}
              <section className="hub-summary">
                <StatCard label="Average Finish" value={hub.avg_finish.toFixed(2)} sub="all-time" />
                <StatCard
                  label={`Avg PF / Game (${hub.selected_year})`}
                  value={hub.selected_avg_pf.toFixed(2)}
                  sub={`${hub.career_avg_pf.toFixed(2)} all-time`}
                />
                {formats.length > 1 && (
                  <div className="stat-card">
                    <div className="stat-label">Avg PF / Game by format</div>
                    <dl className="format-list">
                      {formats.map(([label, v]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{v.toFixed(2)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {prAll?.avgRank != null && (
                  <StatCard
                    label="Avg Power Rank"
                    value={prAll.avgRank.toFixed(2)}
                    sub={`all-time · ${prAll.weeksAt1} wks at #1`}
                  />
                )}
                {prSeason?.avgRank != null && (
                  <StatCard
                    label={`Avg Power Rank (${hub.selected_year})`}
                    value={prSeason.avgRank.toFixed(2)}
                    sub={prSeason.preseasonRank ? `preseason #${prSeason.preseasonRank}` : undefined}
                  />
                )}
              </section>

              {hub.last_matchup && (
                <section className="hub-last-matchup">
                  <h3>Last Matchup — {hub.selected_year}</h3>
                  <LastMatchupCard hub={hub} opponent={opponent} fromHere={fromHere} />
                </section>
              )}

              <RecordsSection
                records={hub.records}
                opponent={opponent}
                fromHere={fromHere}
              />
            </>
          )}

          {tab === 'power' && powerRankings.data && (
            <TeamPowerRankings
              leagueId={selectedLeague.espn_league_id}
              data={powerRankings.data}
              ownerId={ownerId}
              year={hub.selected_year}
            />
          )}

          {tab === 'roster' && (
            <section className="hub-roster">
              <h3>Roster — {hub.selected_year}</h3>
              <RosterTable roster={hub.roster} />
            </section>
          )}

          {tab === 'schedule' && (
            <section className="hub-schedule">
              <h3>Schedule — {hub.selected_year}</h3>
              <ScheduleTable
                schedule={hub.schedule}
                year={hub.selected_year}
                opponent={opponent}
                fromHere={fromHere}
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function TrophyCabinet({ accolades }: { accolades: TeamHub['accolades'] }) {
  const items = [
    { count: accolades.championships, label: '1st', emoji: '🏆', years: accolades.championship_years, cls: 'gold' },
    { count: accolades.runner_ups, label: '2nd', emoji: '🥈', years: accolades.runner_up_years, cls: 'silver' },
    { count: accolades.third_places, label: '3rd', emoji: '🥉', years: accolades.third_place_years, cls: 'bronze' },
  ]
  return (
    <div className="trophy-cabinet">
      {items.map((it) => (
        <div
          key={it.label}
          className={`trophy ${it.cls}${it.count === 0 ? ' empty' : ''}`}
          title={it.years.length ? it.years.join(', ') : 'none'}
        >
          <div className="trophy-icon">{it.emoji}</div>
          <div className="trophy-count">{it.count}</div>
          <div className="trophy-sub">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

type Opponent = (year: number, teamId: number | null, name: ReactNode) => ReactNode
type FromHere = ReturnType<typeof useFromHere>

function RecordsSection({
  records,
  opponent,
  fromHere,
}: {
  records: TeamHub['records']
  opponent: Opponent
  fromHere: FromHere
}) {
  const fmtCtx = (r: RecordEntry | null) =>
    r ? (
      <>
        {r.year} · Wk {r.week} · vs {opponent(r.year, r.opp_team_id, r.opponent)}
      </>
    ) : (
      '—'
    )
  const fmtVal = (r: RecordEntry | null, sign = '') =>
    r ? `${sign}${r.value.toFixed(1)}` : '—'
  // Each game record opens its box score; the streak cards are not games.
  const game = (r: RecordEntry | null) =>
    r ? { href: boxScoreHref(r.year, r.week, r.own_team_id, r.opp_team_id), year: r.year, fromHere } : undefined
  return (
    <section className="hub-records">
      <h3>Career Records</h3>
      <div className="records-grid">
        <RecordCard
          label="Highest Score"
          value={fmtVal(records.highest_score)}
          sub={fmtCtx(records.highest_score)}
          game={game(records.highest_score)}
        />
        <RecordCard
          label="Lowest Score"
          value={fmtVal(records.lowest_score)}
          sub={fmtCtx(records.lowest_score)}
          game={game(records.lowest_score)}
        />
        <RecordCard
          label="Biggest Win"
          value={fmtVal(records.biggest_win_margin, '+')}
          sub={fmtCtx(records.biggest_win_margin)}
          accent="pos"
          game={game(records.biggest_win_margin)}
        />
        <RecordCard
          label="Worst Loss"
          value={fmtVal(records.biggest_loss_margin, '−')}
          sub={fmtCtx(records.biggest_loss_margin)}
          accent="neg"
          game={game(records.biggest_loss_margin)}
        />
        <RecordCard
          label="Longest Win Streak"
          value={`${records.longest_win_streak}`}
          accent="pos"
        />
        <RecordCard
          label="Longest Losing Streak"
          value={`${records.longest_loss_streak}`}
          accent="neg"
        />
      </div>
    </section>
  )
}

function RecordCard({
  label,
  value,
  sub,
  accent,
  game,
}: {
  label: string
  value: string
  sub?: ReactNode
  accent?: 'pos' | 'neg'
  game?: { href: string; year: number; fromHere: FromHere }
}) {
  // The opponent inside `sub` is a link of its own, so the box score link is
  // a cover laid over the card rather than a wrapper (see .card-cover).
  const unavailable = game ? noBoxScoreReason(game.year) : null
  const linked = !!game && !unavailable
  return (
    <div
      className={`record-card${accent ? ` ${accent}` : ''}${linked ? ' clickable' : ''}`}
      title={unavailable ?? undefined}
    >
      {linked && (
        <Link
          to={game.href}
          state={game.fromHere}
          className="card-cover"
          title="View box score"
          aria-label={`${label}: view box score`}
        />
      )}
      <div className="record-label">{label}</div>
      <div className="record-value">{value}</div>
      {sub && <div className="record-sub">{sub}</div>}
    </div>
  )
}

function LastMatchupCard({ hub, opponent, fromHere }: { hub: TeamHub; opponent: Opponent; fromHere: FromHere }) {
  const m = hub.last_matchup!
  const ownWon = m.result === 'W'
  const oppWon = m.result === 'L'
  const unavailable = noBoxScoreReason(m.year)
  return (
    <div
      className={`scoreboard-card ${unavailable ? 'disabled' : 'clickable'}`}
      title={unavailable ?? undefined}
    >
      {!unavailable && (
        <Link
          to={boxScoreHref(m.year, m.week, m.own_team_id, m.opp_team_id)}
          state={fromHere}
          className="card-cover"
          title="View box score"
          aria-label={`Box score: ${m.own_team_name} vs ${m.opp_team_name}, ${m.year} week ${m.week}`}
        />
      )}
      <div className="card-badge">
        <RoundBadge round={m.round_label} hideRegular />
      </div>
      <div className="hub-matchup-meta">
        {m.year} · Week {m.week}
      </div>
      <div className={`card-row ${ownWon ? 'winner' : ''}`}>
        <div className="team">
          <div className="team-name">{m.own_team_name}</div>
          <div className="team-owner">{hub.owner_name}</div>
        </div>
        <div className="score">{m.own_score.toFixed(1)}</div>
      </div>
      <div className={`card-row ${oppWon ? 'winner' : ''}`}>
        <div className="team">
          <div className="team-name">{opponent(m.year, m.opp_team_id, m.opp_team_name)}</div>
          <div className="team-owner">{m.opp_owner_name}</div>
        </div>
        <div className="score">{m.opp_score.toFixed(1)}</div>
      </div>
    </div>
  )
}

function RosterTable({ roster }: { roster: TeamHubPlayer[] }) {
  const sorted = sortRoster(roster)
  const firstBenchIdx = sorted.findIndex((p) => !isStarter(p.lineup_slot))
  return (
    <table className="lineup-table">
      <thead>
        <tr>
          <th>Slot</th>
          <th>Player</th>
          <th>Pos</th>
          <th>NFL</th>
          <th className="right num">Total Pts</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => {
          const showDivider = i === firstBenchIdx && firstBenchIdx > 0
          return (
            <Fragment key={p.player_id || i}>
              {showDivider && (
                <tr className="bench-divider">
                  <td colSpan={5}>Bench</td>
                </tr>
              )}
              <tr className={isStarter(p.lineup_slot) ? 'starter' : 'bench'}>
                <td className="slot">{p.lineup_slot}</td>
                <td className="player-name">
                  {p.name || '—'}
                  {p.injury_status && p.injury_status !== 'ACTIVE' && (
                    <span className="injury-tag"> {p.injury_status}</span>
                  )}
                </td>
                <td>{p.position}</td>
                <td>{p.pro_team}</td>
                <td className="points right num">{p.total_points.toFixed(1)}</td>
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function ScheduleTable({
  schedule,
  year,
  opponent,
  fromHere,
}: {
  schedule: TeamHubGame[]
  year: number
  opponent: Opponent
  fromHere: FromHere
}) {
  return (
    <table className="schedule-table">
      <thead>
        <tr>
          <th className="num">Wk</th>
          <th>Round</th>
          <th>Opponent</th>
          <th className="right num">Score</th>
          <th className="right num">Opp Score</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((g) => {
          const won = g.result === 'W'
          const lost = g.result === 'L'
          const unavailable = noBoxScoreReason(year, {
            isBye: g.is_bye,
            unplayed: g.result === 'U',
            opponent: g.opp_team_id,
          })
          // The row's box score link is a cover over the whole row; the
          // opponent's Head to Head link sits above it (see .row-cover).
          return (
            <tr
              key={g.week}
              className={unavailable ? '' : 'clickable-row link-row'}
              title={unavailable ?? undefined}
            >
              <td className="num">
                {!unavailable && (
                  <Link
                    to={boxScoreHref(year, g.week, g.own_team_id, g.opp_team_id!)}
                    state={fromHere}
                    className="row-cover"
                    title="View box score"
                    aria-label={`Box score: week ${g.week} vs ${g.opp_team_name}`}
                  />
                )}
                {g.week}
              </td>
              <td>
                <RoundBadge round={g.round_label} />
              </td>
              <td>
                {g.is_bye ? (
                  <span className="bye-cell">BYE</span>
                ) : (
                  <>
                    <div>{opponent(year, g.opp_team_id, g.opp_team_name)}</div>
                    <div className="opp-owner">{g.opp_owner_name}</div>
                  </>
                )}
              </td>
              <td className="right num">{g.is_bye ? '—' : g.own_score.toFixed(1)}</td>
              <td className="right num">{g.is_bye ? '—' : g.opp_score.toFixed(1)}</td>
              <td>
                {g.is_bye ? (
                  <span className="result-tag bye">BYE</span>
                ) : (
                  <span className={`result-tag ${won ? 'won' : lost ? 'lost' : ''}`}>
                    {g.result}
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
