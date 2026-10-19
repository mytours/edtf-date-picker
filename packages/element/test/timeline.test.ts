import { analyse, resolveConfig } from 'edtf-input-core'
import { describe, expect, it } from 'vitest'
import { timeline, yearLabel } from '../src/timeline.js'

const config = resolveConfig({ now: new Date(2026, 9, 19, 12) })
const draw = (value: string) => timeline(analyse(value, config))

describe('timeline', () => {
  it('draws an exact year as a sharp solid bar in the middle', () => {
    const t = draw('1965')
    expect(t?.mark).toMatchObject({ fill: 'solid', start: 'sharp', end: 'sharp', point: false })
    expect(t?.mark.from).toBeCloseTo(100 / 3)
    expect(t?.mark.to).toBeCloseTo(200 / 3)
  })

  it('draws a single day as a point', () => {
    expect(draw('1982-03-12')?.mark.point).toBe(true)
  })

  it('softens approximate ends and dashes uncertain ones', () => {
    expect(draw('1965~')?.mark).toMatchObject({ start: 'soft', end: 'soft' })
    expect(draw('1965?')?.mark).toMatchObject({ start: 'dashed', end: 'dashed' })
    expect(draw('~1890/1905-05-?03')?.mark).toMatchObject({ start: 'soft', end: 'dashed' })
  })

  it('hatches one moment somewhere in a range', () => {
    expect(draw('196X')?.mark.fill).toBe('hatched')
    expect(draw('[1950..1960]')?.mark.fill).toBe('hatched')
    expect(draw('1950/1960')?.mark.fill).toBe('solid')
  })

  it('fades open ends and marks unknown ends with a question mark', () => {
    const open = draw('1950/..')
    expect(open?.mark.end).toBe('fade')
    expect(open?.unknownAt).toEqual([])
    const unknown = draw('1950/')
    expect(unknown?.mark.end).toBe('dashed')
    expect(unknown?.unknownAt).toHaveLength(1)
    expect(draw('[..1931]')?.mark.start).toBe('fade')
  })

  it('labels ticks in round years, BCE before year 1', () => {
    const labels = draw('1950/1960')?.ticks.map((t) => t.label)
    expect(labels).toEqual(['1950', '1955', '1960'])
    expect(yearLabel(0)).toBe('1 BCE')
    expect(yearLabel(-499)).toBe('500 BCE')
  })

  it('keeps the ticks to a handful', () => {
    for (const v of ['1965', '1960/2020', '[1890-01-01..2020-12-25]', '-0500/1500']) {
      const n = draw(v)?.ticks.length ?? 0
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThanOrEqual(6)
    }
  })

  it('is hidden when there is nothing to place or the span is too long', () => {
    expect(draw('XXXX')).toBeNull()
    expect(draw('-5000/2000')).toBeNull()
    expect(draw('not edtf')).toBeNull()
  })
})
