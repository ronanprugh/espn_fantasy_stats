import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OwnerHistory, OwnerSeason } from '../api'

export const COLORS = [
  '#0066cc',
  '#dc3545',
  '#28a745',
  '#fd7e14',
  '#6f42c1',
  '#17a2b8',
  '#e83e8c',
  '#20c997',
  '#ffc107',
  '#6c757d',
  '#343a40',
  '#198754',
]

type Props = {
  owners: OwnerHistory[]
  allYears: number[]
  statKey: keyof OwnerSeason
  statLabel: string
  yReversed?: boolean
}

type Datum = Record<string, number | null>

export function ComparisonChart({ owners, allYears, statKey, statLabel, yReversed }: Props) {
  const data: Datum[] = allYears.map((year) => {
    const row: Datum = { year }
    for (const o of owners) {
      const s = o.seasons.find((x) => x.year === year)
      row[o.owner_id] = s ? (s[statKey] as number) : null
    }
    return row
  })

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null
    return (
      <div className="chart-tooltip">
        <div className="year">{label}</div>
        {payload.map((p: any) => {
          const owner = owners.find((o) => o.owner_id === p.dataKey)
          if (!owner || p.value == null) return null
          const season = owner.seasons.find((s) => s.year === label)
          const teamName = season?.team_name ?? owner.current_team_name
          return (
            <div key={p.dataKey} style={{ color: p.color }}>
              <span className="team">{teamName}</span>
              <span className="value">
                {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={500}>
        <LineChart data={data} margin={{ top: 20, right: 32, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} allowDecimals={false} />
          <YAxis
            reversed={yReversed}
            allowDecimals={!yReversed}
            label={{ value: statLabel, angle: -90, position: 'insideLeft', offset: 0 }}
          />
          <Tooltip content={renderTooltip} />
          <Legend />
          {owners.map((o, i) => (
            <Line
              key={o.owner_id}
              type="monotone"
              dataKey={o.owner_id}
              name={o.current_team_name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
