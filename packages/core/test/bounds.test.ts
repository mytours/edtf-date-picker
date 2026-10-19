import { describe, expect, it } from 'vitest'
import { bounds } from '../src/bounds.js'

const span = (value: string) => {
  const b = bounds(value)
  return [b.earliest, b.latest]
}

describe('bounds', () => {
  it.each([
    ['1982-03-12', '1982-03-12', '1982-03-12'],
    ['1982-03', '1982-03-01', '1982-03-31'],
    ['1976-02', '1976-02-01', '1976-02-29'],
    ['1982', '1982-01-01', '1982-12-31'],
    ['1982-03-12~', '1982-03-12', '1982-03-12'],
    ['1982-?03-~12', '1982-03-12', '1982-03-12'],
    ['189X', '1890-01-01', '1899-12-31'],
    ['18XX', '1800-01-01', '1899-12-31'],
    ['1XXX', '1000-01-01', '1999-12-31'],
    ['198X-05', '1980-01-01', '1989-12-31'],
    ['1982-XX-12', '1982-01-01', '1982-12-31'],
    ['1982-03-XX', '1982-03-01', '1982-03-31'],
    ['196', '1960-01-01', '1969-12-31'],
    ['19', '1900-01-01', '1999-12-31'],
    ['1950S2', '1900-01-01', '1999-12-31'],
    ['-0500', '-000500-01-01', '-000500-12-31'],
    ['Y170000002', '+170000002-01-01', '+170000002-12-31'],
  ])('%s → %s to %s', (value, earliest, latest) => {
    expect(span(value)).toEqual([earliest, latest])
  })

  describe('seasons (edtf.js gives 25 and 33 the same range)', () => {
    it.each([
      ['2001-21', '2001-03-01', '2001-05-31'],
      ['2001-24', '2001-12-01', '2002-02-28'],
      ['2001-25', '2001-03-01', '2001-05-31'],
      ['2001-29', '2001-09-01', '2001-11-30'],
      ['2001-30', '2001-12-01', '2002-02-28'],
      ['2001-33', '2001-01-01', '2001-03-31'],
      ['2001-36', '2001-10-01', '2001-12-31'],
      ['2001-38', '2001-05-01', '2001-08-31'],
      ['2001-41', '2001-07-01', '2001-12-31'],
    ])('%s → %s to %s', (value, earliest, latest) => {
      expect(span(value)).toEqual([earliest, latest])
    })
  })

  describe('sets and lists (edtf.js takes max from the first member)', () => {
    it.each([
      ['[1667..1672]', '1667-01-01', '1672-12-31'],
      ['[1890-01-01..2020-12-25]', '1890-01-01', '2020-12-25'],
      ['[1667,1668,1670..1672]', '1667-01-01', '1672-12-31'],
      ['{1960,1961-12}', '1960-01-01', '1961-12-31'],
      ['[1672,1667]', '1667-01-01', '1672-12-31'],
    ])('%s → %s to %s', (value, earliest, latest) => {
      expect(span(value)).toEqual([earliest, latest])
    })

    it('marks earlier and later as open', () => {
      expect(bounds('[..1931]')).toEqual({
        earliest: null,
        latest: '1931-12-31',
        start: 'open',
        end: 'date',
      })
      expect(bounds('[1950..]')).toEqual({
        earliest: '1950-01-01',
        latest: null,
        start: 'date',
        end: 'open',
      })
    })
  })

  describe('intervals', () => {
    it('spans from the start of the first end to the end of the second', () => {
      expect(bounds('1950/1960-06')).toEqual({
        earliest: '1950-01-01',
        latest: '1960-06-30',
        start: 'date',
        end: 'date',
      })
    })

    it('tells open ends from unknown ends (edtf.js gives null for both)', () => {
      expect(bounds('1950/..')).toMatchObject({ latest: null, end: 'open' })
      expect(bounds('1950/')).toMatchObject({ latest: null, end: 'unknown' })
      expect(bounds('../1950')).toMatchObject({ earliest: null, start: 'open' })
      expect(bounds('/1950')).toMatchObject({ earliest: null, start: 'unknown' })
    })

    it('treats an XXXX end as unknown', () => {
      expect(bounds('XXXX/1950')).toMatchObject({ earliest: null, start: 'unknown' })
    })
  })

  it('has no bounds for a fully unknown date', () => {
    expect(bounds('XXXX')).toEqual({
      earliest: null,
      latest: null,
      start: 'unknown',
      end: 'unknown',
    })
  })

  it('throws on invalid EDTF', () => {
    expect(() => bounds('not a date')).toThrow()
  })
})
