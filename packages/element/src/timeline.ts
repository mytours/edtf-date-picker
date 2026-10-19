import type { Result } from 'edtf-input-core'

/** Positions are percentages of the axis width */
export interface Tick {
  readonly at: number
  readonly label: string
}

export interface Mark {
  readonly from: number
  readonly to: number
  /** hatched: one moment somewhere in here; solid: the whole of it */
  readonly fill: 'solid' | 'hatched'
  /** Too narrow to show as a bar */
  readonly point: boolean
  /** Per end: soft edges for approximate, dashed for uncertain or unknown, fade for open */
  readonly start: EndStyle
  readonly end: EndStyle
}

export type EndStyle = 'sharp' | 'soft' | 'dashed' | 'fade'

export interface Timeline {
  readonly ticks: readonly Tick[]
  readonly mark: Mark
  /** A "?" where an end is known to exist but not when */
  readonly unknownAt: readonly number[]
}

/** Hide the timeline for spans longer than this, where it says nothing useful */
export const MAX_YEARS = 5000

/** Context drawn beyond a known end when the other end is open or unknown */
const OPEN_CONTEXT_YEARS = 25

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
const MAX_TICKS = 6
/** Leave out ticks this close (in percent) to either end */
const EDGE = 4

/** An ISO day as a fractional year; `end` gives the moment the day finishes */
function yearOf(iso: string, end: boolean): number {
  const m = /^([+-]?\d+)-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return Number.NaN
  const year = Number(m[1])
  const start = Date.UTC(2000, 0, 1)
  const d = new Date(start)
  d.setUTCFullYear(year, Number(m[2]) - 1, Number(m[3]) + (end ? 1 : 0))
  const yearStart = new Date(start)
  yearStart.setUTCFullYear(year, 0, 1)
  const nextYear = new Date(start)
  nextYear.setUTCFullYear(year + 1, 0, 1)
  return year + (d.getTime() - yearStart.getTime()) / (nextYear.getTime() - yearStart.getTime())
}

export const yearLabel = (year: number): string =>
  year < 1 ? `${String(1 - year)} BCE` : String(year)

function endStyle(kind: Result['start'], approximate: boolean, uncertain: boolean): EndStyle {
  if (kind === 'open') return 'fade'
  if (kind === 'unknown' || uncertain) return 'dashed'
  return approximate ? 'soft' : 'sharp'
}

/** Where to draw a result, or null when there's nothing to place */
export function timeline(r: Result): Timeline | null {
  if (r.status !== 'valid' || r.shape == null || r.qualifiers == null) return null
  let lo = r.earliest == null ? null : yearOf(r.earliest, false)
  let hi = r.latest == null ? null : yearOf(r.latest, true)
  if (lo == null && hi == null) return null
  if (lo == null && hi != null) lo = hi - OPEN_CONTEXT_YEARS
  if (hi == null && lo != null) hi = lo + OPEN_CONTEXT_YEARS
  if (lo == null || hi == null || Number.isNaN(lo) || Number.isNaN(hi)) return null
  const width = hi - lo
  if (width > MAX_YEARS) return null

  const pad = Math.max(width * 0.25, 1)
  const viewLo = lo - pad
  const viewHi = hi + pad
  const span = viewHi - viewLo
  const pct = (y: number) => ((y - viewLo) / span) * 100

  const step = STEPS.find((s) => span / s <= MAX_TICKS) ?? 10_000
  const ticks: Tick[] = []
  for (let y = Math.ceil(viewLo / step) * step; y <= viewHi; y += step) {
    // Labels right at the edges would be cut off
    const at = pct(y)
    if (at >= EDGE && at <= 100 - EDGE) ticks.push({ at, label: yearLabel(y) })
  }

  const from = pct(lo)
  const to = pct(hi)
  const q = r.qualifiers
  const unknownAt = [...(r.start === 'unknown' ? [from] : []), ...(r.end === 'unknown' ? [to] : [])]
  return {
    ticks,
    unknownAt,
    mark: {
      from,
      to,
      fill: r.shape === 'oneOf' ? 'hatched' : 'solid',
      point: to - from < 2,
      start: endStyle(r.start, q.start.approximate, q.start.uncertain),
      end: endStyle(r.end, q.end.approximate, q.end.uncertain),
    },
  }
}
