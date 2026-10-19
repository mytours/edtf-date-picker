import { describe, expect, it } from 'vitest'
import { resolveConfig, type ConfigInput } from '../src/config.js'
import { generate } from '../src/generate.js'
import { parsePeriodText, parseText } from '../src/parse/index.js'

const NOW = new Date(2026, 9, 19, 12)
const cfg = (c: ConfigInput = {}) => resolveConfig({ now: NOW, locale: 'en-NZ', ...c })

/** Parses event text and generates EDTF, or returns the error code */
const event = (text: string, c?: ConfigInput) => {
  const config = cfg(c)
  const p = parseText(text, config)
  return 'error' in p ? `error:${p.error.code}` : generate(p.state, config).value
}
const period = (text: string, c?: ConfigInput) => {
  const config = cfg({ semantics: 'period', ...c })
  const p = parsePeriodText(text, config)
  return 'error' in p ? `error:${p.error.code}` : generate(p.state, config).value
}
const notes = (text: string, c?: ConfigInput) => {
  const p = parseText(text, cfg(c))
  return 'error' in p ? [] : p.notes.map((n) => n.text)
}

describe('parseText: single dates', () => {
  it.each([
    ['1965', '1965'],
    ['about 1965', '1965~'],
    ['around 1965', '1965~'],
    ['circa 1965', '1965~'],
    ['c. 1900', '1900~'],
    ['c1900', '1900~'],
    ['ca. 1900', '1900~'],
    ['~1965', '1965~'],
    ['1965-ish', '1965~'],
    ['1965ish', '1965~'],
    ['1965?', '1965?'],
    ['maybe 1965', '1965?'],
    ['probably 1965', '1965?'],
    ['about 1965?', '1965%'],
    ['summer 1975', '1975-22'],
    ['Fall of 1975', '1975-23'],
    ['June 1982?', '1982-06?'],
    ['March 1982', '1982-03'],
    ['sept 1982', '1982-09'],
    ['12 March 1982', '1982-03-12'],
    ['12th of March, 1982', '1982-03-12'],
    ['March 12, 1982', '1982-03-12'],
    ['Mar 12th 1982', '1982-03-12'],
    ['1982-03-12', '1982-03-12'],
    ['1982-03', '1982-03'],
    ['  ABOUT   1965  ', '1965~'],
  ])('%s → %s', (text, edtf) => {
    expect(event(text)).toBe(edtf)
  })
})

describe('parseText: decades', () => {
  it.each([
    ['1960s', '196X'],
    ['the 1960s', '196X'],
    ['early 1960s', '[1960..1963]'],
    ['mid 1960s', '[1964..1966]'],
    ['mid-60s', '[1964..1966]'],
    ['late 1940s', '[1947..1949]'],
    ["'60s", '196X'],
    ['60s', '196X'],
    ['the late 70s', '[1977..1979]'],
  ])('%s → %s', (text, edtf) => {
    expect(event(text)).toBe(edtf)
  })

  it('reads two-digit decades as the most recent allowed one, and says so', () => {
    expect(event('20s')).toBe('202X')
    expect(notes('20s')).toEqual(['We read that as the 2020s. Type “1920s” if you meant that.'])
    expect(event('20s', { max: 2000 })).toBe('192X')
    expect(notes('20s', { max: 2000 })).toEqual([])
    expect(event('60s')).toBe('196X')
    expect(notes('60s')).toEqual(['We read that as the 1960s. Type “2060s” if you meant that.'])
  })

  it('rejects decades that do not end in 0', () => {
    expect(event('1965s')).toBe('error:decade-not-zero')
  })
})

describe('parseText: slash dates', () => {
  it('follows the locale order and says which was assumed', () => {
    expect(event('3/4/1975')).toBe('1975-04-03')
    expect(notes('3/4/1975')).toEqual(['We read this day first: 3 April 1975.'])
    expect(event('3/4/1975', { locale: 'en-US' })).toBe('1975-03-04')
    expect(notes('3/4/1975', { locale: 'en-US' })).toEqual([
      'We read this month first: March 4, 1975.',
    ])
  })

  it('has no note when only one order fits', () => {
    expect(event('25/12/1975')).toBe('1975-12-25')
    expect(notes('25/12/1975')).toEqual([])
  })

  it('rejects slash dates that do not fit the locale order', () => {
    expect(event('12/25/1975')).toBe('error:slash-order-mismatch')
  })
})

describe('parseText: ranges', () => {
  it.each([
    ['between 1950 and 1960', '[1950..1960]'],
    ['1950 to 1960', '[1950..1960]'],
    ['1950-1960', '[1950..1960]'],
    ['1950 – 1960', '[1950..1960]'],
    ['from 1950 to 1960', '[1950..1960]'],
    ['June 1975 to 1980', '[1975-06..1980-12]'],
    ['1960s to 1980s', '[1960..1989]'],
    ['before 1931', '[..1931]'],
    ['until 1931', '[..1931]'],
    ['after 1950', '[1950..]'],
    ['since 1950', '[1950..]'],
    ['1950 onwards', '[1950..]'],
    ['from 1975 onwards', '[1975..]'],
    ['before about 1931', '[..~1931]'],
  ])('%s → %s', (text, edtf) => {
    expect(event(text)).toBe(edtf)
  })
})

describe('parseText: unknown and errors', () => {
  it.each(["don't know", 'Unknown', 'no idea', '?'])('%s → XXXX', (text) => {
    expect(event(text)).toBe('XXXX')
  })

  it.each([
    ['', 'error:empty'],
    ['the day after the war', 'error:not-understood'],
    ['1982-13', 'error:invalid-month'],
  ])('%s → %s', (text, expected) => {
    expect(event(text)).toBe(expected)
  })
})

describe('parsePeriodText', () => {
  it.each([
    ['1950 to 1962', '1950/1962'],
    ['1950-1962', '1950/1962'],
    ['about 1890 to 1905', '1890~/1905'],
    ['June 1975 to present', '1975-06/..'],
    ['1975 to now', '1975/..'],
    ['1960s to 1980s', '196X/198X'],
    ['until 1931', '/1931'],
    ['since 2004', '2004/..'],
    ['from 1975 onwards', '1975/..'],
    ['the 1920s', '1920/1929'],
    ['the late 1920s', '1927/1929'],
    ['1950 to unknown', '1950/'],
    ['1965', '1965'],
  ])('%s → %s', (text, edtf) => {
    expect(period(text)).toBe(edtf)
  })

  it('reports what it could not read', () => {
    expect(period('whenever')).toBe('error:not-understood')
  })
})
