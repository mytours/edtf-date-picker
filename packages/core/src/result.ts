import { parse, type ParseResult } from 'edtf'
import { boundsOf, type EndKind } from './bounds.js'
import type { Config, Level } from './config.js'
import { compareIso } from './dates.js'
import { captionOf, labelOf } from './label.js'
import { message, type Message } from './messages.js'

export type Status = 'valid' | 'incomplete' | 'invalid'

/** The outcome of generating or analysing a value. Also the `edtf-change` event detail. */
export interface Result {
  readonly status: Status
  readonly value: string | null
  readonly level: Level | null
  readonly label: string | null
  readonly caption: string | null
  readonly earliest: string | null
  readonly latest: string | null
  readonly start: EndKind | null
  readonly end: EndKind | null
  readonly warnings: readonly Message[]
  /** Things the parser assumed, like the order of a slash date */
  readonly notes: readonly Message[]
  readonly error: Message | null
}

const EMPTY = {
  value: null,
  level: null,
  label: null,
  caption: null,
  earliest: null,
  latest: null,
  start: null,
  end: null,
  warnings: [],
  notes: [],
} as const

export const incomplete = (error: Message): Result => ({ ...EMPTY, status: 'incomplete', error })
export const invalid = (error: Message, warnings: readonly Message[] = []): Result => ({
  ...EMPTY,
  status: 'invalid',
  error,
  warnings,
})

/** Where an edtf.js syntax error points. Grammar-level failures have no position. */
export function parseErrorMessage(error: unknown, value: string): Message {
  const offset = (error as { offset?: unknown } | null)?.offset
  if (typeof offset !== 'number') return message('invalid-edtf', { column: null })
  return message('invalid-edtf', { column: offset + 1, character: value[offset] ?? '' })
}

/**
 * Checks a value against edtf.js, the level limit and the date limits, then
 * labels it. `onParseError` decides what a value edtf.js rejects means.
 */
export function finish(
  value: string,
  config: Config,
  warnings: readonly Message[],
  onParseError: (error: unknown) => Message,
): Result {
  let tree: ParseResult
  try {
    tree = parse(value)
  } catch (e) {
    return invalid(onParseError(e), warnings)
  }
  const level = tree.level as Level
  if (level > config.maxLevel)
    return invalid(message('level-too-high', { level, maxLevel: config.maxLevel }), warnings)

  const b = boundsOf(tree, value)
  if (config.min && b.latest != null && compareIso(b.latest, config.min.iso) < 0)
    return invalid(
      message('before-min', { min: config.min.label, today: config.min.today }),
      warnings,
    )
  if (config.max && b.earliest != null && compareIso(b.earliest, config.max.iso) > 0)
    return invalid(
      message('after-max', { max: config.max.label, today: config.max.today }),
      warnings,
    )

  const all = [...warnings]
  for (const rule of config.warn) {
    const before = rule.before != null && b.latest != null && compareIso(b.latest, rule.before) < 0
    const after = rule.after != null && b.earliest != null && compareIso(b.earliest, rule.after) > 0
    if (before || after) all.push(message('config-warning', { message: rule.message }))
  }

  let label: string
  try {
    label = labelOf(value, tree, config)
  } catch (e) {
    // edtf.js parses 1966/196X but throws when building the interval
    if (e instanceof RangeError && /invalid (upper|lower) bound/.test(e.message))
      return invalid(message('end-before-start'), all)
    throw e
  }

  return {
    status: 'valid',
    value,
    level,
    label,
    caption: captionOf(tree, b),
    earliest: b.earliest,
    latest: b.latest,
    start: b.start,
    end: b.end,
    warnings: all,
    notes: [],
    error: null,
  }
}
