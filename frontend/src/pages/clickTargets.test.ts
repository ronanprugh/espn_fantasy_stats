import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Anything you can click has to be a real link or button: reachable with Tab,
 * announced by screen readers, and (for links) openable in a new tab. A `div`
 * or `tr` with an onClick is none of those, so no page may have one.
 *
 * The scan reads each page's source for intrinsic (lower-case) JSX elements
 * carrying onClick, skipping the elements that are interactive themselves.
 * Components (capitalised) are skipped: their onClick is a prop, and the
 * element it lands on is checked where the component is written.
 */

const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'option'])

/** Each JSX opening tag in the source, as [tag name, attribute text, line]. */
function openingTags(source: string): [string, string, number][] {
  const tags: [string, string, number][] = []
  const re = /<([a-z][\w.]*)(?=[\s/>])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    // Walk to the tag's closing `>`, skipping braces and strings, where an
    // arrow function's `=>` or a comparison would otherwise end it early.
    let depth = 0
    let quote: string | null = null
    let i = m.index + m[0].length
    for (; i < source.length; i++) {
      const c = source[i]
      if (quote) {
        if (c === '\\') i++
        else if (c === quote) quote = null
      } else if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    const line = source.slice(0, m.index).split('\n').length
    tags.push([m[1], source.slice(m.index + m[0].length, i), line])
  }
  return tags
}

/** True when onClick is an attribute of this tag itself, not of a nested
 * element inside one of its attribute expressions. */
function hasOwnOnClick(attrs: string): boolean {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < attrs.length; i++) {
    const c = attrs[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && attrs.startsWith('onClick', i) && /[\s{]/.test(attrs[i - 1] ?? ' ')) return true
  }
  return false
}

describe('openingTags', () => {
  it('reads past arrow functions and nested braces', () => {
    const tags = openingTags('<div className="x" onClick={() => go(a > b)}>hi</div><span>')
    expect(tags.map(([t]) => t)).toEqual(['div', 'span'])
    expect(hasOwnOnClick(tags[0][1])).toBe(true)
    expect(hasOwnOnClick(tags[1][1])).toBe(false)
  })
})

describe('pages', () => {
  const dir = __dirname
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))

  it('finds the pages', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('put onClick only on links, buttons and form controls', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const [tag, attrs, line] of openingTags(readFileSync(join(dir, file), 'utf8'))) {
        if (!INTERACTIVE.has(tag) && hasOwnOnClick(attrs)) offenders.push(`${file}:${line} <${tag}>`)
      }
    }
    expect(offenders).toEqual([])
  })
})
