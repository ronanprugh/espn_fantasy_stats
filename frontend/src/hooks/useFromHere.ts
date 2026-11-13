import { useLocation } from 'react-router-dom'

/** Where a click-through page (Box Score) was opened from: a name for its
 * back link and the exact address, selections included. */
export type From = { label: string; path: string }

/**
 * Router state for a link to Box Score, naming this page: `navigate(url,
 * { state: fromHere })` or `<Link to={url} state={fromHere}>`. It travels with
 * an in-app click only; a pasted URL or a new tab arrives without it, and Box
 * Score falls back to that week's Scoreboard.
 */
export function useFromHere(label: string): { from: From } {
  const { pathname, search } = useLocation()
  return { from: { label, path: pathname + search } }
}

/** The `from` a page was opened with, if any. Router state is untyped (and
 * survives a reload), so it is checked rather than trusted. */
export function readFrom(state: unknown): From | null {
  const f = (state as { from?: unknown } | null)?.from as Partial<From> | undefined
  return f && typeof f.label === 'string' && typeof f.path === 'string' ? (f as From) : null
}
