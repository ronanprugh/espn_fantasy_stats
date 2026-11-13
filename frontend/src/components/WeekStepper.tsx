import type { KeyboardEvent } from 'react'

/**
 * `‹ Week 10 ›`: previous/next arrows around a compact week menu.
 *
 * The arrows are disabled at the first and last week. With focus anywhere in
 * the control except the menu itself, ← and → step weeks too; the menu keeps
 * the browser's own arrow-key behaviour.
 *
 * `labelOf` names each week in the menu, so playoff weeks can say their round
 * ("Week 15 · Semifinals").
 */
export function WeekStepper({
  weeks,
  value,
  onChange,
  labelOf = (w) => `Week ${w}`,
  id,
}: {
  weeks: readonly number[]
  value: number | null
  onChange: (week: number) => void
  labelOf?: (week: number) => string
  /** For a <label htmlFor> outside the control. */
  id?: string
}) {
  const i = value === null ? -1 : weeks.indexOf(value)
  const prev = i > 0 ? weeks[i - 1] : null
  const next = i >= 0 && i < weeks.length - 1 ? weeks[i + 1] : null

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'SELECT') return
    if (e.key === 'ArrowLeft' && prev !== null) {
      e.preventDefault()
      onChange(prev)
    } else if (e.key === 'ArrowRight' && next !== null) {
      e.preventDefault()
      onChange(next)
    }
  }

  return (
    <div className="week-stepper" role="group" aria-label="Week" onKeyDown={onKeyDown}>
      <button
        type="button"
        className="week-step"
        aria-label={prev !== null ? `Previous week (Week ${prev})` : 'Previous week'}
        disabled={prev === null}
        onClick={() => prev !== null && onChange(prev)}
      >
        ‹
      </button>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => e.target.value && onChange(Number(e.target.value))}
        disabled={!weeks.length}
        aria-label="Week"
      >
        {weeks.map((w) => (
          <option key={w} value={w}>
            {labelOf(w)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="week-step"
        aria-label={next !== null ? `Next week (Week ${next})` : 'Next week'}
        disabled={next === null}
        onClick={() => next !== null && onChange(next)}
      >
        ›
      </button>
    </div>
  )
}
