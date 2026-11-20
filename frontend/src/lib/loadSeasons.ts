/**
 * Loads something for each season a few at a time, reporting progress.
 *
 * "All seasons" views used to ask the server for every season in one
 * request, which on a cold cache meant one request doing every season's
 * ESPN work and running past the hosting proxy's timeout. One request per
 * season keeps each short; two at a time keeps the free-tier backend (and
 * ESPN) from being flooded. Results come back in the order of `years`.
 */
export async function loadSeasons<T>(
  years: readonly number[],
  load: (year: number) => Promise<T>,
  onProgress?: (done: number, total: number) => void,
  concurrency = 2,
): Promise<T[]> {
  const results: T[] = new Array(years.length)
  let next = 0
  let done = 0
  onProgress?.(0, years.length)
  async function worker() {
    while (next < years.length) {
      const i = next++
      results[i] = await load(years[i])
      done += 1
      onProgress?.(done, years.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, years.length) }, worker))
  return results
}
