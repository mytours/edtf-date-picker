/** English input vocabulary. Every entry is lower case, after normalise(). */
export const en = {
  months: [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ],
  seasons: { spring: 21, summer: 22, autumn: 23, fall: 23, winter: 24 } as Record<string, number>,
  /** Before the date: "about 1965", "c. 1900", "~1965" */
  approximateBefore: [
    'approximately',
    'approx.',
    'approx',
    'roughly',
    'around',
    'about',
    'circa',
    'ca.',
    'ca',
    'c.',
    'c',
    '~',
  ],
  /** After the date: "1965-ish", "1965~" */
  approximateAfter: ['-ish', ' ish', 'ish', '~'],
  /** Anywhere: "maybe 1965", "1965 probably" */
  uncertainWords: ['maybe', 'probably', 'perhaps', 'possibly', 'i think', 'i guess'],
  unknown: [
    'unknown',
    'not known',
    'no idea',
    'not sure',
    'no clue',
    "i don't know",
    "don't know",
    'dont know',
    'n.d.',
    'nd',
    '?',
  ],
  before: ['earlier than', 'prior to', 'up until', 'up to', 'before', 'until', 'till', 'pre'],
  after: ['later than', 'after', 'since', 'post', 'from'],
  /** After the date: "1975 onwards" */
  onwards: ['onwards', 'onward', 'on', '+'],
  /** Joins the two sides of a range */
  connectives: ['to', 'and', 'until', 'till', 'through'],
  /** Leading words on a range: "between 1950 and 1960" */
  rangeStart: ['between', 'from'],
  /** An end that hasn't happened: "1975 to present" */
  present: [
    'the present day',
    'the present',
    'present day',
    'present',
    'now',
    'today',
    'date',
    'ongoing',
  ],
  decadeParts: { early: 'early', mid: 'mid', middle: 'mid', late: 'late' } as Record<
    string,
    'early' | 'mid' | 'late'
  >,
} as const

export type Vocab = typeof en
