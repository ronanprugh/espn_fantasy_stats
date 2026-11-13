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
import { useIsMobile } from '../hooks/useIsMobile'
import {
  AVG_KEY,
  buildTrendData,
  curKey,
  currentYear,
  formatTrendValue,
  rankAxis,
} from '../lib/trends'

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

const AVG_COLOR = 'var(--text-faint)'

type Props = {
  owners: OwnerHistory[]
  /** Every owner in the league, for the league average and the rank axis. */
  allOwners: OwnerHistory[]
  allYears: number[]
  statKey: keyof OwnerSeason
  statLabel: string
  /** A place (1 is best): the axis runs 1…N top to bottom in whole steps. */
  rank?: boolean
  yAutoScale?: boolean
  showAverage?: boolean
}

export function ComparisonChart({
  owners,
  allOwners,
  allYears,
  statKey,
  statLabel,
  rank,
  yAutoScale,
  showAverage,
}: Props) {
  const isMobile = useIsMobile()
  const current = currentYear(allOwners)
  const average = !!showAverage && !rank

  /* A 500px-tall chart on a phone is taller than the viewport minus the header
   * and controls, so the plot could not be seen whole. 280px keeps it above the
   * fold; the rotated axis label and the wider margins go with it, since both
   * spend horizontal space the plot needs more than the annotation does. */
  const height = isMobile ? 280 : 500
  const margin = isMobile
    ? { top: 12, right: 10, left: 0, bottom: 0 }
    : { top: 20, right: 32, left: 16, bottom: 8 }

  const data = buildTrendData(owners, allOwners, allYears, statKey, { current, average })
  const axis = rank ? rankAxis(allOwners, allYears) : null

  /* Read values from the data row, not the tooltip payload: at the join year
   * the solid and dashed keys both carry the same point, and the payload
   * would list it twice. */
  const renderTooltip = ({ active, label }: any) => {
    if (!active) return null
    const row = data.find((d) => d.year === label)
    if (!row) return null
    const isCurrent = label === current
    const valueOf = (key: string) => (isCurrent ? row[curKey(key)] : row[key])
    const avg = average ? valueOf(AVG_KEY) : null
    return (
      <div className="chart-tooltip">
        <div className="year">
          {label}
          {isCurrent && ' (current)'}
        </div>
        {owners.map((owner, i) => {
          const value = valueOf(owner.owner_id)
          if (value == null) return null
          const season = owner.seasons.find((s) => s.year === label)
          const teamName = season?.team_name ?? owner.current_team_name
          return (
            <div key={owner.owner_id} style={{ color: COLORS[i % COLORS.length] }}>
              <span className="team">{teamName}</span>
              <span className="value">{formatTrendValue(value)}</span>
            </div>
          )
        })}
        {avg != null && (
          <div className="avg">
            <span className="team">League average</span>
            <span className="value">{formatTrendValue(avg)}</span>
          </div>
        )}
      </div>
    )
  }

  const dotRadius = isMobile ? 2.5 : 4

  /* The season in progress gets a hollow dot on its dashed segment; the
   * segment's other end is the last completed season, which already has a
   * solid dot from the main line. */
  const currentDot = (color: string, r: number) => (props: any) => {
    const { cx, cy, payload, index, dataKey } = props
    if (payload?.year !== current || cx == null || cy == null) {
      return <g key={`${dataKey}-${index}`} />
    }
    return (
      <circle
        key={`${dataKey}-${index}`}
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--bg-card)"
        stroke={color}
        strokeWidth={2}
      />
    )
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="year"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={allYears}
            allowDecimals={false}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            /* Every year gets a label when there's room; recharts drops the
             * ones that would collide (keeping the first and last) when not. */
            interval="preserveStartEnd"
            minTickGap={isMobile ? 12 : 4}
          />
          <YAxis
            reversed={rank}
            allowDecimals={!rank}
            domain={axis ? axis.domain : yAutoScale ? ['auto', 'auto'] : [0, 'auto']}
            ticks={axis?.ticks}
            interval={axis ? 0 : undefined}
            width={isMobile ? 34 : 60}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={
              isMobile
                ? undefined
                : { value: statLabel, angle: -90, position: 'insideLeft', offset: 0 }
            }
          />
          <Tooltip content={renderTooltip} />
          {/* The legend repeats what the averages panel already lists by colour,
            * and on a phone it can grow taller than the plot. */}
          {!isMobile && <Legend />}
          {average && (
            <Line
              type="linear"
              dataKey={AVG_KEY}
              name="League average"
              stroke={AVG_COLOR}
              strokeWidth={1.25}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {average && current !== null && (
            <Line
              type="linear"
              dataKey={curKey(AVG_KEY)}
              legendType="none"
              stroke={AVG_COLOR}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {owners.map((o, i) => (
            <Line
              key={o.owner_id}
              type="linear"
              dataKey={o.owner_id}
              name={o.current_team_name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              /* Solid dots for completed seasons, so the season in progress's
               * hollow one stands apart. */
              dot={{ r: dotRadius, fill: COLORS[i % COLORS.length], strokeWidth: 0 }}
              connectNulls
            />
          ))}
          {current !== null &&
            owners.map((o, i) => (
              <Line
                key={curKey(o.owner_id)}
                type="linear"
                dataKey={curKey(o.owner_id)}
                legendType="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={currentDot(COLORS[i % COLORS.length], dotRadius)}
                activeDot={false}
                connectNulls
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
