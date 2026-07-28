import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseThemeTokens, readStylesheet, tokenNames } from './parseTokens'

const FIXTURE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'token-names.fixture.txt')

/**
 * Token names deliberately introduced after the fixture was captured.
 *
 * Additions are allowed; renames and removals are not. Every entry here should
 * correspond to a task in the spec's task list, so that an accidental rename
 * (which shows up as one removal plus one unexpected addition) cannot be waved
 * through by simply appending to this list.
 */
const ALLOWED_ADDITIONS: string[] = [
  '--font-numeric', // task 3.1 — condensed tabular numerals (FR U1-4)
]

function readFixture(): string[] {
  return readFileSync(FIXTURE_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

describe('token-name stability (FR U1-1)', () => {
  const tokens = parseThemeTokens()
  const current = tokenNames(tokens)
  const fixture = readFixture()

  it('parses both theme blocks', () => {
    expect(Object.keys(tokens.light).length).toBeGreaterThan(0)
    expect(Object.keys(tokens.dark).length).toBeGreaterThan(0)
  })

  // The core constraint of the whole spec: every page styles through these
  // names, so a rename converts a token retarget into an app-wide refactor.
  it('never drops or renames a token that existed before the retarget', () => {
    const missing = fixture.filter((name) => !current.includes(name))
    expect(missing).toEqual([])
  })

  it('only introduces additions that were declared deliberate', () => {
    const added = current.filter((name) => !fixture.includes(name))
    expect(added.sort()).toEqual([...ALLOWED_ADDITIONS].sort())
  })

  /**
   * FR U2-5: full-height layout uses small-viewport units.
   *
   * `100vh` on a mobile browser is the height with the toolbars *hidden*, so a
   * `100vh` pane is taller than the visible area whenever they are shown and
   * the bottom of the layout is clipped. `svh` is the smallest viewport height
   * and always fits. `dvh` is deliberately not used: it recalculates during
   * scroll and causes visible jitter.
   */
  it('uses small-viewport units, not vh, for full-height layout', () => {
    const css = readStylesheet()
    const offenders = css
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\b\d+vh\b/.test(line) && !line.startsWith('*'))
    expect(offenders).toEqual([])
  })

  it('defines the same token names in both themes', () => {
    const lightOnly = Object.keys(tokens.light).filter((n) => !(n in tokens.dark))
    const darkOnly = Object.keys(tokens.dark).filter((n) => !(n in tokens.light))
    // --font-numeric and the base font stack live only on :root by design;
    // colour tokens must be paired.
    const colourLightOnly = lightOnly.filter((n) => !n.startsWith('--font'))
    expect(colourLightOnly).toEqual([])
    expect(darkOnly).toEqual([])
  })
})
