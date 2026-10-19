import { describe, expect, it } from 'vitest'
import { resolveConfig, type ConfigInput } from '../src/config.js'
import { generate } from '../src/generate.js'
import { part, type DateParts, type Endpoint, type State } from '../src/model.js'

const NOW = new Date(2026, 9, 19, 12)
const cfg = (c: ConfigInput = {}) => resolveConfig({ now: NOW, locale: 'en-NZ', ...c })
const value = (s: State, c?: ConfigInput) => generate(s, cfg(c)).value
const codes = (s: State, c?: ConfigInput) => {
  const r = generate(s, cfg(c))
  return { status: r.status, error: r.error?.code ?? null, warnings: r.warnings.map((w) => w.code) }
}

const ymd = (y: number | null, m?: number | null, d?: number | null): DateParts => ({
  year: part(y),
  ...(m !== undefined ? { month: part(m) } : {}),
  ...(d !== undefined ? { day: part(d) } : {}),
})
const date = (parts: DateParts): State => ({ kind: 'date', parts })

describe('generate: event dates', () => {
  it('writes exact, month and year precision', () => {
    expect(value(date(ymd(1982, 3, 12)))).toBe('1982-03-12')
    expect(value(date(ymd(1975, 6)))).toBe('1975-06')
    expect(value(date(ymd(1965)))).toBe('1965')
    expect(value(date(ymd(800)))).toBe('0800')
  })

  it('writes seasons as 21-24', () => {
    expect(value(date(ymd(1975, 22)))).toBe('1975-22')
  })

  it('uses the trailing form when every known part shares a qualifier', () => {
    const all = (c: 'approximate' | 'uncertain' | 'both') =>
      date({ year: part(1982, c), month: part(3, c), day: part(12, c) })
    expect(value(all('approximate'))).toBe('1982-03-12~')
    expect(value(all('uncertain'))).toBe('1982-03-12?')
    expect(value(all('both'))).toBe('1982-03-12%')
    expect(value(date({ year: part(1965, 'approximate') }))).toBe('1965~')
  })

  it('prefixes each part when qualifiers differ', () => {
    const s = date({ year: part(1982), month: part(3, 'uncertain'), day: part(12, 'approximate') })
    expect(value(s)).toBe('1982-?03-~12')
  })

  it('writes unknown parts as X', () => {
    expect(value(date({ year: part(1982), month: part(3), day: part(null, 'unknown') }))).toBe(
      '1982-03-XX',
    )
    expect(value(date({ year: part(null, 'unknown'), month: part(3), day: part(12) }))).toBe(
      'XXXX-03-12',
    )
    expect(value(date({ year: part(1982), month: part(null, 'unknown'), day: part(12) }))).toBe(
      '1982-XX-12',
    )
  })

  it('drops trailing unknown parts instead of putting a qualifier next to X', () => {
    const s = date({ year: part(1982), month: part(3, 'uncertain'), day: part(null, 'unknown') })
    expect(value(s)).toBe('1982-?03')
  })

  it('drops qualifiers and warns when an inner part is unknown', () => {
    const s = date({ year: part(null, 'unknown'), month: part(3, 'uncertain'), day: part(12) })
    expect(value(s)).toBe('XXXX-03-12')
    expect(codes(s).warnings).toEqual(['qualifier-dropped'])
  })

  it('drops qualifiers on seasons and warns (edtf.js rejects 2001-21~)', () => {
    const s = date({ year: part(1975, 'approximate'), month: part(22, 'approximate') })
    expect(value(s)).toBe('1975-22')
    expect(codes(s).warnings).toEqual(['qualifier-dropped'])
  })

  it('is XXXX when every part is unknown', () => {
    expect(value(date({ year: part(null, 'unknown') }))).toBe('XXXX')
    expect(value({ kind: 'unknown' })).toBe('XXXX')
  })

  it('is incomplete while a part is empty', () => {
    expect(codes(date(ymd(null)))).toEqual({ status: 'incomplete', error: 'missing', warnings: [] })
    expect(generate(date(ymd(1982, null)), cfg()).error?.params).toMatchObject({ part: 'month' })
  })

  it('rejects impossible days (edtf.js accepts 1975-02-29)', () => {
    const r = generate(date(ymd(1975, 2, 29)), cfg())
    expect(r.status).toBe('invalid')
    expect(r.error?.text).toBe('February 1975 only had 28 days.')
    expect(value(date(ymd(1976, 2, 29)))).toBe('1976-02-29')
    expect(value(date({ year: part(null, 'unknown'), month: part(2), day: part(29) }))).toBe(
      'XXXX-02-29',
    )
  })

  it('rejects a season with a day, and bad years and months', () => {
    expect(codes(date(ymd(1975, 22, 3))).error).toBe('season-with-day')
    expect(codes(date({ year: part(null, 'unknown'), month: part(21) })).error).toBe(
      'season-needs-year',
    )
    expect(codes(date(ymd(12345))).error).toBe('invalid-year')
    expect(codes(date(ymd(1975, 13))).error).toBe('invalid-month')
  })
})

