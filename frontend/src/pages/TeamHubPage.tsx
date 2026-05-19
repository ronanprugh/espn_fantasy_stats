import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchOwnerHistory,
  fetchTeamHub,
  type OwnerHistory,
  type RecordEntry,
  type TeamHub,
  type TeamHubGame,
  type TeamHubPlayer,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { RoundBadge } from '../components/RoundBadge'
import { useLeague } from '../contexts/LeagueContext'

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

type HubTab = 'summary' | 'roster' | 'schedule'

export function TeamHubPage() {
  const { selectedLeague } = useLeague()
  const navigate = useNavigate()
  const [owners, setOwners] = useState<OwnerHistory[]>([])
  const [ownerId, setOwnerId] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [hub, setHub] = useState<TeamHub | null>(null)
  const [tab, setTab] = useState<HubTab>('summary')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) return
    fetchOwnerHistory(selectedLeague.espn_league_id)
      .then((h) => {
        setOwners(h.owners)
        if (!ownerId && selectedLeague.favorite_owner_id) {
          const fav = h.owners.find((o) => o.owner_id === selectedLeague.favorite_owner_id)
          if (fav) setOwnerId(fav.owner_id)
        }
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.espn_league_id])

  // Reset the selected year whenever owner or league changes; the hub fetch
  // will default to the most recent year and we'll pick up that value.
  useEffect(() => {
    setSelectedYear(null)
  }, [ownerId, selectedLeague?.espn_league_id])

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
      .then((h) => {
        setHub(h)
        if (selectedYear == null) setSelectedYear(h.selected_year)
      })
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
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">— pick a team —</option>
            {owners.map((o) => (
              <option key={o.owner_id} value={o.owner_id}>
                {o.current_team_name} — {o.owner_name}
              </option>
            ))}
          </select>
        </div>

        {hub && hub.available_years.length > 0 && (
          <div className="control">
            <label htmlFor="hub-year">Year</label>
            <select
              id="hub-year"
              value={selectedYear ?? hub.selected_year}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[...hub.available_years].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}

      {!loading && hub && (
        <>
          <section className="hub-header">
            <div className="hub-header-main">
              <h3 className="hub-team-name">{hub.current_team_name}</h3>
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
          </nav>

          {tab === 'summary' && (
            <>
              <section className="hub-summary">
                <StatCard
                  label={`${hub.selected_year} Final Place`}
                  value={`#${hub.selected_finish}`}
                />
                <StatCard label="Average Finish" value={hub.avg_finish.toFixed(2)} sub="all-time" />
                <StatCard
                  label="Avg PF / Game"
                  value={hub.career_avg_pf.toFixed(2)}
                  sub="all-time"
                />
                <StatCard
                  label={`Avg PF / Game (${hub.selected_year})`}
                  value={hub.selected_avg_pf.toFixed(2)}
                />
              </section>

              {hub.last_matchup && (
                <section className="hub-last-matchup">
                  <h3>Last Matchup — {hub.selected_year}</h3>
                  <LastMatchupCard
                    hub={hub}
                    onClick={() => {
                      if (hub.last_matchup!.year < 2019) return
                      navigate(
                        `/box_score/${hub.last_matchup!.year}/${hub.last_matchup!.week}/${hub.last_matchup!.own_team_id}/${hub.last_matchup!.opp_team_id}`,
                      )
                    }}
                  />
                </section>
              )}

              <RecordsSection records={hub.records} />
            </>
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
                onGameClick={(g) => {
                  if (g.is_bye || hub.selected_year < 2019 || g.opp_team_id == null) return
                  navigate(
                    `/box_score/${hub.selected_year}/${g.week}/${g.own_team_id}/${g.opp_team_id}`,
                  )
                }}
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

function RecordsSection({ records }: { records: TeamHub['records'] }) {
  const fmtCtx = (r: RecordEntry | null) =>
    r ? `${r.year} · Wk ${r.week} · vs ${r.opponent}` : '—'
  const fmtVal = (r: RecordEntry | null, sign = '') =>
    r ? `${sign}${r.value.toFixed(1)}` : '—'
  return (
    <section className="hub-records">
      <h3>Career Records</h3>
      <div className="records-grid">
        <RecordCard
          label="Highest Score"
          value={fmtVal(records.highest_score)}
          sub={fmtCtx(records.highest_score)}
        />
        <RecordCard
          label="Lowest Score"
          value={fmtVal(records.lowest_score)}
          sub={fmtCtx(records.lowest_score)}
        />
        <RecordCard
          label="Biggest Win"
          value={fmtVal(records.biggest_win_margin, '+')}
          sub={fmtCtx(records.biggest_win_margin)}
          accent="pos"
        />
        <RecordCard
          label="Worst Loss"
          value={fmtVal(records.biggest_loss_margin, '−')}
          sub={fmtCtx(records.biggest_loss_margin)}
          accent="neg"
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
}: {
  label: string
  value: string
  sub?: string
  accent?: 'pos' | 'neg'
}) {
  return (
    <div className={`record-card${accent ? ` ${accent}` : ''}`}>
      <div className="record-label">{label}</div>
      <div className="record-value">{value}</div>
      {sub && <div className="record-sub">{sub}</div>}
    </div>
  )
}

function LastMatchupCard({ hub, onClick }: { hub: TeamHub; onClick: () => void }) {
  const m = hub.last_matchup!
  const ownWon = m.result === 'W'
  const oppWon = m.result === 'L'
  const clickable = m.year >= 2019
  return (
    <div
      className={`scoreboard-card ${clickable ? 'clickable' : 'disabled'}`}
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'View box score' : ''}
    >
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
          <div className="team-name">{m.opp_team_name}</div>
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
          <th className="right">Total Pts</th>
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
                <td className="points right">{p.total_points.toFixed(1)}</td>
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
  onGameClick,
}: {
  schedule: TeamHubGame[]
  year: number
  onGameClick: (g: TeamHubGame) => void
}) {
  const boxScoresAvailable = year >= 2019
  return (
    <table className="schedule-table">
      <thead>
        <tr>
          <th>Wk</th>
          <th>Round</th>
          <th>Opponent</th>
          <th className="right">Score</th>
          <th className="right">Opp Score</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((g) => {
          const won = g.result === 'W'
          const lost = g.result === 'L'
          const clickable = !g.is_bye && boxScoresAvailable && g.opp_team_id != null
          return (
            <tr
              key={g.week}
              className={clickable ? 'clickable-row' : ''}
              onClick={clickable ? () => onGameClick(g) : undefined}
              title={clickable ? 'View box score' : ''}
            >
              <td>{g.week}</td>
              <td>
                <RoundBadge round={g.round_label} />
              </td>
              <td>
                {g.is_bye ? (
                  <span className="bye-cell">BYE</span>
                ) : (
                  <>
                    <div>{g.opp_team_name}</div>
                    <div className="opp-owner">{g.opp_owner_name}</div>
                  </>
                )}
              </td>
              <td className="right">{g.is_bye ? '—' : g.own_score.toFixed(1)}</td>
              <td className="right">{g.is_bye ? '—' : g.opp_score.toFixed(1)}</td>
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
