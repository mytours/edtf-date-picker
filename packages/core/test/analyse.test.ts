import { describe, expect, it } from 'vitest'
import { analyse } from '../src/analyse.js'
import { resolveConfig, type ConfigInput } from '../src/config.js'

const cfg = (c: ConfigInput = {}) => resolveConfig({ now: new Date(2026, 9, 19, 12), ...c })

describe('analyse', () => {
  it('describes a valid value', () => {
    expect(analyse(' [1667,1668,1670..1672] ', cfg())).toMatchObject({
      status: 'valid',
      value: '[1667,1668,1670..1672]',
      level: 2,
      earliest: '1667-01-01',
      latest: '1672-12-31',
      caption: 'One moment, somewhere in this range.',
    })
  })

  it('points at the character edtf.js rejected', () => {
    const r = analyse('1982-?03-XX', cfg())
    expect(r.status).toBe('invalid')
    expect(r.error?.params).toEqual({ column: 10, character: 'X' })
    expect(r.error?.text).toBe('Character 10, “X”, isn’t expected there.')
  })

  it('falls back to a general message when edtf.js gives no position', () => {
    expect(analyse('2001-21~', cfg()).error?.text).toBe(
      'This looks unfinished, or the parts don’t fit together.',
    )
  })

  it('enforces maxLevel and limits', () => {
    expect(analyse('1982-?03-~12', cfg({ maxLevel: 1 })).error?.code).toBe('level-too-high')
    expect(analyse('2030', cfg({ max: 'today' })).error?.code).toBe('after-max')
    expect(analyse('[..1931]', cfg({ min: 1800 })).status).toBe('valid')
  })

  it('reports intervals edtf.js parses but cannot build', () => {
    expect(analyse('1966/196X', cfg()).error?.code).toBe('end-before-start')
  })

  it('is incomplete when empty', () => {
    expect(analyse('  ', cfg()).status).toBe('incomplete')
  })
})