describe('generate: decades', () => {
  it('writes a whole decade as 196X', () => {
    expect(value({ kind: 'decade', decade: 1960, part: 'any' })).toBe('196X')
  })

  it('writes early, mid and late as set ranges', () => {
    expect(value({ kind: 'decade', decade: 1960, part: 'early' })).toBe('[1960..1963]')
    expect(value({ kind: 'decade', decade: 1960, part: 'mid' })).toBe('[1964..1966]')
    expect(value({ kind: 'decade', decade: 1960, part: 'late' })).toBe('[1967..1969]')
  })

  it('clips to the configured limits', () => {
    expect(value({ kind: 'decade', decade: 2020, part: 'mid' }, { max: 'today' })).toBe(
      '[2024..2026]',
    )
    expect(value({ kind: 'decade', decade: 2020, part: 'mid' }, { max: 2024 })).toBe('2024')
    expect(codes({ kind: 'decade', decade: 2020, part: 'late' }, { max: 'today' }).error).toBe(
      'outside-limits',
    )
  })

  it('rejects a decade that does not end in 0', () => {
    const r = generate({ kind: 'decade', decade: 1965, part: 'any' }, cfg())
    expect(r.error?.text).toBe('A decade ends in 0, like the 1960s.')
  })
})

describe('generate: between and before/after', () => {
  it('writes a set range', () => {
    expect(value({ kind: 'between', from: ymd(1950), to: ymd(1960) })).toBe('[1950..1960]')
  })

  it('pads both ends to the same precision', () => {
    expect(value({ kind: 'between', from: ymd(1890), to: ymd(2020, 12, 25) })).toBe(
      '[1890-01-01..2020-12-25]',
    )
    expect(value({ kind: 'between', from: ymd(1950, 5), to: ymd(1960) })).toBe('[1950-05..1960-12]')
  })

  it('drops qualifiers in two-ended ranges, which edtf.js rejects', () => {
    const s: State = { kind: 'between', from: { year: part(1890, 'approximate') }, to: ymd(1900) }
    expect(value(s)).toBe('[1890..1900]')
    expect(codes(s).warnings).toEqual(['qualifier-dropped'])
  })

  it('collapses equal ends and rejects reversed ones', () => {
    expect(value({ kind: 'between', from: ymd(1950), to: ymd(1950) })).toBe('1950')
    expect(codes({ kind: 'between', from: ymd(1960), to: ymd(1950) }).error).toBe('from-after-to')
  })

  it('rejects seasons and unknown years at range ends', () => {
    expect(codes({ kind: 'between', from: ymd(1950, 21), to: ymd(1960) }).error).toBe(
      'season-not-allowed',
    )
    expect(
      codes({ kind: 'between', from: { year: part(null, 'unknown') }, to: ymd(1960) }).error,
    ).toBe('missing')
  })

  it('writes before and after as open sets', () => {
    expect(value({ kind: 'beforeAfter', dir: 'before', at: ymd(1931) })).toBe('[..1931]')
    expect(value({ kind: 'beforeAfter', dir: 'after', at: ymd(1950, 5) })).toBe('[1950-05..]')
  })

  it('keeps qualifiers on open sets in the form edtf.js accepts', () => {
    // [..1931~] and [..1931?] are rejected; [..~1931] parses
    const s: State = { kind: 'beforeAfter', dir: 'before', at: { year: part(1931, 'approximate') } }
    expect(value(s)).toBe('[..~1931]')
    expect(codes(s).warnings).toEqual([])
  })
})

