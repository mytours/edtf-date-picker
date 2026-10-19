export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** ISO 8601 year: four digits for 0-9999, otherwise a sign and at least six digits */
export function isoYear(year: number): string {
  if (year >= 0 && year <= 9999) return String(year).padStart(4, '0')
  return (year < 0 ? '-' : '+') + String(Math.abs(year)).padStart(6, '0')
}

export const isoDate = (year: number, month: number, day: number): string =>
  `${isoYear(year)}-${pad2(month)}-${pad2(day)}`

/** Days in a month of the proleptic Gregorian calendar (month is 1-12) */
export function daysInMonth(year: number, month: number): number {
  const d = new Date(Date.UTC(2000, 0, 1))
  d.setUTCFullYear(year, month, 0)
  return d.getUTCDate()
}

export const isSeason = (month: number): boolean => month >= 21

/** Orders ISO dates, including expanded years like -000500-01-01 */
export function compareIso(a: string, b: string): number {
  const key = (iso: string): number => {
    const m = /^([+-]?\d+)-(\d{2})-(\d{2})$/.exec(iso)
    if (!m) throw new Error(`Not an ISO date: ${iso}`)
    return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
  }
  return key(a) - key(b)
}
