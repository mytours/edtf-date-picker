export type Params = Readonly<Record<string, string | number | boolean | null>>

/** A machine-readable message. `text` is the English wording; hosts can localise by `code`. */
export interface Message {
  readonly code: MessageCode
  readonly params: Params
  readonly text: string
}

const monthName = (month: number): string =>
  new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 15)),
  )

const s = (v: Params[string] | undefined): string => String(v ?? '')

const TEXT = {
  missing: (p: Params) => `Add the ${s(p.part)}.`,
  'invalid-year': () => 'Enter a year from 1 to 9999, like 1965.',
  'invalid-month': () => 'That month doesn’t look right.',
  'impossible-day': (p: Params) =>
    p.year == null
      ? `${monthName(Number(p.month))} never has ${s(p.day)} days.`
      : `${monthName(Number(p.month))} ${s(p.year)} only had ${s(p.days)} days.`,
  'season-with-day': () => 'Pick a month rather than a season when you know the day.',
  'season-not-allowed': () => 'Use a month rather than a season here.',
  'season-needs-year': () => 'A season needs a year. Add the year, or choose a month instead.',
  'qualifier-dropped': (p: Params) =>
    p.reason === 'season'
      ? 'EDTF can’t mark a season as rough or not certain, so it was saved without that mark.'
      : p.reason === 'unknown-part'
        ? 'EDTF can’t mark parts as rough or not certain when another part isn’t known, so it was saved without those marks.'
        : 'EDTF can’t mark this kind of date as rough or not certain, so it was saved without those marks.',
  'decade-not-zero': (p: Params) => `A decade ends in 0, like the ${s(p.suggestion)}s.`,
  'outside-limits': () => 'That is outside the dates allowed here.',
  'from-after-to': () => 'The first date should be the earlier one.',
  'end-before-start': () => 'The end needs to be after the start.',
  'period-needs-a-date': () => 'Give at least a start date or an end date.',
  'before-min': (p: Params) =>
    p.today
      ? 'That has already passed, and this date needs to be from today on.'
      : `That’s earlier than ${s(p.min)}, the earliest date allowed here.`,
  'after-max': (p: Params) =>
    p.today
      ? 'That’s in the future, and this date can’t be.'
      : `That’s later than ${s(p.max)}, the latest date allowed here.`,
  'level-too-high': (p: Params) =>
    `This uses EDTF level ${s(p.level)} features. This field accepts up to level ${s(p.maxLevel)}.`,
  'config-warning': (p: Params) => s(p.message),
  'invalid-edtf': (p: Params) =>
    p.column == null
      ? 'This looks unfinished, or the parts don’t fit together.'
      : p.character === ''
        ? 'Something is missing at the end.'
        : `Character ${s(p.column)}, “${s(p.character)}”, isn’t expected there.`,
  internal: (p: Params) => `Internal error: generated an invalid value (${s(p.value)}).`,
  empty: () => 'Type a date.',
  'empty-edtf': () => 'Type an EDTF value.',
  'not-understood': () =>
    'We didn’t understand that. Try something like “about 1965”, “summer 1975” or “late 1940s”.',
  'slash-order-mismatch': (p: Params) =>
    p.order === 'mdy'
      ? 'We read dates month first, like 12/25/1975. That one doesn’t fit.'
      : 'We read dates day first, like 25/12/1975. That one doesn’t fit.',
  'slash-order-assumed': (p: Params) =>
    `We read this ${p.order === 'mdy' ? 'month' : 'day'} first: ${s(p.date)}.`,
  'two-digit-decade': (p: Params) =>
    `We read that as the ${s(p.decade)}s. Type “${s(p.alternative)}s” if you meant that.`,
} as const satisfies Record<string, (p: Params) => string>

export type MessageCode = keyof typeof TEXT

/** Errors that belong to one end of a period are prefixed with that end */
export function message(code: MessageCode, params: Params = {}): Message {
  const text = TEXT[code](params)
  const end = params.end === 'start' ? 'Start: ' : params.end === 'end' ? 'End: ' : ''
  return { code, params, text: end + text }
}
