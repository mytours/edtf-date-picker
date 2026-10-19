import type { Config } from '../config.js'
import { message, type Message } from '../messages.js'
import { part, type DateParts, type Endpoint, type EventState, type PeriodState } from '../model.js'
import { anyOf, normalise } from './normalise.js'
import { parseSingle, type Single } from './single.js'
import { en } from './vocab/en.js'

export type TextResult<T> =
  { readonly state: T; readonly notes: readonly Message[] } | { readonly error: Message }

const AFTER = new RegExp(`^(?:${anyOf(en.after)}) (.+?)(?: (?:${anyOf(en.onwards)}))?$`)
const ONWARDS = new RegExp(`^(.+?) ?(?:${anyOf(en.onwards)})$`)
const BEFORE = new RegExp(`^(?:${anyOf(en.before)}) (.+)$`)
const RANGE_START = new RegExp(`^(?:${anyOf(en.rangeStart)}) `)
const CONNECTIVE = new RegExp(` (?:${anyOf(en.connectives)}) `)
const PRESENT = new RegExp(`^(?:${anyOf(en.present)})$`)

const DECADE_SPAN = { any: [0, 9], early: [0, 3], mid: [4, 6], late: [7, 9] } as const

/** Year-year ranges and spaced hyphens become " to ", leaving ISO dates alone */
const joinRanges = (t: string): string =>
  t.replace(/^(\d{4}) ?- ?(\d{4})$/, '$1 to $2').replace(/ - /g, ' to ')

/** Splits "a to b" into two sides, or returns null */
function sides(t: string): [string, string] | null {
  const [a, b, ...rest] = joinRanges(t).replace(RANGE_START, '').split(CONNECTIVE)
  return a != null && b != null && rest.length === 0 ? [a, b] : null
}

/** A decade as one year at the start or end of a range */
function decadeYear(s: Single & { kind: 'decade' }, edge: 'start' | 'end'): DateParts {
  const [a, b] = DECADE_SPAN[s.part]
  return { year: part(s.decade + (edge === 'start' ? a : b)) }
}

function asRangeEnd(s: Single, edge: 'start' | 'end'): DateParts | null {
  if (s.kind === 'date') return s.parts
  if (s.kind === 'decade') return decadeYear(s, edge)
  return null
}

const notUnderstood = { error: message('not-understood') } as const

/** Parses an event date typed in words: "about 1965", "late 1940s", "before 1931" */
export function parseText(text: string, config: Config): TextResult<EventState> {
  const t = normalise(text)
  if (!t) return { error: message('empty') }

  const directional = (
    dir: 'before' | 'after',
    side: string | undefined,
  ): TextResult<EventState> | null => {
    const p = side == null ? null : parseSingle(side, config)
    if (!p) return null
    if ('error' in p) return p
    const at = asRangeEnd(p.value, dir === 'before' ? 'end' : 'start')
    return at ? { state: { kind: 'beforeAfter', dir, at }, notes: p.notes } : null
  }
  const after =
    directional('after', AFTER.exec(t)?.[1]) ?? directional('after', ONWARDS.exec(t)?.[1])
  if (after) return after
  const before = directional('before', BEFORE.exec(t)?.[1])
  if (before) return before

  const single = parseSingle(t, config)
  if (single && 'error' in single) return single
  if (single) {
    const v = single.value
    const state: EventState = v.kind === 'date' ? { kind: 'date', parts: v.parts } : v
    return { state, notes: single.notes }
  }

  const pair = sides(t)
  if (pair) {
    const a = parseSingle(pair[0], config)
    const b = parseSingle(pair[1], config)
    if (a && 'error' in a) return a
    if (b && 'error' in b) return b
    const from = a && asRangeEnd(a.value, 'start')
    const to = b && asRangeEnd(b.value, 'end')
    if (a && b && from && to)
      return { state: { kind: 'between', from, to }, notes: [...a.notes, ...b.notes] }
  }
  return notUnderstood
}

function asEndpoint(s: Single, edge: 'start' | 'end'): Endpoint {
  if (s.kind === 'unknown') return { kind: 'unknown' }
  if (s.kind === 'date') return { kind: 'date', parts: s.parts }
  if (s.part === 'any') return { kind: 'decade', decade: s.decade }
  return { kind: 'date', parts: decadeYear(s, edge) }
}

/** Parses one side of a period: a date, "present", or "unknown" */
function parseSide(
  side: string,
  edge: 'start' | 'end',
  config: Config,
): TextResult<Endpoint> | null {
  if (PRESENT.test(side)) return { state: { kind: 'open' }, notes: [] }
  const p = parseSingle(side, config)
  if (!p) return null
  if ('error' in p) return p
  return { state: asEndpoint(p.value, edge), notes: p.notes }
}

/** Parses a period typed in words: "about 1890 to 1905", "June 1975 to present", "since 2004" */
export function parsePeriodText(text: string, config: Config): TextResult<PeriodState> {
  const t = normalise(text)
  if (!t) return { error: message('empty') }

  const build = (
    start: TextResult<Endpoint> | null,
    end: TextResult<Endpoint> | null,
  ): TextResult<PeriodState> | null => {
    if (!start || !end) return null
    if ('error' in start) return start
    if ('error' in end) return end
    return {
      state: { kind: 'period', start: start.state, end: end.state },
      notes: [...start.notes, ...end.notes],
    }
  }
  const open = { state: { kind: 'open' }, notes: [] } as const
  const unknown = { state: { kind: 'unknown' }, notes: [] } as const

  const sinceSide = AFTER.exec(t)?.[1] ?? ONWARDS.exec(t)?.[1]
  const since = sinceSide == null ? null : build(parseSide(sinceSide, 'start', config), open)
  if (since) return since
  const untilSide = BEFORE.exec(t)?.[1]
  const until = untilSide == null ? null : build(unknown, parseSide(untilSide, 'end', config))
  if (until) return until

  const pair = sides(t)
  if (pair) {
    const both = build(parseSide(pair[0], 'start', config), parseSide(pair[1], 'end', config))
    if (both) return both
  }

  // A lone expression: "the 1920s" is the whole decade, a date is both ends
  const p = parseSingle(t, config)
  if (!p) return notUnderstood
  if ('error' in p) return p
  const v = p.value
  if (v.kind === 'decade') {
    const [a, b] = DECADE_SPAN[v.part]
    const start: Endpoint = { kind: 'date', parts: { year: part(v.decade + a) } }
    const end: Endpoint = { kind: 'date', parts: { year: part(v.decade + b) } }
    return { state: { kind: 'period', start, end }, notes: p.notes }
  }
  const e = asEndpoint(v, 'start')
  return { state: { kind: 'period', start: e, end: e }, notes: p.notes }
}
