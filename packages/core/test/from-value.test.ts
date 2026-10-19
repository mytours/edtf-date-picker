import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { fromValue } from '../src/from-value.js'
import { generate } from '../src/generate.js'
import { part, type State } from '../src/model.js'

const config = resolveConfig({ now: new Date(2026, 9, 19, 12) })
const period = resolveConfig({ now: new Date(2026, 9, 19, 12), semantics: 'period' })

describe('fromValue', () => {
  it.each<[string, State]>([
    ['1982-03-12', { kind: 'date', parts: { year: part(1982), month: part(3), day: part(12) } }],
    ['1965~', { kind: 'date', parts: { year: part(1965, 'approximate') } }],
    [
      '1982-?03-~12',
      {
        kind: 'date',
        parts: { year: part(1982), month: part(3, 'uncertain'), day: part(12, 'approximate') },
      },
    ],
    ['1984-05%', { kind: 'date', parts: { year: part(1984, 'both'), month: part(5, 'both') } }],
    [
      '1982-XX-12',
      { kind: 'date', parts: { year: part(1982), month: part(null, 'unknown'), day: part(12) } },
    ],
    ['1975-22', { kind: 'date', parts: { year: part(1975), month: part(22) } }],
    ['XXXX', { kind: 'unknown' }],
    ['196X', { kind: 'decade', decade: 1960, part: 'any' }],
    ['[1967..1969]', { kind: 'decade', decade: 1960, part: 'late' }],
    ['[1950..1960]', { kind: 'between', from: { year: part(1950) }, to: { year: part(1960) } }],
    [
      '[1950-05..1960-12]',
      {
        kind: 'between',
        from: { year: part(1950), month: part(5) },
        to: { year: part(1960), month: part(12) },
      },
    ],
    ['[..~1931]', { kind: 'beforeAfter', dir: 'before', at: { year: part(1931, 'approximate') } }],
    ['[1950..]', { kind: 'beforeAfter', dir: 'after', at: { year: part(1950) } }],
  ])('%s', (value, state) => {
    expect(fromValue(value, config)).toEqual(state)
  })

  it.each<[string, State]>([
    [
      '1950/1960',
      {
        kind: 'period',
        start: { kind: 'date', parts: { year: part(1950) } },
        end: { kind: 'date', parts: { year: part(1960) } },
      },
    ],
    [
      '1975-06/..',
      {
        kind: 'period',
        start: { kind: 'date', parts: { year: part(1975), month: part(6) } },
        end: { kind: 'open' },
      },
    ],
    [
      '/1931',
      {
        kind: 'period',
        start: { kind: 'unknown' },
        end: { kind: 'date', parts: { year: part(1931) } },
      },
    ],
    [
      '196X/198X',
      {
        kind: 'period',
        start: { kind: 'decade', decade: 1960 },
        end: { kind: 'decade', decade: 1980 },
      },
    ],
    [
      '196X',
      {
        kind: 'period',
        start: { kind: 'decade', decade: 1960 },
        end: { kind: 'decade', decade: 1960 },
      },
    ],
    [
      '1965',
      {
        kind: 'period',
        start: { kind: 'date', parts: { year: part(1965) } },
        end: { kind: 'date', parts: { year: part(1965) } },
      },
    ],
  ])('%s (period)', (value, state) => {
    expect(fromValue(value, period)).toEqual(state)
  })

  it('returns null for values the guided UI cannot show', () => {
    for (const v of [
      '{1960,1961}',
      '[1667,1668]',
      '19',
      '196',
      '1950S2',
      '2001-33',
      'not edtf',
      '',
    ]) {
      expect(fromValue(v, config)).toBeNull()
    }
  })

  it('round-trips everything generate() writes', () => {
    const states: State[] = [
      {
        kind: 'date',
        parts: { year: part(1890, 'uncertain'), month: part(2), day: part(28, 'both') },
      },
      {
        kind: 'between',
        from: { year: part(1890) },
        to: { year: part(2020), month: part(12), day: part(25) },
      },
      { kind: 'decade', decade: 1940, part: 'mid' },
      {
        kind: 'period',
        start: { kind: 'date', parts: { year: part(1890, 'approximate') } },
        end: {
          kind: 'date',
          parts: { year: part(1905), month: part(5), day: part(3, 'uncertain') },
        },
      },
    ]
    for (const s of states) {
      const c = s.kind === 'period' ? period : config
      const value = generate(s, c).value ?? ''
      const back = fromValue(value, c)
      expect(back).not.toBeNull()
      if (back) expect(generate(back, c).value).toBe(value)
    }
  })
})
