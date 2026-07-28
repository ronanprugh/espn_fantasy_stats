import { useEffect, useState } from 'react'

/* 900px is the shell's breakpoint (see styles.css). Pages that need a different
 * *structure* on a phone — not just different spacing — have to know about it in
 * JS, because CSS alone cannot interleave two lineup tables into one, or hand a
 * shorter height to Recharts' ResponsiveContainer.
 *
 * The query string is duplicated from the stylesheet by necessity; keeping the
 * single constant here is the closest thing to one definition of "mobile". */
export const MOBILE_QUERY = '(max-width: 900px)'

export function useIsMobile(query: string = MOBILE_QUERY): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
