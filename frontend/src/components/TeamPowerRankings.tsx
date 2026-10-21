import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PowerRankings } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  formatChange,
  isAssumed,
  ordinal,
  ownerSeasonStats,
  ownerStats,
  postIndex,
  teamIn,
  weekLabel,
} from '../lib/powerRankings'
import { WriteupModal } from './WriteupModal'

/**
 * Team Hub's Power Rankings tab: an owner's rank over every ranked week, and
 * the selected season week by week with each write-up a click away.
 */
export function TeamPowerRankings({
  leagueId,
  data,
  ownerId,
  year,
}: {
  leagueId: number
  data: PowerRankings
  ownerId: string
  year: number
}) {
  const isMobile = useIsMobile()
  const [modal, setModal] = useState<{ postId: number; highlight?: string } | null>(null)
  const posts = postIndex(data)
  const stats = useMemo(() => ownerStats(data).find((o) => o.ownerId === ownerId), [data, ownerId])
  const seasonStats = useMemo(() => ownerSeasonStats(data), [data])

  // Every week this owner was ranked, in order, for the career line.
  const career = useMemo(() => {
    const rows: { i: number; season: number; week: number; rank: number; assumed: boolean; label: string }[] = []
    for (const s of data.seasons) {
      const team = s.teams.find((t) => t.owner_id === ownerId)
      if (!team) continue
      for (const w of s.weeks) {
        const e = w.entries.find((x) => x.team_id === team.team_id)
        if (!e) continue
        rows.push({ i: rows.length, season: s.season, week: w.week, rank: e.rank, assumed: isAssumed(w), label: `${s.season} ${weekLabel(w.week)}` })
      }
    }
    return rows
  }, [data, ownerId])
  const seasonStarts = career.filter((r, idx) => idx === 0 || career[idx - 1].season !== r.season)
  const maxRank = Math.max(...data.seasons.map((s) => s.teams.length))

  const season = data.seasons.find((s) => s.season === year)
  const team = season?.teams.find((t) => t.owner_id === ownerId)
  const thisSeason = season ? seasonStats.get(`${season.season}:${ownerId}`) : undefined

  if (!stats || career.length === 0) {
    return <p className="subtitle">This team doesn't appear in any power rankings.</p>
  }

  return (
    <section className="hub-power">
      <div className="hub-summary">
        <Stat label="Avg Power Rank" value={stats.avgRank?.toFixed(2) ?? '—'} sub={`${stats.weeks} posted weeks`} />
        <Stat label="Weeks at #1" value={String(stats.weeksAt1)} sub={stats.longestAt1 > 1 ? `longest run ${stats.longestAt1}` : undefined} />
        <Stat label="Top-3 Weeks" value={String(stats.top3Weeks)} />
        <Stat label="Preseason Rank" value={stats.avgPreseasonRank?.toFixed(1) ?? '—'} sub={stats.preseasonAt1 ? `${stats.preseasonAt1}× preseason #1` : 'average'} />
        <Stat
          label="vs Record"
          value={stats.respect == null ? '—' : `${stats.respect >= 0 ? '+' : ''}${stats.respect.toFixed(2)}`}
          sub={stats.respect == null ? undefined : stats.respect >= 0 ? 'ranked above standing' : 'ranked below standing'}
        />
        {thisSeason && thisSeason.avgRank != null && (
          <Stat label={`${year} Avg Rank`} value={thisSeason.avgRank.toFixed(2)} sub={thisSeason.preseasonRank ? `preseason #${thisSeason.preseasonRank}` : undefined} />
        )}
      </div>

      <h3 className="chart-title">Every ranked week</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
          <LineChart data={career} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, Math.max(0, career.length - 1)]}
              ticks={seasonStarts.map((r) => r.i)}
              tickFormatter={(i) => String(career[i]?.season ?? '')}
              tick={{ fontSize: isMobile ? 10 : 12, fill: 'var(--text-muted)' }}
            />
            <YAxis reversed domain={[1, maxRank]} ticks={[1, 4, 7, 10, maxRank]} width={28} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            {seasonStarts.slice(1).map((r) => (
              <ReferenceLine key={r.i} x={r.i - 0.5} stroke="var(--border)" />
            ))}
            <Tooltip
              content={({ active, payload }: any) => {
                const r = active && payload?.[0]?.payload
                if (!r) return null
                return (
                  <div className="chart-tooltip">
                    <div className="year">{r.label}</div>
                    <div>
                      #{r.rank}
                      {r.assumed && <span className="tooltip-assumed"> · carried over</span>}
                    </div>
                  </div>
                )
              }}
            />
            <Line
              type="linear"
              dataKey="rank"
              stroke="var(--accent)"
              strokeWidth={2}
              isAnimationActive={false}
              dot={(p: any) => (
                <circle
                  key={p.index}
                  cx={p.cx}
                  cy={p.cy}
                  r={2.5}
                  stroke="var(--accent)"
                  strokeWidth={1.25}
                  fill={p.payload.assumed ? 'var(--bg-card)' : 'var(--accent)'}
                />
              )}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-footnote">Hollow dots are weeks with no posted rankings, carried over from the nearest week.</p>

      <div className="hub-power-head">
        <h3>{year} week by week</h3>
        <Link className="link-btn" to={`/power_rankings?year=${year}`}>
          Open {year} in Power Rankings
        </Link>
      </div>
      {!season || !team ? (
        <p className="subtitle">No power rankings for {year}.</p>
      ) : (
        <ol className="pr-list hub-pr-list">
          {season.weeks.map((w) => {
            const e = w.entries.find((x) => x.team_id === team.team_id)
            if (!e) return null
            const post = w.post_id != null ? posts.get(w.post_id) : undefined
            const game = w.games.find((g) => g[0] === team.team_id || g[1] === team.team_id)
            const oppId = game ? (game[0] === team.team_id ? game[1] : game[0]) : null
            const opp = oppId != null ? teamIn(season, oppId) : undefined
            const oppRank = oppId != null ? w.entries.find((x) => x.team_id === oppId)?.rank : undefined
            const result = game ? (game[2] === team.team_id ? 'W' : game[2] == null ? 'T' : 'L') : null
            return (
              <li key={w.week} className={`pr-row${isAssumed(w) ? ' assumed' : ''}${e.rank === 1 ? ' top' : ''}`}>
                <div className="pr-rank">{e.rank}</div>
                <div className="pr-main">
                  <div className="pr-team-line">
                    <Link className="pr-team" to={`/power_rankings?year=${season.season}&week=${w.week}`}>
                      {weekLabel(w.week)}
                    </Link>
                    <span className={`pr-move ${e.change == null ? '' : e.change > 0 ? 'pos' : e.change < 0 ? 'neg' : 'flat'}`}>
                      {formatChange(e.change)}
                    </span>
                    {post?.is_guest && <span className="tag guest">Guest: {post.author}</span>}
                  </div>
                  <div className="pr-meta">
                    {e.record}
                    {e.standing != null && ` · ${ordinal(e.standing)} in standings`}
                    {result && opp && (
                      <>
                        {' · '}
                        <span className={`result-inline ${result === 'W' ? 'pos' : result === 'L' ? 'neg' : ''}`}>
                          {result === 'W' ? 'Beat' : result === 'L' ? 'Lost to' : 'Tied'} {oppRank ? `#${oppRank} ` : ''}
                          {opp.team_name}
                        </span>
                      </>
                    )}
                  </div>
                  {e.blurb ? (
                    <button
                      type="button"
                      className="pr-blurb-button"
                      onClick={() => post && setModal({ postId: post.id, highlight: e.blurb })}
                      title="Read it in the full post"
                    >
                      {e.blurb}
                    </button>
                  ) : isAssumed(w) ? (
                    <div className="pr-carried">No rankings posted. Rank carried over from Week {w.source_week}.</div>
                  ) : (
                    post && (
                      <button type="button" className="link-btn" onClick={() => setModal({ postId: post.id })}>
                        {post.format === 'image' ? 'See the image' : 'Read the post'}
                      </button>
                    )
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {modal && (
        <WriteupModal leagueId={leagueId} postId={modal.postId} highlight={modal.highlight} onClose={() => setModal(null)} />
      )}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

