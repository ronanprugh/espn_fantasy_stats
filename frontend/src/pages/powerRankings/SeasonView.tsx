/** Power Rankings, Season: the bump chart and each team's season in the rankings. */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type PowerRankings, type PowerRankingSeason } from '../../api'
import { BumpChart } from '../../components/BumpChart'
import { SortableTh, type SortDir } from '../../components/SortableTh'
import { ownerSeasonStats, type OwnerSeasonPr, type PrOptions } from '../../lib/powerRankings'
import { rankingsHref, fmt, sortRows } from './shared'

export type SeasonSortKey = 'team' | 'avg' | 'pre' | 'final' | 'best' | 'worst' | 'at1' | 'finish' | 'beat'

export function SeasonView({ data, season, opts }: { data: PowerRankings; season: PowerRankingSeason; opts: PrOptions }) {
  const [focus, setFocus] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<SeasonSortKey>('avg')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const stats = useMemo(() => ownerSeasonStats(data, opts), [data, opts])
  const rows = season.teams.map((t) => stats.get(`${season.season}:${t.owner_id}`)!).filter(Boolean)
  const posted = season.weeks.filter((w) => w.source === 'posted').length

  const value = (r: OwnerSeasonPr, k: SeasonSortKey): number | string | null => {
    switch (k) {
      case 'team': return r.teamName
      case 'avg': return r.avgRank
      case 'pre': return r.preseasonRank
      case 'final': return r.finalRank
      case 'best': return r.bestRank
      case 'worst': return r.worstRank
      case 'at1': return r.weeksAt1
      case 'finish': return r.finish
      case 'beat': return r.preseasonRank != null && r.finish != null ? r.preseasonRank - r.finish : null
    }
  }
  const sorted = sortRows(rows, (r) => value(r, sortKey), sortDir)
  const onSort = (k: SeasonSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'at1' || k === 'beat' ? 'desc' : 'asc')
    }
  }
  const th = (k: SeasonSortKey, label: string, title?: string) => (
    <SortableTh sortKey={k} activeKey={sortKey} dir={sortDir} onClick={onSort} title={title} numeric={k !== 'team'}>
      {label}
    </SortableTh>
  )

  return (
    <section className="pr-season">
      <p className="subtitle">
        {posted} of {season.weeks.length} weeks posted
        {season.live && ' · season in progress'}
      </p>
      <BumpChart
        season={season}
        focus={focus}
        onToggle={(id) =>
          setFocus((f) => {
            const next = new Set(f)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })
        }
      />
      <h3 className="chart-title">{season.season} season</h3>
      <div className="teams-wrap">
        <table className="teams">
          <thead>
            <tr>
              {th('team', 'Team')}
              {th('avg', 'Avg', 'Average power rank across the weeks counted.')}
              {th('pre', 'Pre', 'Preseason rank (Week 1).')}
              {th('final', 'Last', "Rank in the season's last counted week.")}
              {th('best', 'Best')}
              {th('worst', 'Worst')}
              {th('at1', '#1 Wks', 'Weeks ranked #1.')}
              {th('finish', 'Finish', 'Place after the playoffs.')}
              {th('beat', 'vs Pre', 'Preseason rank minus final finish. Positive means the team finished better than it was ranked before the season.')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const team = season.teams.find((t) => t.owner_id === r.ownerId)
              const beat = r.preseasonRank != null && r.finish != null ? r.preseasonRank - r.finish : null
              return (
                <tr key={r.ownerId}>
                  <td>
                    <Link to={rankingsHref(r.ownerId, season.season)}>{r.teamName}</Link>
                    <div className="opp-owner">{team?.owner_name}</div>
                  </td>
                  <td className="num">{fmt(r.avgRank)}</td>
                  <td className="num">{r.preseasonRank ?? '—'}</td>
                  <td className="num">{r.finalRank ?? '—'}</td>
                  <td className="num">{r.bestRank ?? '—'}</td>
                  <td className="num">{r.worstRank ?? '—'}</td>
                  <td className="num">{r.weeksAt1}</td>
                  <td className="num">{r.finish ?? '—'}</td>
                  <td className={`num ${beat == null ? '' : beat > 0 ? 'pos' : beat < 0 ? 'neg' : ''}`}>
                    {beat == null ? '—' : beat > 0 ? `+${beat}` : beat}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
