import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * A page's selections (year, week, team…) kept in the query string, so they
 * survive a refresh, Back/Forward, and a shared link.
 *
 * `update` takes every change at once on purpose: React Router doesn't queue
 * search-param updates the way useState queues state, so two separate calls
 * in one event (say, a new year and clearing the week) would have the second
 * overwrite the first. A `null` value removes the parameter.
 *
 * Updates replace the current history entry rather than pushing one, so Back
 * leaves the page instead of stepping through every week you looked at.
 */
export function useUrlState(): [URLSearchParams, (changes: Record<string, string | null>) => void] {
  const [params, setParams] = useSearchParams()
  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [params, update]
}

/** A query parameter as a number, or null when absent or not a number. */
export function numberParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key)
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
