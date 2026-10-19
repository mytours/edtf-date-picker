import { describe, expect, it } from 'vitest'
import { ConfigError, resolveConfig } from '../src/config.js'

const now = new Date(2026, 9, 19, 12)

describe('resolveConfig', () => {
  it('has neutral defaults', () => {
    expect(resolveConfig({ now })).toEqual({
      semantics: 'event',
      min: null,
      max: null,
      warn: [],
      maxLevel: 2,
      locale: 'en',
      terms: {},
      now,
      dateOrder: 'mdy',
    })
  })

  it('reads years, ISO dates and today as inclusive limits', () => {
    const c = resolveConfig({ now, min: 1800, max: 'today' })
    expect(c.min).toEqual({ iso: '1800-01-01', label: '1800', today: false })
    expect(c.max).toEqual({ iso: '2026-10-19', label: 'today', today: true })
    expect(resolveConfig({ now, max: '1999' }).max?.iso).toBe('1999-12-31')
    expect(resolveConfig({ now, min: '1826-06-01' }).min?.iso).toBe('1826-06-01')
  })

  it('reads attribute-style strings', () => {
    const c = resolveConfig({ now, min: '', max: '', maxLevel: '1' })
    expect([c.min, c.max, c.maxLevel]).toEqual([null, null, 1])
  })

  it('resolves warning rules', () => {
    const c = resolveConfig({ now, warn: [{ before: 1826, message: 'Too early' }] })
    expect(c.warn).toEqual([{ before: '1826-01-01', after: null, message: 'Too early' }])
  })

  it('takes the slash-date order from the locale', () => {
    expect(resolveConfig({ now, locale: 'en-NZ' }).dateOrder).toBe('dmy')
    expect(resolveConfig({ now, locale: 'en-US' }).dateOrder).toBe('mdy')
    expect(resolveConfig({ now, locale: 'fr' }).dateOrder).toBe('dmy')
  })

  it('rejects bad config', () => {
    expect(() => resolveConfig({ min: 'soon' })).toThrow(ConfigError)
    expect(() => resolveConfig({ min: 2000, max: 1900 })).toThrow('min is later than max')
    expect(() => resolveConfig({ maxLevel: 3 as never })).toThrow(ConfigError)
  })
})
