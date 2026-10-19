import { parse } from 'edtf'
import { bounds } from './bounds.js'
import type { Config } from './config.js'
import { compareIso, daysInMonth, isSeason, pad2 } from './dates.js'
import { message, type Message } from './messages.js'
import type { Certainty, DateParts, Endpoint, EventState, PeriodState, State } from './model.js'
import { finish, incomplete, invalid, type Result } from './result.js'

type Kind = 'year' | 'month' | 'day'
type Qualifier = Exclude<Certainty, 'unknown'>

const SUFFIX: Readonly<Record<Qualifier, string>> = {
  sure: '',
  approximate: '~',
  uncertain: '?',
  both: '%',
}
const WIDTH: Readonly<Record<Kind, number>> = { year: 4, month: 2, day: 2 }

/** One date written out, in each form EDTF allows for it */
interface Written {
  /** Trailing qualifier where possible (1982-03-12~), otherwise per-part prefixes */
  readonly natural: string
  /** Per-part prefixes throughout (~1982-~03-~12) */
  readonly prefix: string
  /** No qualifiers at all */
  readonly plain: string
  readonly qualified: boolean
  readonly warnings: readonly Message[]
  /** Known parts, for padding set ends to equal precision */
  readonly year: number | null
  readonly month: number | null
  readonly day: number | null
}

type Outcome<T> = { ok: T } | { result: Result }

const fail = (r: Result): { result: Result } => ({ result: r })

/** The parts that are present, in order */
function kindsOf(parts: DateParts): Kind[] {
  return parts.day ? ['year', 'month', 'day'] : parts.month ? ['year', 'month'] : ['year']
}

/** Validates the parts and writes them out. `end` scopes messages to one end of a period. */
function writeParts(parts: DateParts, end?: 'start' | 'end'): Outcome<Written> | 'all-unknown' {
  const scope = end ? { end } : {}
  const kinds = kindsOf(parts)
  const value: Record<Kind, number | null> = { year: null, month: null, day: null }
  const q: Record<Kind, Qualifier> = { year: 'sure', month: 'sure', day: 'sure' }

  for (const k of kinds) {
    const p = parts[k]
    if (!p || p.certainty === 'unknown') continue
    if (p.value == null) return fail(incomplete(message('missing', { part: k, ...scope })))
    value[k] = p.value
    q[k] = p.certainty
  }

  const { year, month, day } = value
  if (year != null && (!Number.isInteger(year) || year < 0 || year > 9999))
    return fail(invalid(message('invalid-year', scope)))
  if (
    month != null &&
    !(Number.isInteger(month) && ((month >= 1 && month <= 12) || (month >= 21 && month <= 24)))
  )
    return fail(invalid(message('invalid-month', scope)))
  if (month != null && isSeason(month) && kinds.includes('day'))
    return fail(invalid(message('season-with-day', scope)))
  // edtf.js rejects XXXX-21 and 198X-21
  if (month != null && isSeason(month) && year == null)
    return fail(invalid(message('season-needs-year', scope)))
  if (day != null && month != null) {
    // With no year, allow 29 February
    const days = daysInMonth(year ?? 2000, month)
    if (!Number.isInteger(day) || day < 1 || day > days)
      return fail(invalid(message('impossible-day', { day, month, year, days, ...scope })))
  }

  const known = kinds.filter((k) => value[k] != null)
  if (known.length === 0) return 'all-unknown'

  const warnings: Message[] = []
  let out = kinds
  if (known.some((k) => q[k] !== 'sure')) {
    // A qualifier can't sit next to an X part, so drop trailing unknown parts.
    while (out.length > 1 && value[out.at(-1) ?? 'year'] == null) out = out.slice(0, -1)
    const season = month != null && isSeason(month)
    if (season || out.some((k) => value[k] == null)) {
      for (const k of known) q[k] = 'sure'
      out = kinds
      warnings.push(message('qualifier-dropped', { reason: season ? 'season' : 'unknown-part' }))
    }
  }

  const digits = (k: Kind): string => {
    const v = value[k]
    return v == null ? 'X'.repeat(WIDTH[k]) : String(v).padStart(WIDTH[k], '0')
  }
  const plain = out.map(digits).join('-')
  const prefix = out.map((k) => (value[k] == null ? '' : SUFFIX[q[k]]) + digits(k)).join('-')
  const qs = known.filter((k) => out.includes(k)).map((k) => q[k])
  const uniform = qs.every((x) => x === qs[0])
  const allKnown = out.every((k) => value[k] != null)
  const natural = uniform && allKnown ? plain + SUFFIX[qs[0] ?? 'sure'] : prefix

  return {
    ok: {
      natural,
      prefix,
      plain,
      qualified: qs.some((x) => x !== 'sure'),
      warnings,
      year: out.includes('year') ? year : null,
      month: out.includes('month') ? month : null,
      day: out.includes('day') ? day : null,
    },
  }
}

