import type { Config } from '../config.js'
import { compareIso, isoDate } from '../dates.js'
import { message, type Message } from '../messages.js'
import { part, type Certainty, type DateParts, type DecadePart } from '../model.js'
import { anyOf } from './normalise.js'
import { en } from './vocab/en.js'

/** One date expression: a date, a decade, or "don't know" */
export type Single =
  | { readonly kind: 'date'; readonly parts: DateParts }
  | { readonly kind: 'decade'; readonly decade: number; readonly part: DecadePart }
  | { readonly kind: 'unknown' }

/** null means "not a single date expression"; the caller may try other forms */
export type Parsed<T> =
  { readonly value: T; readonly notes: readonly Message[] } | { readonly error: Message } | null

const APPROX_BEFORE = new RegExp(`^(?:${anyOf(en.approximateBefore)})(?:\\s+|(?=\\d))`)
const APPROX_AFTER = new RegExp(`(?:${anyOf(en.approximateAfter)})$`)
const UNCERTAIN_WORDS = new RegExp(`\\b(?:${anyOf(en.uncertainWords)})\\b`, 'g')
const UNKNOWN = new RegExp(`^(?:${anyOf(en.unknown)})$`)
const SEASON = new RegExp(`^(${anyOf(Object.keys(en.seasons))})(?: of)? (\\d{4})$`)
const DECADE = new RegExp(
  `^(?:the )?(?:(${anyOf(Object.keys(en.decadeParts))})[ -]?)?(?:the )?(\\d{4}|'?\\d{2})'?s$`,
)

/** Strips qualifier words and returns how sure the text is */
export function qualifiers(text: string): { text: string; certainty: Certainty } {
  let t = text
  let uncertain = false
  let approximate = false
  if (/\?+$/.test(t) || new RegExp(UNCERTAIN_WORDS.source).test(t)) {
    uncertain = true
    t = t.replace(/\?+$/, '').replace(UNCERTAIN_WORDS, '').replace(/\s+/g, ' ').trim()
  }
  if (APPROX_BEFORE.test(t)) {
    approximate = true
    t = t.replace(APPROX_BEFORE, '').trim()
  }
  if (APPROX_AFTER.test(t)) {
    approximate = true
    t = t.replace(APPROX_AFTER, '').trim()
  }
  const certainty =
    approximate && uncertain
      ? 'both'
      : approximate
        ? 'approximate'
        : uncertain
          ? 'uncertain'
          : 'sure'
  return { text: t, certainty }
}

/** 1-12 for a month name or abbreviation of at least three letters, else 0 */
export function monthNumber(word: string): number {
  if (word.length < 3) return 0
  return en.months.findIndex((m) => m.startsWith(word)) + 1
}

/** '60s → the most recent allowed decade ending in 60, with a note naming the other */
function twoDigitDecade(n: number, config: Config): { decade: number; notes: Message[] } {
  const allowed = (d: number) =>
    (!config.min || compareIso(isoDate(d + 9, 12, 31), config.min.iso) >= 0) &&
    (!config.max || compareIso(isoDate(d, 1, 1), config.max.iso) <= 0)
  const options = [1900 + n, 2000 + n].filter(allowed)
  if (options.length === 0) return { decade: 1900 + n, notes: [] }
  const thisYear = config.now.getFullYear()
  const past = options.filter((d) => d <= thisYear)
  const decade = past.at(-1) ?? options[0] ?? 1900 + n
  const other = options.find((d) => d !== decade)
  return {
    decade,
    notes: other == null ? [] : [message('two-digit-decade', { decade, alternative: other })],
  }
}

const withCertainty = (parts: DateParts, c: Certainty): DateParts => ({
  year: { ...parts.year, certainty: c },
  ...(parts.month ? { month: { ...parts.month, certainty: c } } : {}),
  ...(parts.day ? { day: { ...parts.day, certainty: c } } : {}),
})

const date = (year: number, month?: number, day?: number): DateParts => ({
  year: part(year),
  ...(month != null ? { month: part(month) } : {}),
  ...(day != null ? { day: part(day) } : {}),
})

const formatDay = (locale: string, year: number, month: number, day: number): string =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))

/** Parses one date expression, with its qualifiers */
export function parseSingle(raw: string, config: Config): Parsed<Single> {
  if (UNKNOWN.test(raw)) return { value: { kind: 'unknown' }, notes: [] }
  const { text: t, certainty } = qualifiers(raw)
  const ok = (parts: DateParts, notes: Message[] = []) => ({
    value: { kind: 'date' as const, parts: withCertainty(parts, certainty) },
    notes,
  })
  let m: RegExpExecArray | null

  if ((m = DECADE.exec(t))) {
    const decadePart = m[1] ? (en.decadeParts[m[1]] ?? 'any') : 'any'
    const digits = (m[2] ?? '').replace("'", '')
    let decade = Number(digits)
    let notes: Message[] = []
    if (digits.length === 2) ({ decade, notes } = twoDigitDecade(decade, config))
    if (decade % 10 !== 0)
      return { error: message('decade-not-zero', { suggestion: decade - (decade % 10) }) }
    return { value: { kind: 'decade', decade, part: decadePart }, notes }
  }

  if ((m = SEASON.exec(t))) return ok(date(Number(m[2]), en.seasons[m[1] ?? '']))

  // 12 March 1982, 12th of March, 1982
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)\.?,? (\d{4})$/.exec(t))) {
    const month = monthNumber(m[2] ?? '')
    if (month) return ok(date(Number(m[3]), month, Number(m[1])))
  }
  // March 12, 1982
  if ((m = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(t))) {
    const month = monthNumber(m[1] ?? '')
    if (month) return ok(date(Number(m[3]), month, Number(m[2])))
  }
  // March 1982, March of 1982
  if ((m = /^([a-z]+)\.?,?(?: of)? (\d{4})$/.exec(t))) {
    const month = monthNumber(m[1] ?? '')
    if (month) return ok(date(Number(m[2]), month))
  }
  // 1982-03-12, 1982-03
  if ((m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t))) {
    const month = Number(m[2])
    if (month < 1 || month > 12) return { error: message('invalid-month') }
    return ok(date(Number(m[1]), month, m[3] ? Number(m[3]) : undefined))
  }
  // 3/4/1975 or 3.4.1975, in the locale's order
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t))) {
    const first = Number(m[1])
    const second = Number(m[2])
    const year = Number(m[3])
    const [day, month] = config.dateOrder === 'mdy' ? [second, first] : [first, second]
    if (month < 1 || month > 12)
      return { error: message('slash-order-mismatch', { order: config.dateOrder }) }
    const ambiguous = first <= 12 && second <= 12 && first !== second
    const notes = ambiguous
      ? [
          message('slash-order-assumed', {
            order: config.dateOrder,
            date: formatDay(config.locale, year, month, day),
          }),
        ]
      : []
    return ok(date(year, month, day), notes)
  }
  if (/^\d{4}$/.test(t)) return ok(date(Number(t)))

  return null
}
