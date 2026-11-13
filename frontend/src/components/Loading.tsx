import { useEffect, useState, type ReactNode } from 'react'

/** A normal load finishes well inside this; past it, the wait gets explained. */
const SLOW_AFTER_MS = 4000

/**
 * Why a wait can run long. The backend is on Render's free tier, which spins
 * down after 15 idle minutes (the keep-warm cron only covers waking hours), and
 * the first request after that takes up to a minute. An uncached season also
 * means an ESPN fetch. Without this, a bare "Loading…" for a minute looks broken.
 */
export const SLOW_HINT =
  "Still working. If the site hasn't been used for a while, the server takes up to a minute to wake up."

/** True once `active` has stayed true for SLOW_AFTER_MS; resets when it clears. */
export function useSlowHint(active: boolean): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) {
      setSlow(false)
      return
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [active])
  return slow
}

export function SlowHint({ active }: { active: boolean }) {
  return useSlowHint(active) ? (
    <p className="slow-hint" role="status">
      {SLOW_HINT}
    </p>
  ) : null
}

/** Page-level loading placeholder that explains itself if the wait runs long.
 * Pages prefer a shaped placeholder below, so the page doesn't jump when the
 * data lands; this one is for waits with no particular shape. */
export function Loading() {
  return (
    <>
      <p>Loading…</p>
      <SlowHint active />
    </>
  )
}

/*
 * Shaped placeholders: grey blocks the size of what's coming, with a shimmer
 * (stopped under reduced motion, in styles.css). Only the results area is
 * replaced; a page keeps its year, week and team controls on screen.
 *
 * Each is a status region read as "Loading…", with the blocks themselves
 * hidden from screen readers, and the slow-load hint underneath.
 */
export function SkeletonRegion({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`skeleton-wrap ${className}`} role="status" aria-busy="true">
      <span className="visually-hidden">Loading…</span>
      <div aria-hidden="true">{children}</div>
      <SlowHint active />
    </div>
  )
}

/** One shimmering block. `width` is a CSS length; it fills the line by default. */
export function SkeletonBlock({ width, height = 14, className = '' }: { width?: string; height?: number; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ width, height }} />
}

/* Varied cell widths so the rows read as text, not as a grid of bars. */
const CELL_WIDTHS = ['70%', '45%', '55%', '40%', '60%', '50%']

/** A table: a header row and `rows` body rows (about 8 by default). The
 * first column is a team over its owner unless `nameLines` is 1, and
 * `toolbar` adds the line of notes and toggles most tables have above them. */
export function TableSkeleton({
  rows = 8,
  cols = 6,
  nameLines = 2,
  toolbar = false,
}: {
  rows?: number
  cols?: number
  nameLines?: 1 | 2
  toolbar?: boolean
}) {
  return (
    <SkeletonRegion className="table-skeleton">
      {toolbar && (
        <div className="season-history-bar skeleton-toolbar">
          <SkeletonBlock width="180px" height={13} />
          <SkeletonBlock width="100px" height={13} />
        </div>
      )}
      <table className="teams skeleton-table">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c}>
                <SkeletonBlock width={c === 0 ? '60%' : '50%'} height={12} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  {c === 0 ? (
                    <>
                      <SkeletonBlock width="80%" height={15} />
                      {nameLines === 2 && <SkeletonBlock width="50%" height={11} className="skeleton-sub" />}
                    </>
                  ) : (
                    <SkeletonBlock width={CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </SkeletonRegion>
  )
}

/** A grid of cards. `matchup` cards are Scoreboard-shaped (two team lines
 * with scores); `stat` cards are a label over a big number. */
export function CardGridSkeleton({
  count = 6,
  variant = 'matchup',
}: {
  count?: number
  variant?: 'matchup' | 'stat'
}) {
  return (
    <SkeletonRegion className={`card-grid-skeleton ${variant}`}>
      <div className={variant === 'matchup' ? 'scoreboard-list' : 'hub-summary'}>
        {Array.from({ length: count }, (_, i) =>
          variant === 'matchup' ? (
            <div key={i} className="scoreboard-card skeleton-card">
              {[0, 1].map((row) => (
                <div key={row} className="card-row">
                  <div className="team">
                    <SkeletonBlock width={CELL_WIDTHS[(i + row) % CELL_WIDTHS.length]} height={15} />
                    <SkeletonBlock width="35%" height={11} className="skeleton-sub" />
                  </div>
                  <SkeletonBlock width="48px" height={20} />
                </div>
              ))}
            </div>
          ) : (
            <div key={i} className="stat-card skeleton-card">
              <SkeletonBlock width="55%" height={11} />
              <SkeletonBlock width="40%" height={26} className="skeleton-value" />
              <SkeletonBlock width="65%" height={11} />
            </div>
          ),
        )}
      </div>
    </SkeletonRegion>
  )
}

/** A stack of list rows, each a title line over a shorter detail line. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonRegion className="list-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-list-row">
          <SkeletonBlock width={CELL_WIDTHS[i % CELL_WIDTHS.length]} height={15} />
          <SkeletonBlock width="35%" height={11} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** One block of a fixed height, for a chart or a bracket. */
export function BlockSkeleton({ height }: { height: number }) {
  return (
    <SkeletonRegion className="block-skeleton">
      <SkeletonBlock height={height} className="skeleton-panel" />
    </SkeletonRegion>
  )
}