/** Writes an end of a range, period or before/after, where the year must be known and seasons can't be used */
function writeEnd(parts: DateParts, end?: 'start' | 'end'): Outcome<Written> {
  const scope = end ? { end } : {}
  if (parts.year.certainty === 'unknown')
    return fail(invalid(message('missing', { part: 'year', ...scope })))
  const w = writeParts(parts, end)
  if (w === 'all-unknown') return fail(invalid(message('missing', { part: 'year', ...scope })))
  if ('result' in w) return w
  if (w.ok.month != null && isSeason(w.ok.month))
    return fail(invalid(message('season-not-allowed', scope)))
  return w
}

const parses = (value: string): boolean => {
  try {
    parse(value)
    return true
  } catch {
    return false
  }
}

/**
 * Picks the first candidate edtf.js accepts. edtf.js is inconsistent about
 * qualifiers inside sets ([..~1931] parses, [~1890..1900] doesn't), so the
 * fallback is to drop the qualifiers and say so. If nothing parses, the last
 * candidate is returned and finish() reports it as an internal error.
 */
function firstParsing(
  candidates: readonly string[],
  unqualified: string,
  warn: boolean,
): [string, Message[]] {
  for (const c of candidates) if (parses(c)) return [c, []]
  return [unqualified, warn ? [message('qualifier-dropped', { reason: 'not-supported' })] : []]
}

/** Pads a date to day precision, at the start or end of its period */
function padTo(w: Written, precision: number, edge: 'start' | 'end'): string {
  const y = w.year ?? 0
  const m = w.month ?? (edge === 'start' ? 1 : 12)
  const d = w.day ?? (edge === 'start' ? 1 : daysInMonth(y, m))
  return [String(y).padStart(4, '0'), pad2(m), pad2(d)].slice(0, precision).join('-')
}

const precisionOf = (w: Written): number => (w.day != null ? 3 : w.month != null ? 2 : 1)

const internal = (value: string) => message('internal', { value })

function done(value: string, config: Config, warnings: readonly Message[]): Result {
  return finish(value, config, warnings, () => internal(value))
}

const DECADE_PARTS = { any: [0, 9], early: [0, 3], mid: [4, 6], late: [7, 9] } as const

/** The year of an ISO date, which may have an expanded year (-000500-01-01) */
const yearOf = (iso: string | undefined): number | null =>
  iso == null ? null : Number(iso.slice(0, -6))

function generateEvent(state: EventState, config: Config): Result {
  switch (state.kind) {
    case 'unknown':
      return done('XXXX', config, [])

    case 'date': {
      const w = writeParts(state.parts)
      if (w === 'all-unknown') return done('XXXX', config, [])
      if ('result' in w) return w.result
      return done(w.ok.natural, config, w.ok.warnings)
    }

    case 'decade': {
      const d = state.decade
      if (!Number.isInteger(d) || d % 10 !== 0 || d < 0 || d > 9990)
        return invalid(message('decade-not-zero', { suggestion: Math.max(0, d - (d % 10)) }))
      const stem = String(d / 10).padStart(3, '0')
      if (state.part === 'any') return done(`${stem}X`, config, [])
      const [a, b] = DECADE_PARTS[state.part]
      const minY = yearOf(config.min?.iso)
      const maxY = yearOf(config.max?.iso)
      const lo = Math.max(d + a, minY ?? -Infinity)
      const hi = Math.min(d + b, maxY ?? Infinity)
      if (lo > hi) return invalid(message('outside-limits'))
      const y = (n: number) => String(n).padStart(4, '0')
      return done(lo === hi ? y(lo) : `[${y(lo)}..${y(hi)}]`, config, [])
    }

    case 'between': {
      const a = writeEnd(state.from)
      if ('result' in a) return a.result
      const b = writeEnd(state.to)
      if ('result' in b) return b.result
      // Set ranges need both ends at the same precision
      const p = Math.max(precisionOf(a.ok), precisionOf(b.ok))
      const from = padTo(a.ok, p, 'start')
      const to = padTo(b.ok, p, 'end')
      if (compareIso(bounds(from).earliest ?? '', bounds(to).latest ?? '') > 0)
        return invalid(message('from-after-to'))
      if (from === to) return done(a.ok.natural, config, a.ok.warnings)
      const qualified = a.ok.qualified || b.ok.qualified
      const warnings = [...a.ok.warnings, ...b.ok.warnings]
      if (!qualified) return done(`[${from}..${to}]`, config, warnings)
      // Qualifiers only survive when no padding was needed
      const same = precisionOf(a.ok) === precisionOf(b.ok)
      const candidates = same
        ? [`[${a.ok.natural}..${b.ok.natural}]`, `[${a.ok.prefix}..${b.ok.prefix}]`]
        : []
      const [value, extra] = firstParsing(candidates, `[${from}..${to}]`, true)
      return done(value, config, [...warnings, ...extra])
    }

    case 'beforeAfter': {
      const w = writeEnd(state.at)
      if ('result' in w) return w.result
      const wrap = (s: string) => (state.dir === 'before' ? `[..${s}]` : `[${s}..]`)
      const [value, extra] = firstParsing(
        [wrap(w.ok.natural), wrap(w.ok.prefix)],
        wrap(w.ok.plain),
        w.ok.qualified,
      )
      return done(value, config, [...w.ok.warnings, ...extra])
    }
  }
}

