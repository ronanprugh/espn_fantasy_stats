import { describe, expect, it } from 'vitest'
import { loadSeasons } from './loadSeasons'

describe('loadSeasons', () => {
  it('loads every season, at most `concurrency` at once, in order', async () => {
    let running = 0
    let peak = 0
    const progress: [number, number][] = []
    const out = await loadSeasons(
      [2021, 2022, 2023, 2024, 2025],
      async (y) => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, (2026 - y) * 2))
        running -= 1
        return y * 10
      },
      (done, total) => progress.push([done, total]),
      2,
    )
    expect(out).toEqual([20210, 20220, 20230, 20240, 20250])
    expect(peak).toBe(2)
    expect(progress[0]).toEqual([0, 5])
    expect(progress[progress.length - 1]).toEqual([5, 5])
  })

  it('fails as soon as a season fails', async () => {
    await expect(loadSeasons([1, 2], async (y) => {
      if (y === 2) throw new Error('ESPN down')
      return y
    })).rejects.toThrow('ESPN down')
  })

  it('handles no seasons', async () => {
    expect(await loadSeasons([], async () => 1)).toEqual([])
  })
})
