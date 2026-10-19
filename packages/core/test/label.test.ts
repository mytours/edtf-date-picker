import { describe, expect, it } from 'vitest'
import { analyse } from '../src/analyse.js'
import { resolveConfig } from '../src/config.js'

const label = (value: string, locale = 'en') => analyse(value, resolveConfig({ locale })).label

describe('labels', () => {
  it('come from edtf-humanize', () => {
    expect(label('1975-07-01')).toBe('July 1, 1975')
    expect(label('1965~')).toBe('circa 1965')
    expect(label('189X')).toBe('1890s (year unknown)')
    expect(label('1950/..')).toBe('since 1950')
    expect(label('1950/')).toBe('1950 to unknown date')
    expect(label('[..1931]')).toBe('on or before 1931')
    expect(label('1970/1980', 'fr-CA')).toBe('De 1970 à 1980')
  })

  it('fall back to English for unsupported languages', () => {
    expect(label('1965~', 'mi')).toBe('circa 1965')
  })

  it('describe set ranges without listing every member (edtf-humanize 0.1.0 does)', () => {
    const start = performance.now()
    expect(label('[1890-01-01..2020-12-25]')).toBe('January 1, 1890 to December 25, 2020')
    expect(performance.now() - start).toBeLessThan(50)
    expect(label('[1950..1960]')).toBe('1950 to 1960')
    expect(label('[1667,1668,1670..1672]')).toBe('1667, 1668 or 1670 to 1672')
    expect(label('{1960,1970..1972}')).toBe('1960 and 1970 to 1972')
    expect(label('[..1760-12-03,1770..1772]')).toBe('on or before December 3, 1760 or 1770 to 1772')
  })
})
