import { useMemo, useRef, type TouchEvent } from 'react'

const MIN_DISTANCE = 50

/**
 * A one-finger sideways swipe: `onSwipe('left')` when the finger moves left
 * (the next thing slides in from the right), `'right'` the other way.
 *
 * It counts only when the movement is mostly horizontal (at least twice as
 * far across as down) and at least 50px, so scrolling the page, or a tap on a
 * card, never reads as a swipe. Touch only: mice and pens use the arrows.
 */
export function useSwipe(onSwipe: (dir: 'left' | 'right') => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const handler = useRef(onSwipe)
  handler.current = onSwipe

  return useMemo(
    () => ({
      onTouchStart: (e: TouchEvent) => {
        start.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
      },
      onTouchEnd: (e: TouchEvent) => {
        const s = start.current
        start.current = null
        const t = e.changedTouches[0]
        if (!s || !t) return
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return
        handler.current(dx < 0 ? 'left' : 'right')
      },
    }),
    [],
  )
}