describe('generate: periods', () => {
  /** A DateParts, a decade, or an open/unknown end */
  type End = DateParts | number | 'open' | 'unknown'
  const endpoint = (x: End): Endpoint =>
    x === 'open' || x === 'unknown'
      ? { kind: x }
      : typeof x === 'number'
        ? { kind: 'decade', decade: x }
        : { kind: 'date', parts: x }
  const period = (start: End, end: End): State => ({
    kind: 'period',
    start: endpoint(start),
    end: endpoint(end),
  })

  it('writes start/end', () => {
    expect(value(period(ymd(1950), ymd(1960)))).toBe('1950/1960')
    expect(value(period(ymd(1975, 6), ymd(1980, 2, 3)))).toBe('1975-06/1980-02-03')
  })

  it('writes open and unknown ends differently', () => {
    expect(value(period(ymd(1975, 6), 'open'))).toBe('1975-06/..')
    expect(value(period(ymd(1950), 'unknown'))).toBe('1950/')
    expect(value(period('open', ymd(1931)))).toBe('../1931')
    expect(value(period('unknown', ymd(1931)))).toBe('/1931')
  })

  it('writes decade ends as 196X (196/198 does not parse)', () => {
    expect(value(period(1960, 1980))).toBe('196X/198X')
  })

  it('keeps trailing qualifiers when neither end needs prefixes', () => {
    expect(value(period({ year: part(1890, 'approximate') }, ymd(1905)))).toBe('1890~/1905')
  })

  it('writes both ends in prefix form if either needs it', () => {
    // edtf.js rejects 1890~/1905-05-?03
    const end = { year: part(1905), month: part(5), day: part(3, 'uncertain') }
    expect(value(period({ year: part(1890, 'approximate') }, end))).toBe('~1890/1905-05-?03')
  })

  it('needs at least one date, in order', () => {
    expect(codes(period('open', 'unknown')).error).toBe('period-needs-a-date')
    expect(codes(period(ymd(1960), ymd(1950))).error).toBe('end-before-start')
    // edtf.js needs the end to begin after the start begins
    expect(codes(period(ymd(1965, 6), ymd(1965))).error).toBe('end-before-start')
    expect(codes(period(ymd(2090), 2090)).error).toBe('end-before-start')
    expect(value(period(ymd(1965), ymd(1965, 6)))).toBe('1965/1965-06')
  })

  it('names the end in errors', () => {
    const r = generate(period(ymd(1950, 21), ymd(1960)), cfg())
    expect(r.error?.text).toBe('Start: Use a month rather than a season here.')
    const r2 = generate(period(ymd(1950), ymd(null)), cfg())
    expect(r2.status).toBe('incomplete')
    expect(r2.error?.text).toBe('End: Add the year.')
  })
})

describe('generate: config', () => {
  it('rejects dates outside min and max', () => {
    expect(codes(date(ymd(2030)), { max: 'today' }).error).toBe('after-max')
    expect(generate(date(ymd(2030)), cfg({ max: 'today' })).error?.text).toBe(
      'That’s in the future, and this date can’t be.',
    )
    expect(codes(date(ymd(1799)), { min: 1800 }).error).toBe('before-min')
    expect(codes(date(ymd(2026)), { max: 'today' }).status).toBe('valid')
    expect(codes(date(ymd(2026, 12, 1)), { max: 'today' }).error).toBe('after-max')
  })

  it('warns from config rules', () => {
    const c = { warn: [{ before: 1826, message: 'Earlier than the oldest known photograph.' }] }
    const r = generate(date(ymd(1820)), cfg(c))
    expect(r.status).toBe('valid')
    expect(r.warnings.map((w) => w.text)).toEqual(['Earlier than the oldest known photograph.'])
    expect(generate(date(ymd(1826)), cfg(c)).warnings).toEqual([])
  })

  it('enforces maxLevel', () => {
    const s = date({ year: part(1982), month: part(3, 'uncertain'), day: part(12, 'approximate') })
    expect(codes(s, { maxLevel: 1 }).error).toBe('level-too-high')
    expect(codes(date(ymd(1982, 3, 12)), { maxLevel: 0 }).status).toBe('valid')
  })
})

describe('generate: result', () => {
  it('fills in level, bounds, label and caption', () => {
    expect(generate(date({ year: part(1965, 'approximate') }), cfg())).toEqual({
      status: 'valid',
      value: '1965~',
      level: 1,
      label: 'circa 1965',
      caption: 'Roughly then. It could be a little either side.',
      earliest: '1965-01-01',
      latest: '1965-12-31',
      start: 'date',
      end: 'date',
      warnings: [],
      notes: [],
      error: null,
    })
  })

  it('uses term overrides for public wording', () => {
    const c = cfg({
      terms: { approximatePrefix: { day: 'around ', month: 'around ', year: 'around ' } },
    })
    expect(generate(date({ year: part(1965, 'approximate') }), c).label).toBe('around 1965')
  })
})
