import { part, type Certainty, type EventState } from 'edtf-input-core'
import { describe, expect, it } from 'vitest'
import { answerOf, controlsFor, EMPTY_CONTROLS, type Controls, type Mode } from '../src/controls.js'

const f = (value: string, certainty: Certainty = 'sure') => ({ value, certainty })

describe('answerOf', () => {
  it('is null until a mode is chosen', () => {
    expect(answerOf(EMPTY_CONTROLS)).toBeNull()
  })

  it('reads exact dates with per-part certainty', () => {
    const c: Controls = {
      ...EMPTY_CONTROLS,
      mode: 'exact',
      exact: { day: f('12', 'approximate'), month: f('3', 'uncertain'), year: f('1982') },
    }
    expect(answerOf(c)).toEqual({
      state: {
        kind: 'date',
        parts: { year: part(1982), month: part(3, 'uncertain'), day: part(12, 'approximate') },
      },
    })
  })

  it('treats "don’t know" parts as unknown whatever the field holds', () => {
    const c: Controls = {
      ...EMPTY_CONTROLS,
      mode: 'exact',
      exact: { day: f('5', 'unknown'), month: f('3'), year: f('1982') },
    }
    expect(answerOf(c)).toMatchObject({
      state: { parts: { day: { value: null, certainty: 'unknown' } } },
    })
  })

  it('reads year mode with and without a month or season', () => {
    const just: Controls = {
      ...EMPTY_CONTROLS,
      mode: 'year',
      year: { month: f(''), year: f('1965', 'approximate') },
    }
    expect(answerOf(just)).toEqual({
      state: { kind: 'date', parts: { year: part(1965, 'approximate') } },
    })
    const season: Controls = { ...just, year: { month: f('22'), year: f('1975') } }
    expect(answerOf(season)).toEqual({
      state: { kind: 'date', parts: { year: part(1975), month: part(22) } },
    })
  })

  it('uses only the filled-in parts of range ends', () => {
    const c: Controls = {
      ...EMPTY_CONTROLS,
      mode: 'between',
      between: {
        from: { day: f(''), month: f(''), year: f('1890') },
        to: { day: f('25'), month: f('12'), year: f('2020') },
      },
    }
    expect(answerOf(c)).toEqual({
      state: {
        kind: 'between',
        from: { year: part(1890) },
        to: { year: part(2020), month: part(12), day: part(25) },
      },
    })
  })

  it('needs a decade before it can check one', () => {
    expect(answerOf({ ...EMPTY_CONTROLS, mode: 'decade' })).toEqual({ missing: 'decade' })
  })

  it('passes text through for the parser', () => {
    expect(answerOf({ ...EMPTY_CONTROLS, mode: 'text', text: 'about 1965' })).toEqual({
      text: 'about 1965',
    })
  })

  it('treats non-numbers as empty', () => {
    const c: Controls = { ...EMPTY_CONTROLS, mode: 'year', year: { month: f(''), year: f('19x5') } }
    expect(answerOf(c)).toEqual({
      state: { kind: 'date', parts: { year: { value: null, certainty: 'sure' } } },
    })
  })
})

describe('controlsFor', () => {
  const cases: [EventState, Mode][] = [
    [
      { kind: 'date', parts: { year: part(1982), month: part(3, 'uncertain'), day: part(12) } },
      'exact',
    ],
    [{ kind: 'date', parts: { year: part(1965, 'approximate') } }, 'year'],
    [{ kind: 'decade', decade: 1960, part: 'late' }, 'decade'],
    [{ kind: 'between', from: { year: part(1950) }, to: { year: part(1960) } }, 'between'],
    [
      { kind: 'beforeAfter', dir: 'after', at: { year: part(1950), month: part(5) } },
      'beforeAfter',
    ],
    [{ kind: 'unknown' }, 'unknown'],
  ]

  it.each(cases)('round-trips %j through the %s controls', (state, mode) => {
    const c = controlsFor(state)
    expect(c.mode).toBe(mode)
    expect(answerOf(c)).toEqual({ state })
  })
})
