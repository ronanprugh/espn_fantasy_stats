import { useLayoutEffect, useRef } from 'react'

/**
 * For a row of buttons that scrolls sideways on a phone: keeps the pressed
 * one (`aria-pressed="true"`) in view whenever `deps` change, so a deep link
 * to an option off to the right doesn't leave it hidden. Scrolls the row,
 * not the page: scrollIntoView would also move the window.
 */
export function useActiveInView<T extends HTMLElement>(deps: readonly unknown[]) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const row = ref.current
    const active = row?.querySelector<HTMLElement>('button[aria-pressed="true"]')
    if (!row || !active || row.scrollWidth <= row.clientWidth) return
    const left = active.offsetLeft - row.offsetLeft
    const right = left + active.offsetWidth
    const pad = 12
    if (left < row.scrollLeft + pad) row.scrollLeft = left - pad
    else if (right > row.scrollLeft + row.clientWidth - pad) row.scrollLeft = right - row.clientWidth + pad
    // The caller names what moves the pressed button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}
