import { parse } from 'edtf'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { compareIso } from '../src/dates.js'
import { generate } from '../src/generate.js'
import type { Certainty, DateParts, Endpoint, State } from '../src/model.js'

const config = resolveConfig({ now: new Date(2026, 9, 19, 12) })

const certainty = fc.constantFrom<Certainty>('sure', 'approximate', 'uncertain', 'both', 'unknown')
const knownCertainty = fc.constantFrom<Certainty>('sure', 'approximate', 'uncertain', 'both')
const year = fc.integer({ min: 1, max: 2100 })

const dateParts: fc.Arbitrary<DateParts> = fc.oneof(
  fc.record({ year: fc.record({ value: year, certainty }) }),
  fc.record({
    year: fc.record({ value: year, certainty }),
    month: fc.record({
      value: fc.oneof(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 21, max: 24 })),
      certainty,
    }),
  }),
  fc.record({
    year: fc.record({ value: year, certainty }),
    month: fc.record({ value: fc.integer({ min: 1, max: 12 }), certainty }),
    day: fc.record({ value: fc.integer({ min: 1, max: 31 }), certainty }),
  }),
)

/** Range ends need a known year */
const endParts: fc.Arbitrary<DateParts> = dateParts.map((p) => ({
  ...p,
  year: {
    value: p.year.value,
    certainty: p.year.certainty === 'unknown' ? 'sure' : p.year.certainty,
  },
}))

const decade = fc.integer({ min: 100, max: 210 }).map((d) => d * 10)

const endpoint: fc.Arbitrary<Endpoint> = fc.oneof(
  endParts.map((parts) => ({ kind: 'date' as const, parts })),
  decade.map((d) => ({ kind: 'decade' as const, decade: d })),
  fc.constant({ kind: 'open' as const }),
  fc.constant({ kind: 'unknown' as const }),
)

const state: fc.Arbitrary<State> = fc.oneof(
  dateParts.map((parts) => ({ kind: 'date' as const, parts })),
  fc.record({
    kind: fc.constant('decade' as const),
    decade,
    part: fc.constantFrom('any' as const, 'early' as const, 'mid' as const, 'late' as const),
  }),
  fc.record({ kind: fc.constant('between' as const), from: endParts, to: endParts }),
  fc.record({
    kind: fc.constant('beforeAfter' as const),
    dir: fc.constantFrom('before' as const, 'after' as const),
    at: endParts,
  }),
  fc.constant({ kind: 'unknown' as const }),
  fc.record({ kind: fc.constant('period' as const), start: endpoint, end: endpoint }),
)

describe('generate (property)', () => {
  it('never emits a value edtf.js rejects', () => {
    fc.assert(
      fc.property(state, (s) => {
        const r = generate(s, config)
        expect(r.error?.code).not.toBe('internal')
        if (r.status === 'valid') {
          expect(() => parse(r.value ?? '')).not.toThrow()
          if (r.earliest && r.latest)
            expect(compareIso(r.earliest, r.latest)).toBeLessThanOrEqual(0)
        }
      }),
      { numRuns: 5000 },
    )
  })

  it('makes valid values from sure, known parts', () => {
    const sure = (p: DateParts): DateParts => ({
      year: { value: p.year.value, certainty: 'sure' },
      ...(p.month ? { month: { value: p.month.value, certainty: 'sure' } } : {}),
      ...(p.day ? { day: { value: Math.min(p.day.value ?? 1, 28), certainty: 'sure' } } : {}),
    })
    fc.assert(
      fc.property(
        dateParts.filter((p) => !(p.day && (p.month?.value ?? 0) > 20)),
        (p) => {
          expect(generate({ kind: 'date', parts: sure(p) }, config).status).toBe('valid')
        },
      ),
    )
  })

  it('keeps per-part qualifiers wherever edtf.js allows them', () => {
    fc.assert(
      fc.property(
        year,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        knownCertainty,
        knownCertainty,
        knownCertainty,
        (y, m, d, a, b, c) => {
          const r = generate(
            {
              kind: 'date',
              parts: {
                year: { value: y, certainty: a },
                month: { value: m, certainty: b },
                day: { value: d, certainty: c },
              },
            },
            config,
          )
          expect(r.status).toBe('valid')
          expect(r.warnings).toEqual([])
        },
      ),
    )
  })
})
