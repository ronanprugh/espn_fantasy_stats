import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from this file's own location, not process.cwd(), so the suite
// passes regardless of the directory Vitest is invoked from.
const STYLESHEET_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../styles.css')

export type TokenMap = Record<string, string>

export type ThemeTokens = {
  light: TokenMap
  dark: TokenMap
}

export function readStylesheet(): string {
  return readFileSync(STYLESHEET_PATH, 'utf8')
}

/**
 * Returns the body of the first rule matching `selector`.
 *
 * Both token blocks are flat — no nested braces — so matching to the first
 * closing brace is sufficient here. Throws if the selector is missing so a
 * renamed or deleted block fails loudly instead of yielding an empty token map
 * that would make every downstream assertion vacuously pass.
 */
function extractBlock(css: string, selector: string): string {
  const selectorIndex = css.indexOf(selector)
  if (selectorIndex === -1) {
    throw new Error(`Selector not found in styles.css: ${selector}`)
  }
  const open = css.indexOf('{', selectorIndex)
  const close = css.indexOf('}', open)
  if (open === -1 || close === -1) {
    throw new Error(`Malformed block for selector: ${selector}`)
  }
  return css.slice(open + 1, close)
}

/** Extracts `--name: value` declarations, ignoring non-custom properties. */
export function parseCustomProperties(block: string): TokenMap {
  const tokens: TokenMap = {}
  const declaration = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let match: RegExpExecArray | null
  while ((match = declaration.exec(block)) !== null) {
    tokens[match[1]] = match[2].trim()
  }
  return tokens
}

/** Parses both theme blocks out of the real stylesheet. */
export function parseThemeTokens(css: string = readStylesheet()): ThemeTokens {
  return {
    light: parseCustomProperties(extractBlock(css, ':root')),
    dark: parseCustomProperties(extractBlock(css, '[data-theme="dark"]')),
  }
}

/** Sorted list of every custom-property name defined across both themes. */
export function tokenNames(tokens: ThemeTokens): string[] {
  return [...new Set([...Object.keys(tokens.light), ...Object.keys(tokens.dark)])].sort()
}
