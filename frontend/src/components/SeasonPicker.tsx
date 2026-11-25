import { useActiveInView } from '../hooks/useActiveInView'

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
  const yearsDesc = [...years].sort((a, b) => b - a)
  const navRef = useActiveInView<HTMLElement>([value, yearsDesc.length])

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
