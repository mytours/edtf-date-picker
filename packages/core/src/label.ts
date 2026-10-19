import type { ParseResult, SetNode } from 'edtf'
import { humanize, locales, type Locale, type LocaleCode } from 'edtf-humanize'
import type { Bounds } from './bounds.js'
import type { Config } from './config.js'

function humanizeLocale(config: Config): Locale {
  const language = config.locale.toLowerCase().split('-')[0] ?? 'en'
  const base = language in locales ? locales[language as LocaleCode] : locales.en
  return { ...base, terms: { ...base.terms, ...config.terms } }
}

/**
 * edtf-humanize 0.1.0 lists every member of a set range, so
 * [1890-01-01..2020-12-25] becomes ~47,000 dates. Until that is fixed
 * upstream, label sets containing a range here: each range as an interval
 * ("1890 to 1905"), joined with the locale's set connectors.
 */
function setWithRangesLabel(tree: SetNode, value: string, locale: Locale): string | null {
  if (!tree.values.some(Array.isArray)) return null
  const terms = tree.type === 'Set' ? locale.terms.exclusiveSet : locale.terms.inclusiveSet
  const h = (v: string) => humanize(v, { locale })
  const items = value
    .slice(1, -1)
    .split(',')
    .map((member) => {
      const m = member.trim()
      if (m.startsWith('..')) return terms.earlierPrefix + h(m.slice(2))
      if (m.endsWith('..')) return terms.laterPrefix + h(m.slice(0, -2))
      const range = m.split('..')
      return range.length === 2 ? h(`${range[0] ?? ''}/${range[1] ?? ''}`) : h(m)
    })
  if (items.length === 1) return items[0] ?? null
  if (items.length === 2) return items.join(terms.twoDatesConnector)
  return (
    items.slice(0, -1).join(terms.datesConnector) + terms.lastDateConnector + (items.at(-1) ?? '')
  )
}

/** The human-readable label, from edtf-humanize */
export function labelOf(value: string, tree: ParseResult, config: Config): string {
  const locale = humanizeLocale(config)
  if (tree.type === 'Set' || tree.type === 'List') {
    const label = setWithRangesLabel(tree, value, locale)
    if (label != null) return label
  }
  return humanize(value, { locale })
}

const isQualified = (q: boolean | number | undefined): boolean =>
  q === true || (typeof q === 'number' && q > 0)

/** One line explaining the shape of the value (not the date itself) */
export function captionOf(tree: ParseResult, b: Bounds): string {
  if (b.start === 'unknown' && b.end === 'unknown' && tree.type !== 'Interval')
    return 'That’s fine. It can be filled in later.'
  switch (tree.type) {
    case 'Interval':
      if (b.end === 'open') return 'A span that is still going.'
      if (b.start === 'open') return 'A span with no set start.'
      if (b.end === 'unknown') return 'A span that did end, but when isn’t known.'
      if (b.start === 'unknown') return 'A span that did start, but when isn’t known.'
      return 'A span from the start to the end.'
    case 'Set':
      if (b.start === 'open') return 'One moment, any time up to then.'
      if (b.end === 'open') return 'One moment, any time from then on.'
      return 'One moment, somewhere in this range.'
    case 'List':
      return 'All of these dates.'
    case 'Decade':
      return 'The whole decade.'
    case 'Century':
      return 'The whole century.'
    case 'Season':
      return 'Sometime that season.'
    case 'Year':
      return tree.significant ? 'An estimate, somewhere in this range.' : 'Sometime that year.'
    case 'Date': {
      const approx = isQualified(tree.approximate)
      const uncertain = isQualified(tree.uncertain)
      const perPart = typeof tree.approximate === 'number' || typeof tree.uncertain === 'number'
      if (perPart) return 'Some parts are rough or not certain.'
      if (approx && uncertain) return 'Roughly then, and a best guess.'
      if (approx) return 'Roughly then. It could be a little either side.'
      if (uncertain) return 'A best guess. It might not be right.'
      if ((tree.unspecified ?? 0) & 15) return 'One moment, sometime in that span.'
      const [, m, d] = tree.values
      if (m == null) return 'Sometime that year.'
      if (d == null) return 'Sometime that month.'
      return 'A single day.'
    }
  }
}
