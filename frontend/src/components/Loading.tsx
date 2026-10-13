import { useEffect, useState } from 'react'

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

/** Page-level loading placeholder that explains itself if the wait runs long. */
export function Loading() {
  return (
    <>
      <p>Loading…</p>
      <SlowHint active />
    </>
  )
}