type WrittenEnd = { kind: 'date'; w: Written } | { kind: 'open' } | { kind: 'unknown' }

function writeEndpoint(e: Endpoint, end: 'start' | 'end'): Outcome<WrittenEnd> {
  switch (e.kind) {
    case 'open':
    case 'unknown':
      return { ok: { kind: e.kind } }
    case 'decade': {
      const d = e.decade
      if (!Number.isInteger(d) || d % 10 !== 0 || d < 0 || d > 9990)
        return fail(
          invalid(message('decade-not-zero', { suggestion: Math.max(0, d - (d % 10)), end })),
        )
      // A decade can't be an interval end (196/198 doesn't parse), but 196X can
      const text = `${String(d / 10).padStart(3, '0')}X`
      return {
        ok: {
          kind: 'date',
          w: {
            natural: text,
            prefix: text,
            plain: text,
            qualified: false,
            warnings: [],
            year: d,
            month: null,
            day: null,
          },
        },
      }
    }
    case 'date': {
      const w = writeEnd(e.parts, end)
      if ('result' in w) return w
      return { ok: { kind: 'date', w: w.ok } }
    }
  }
}

function generatePeriod(state: PeriodState, config: Config): Result {
  const a = writeEndpoint(state.start, 'start')
  if ('result' in a) return a.result
  const b = writeEndpoint(state.end, 'end')
  if ('result' in b) return b.result
  const s = a.ok
  const e = b.ok
  if (s.kind !== 'date' && e.kind !== 'date') return invalid(message('period-needs-a-date'))

  if (s.kind === 'date' && e.kind === 'date') {
    if (s.w.natural === e.w.natural) return done(s.w.natural, config, s.w.warnings)
    // edtf.js needs the end to start strictly after the start does, so
    // 1965-06/1965 and 1966/196X are rejected even though they overlap
    const startFrom = bounds(s.w.plain).earliest
    const endFrom = bounds(e.w.plain).earliest
    if (startFrom && endFrom && compareIso(startFrom, endFrom) >= 0)
      return invalid(message('end-before-start'))
  }

  const text = (x: WrittenEnd, form: 'natural' | 'prefix' | 'plain'): string =>
    x.kind === 'open' ? '..' : x.kind === 'unknown' ? '' : x.w[form]
  const warnings = [s, e].flatMap((x) => (x.kind === 'date' ? x.w.warnings : []))
  const qualified = [s, e].some((x) => x.kind === 'date' && x.w.qualified)
  // edtf.js rejects a trailing qualifier on one end with prefixes on the other
  // (1890~/1905-05-?03), so if either end needs prefixes, write both that way.
  const needsPrefix = [s, e].some(
    (x) => x.kind === 'date' && x.w.qualified && x.w.natural === x.w.prefix,
  )
  const candidates = needsPrefix
    ? [`${text(s, 'prefix')}/${text(e, 'prefix')}`]
    : [`${text(s, 'natural')}/${text(e, 'natural')}`, `${text(s, 'prefix')}/${text(e, 'prefix')}`]
  const [value, extra] = firstParsing(
    candidates,
    `${text(s, 'plain')}/${text(e, 'plain')}`,
    qualified,
  )
  return done(value, config, [...warnings, ...extra])
}

/** Turns guided UI state into an EDTF value, checked with edtf.js */
export function generate(state: State, config: Config): Result {
  return state.kind === 'period' ? generatePeriod(state, config) : generateEvent(state, config)
}
