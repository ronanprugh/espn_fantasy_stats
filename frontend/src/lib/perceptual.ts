// Perceptual colour comparison (CIELAB / LCh).
//
// Distinct from contrast.ts, which implements WCAG contrast ratio. The two
// answer different questions and are not interchangeable:
//
//   - contrast ratio  -> "is this text legible on this background?" (luminance)
//   - hue separation  -> "would someone confuse these two colours?" (chroma)
//
// FR U1-5 requires semantic status tokens to be *distinct from the accent*.
// That is a hue question, not a luminance one: an amber accent and a green
// success token score ~1.1:1 by contrast ratio despite being unmistakable,
// because they sit at similar lightness. Measuring FR U1-5 with contrast ratio
// would force status colours to be far darker or lighter than the accent,
// wrecking a palette where they must read as peers in the same table.

import { parseColor, type Rgb } from './contrast'

export type Lab = { L: number; a: number; b: number }
export type Lch = { L: number; C: number; h: number }

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 }

function toLinear(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const rl = toLinear(r)
  const gl = toLinear(g)
  const bl = toLinear(b)

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65.x
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / D65.y
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65.z

  const delta = 6 / 29
  const f = (t: number) => (t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29)

  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToLch({ L, a, b }: Lab): Lch {
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return { L, C: Math.sqrt(a * a + b * b), h: (h + 360) % 360 }
}

export function toLch(color: string): Lch {
  const { r, g, b } = parseColor(color)
  return labToLch(rgbToLab({ r, g, b }))
}

/** Smallest angular distance between two hues, in degrees (0–180). */
export function hueDifference(colorA: string, colorB: string): number {
  const a = toLch(colorA)
  const b = toLch(colorB)
  const raw = Math.abs(a.h - b.h)
  return Math.round(Math.min(raw, 360 - raw) * 10) / 10
}

/** CIE76 colour difference. Reported alongside hue as a sanity check. */
export function deltaE76(colorA: string, colorB: string): number {
  const a = rgbToLab(parseColor(colorA))
  const b = rgbToLab(parseColor(colorB))
  return (
    Math.round(
      Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2) * 10,
    ) / 10
  )
}
