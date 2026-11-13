import { useLayoutEffect, useRef } from 'react'

type Leading<E extends string> = { value: E; label: string }

/**
 * The season choice, the same on every page: a row of year buttons, newest
 * first. On a phone the row scrolls sideways (.years in styles.css), and the
 * selected year is scrolled into view, so a deep link to an old season doesn't
 * leave its button off-screen.
 *
 * `leading` adds options before the years, such as "All Time" on Positional
 * Stats. `value` is null while nothing is chosen yet.
 */
export function SeasonPicker<E extends string = never>({
  years,
  value,
  onChange,
  leading = [],
  label = 'Season',
}: {
  /** Any order; shown newest first. */
  years: readonly number[]
  // NoInfer: E comes from `leading` alone, so a page without extra options
  // gets plain years rather than a widened type.
  value: NoInfer<number | E> | null
  onChange: (value: NoInfer<number | E>) => void
  leading?: readonly Leading<E>[]
  label?: string
}) {
  const navRef = useRef<HTMLElement>(null)
  const yearsDesc = [...years].sort((a, b) => b - a)

  // Scroll the row, not the page: scrollIntoView would also move the window.
  useLayoutEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('button[aria-pressed="true"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const left = active.offsetLeft - nav.offsetLeft
    const right = left + active.offsetWidth
    const pad = 12
    if (left < nav.scrollLeft + pad) nav.scrollLeft = left - pad
    else if (right > nav.scrollLeft + nav.clientWidth - pad) nav.scrollLeft = right - nav.clientWidth + pad
  }, [value, yearsDesc.length])

  const button = (v: number | E, text: string) => {
    const on = v === value
    return (
      <button
        key={String(v)}
        type="button"
        className={on ? 'active' : ''}
        aria-pressed={on}
        onClick={() => onChange(v)}
      >
        {text}
      </button>
    )
  }

  return (
    <nav ref={navRef} className="years season-picker" aria-label={label}>
      {leading.map((o) => button(o.value, o.label))}
      {yearsDesc.map((y) => button(y, String(y)))}
    </nav>
  )
}
