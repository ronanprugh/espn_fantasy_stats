/**
 * The fields our Recharts render callbacks read. Recharts' own prop types
 * are loose (mostly `any`) and vary between versions; these name exactly
 * what each tooltip and dot uses, so callers stay type-checked.
 */

/** What a `<Tooltip content={…}>` renderer reads. `P` is the data row. */
export type TooltipArgs<P = unknown> = {
  active?: boolean
  label?: string | number
  payload?: readonly { payload?: P }[]
}

/** What a `<Line dot={…}>` renderer reads. `P` is the data row. */
export type DotArgs<P> = {
  cx?: number
  cy?: number
  index?: number
  dataKey?: unknown
  payload: P
}
