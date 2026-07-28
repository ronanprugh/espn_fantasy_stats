// WCAG 2.1 contrast math. Pure functions only — no file I/O, no imports from
// the stylesheet. Keeping this module side-effect free is what makes the
// known-value assertions in contrast.test.ts meaningful.

export type Rgb = { r: number; g: number; b: number }
export type Rgba = Rgb & { a: number }

/**
 * Parses the colour notations actually used in styles.css: #rgb, #rrggbb,
 * rgb(...) and rgba(...). Throws on anything else rather than guessing — a
 * silently-wrong colour would produce a plausible ratio and hide a real
 * contrast failure.
 */
export function parseColor(input: string): Rgba {
  const value = input.trim()

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((d) => d + d)
            .join('')
        : digits
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }

  const fn = value.match(/^rgba?\(([^)]+)\)$/i)
  if (fn) {
    const parts = fn[1].split(/[,/]/).map((p) => Number(p.trim()))
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) {
      throw new Error(`Unparseable colour: ${input}`)
    }
    const [r, g, b] = parts
    const a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1
    return { r, g, b, a }
  }

  throw new Error(`Unparseable colour: ${input}`)
}

/**
 * Flattens a translucent colour onto an opaque background.
 *
 * Several tokens (--bg-subtle, --bg-hover, --accent-soft, --bg-row-stripe) are
 * low-alpha rgba(). Computing luminance from their raw channel values ignores
 * the alpha entirely and yields a ratio that has nothing to do with what a user
 * sees, so every translucent token must be composited before measurement.
 */
export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  const a = Math.min(Math.max(fg.a, 0), 1)
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  }
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.1 contrast ratio. Order-independent; result ranges 1:1 to 21:1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Convenience wrapper: resolve two token values against an opaque page
 * background and return their ratio, rounded to two decimals for reporting.
 */
export function ratioBetween(fg: string, bg: string, pageBg: string): number {
  const page = compositeOver(parseColor(pageBg), { r: 255, g: 255, b: 255 })
  const resolvedBg = compositeOver(parseColor(bg), page)
  const resolvedFg = compositeOver(parseColor(fg), resolvedBg)
  return Math.round(contrastRatio(resolvedFg, resolvedBg) * 100) / 100
}
