/**
 * Team Hub: one owner's page (`?team=<owner id>`). Summary (record, standing,
 * trophies and career records), the roster, the season's schedule, its
 * transactions (rosters start to end, trades, pickups and drops) and, when the
 * league has them, power rankings. `?year=` picks the season, `?tab=` the tab.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  fetchOwnerHistory,
  fetchTeamHub,
  fetchTeams,
  type SeasonTeams,
  type OwnerHistory,
  type RecordEntry,
  type TeamHub,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { TeamPowerRankings } from '../components/TeamPowerRankings'
import { YourTeamPrompt } from '../components/YourTeamPrompt'
import { SeasonPicker } from '../components/SeasonPicker'
import { H2HLink } from '../components/TeamLink'
import { useTeamOwners } from '../hooks/useTeamOwners'
import { useFromHere } from '../hooks/useFromHere'
import { hubHeadline } from '../lib/teamHub'
import { useLeague } from '../contexts/LeagueContext'
import { ErrorMessage } from '../components/ErrorMessage'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { useActiveInView } from '../hooks/useActiveInView'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { ownerSeasonStats, ownerStats } from '../lib/powerRankings'
import { HubSkeleton } from './teamHub/HubSkeleton'
import { RosterTable } from './teamHub/RosterTab'
import { ScheduleTable } from './teamHub/ScheduleTab'
import { TeamSeasonTransactions } from './transactions/TeamSeason'
import { FIRST_TRADE_YEAR } from '../lib/trades'
import { StatCard, TrophyCabinet, RecordsSection, LastMatchupCard } from './teamHub/SummaryTab'

type HubTab = 'summary' | 'roster' | 'schedule' | 'transactions' | 'power'
const HUB_TABS: HubTab[] = ['summary', 'roster', 'schedule', 'transactions', 'power']

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
  const leagueId = selectedLeague?.espn_league_id
  const hubYear = hub?.selected_year
  useEffect(() => {
    if (!leagueId || hubYear === undefined) return
    let cancelled = false
    fetchTeams(leagueId, hubYear)
      .then((s) => !cancelled && setSeasonTeams(s))
      .catch(() => !cancelled && setSeasonTeams(null))
    return () => {
      cancelled = true
    }
  }, [leagueId, hubYear])
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
    if (!leagueId || !ownerId) {
      setHub(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTeamHub(leagueId, ownerId, selectedYear ?? undefined)
      .then((h) => !cancelled && setHub(h))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    // Switching teams mid-load mustn't show the previous team's hub.
    return () => {
      cancelled = true
    }
  }, [leagueId, ownerId, selectedYear])

  // Before the early return: hooks run on every render. The row is only there
  // once the hub has loaded, so that's a reason to look again too.
  const tabsRef = useActiveInView<HTMLElement>([tab, !!hub, loading])

  if (!selectedLeague) return <NoLeagueSelected />

  // The team's seasons, from the hub once it's loaded and from the owner list
  // before that, so the picker is there (and usable) while the hub loads.
  const pickerYears =
    hub?.owner_id === ownerId && hub.available_years.length > 0
      ? hub.available_years
      : owners.find((o) => o.owner_id === ownerId)?.seasons.map((s) => s.year) ?? []

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
      {pickerYears.length > 0 && (
        <SeasonPicker
          years={pickerYears}
          value={selectedYear ?? hub?.selected_year ?? pickerYears[pickerYears.length - 1]}
          onChange={(y) => update({ year: String(y) })}
        />
      )}

      <YourTeamPrompt league={selectedLeague} owners={owners} selectedOwnerId={ownerId} />

      {error && <ErrorMessage message={error} />}
      {loading && <HubSkeleton />}

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

          <nav ref={tabsRef} className="hub-tabs" aria-label="Team Hub sections">
            <button
              className={tab === 'summary' ? 'active' : ''}
              aria-pressed={tab === 'summary'}
              onClick={() => setTab('summary')}
            >
              Summary
            </button>
            <button
              className={tab === 'roster' ? 'active' : ''}
              aria-pressed={tab === 'roster'}
              onClick={() => setTab('roster')}
            >
              Roster
            </button>
            <button
              className={tab === 'schedule' ? 'active' : ''}
              aria-pressed={tab === 'schedule'}
              onClick={() => setTab('schedule')}
            >
              Schedule
            </button>
            <button
              className={tab === 'transactions' ? 'active' : ''}
              aria-pressed={tab === 'transactions'}
              onClick={() => setTab('transactions')}
            >
              Transactions
            </button>
            {powerRankings.hasData && (
              <button
                className={tab === 'power' ? 'active' : ''}
                aria-pressed={tab === 'power'}
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
                <StatCard
                  label="Average Finish"
                  value={hub.avg_finish ? hub.avg_finish.toFixed(2) : '—'}
                  sub={hub.avg_finish ? 'finished seasons' : 'no finished season yet'}
                />
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

          {tab === 'transactions' &&
            (hub.selected_year < FIRST_TRADE_YEAR ? (
              <p className="subtitle">ESPN keeps transactions from {FIRST_TRADE_YEAR} on.</p>
            ) : (
              <TeamSeasonTransactions
                leagueId={selectedLeague.espn_league_id}
                year={hub.selected_year}
                ownerId={hub.owner_id}
                teamId={hub.selected_team_id}
              />
            ))}

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
