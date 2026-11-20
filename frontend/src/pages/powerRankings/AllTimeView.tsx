/** Power Rankings, All-Time: each owner's record in the rankings across seasons, and the heatmap. */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type PowerRankings } from '../../api'
import { SortableTh, type SortDir } from '../../components/SortableTh'
import {
  authorOwnerId,
  biggestUpsets,
  ownerSeasonStats,
  ownerStats,
  pickAccuracy,
  teamIn,
  weekLabel,
  type OwnerPrStats,
  type OwnerSeasonPr,
  type PrOptions,
} from '../../lib/powerRankings'
import { Coverage } from './ArchiveView'
import { rankingsHref, Card, fmt, sortRows } from './shared'

export type AllSortKey =
  | 'owner' | 'seasons' | 'weeks' | 'avg' | 'best' | 'worst' | 'at1' | 'top3' | 'last'
  | 'streak' | 'pre1' | 'pre' | 'final' | 'vol' | 'respect'

export const MIN_WEEKS_FOR_AVG = 20

export function AllTimeView({
  data,
  opts,
  onPickWeek,
}: {
  data: PowerRankings
  opts: PrOptions
  onPickWeek: (season: number, week: number) => void
}) {
  const stats = useMemo(() => ownerStats(data, opts), [data, opts])
  const accuracy = useMemo(() => pickAccuracy(data, opts), [data, opts])
  const upsets = useMemo(() => biggestUpsets(data, 8, opts), [data, opts])
  const seasonStats = useMemo(() => ownerSeasonStats(data, opts), [data, opts])
  const author = authorOwnerId(data)
  const [sortKey, setSortKey] = useState<AllSortKey>('avg')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const top = <K extends keyof OwnerPrStats>(key: K, dir: 'max' | 'min', filter: (o: OwnerPrStats) => boolean = () => true) => {
    const pool = stats.filter((o) => o[key] != null && filter(o))
    if (!pool.length) return null
    return pool.reduce((best, o) => {
      const a = o[key] as unknown as number
      const b = best[key] as unknown as number
      return (dir === 'max' ? a > b : a < b) ? o : best
    })
  }
  const nameOf = (o: OwnerPrStats | null) => (o ? `${o.teamName} · ${o.ownerName}` : '—')
  const mostAt1 = top('weeksAt1', 'max')
  const streak = top('longestAt1', 'max')
  const bestAvg = top('avgRank', 'min', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const worstAvg = top('avgRank', 'max', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const pre1 = top('preseasonAt1', 'max')
  const climbs = stats.filter((o) => o.biggestClimb).sort((a, b) => b.biggestClimb!.value - a.biggestClimb!.value)[0]
  const drops = stats.filter((o) => o.biggestDrop).sort((a, b) => b.biggestDrop!.value - a.biggestDrop!.value)[0]
  const loved = top('respect', 'max', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const doubted = top('respect', 'min', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const writer = author ? stats.find((o) => o.ownerId === author) : undefined

  const value = (o: OwnerPrStats, k: AllSortKey): number | string | null => {
    switch (k) {
      case 'owner': return o.ownerName
      case 'seasons': return o.seasons
      case 'weeks': return o.weeks
      case 'avg': return o.avgRank
      case 'best': return o.bestRank
      case 'worst': return o.worstRank
      case 'at1': return o.weeksAt1
      case 'top3': return o.top3Weeks
      case 'last': return o.lastWeeks
      case 'streak': return o.longestAt1
      case 'pre1': return o.preseasonAt1
      case 'pre': return o.avgPreseasonRank
      case 'final': return o.avgFinalRank
      case 'vol': return o.volatility
      case 'respect': return o.respect
    }
  }
  const ASC: Set<AllSortKey> = new Set(['owner', 'avg', 'best', 'worst', 'pre', 'final', 'vol'])
  const onSort = (k: AllSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(ASC.has(k) ? 'asc' : 'desc')
    }
  }
  const th = (k: AllSortKey, label: string, title?: string) => (
    <SortableTh sortKey={k} activeKey={sortKey} dir={sortDir} onClick={onSort} title={title} numeric={k !== 'owner'}>
      {label}
    </SortableTh>
  )
  const sorted = sortRows(stats, (o) => value(o, sortKey), sortDir)
  const pct = accuracy.games ? (100 * accuracy.correct) / accuracy.games : null

  return (
    <section className="pr-alltime">
      <div className="records-grid pr-records">
        <Card label="Most weeks at #1" value={mostAt1 ? String(mostAt1.weeksAt1) : '—'} sub={nameOf(mostAt1)} />
        <Card label="Longest run at #1" value={streak ? `${streak.longestAt1} wks` : '—'} sub={nameOf(streak)} />
        <Card label="Best average rank" value={fmt(bestAvg?.avgRank ?? null)} sub={`${nameOf(bestAvg)} (min ${MIN_WEEKS_FOR_AVG} wks)`} accent="pos" />
        <Card label="Worst average rank" value={fmt(worstAvg?.avgRank ?? null)} sub={nameOf(worstAvg)} accent="neg" />
        <Card label="Most preseason #1s" value={pre1 ? String(pre1.preseasonAt1) : '—'} sub={nameOf(pre1)} />
        <Card
          label="Biggest one-week climb"
          value={climbs ? `▲${climbs.biggestClimb!.value}` : '—'}
          sub={climbs ? `${nameOf(climbs)} · ${climbs.biggestClimb!.season} ${weekLabel(climbs.biggestClimb!.week)}` : ''}
          accent="pos"
          onClick={climbs ? () => onPickWeek(climbs.biggestClimb!.season, climbs.biggestClimb!.week) : undefined}
        />
        <Card
          label="Biggest one-week fall"
          value={drops ? `▼${drops.biggestDrop!.value}` : '—'}
          sub={drops ? `${nameOf(drops)} · ${drops.biggestDrop!.season} ${weekLabel(drops.biggestDrop!.week)}` : ''}
          accent="neg"
          onClick={drops ? () => onPickWeek(drops.biggestDrop!.season, drops.biggestDrop!.week) : undefined}
        />
        <Card
          label="Ranked furthest above record"
          value={loved?.respect != null ? `+${loved.respect.toFixed(1)}` : '—'}
          sub={`${nameOf(loved)} · places above their standing, on average`}
        />
        <Card
          label="Ranked furthest below record"
          value={doubted?.respect != null ? doubted.respect.toFixed(1) : '—'}
          sub={`${nameOf(doubted)} · places below their standing, on average`}
        />
        <Card
          label="Better-ranked team won"
          value={pct != null ? `${pct.toFixed(1)}%` : '—'}
          sub={`${accuracy.correct} of ${accuracy.games} regular-season games`}
        />
        {writer && data.primary_author && (
          <Card
            label={`The writer's own team`}
            value={fmt(writer.avgRank)}
            sub={`Average rank ${data.primary_author.split(' ')[0]} gives ${writer.teamName}${
              writer.respect != null
                ? `, ${Math.abs(writer.respect).toFixed(1)} places ${writer.respect >= 0 ? 'above' : 'below'} its standing`
                : ''
            }.`}
          />
        )}
      </div>

      <h3 className="chart-title">Every owner</h3>
      <div className="teams-wrap">
        <table className="teams">
          <thead>
            <tr>
              {th('owner', 'Owner')}
              {th('avg', 'Avg', 'Average power rank.')}
              {th('at1', '#1', 'Weeks ranked #1.')}
              {th('top3', 'Top 3', 'Weeks ranked in the top three.')}
              {th('last', 'Last', 'Weeks ranked last.')}
              {th('streak', 'Run', 'Longest run of consecutive weeks at #1 within a season.')}
              {th('best', 'Best')}
              {th('worst', 'Worst')}
              {th('pre1', 'Pre #1', 'Seasons opened at #1 in the preseason rankings.')}
              {th('pre', 'Avg Pre', 'Average preseason rank.')}
              {th('final', 'Avg Last', "Average rank in each season's last counted week.")}
              {th('respect', 'vs Record', 'Average of standing minus power rank. Positive means ranked higher than the record says.')}
              {th('vol', 'Moves', 'Average places moved per week, either direction.')}
              {th('weeks', 'Wks', 'Weeks counted.')}
              {th('seasons', 'Sns', 'Seasons ranked.')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o.ownerId}>
                <td>
                  <Link to={rankingsHref(o.ownerId)}>{o.ownerName}</Link>
                  <div className="opp-owner">{o.teamName}</div>
                </td>
                <td className="num">{fmt(o.avgRank)}</td>
                <td className="num">{o.weeksAt1}</td>
                <td className="num">{o.top3Weeks}</td>
                <td className="num">{o.lastWeeks}</td>
                <td className="num">{o.longestAt1}</td>
                <td className="num">{o.bestRank ?? '—'}</td>
                <td className="num">{o.worstRank ?? '—'}</td>
                <td className="num">{o.preseasonAt1}</td>
                <td className="num">{fmt(o.avgPreseasonRank)}</td>
                <td className="num">{fmt(o.avgFinalRank)}</td>
                <td className={`num ${o.respect == null ? '' : o.respect >= 0 ? 'pos' : 'neg'}`}>
                  {o.respect == null ? '—' : `${o.respect >= 0 ? '+' : ''}${o.respect.toFixed(2)}`}
                </td>
                <td className="num">{fmt(o.volatility)}</td>
                <td className="num">{o.weeks}</td>
                <td className="num">{o.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="chart-title">Average rank by season</h3>
      <Heatmap data={data} stats={seasonStats} owners={sorted} />

      <div className="pr-two-col">
        <section>
          <h3 className="chart-title">Biggest upsets</h3>
          <ol className="pr-upsets">
            {upsets.map((u, i) => {
              const s = data.seasons.find((x) => x.season === u.season)!
              return (
                <li key={i}>
                  <button className="link-btn" onClick={() => onPickWeek(u.season, u.week)}>
                    {u.season} {weekLabel(u.week)}
                  </button>
                  : #{u.winnerRank} {teamIn(s, u.winnerTeamId)?.team_name} beat #{u.loserRank} {teamIn(s, u.loserTeamId)?.team_name}
                </li>
              )
            })}
          </ol>
        </section>
        <section>
          <h3 className="chart-title">How often the better-ranked team won</h3>
          <table className="teams pr-accuracy">
            <tbody>
              {accuracy.bySeason.map((s) => (
                <tr key={s.season}>
                  <td>{s.season}</td>
                  <td className="num">{((100 * s.correct) / s.games).toFixed(0)}%</td>
                  <td className="num opp-owner">{s.correct} of {s.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <h3 className="chart-title">Coverage</h3>
      <Coverage data={data} onPick={onPickWeek} />
    </section>
  )
}

export function Heatmap({ data, stats, owners }: { data: PowerRankings; stats: Map<string, OwnerSeasonPr>; owners: OwnerPrStats[] }) {
  const seasons = data.seasons
  return (
    <div className="teams-wrap">
      <table className="pr-heatmap">
        <thead>
          <tr>
            <th />
            {seasons.map((s) => (
              <th key={s.season} className="num">{s.season}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {owners.map((o) => (
            <tr key={o.ownerId}>
              <th scope="row">{o.ownerName}</th>
              {seasons.map((s) => {
                const r = stats.get(`${s.season}:${o.ownerId}`)
                const avg = r?.avgRank ?? null
                const n = s.teams.length
                // 0 for the best rank, 1 for the worst.
                const t = avg == null ? null : (avg - 1) / Math.max(1, n - 1)
                const style = t == null ? undefined : {
                  background: t < 0.5
                    ? `color-mix(in srgb, var(--success) ${Math.round((0.5 - t) * 120)}%, transparent)`
                    : `color-mix(in srgb, var(--danger) ${Math.round((t - 0.5) * 120)}%, transparent)`,
                }
                return (
                  <td key={s.season} className="num" style={style} title={r ? `${r.teamName}: ${fmt(avg)} average, finished ${r.finish ?? '—'}` : 'Not ranked'}>
                    {fmt(avg, 1)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
