/** Transactions: the kinds of transaction, formatting, and a stat card. */
import type { MoveKind } from '../../api'

export type Kind = 'trades' | MoveKind
export const KINDS: { key: Kind; label: string; noun: string }[] = [
  { key: 'trades', label: 'Trades', noun: 'trade' },
  { key: 'waiver', label: 'Waiver claims', noun: 'waiver claim' },
  { key: 'free_agent', label: 'Free agents', noun: 'free-agent pickup' },
  { key: 'drop', label: 'Drops', noun: 'drop' },
]

export const fmt = (n: number) => n.toFixed(1)
export const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`
export const fmtWar = (n: number) => signed(n, 2)
export const wins = (n: number) => `${n.toFixed(2)} ${n === 1 ? 'win' : 'wins'}`
export const tone = (n: number | null) => (n === null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')
export const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

export function Stat({ label, value, sub, valueTone = '' }: { label: string; value: string | number; sub?: string; valueTone?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${valueTone ? ` ${valueTone}` : ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
