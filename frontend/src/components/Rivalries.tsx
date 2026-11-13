import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Rivalry, RivalrySummary } from '../api'
import { headToHeadHref } from '../lib/links'
import { rivalryCallouts, winRate } from '../lib/rivalries'
import { formatDashRecord, formatRate } from '../lib/seasonStats'
import { SortableTh, type SortDir } from './SortableTh'

type SortKey = 'opponent' | 'meetings' | 'record' | 'win_pct' | 'avg_pf' | 'avg_pa' | 'playoffs' | 'last'

const ASC_BY_DEFAULT = new Set<SortKey>(['opponent'])

const valueOf = (r: Rivalry, key: SortKey): string | number | null => {
  switch (key) {
    case 'opponent':
      return r.opponent_name
    case 'meetings':
      return r.meetings
    case 'record':
      return r.meetings ? r.wins - r.losses + r.ties / 2 : null
    case 'win_pct':
      return winRate(r)
    case 'avg_pf':
      return r.avg_pf
    case 'avg_pa':
      return r.avg_pa
    case 'playoffs':
      return r.playoff_meetings || null
    case 'last':
      return r.last_meeting ? r.last_meeting.year * 100 + r.last_meeting.week : null
  }
}

const lastLabel = (r: Rivalry) => {
  const m = r.last_meeting
  if (!m) return '—'
  return `${m.result} ${m.score.toFixed(1)}–${m.opponent_score.toFixed(1)} · ${m.year} Wk ${m.week}`
}

/**
 * Head to Head before an opponent is picked: one owner's record against every
 * other owner, with the standouts called out above. Each row opens the full
 * head-to-head for that pair as a new page (a real link), so Back returns
 * here.
 */
export function Rivalries({ summary }: { summary: RivalrySummary }) {
  const [sortKey, setSortKey] = useState<SortKey>('meetings')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const { best, toughest, mostPlayed } = rivalryCallouts(summary.opponents)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(ASC_BY_DEFAULT.has(key) ? 'asc' : 'desc')
    }
  }

  const sorted = [...summary.opponents].sort((a, b) => {
    const va = valueOf(a, sortKey)
    const vb = valueOf(b, sortKey)
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const href = (r: Rivalry) => headToHeadHref(summary.owner_id, r.opponent_id)

  const th = (key: SortKey, label: string, title?: string, className?: string) => (
    <SortableTh
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onClick={handleSort}
      title={title}
      numeric={key !== 'opponent' && key !== 'last'}
      className={className}
    >
      {label}
    </SortableTh>
  )

  const callout = (label: string, r: Rivalry | null, value: (r: Rivalry) => string) =>
    r && (
      <Link to={href(r)} className="stat-card rivalry-callout">
        <div className="stat-label">{label}</div>
        <div className="stat-value" title={r.opponent_name}>
          vs {r.opponent_name}
        </div>
        <div className="stat-sub">{value(r)}</div>
      </Link>
    )

  const PINNED = 'sticky-col sticky-1 sticky-edge'
  const anyMeetings = summary.opponents.some((o) => o.meetings > 0)

  return (
    <section className="rivalries">
      <h3>{summary.owner_team_name || summary.owner_name} against everyone</h3>
      {anyMeetings && (
        <div className="rivalry-callouts">
          {callout('Best record', best, (r) => formatDashRecord(r.wins, r.losses, r.ties))}
          {callout('Toughest', toughest, (r) => formatDashRecord(r.wins, r.losses, r.ties))}
          {callout('Most played', mostPlayed, (r) => `${r.meetings} meetings`)}
        </div>
      )}
      <p className="subtitle">Pick a row, or Team B above, for the full head-to-head.</p>
      <div className="teams-wrap sticky">
        <table className="teams rivalries-table">
          <thead>
            <tr>
              {th('opponent', 'Opponent', undefined, PINNED)}
              {th('meetings', 'Games', 'Games played against this owner, regular season and playoffs.')}
              {th('record', 'Record', 'Your wins–losses against this owner, with ties last when there are any.')}
              {th('win_pct', 'Win %', 'Your win percentage against this owner, with ties counted as half a win.')}
              {th('avg_pf', 'Avg PF', 'Your average score in these games.')}
              {th('avg_pa', 'Avg PA', "This owner's average score in these games.")}
              {th('playoffs', 'Playoffs', 'Playoff meetings, with your playoff wins–losses against this owner.')}
              {th('last', 'Last meeting', 'The most recent game: your result, the score (yours first), and when.')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.opponent_id} className="clickable-row link-row">
                <td className={`owner-line ${PINNED}`}>
                  <Link to={href(r)} className="team-link owner-line-name">
                    {r.opponent_name}
                  </Link>
                  <span className="owner-line-team" title={r.opponent_team_name}>
                    <span className="owner-line-team-name">{r.opponent_team_name}</span>
                  </span>
                </td>
                <td className="num">
                  {/* The whole row opens the pair. The opponent's name is the
                    * same link for the keyboard and screen readers, so this
                    * cover is for the pointer only. It sits here, not in the
                    * pinned cell, which would contain it (see .row-cover). */}
                  <Link to={href(r)} className="row-cover" tabIndex={-1} aria-hidden="true" />
                  {r.meetings}
                </td>
                <td className="num">{r.meetings ? formatDashRecord(r.wins, r.losses, r.ties) : '—'}</td>
                <td className="num">{r.meetings ? formatRate(winRate(r)!) : '—'}</td>
                <td className="num">{r.avg_pf?.toFixed(2) ?? '—'}</td>
                <td className="num">{r.avg_pa?.toFixed(2) ?? '—'}</td>
                <td className="num">
                  {r.playoff_meetings
                    ? `${r.playoff_meetings} (${formatDashRecord(r.playoff_wins, r.playoff_losses)})`
                    : '—'}
                </td>
                <td className="last-meeting">{lastLabel(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
