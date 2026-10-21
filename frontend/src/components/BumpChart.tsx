import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PowerRankingSeason } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'
import { weekLabel } from '../lib/powerRankings'

/** Fourteen hues that stay apart on both themes; a league tops out around there. */
export const TEAM_COLORS = [
  '#3b82f6', '#ef4444', '#22a35a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899',
  '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#64748b', '#e11d48',
]

export function teamColor(season: PowerRankingSeason, teamId: number): string {
  const ids = [...season.teams].map((t) => t.team_id).sort((a, b) => a - b)
  return TEAM_COLORS[ids.indexOf(teamId) % TEAM_COLORS.length]
}

type Props = {
  season: PowerRankingSeason
  /** Teams drawn at full strength; everyone else fades. Empty means all. */
  focus: Set<number>
  onToggle: (teamId: number) => void
}

/**
 * Every team's rank by week, #1 at the top. Hollow dots mark weeks whose ranks
 * were carried over rather than posted.
 */
export function BumpChart({ season, focus, onToggle }: Props) {
  const isMobile = useIsMobile()
  const n = season.teams.length
  const assumed = new Set(season.weeks.filter((w) => w.source !== 'posted').map((w) => w.week))
  const data = season.weeks.map((w) => {
    const row: Record<string, number> = { week: w.week }
    for (const e of w.entries) row[`t${e.team_id}`] = e.rank
    return row
  })
  const teams = [...season.teams].sort((a, b) => a.team_id - b.team_id)
  const lit = (id: number) => focus.size === 0 || focus.has(id)

  const renderTooltip = ({ active, label }: any) => {
    if (!active || label == null) return null
    const w = season.weeks.find((x) => x.week === label)
    if (!w) return null
    return (
      <div className="chart-tooltip bump-tooltip">
        <div className="year">
          {weekLabel(w.week)}
          {w.source !== 'posted' && <span className="tooltip-assumed"> · carried from Wk {w.source_week}</span>}
        </div>
        {w.entries.map((e) => {
          const t = season.teams.find((x) => x.team_id === e.team_id)
          return (
            <div key={e.team_id} style={{ color: teamColor(season, e.team_id), opacity: lit(e.team_id) ? 1 : 0.5 }}>
              <span className="value">{e.rank}.</span> <span className="team">{t?.team_name}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="bump-chart">
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={isMobile ? 340 : 460}>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis
              dataKey="week"
              type="number"
              domain={[1, season.last_week]}
              ticks={season.weeks.map((w) => w.week)}
              tickFormatter={(w) => (w === 1 ? 'Pre' : String(w))}
              tick={{ fontSize: isMobile ? 10 : 12, fill: 'var(--text-muted)' }}
            />
            <YAxis
              reversed
              domain={[1, n]}
              ticks={Array.from({ length: n }, (_, i) => i + 1)}
              width={isMobile ? 24 : 32}
              tick={{ fontSize: isMobile ? 10 : 12, fill: 'var(--text-muted)' }}
              interval={0}
            />
            <Tooltip content={renderTooltip} />
            {teams.map((t) => {
              const color = teamColor(season, t.team_id)
              const on = lit(t.team_id)
              return (
                <Line
                  key={t.team_id}
                  type="linear"
                  dataKey={`t${t.team_id}`}
                  name={t.team_name}
                  stroke={color}
                  strokeOpacity={on ? 1 : 0.12}
                  strokeWidth={on && focus.size ? 3 : 2}
                  isAnimationActive={false}
                  dot={(p: any) => (
                    <circle
                      key={`${t.team_id}-${p.payload.week}`}
                      cx={p.cx}
                      cy={p.cy}
                      r={on ? 3.5 : 2}
                      stroke={color}
                      strokeOpacity={on ? 1 : 0.15}
                      strokeWidth={1.5}
                      fill={assumed.has(p.payload.week) ? 'var(--bg-card)' : color}
                      fillOpacity={on ? 1 : 0.15}
                    />
                  )}
                  activeDot={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bump-legend" role="group" aria-label="Highlight teams">
        {teams.map((t) => (
          <button
            key={t.team_id}
            type="button"
            className={`bump-legend-item${focus.has(t.team_id) ? ' active' : ''}${lit(t.team_id) ? '' : ' faded'}`}
            onClick={() => onToggle(t.team_id)}
            aria-pressed={focus.has(t.team_id)}
          >
            <span className="swatch" style={{ background: teamColor(season, t.team_id) }} />
            {t.team_name}
          </button>
        ))}
      </div>
      <p className="chart-footnote">
        Filled dots are posted rankings; hollow dots are weeks with no rankings, carried over from the nearest week. Click a team to highlight it.
      </p>
    </div>
  )
}
