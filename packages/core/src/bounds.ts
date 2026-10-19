import { parse, type LeafNode, type ParseResult } from 'edtf'
import { compareIso, daysInMonth, isoDate } from './dates.js'

/** What is known about one end of a value */
export type EndKind = 'date' | 'open' | 'unknown'

export interface Bounds {
  /** Earliest possible day (ISO), or null when there is no lower bound */
  readonly earliest: string | null
  /** Latest possible day (ISO), or null when there is no upper bound */
  readonly latest: string | null
  readonly start: EndKind
  readonly end: EndKind
}

interface Span {
  readonly earliest: string
  readonly latest: string
}

// [first month, last month, years to add to the last month]. 21-24 follow the
// northern hemisphere; ISO 8601-2 doesn't say which hemisphere they mean.
const SEASONS: Readonly<Record<number, readonly [number, number, number]>> = {
  21: [3, 5, 0], // spring
  22: [6, 8, 0], // summer
  23: [9, 11, 0], // autumn
  24: [12, 2, 1], // winter
  25: [3, 5, 0], // northern spring
  26: [6, 8, 0], // northern summer
  27: [9, 11, 0], // northern autumn
  28: [12, 2, 1], // northern winter
  29: [9, 11, 0], // southern spring
  30: [12, 2, 1], // southern summer
  31: [3, 5, 0], // southern autumn
  32: [6, 8, 0], // southern winter
  33: [1, 3, 0], // first quarter
  34: [4, 6, 0], // second quarter
  35: [7, 9, 0], // third quarter
  36: [10, 12, 0], // fourth quarter
  37: [1, 4, 0], // first third
  38: [5, 8, 0], // second third
  39: [9, 12, 0], // last third
  40: [1, 6, 0], // first half
  41: [7, 12, 0], // second half
}

const years = (from: number, to: number): Span => ({
  earliest: isoDate(from, 1, 1),
  latest: isoDate(to, 12, 31),
})

const month = (year: number, m: number): Span => ({
  earliest: isoDate(year, m, 1),
  latest: isoDate(year, m, daysInMonth(year, m)),
})

/** Bits of DateNode.unspecified: one per year digit, then month, then day */
const YEAR_DIGITS = [1, 2, 4, 8] as const
const MONTH_X = 48
const DAY_X = 192

function leafSpan(node: LeafNode): Span | null {
  switch (node.type) {
    case 'Year': {
      const [y] = node.values
      if (!node.significant) return years(y, y)
      const digits = String(Math.abs(y)).length
      const size = 10 ** Math.max(0, digits - node.significant)
      const from = Math.floor(y / size) * size
      return years(from, from + size - 1)
    }
    case 'Decade':
      return years(node.values[0] * 10, node.values[0] * 10 + 9)
    case 'Century':
      return years(node.values[0] * 100, node.values[0] * 100 + 99)
    case 'Season': {
      const [y, code] = node.values
      const s = SEASONS[code]
      if (!s) return years(y, y)
      return {
        earliest: isoDate(y, s[0], 1),
        latest: isoDate(y + s[2], s[1], daysInMonth(y + s[2], s[1])),
      }
    }
    case 'Date': {
      const [y = 0, m0, d] = node.values
      const un = node.unspecified ?? 0
      // The first unspecified year digit sets the span: 189X → 10 years, 18XX → 100
      const firstX = YEAR_DIGITS.findIndex((bit) => (un & bit) !== 0)
      if (firstX === 0) return null
      if (firstX > 0) return years(y, y + 10 ** (4 - firstX) - 1)
      if (m0 == null || un & MONTH_X) return years(y, y)
      if (d == null || un & DAY_X) return month(y, m0 + 1)
      const iso = isoDate(y, m0 + 1, d)
      return { earliest: iso, latest: iso }
    }
  }
}

const min = (a: string, b: string): string => (compareIso(a, b) <= 0 ? a : b)
const max = (a: string, b: string): string => (compareIso(a, b) >= 0 ? a : b)

/** The text either side of the interval's slash: '' is unknown, '..' is open */
function intervalEnd(text: string): EndKind {
  const t = text.trim()
  return t === '' ? 'unknown' : t === '..' ? 'open' : 'date'
}

/** Bounds of an already parsed value. `input` is needed to tell open from unknown interval ends. */
export function boundsOf(tree: ParseResult, input: string): Bounds {
  switch (tree.type) {
    case 'Interval': {
      const slash = input.indexOf('/')
      const startKind = intervalEnd(input.slice(0, slash))
      const endKind = intervalEnd(input.slice(slash + 1))
      const a = tree.values[0] ? leafSpan(tree.values[0]) : null
      const b = tree.values[1] ? leafSpan(tree.values[1]) : null
      return {
        earliest: a?.earliest ?? null,
        latest: b?.latest ?? null,
        start: a ? 'date' : startKind === 'date' ? 'unknown' : startKind,
        end: b ? 'date' : endKind === 'date' ? 'unknown' : endKind,
      }
    }
    case 'Set':
    case 'List': {
      const spans = tree.values
        .flatMap((v) => (Array.isArray(v) ? [leafSpan(v[0]), leafSpan(v[1])] : [leafSpan(v)]))
        .filter((s): s is Span => s != null)
      if (spans.length === 0)
        return { earliest: null, latest: null, start: 'unknown', end: 'unknown' }
      const earliest = spans.map((s) => s.earliest).reduce(min)
      const latest = spans.map((s) => s.latest).reduce(max)
      return {
        earliest: tree.earlier ? null : earliest,
        latest: tree.later ? null : latest,
        start: tree.earlier ? 'open' : 'date',
        end: tree.later ? 'open' : 'date',
      }
    }
    default: {
      const span = leafSpan(tree)
      if (!span) return { earliest: null, latest: null, start: 'unknown', end: 'unknown' }
      return { ...span, start: 'date', end: 'date' }
    }
  }
}

/** Earliest and latest possible days of an EDTF value. Throws if the value isn't valid EDTF. */
export function bounds(value: string): Bounds {
  return boundsOf(parse(value), value)
}
