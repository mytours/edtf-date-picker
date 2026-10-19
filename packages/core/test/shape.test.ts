import { describe, expect, it } from 'vitest'
import { analyse } from '../src/analyse.js'
import { resolveConfig } from '../src/config.js'

const config = resolveConfig({ now: new Date(2026, 9, 19, 12) })
const shape = (value: string) => {
  const r = analyse(value, config)
  return { shape: r.shape, qualifiers: r.qualifiers }
}
const plain = { approximate: false, uncertain: false }
const approx = { approximate: true, uncertain: false }
const unsure = { approximate: false, uncertain: true }

describe('result shape, for the timeline', () => {
  it.each([
    ['1982-03-12', 'moment', plain, plain],
    ['1965~', 'moment', approx, approx],
    ['1965?', 'moment', unsure, unsure],
    [
      '1982-?03-~12',
      'moment',
      { approximate: true, uncertain: true },
      { approximate: true, uncertain: true },
    ],
    ['196X', 'oneOf', plain, plain],
    ['1950S2', 'oneOf', plain, plain],
    ['[1950..1960]', 'oneOf', plain, plain],
    ['[..~1931]', 'oneOf', approx, approx],
    ['{1960,1961}', 'allOf', plain, plain],
    ['196', 'span', plain, plain],
    ['1890~/1905', 'span', approx, plain],
    ['~1890/1905-05-?03', 'span', approx, unsure],
    ['1950/..', 'span', plain, plain],
  ] as const)('%s is a %s', (value, s, start, end) => {
    expect(shape(value)).toEqual({ shape: s, qualifiers: { start, end } })
  })

  it('has no shape when there is nothing to place', () => {
    expect(shape('XXXX').shape).toBeNull()
    expect(shape('not edtf').shape).toBeNull()
  })
})
