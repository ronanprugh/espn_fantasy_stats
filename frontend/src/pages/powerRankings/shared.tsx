/** Pieces the Power Rankings views share: cards, blurbs, formatting and sorting. */
import { useState } from 'react'
import { type PowerRankingPostSummary } from '../../api'
import { type SortDir } from '../../components/SortableTh'
import { teamHubHref } from '../../lib/links'
import { type PrOptions } from '../../lib/powerRankings'

export type OpenPost = (postId: number, highlight?: string) => void

/** A team's power rankings on Team Hub. */
export const rankingsHref = (ownerId: string, season?: number) => teamHubHref(ownerId, { year: season, tab: 'power' })

export function OptionToggles({ opts, onChange }: { opts: PrOptions; onChange: (o: PrOptions) => void }) {
  return (
    <div className="pr-options">
      <label className="season-toggle" title="Weeks with no posted rankings take the nearest week's ranks. Leave this off to count only what was actually posted.">
        <input
          type="checkbox"
          checked={opts.includeAssumed}
          onChange={(e) => onChange({ ...opts, includeAssumed: e.target.checked })}
        />
        Count carried-over weeks
      </label>
      <label className="season-toggle" title="Rankings written by someone other than the regular writer.">
        <input
          type="checkbox"
          checked={opts.includeGuest}
          onChange={(e) => onChange({ ...opts, includeGuest: e.target.checked })}
        />
        Count guest editions
      </label>
    </div>
  )
}

export function Blurb({ text, onFull }: { text: string; onFull?: () => void }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 260
  return (
    <div className="pr-blurb">
      <p className={!open && long ? 'clamped' : ''}>{text}</p>
      <div className="pr-blurb-actions">
        {long && (
          <button className="link-btn" onClick={() => setOpen((o) => !o)}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
        {onFull && (
          <button className="link-btn" onClick={onFull}>
            In the full post
          </button>
        )}
      </div>
    </div>
  )
}

export function previewLabel(p: PowerRankingPostSummary): string {
  const t = p.title.toLowerCase()
  if (t.includes('toilet')) return 'Toilet Bowl'
  if (t.includes('bowl') || t.includes('championship')) return 'Final'
  if (t.includes('final four')) return 'Final Four'
  if (t.includes('round 1') || t.includes('first round')) return 'Round 1'
  return 'Preview'
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function Card({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'pos' | 'neg'
  onClick?: () => void
}) {
  const cls = `record-card${accent ? ` ${accent}` : ''}${onClick ? ' clickable' : ''}`
  const inner = (
    <>
      <div className="record-label">{label}</div>
      <div className="record-value">{value}</div>
      {sub && <div className="record-sub">{sub}</div>}
    </>
  )
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export const fmt = (x: number | null, digits = 2) => (x == null ? '—' : x.toFixed(digits))

/** Sort with missing values always last, whichever the direction. */
export function sortRows<T>(rows: T[], get: (r: T) => number | string | null, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    if (va == null || vb == null) return va === vb ? 0 : va == null ? 1 : -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return dir === 'asc' ? cmp : -cmp
  })
}
