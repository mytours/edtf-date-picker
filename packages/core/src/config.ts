import type { Locale } from 'edtf-humanize'
import { isoDate } from './dates.js'

export type Semantics = 'event' | 'period'
export type Level = 0 | 1 | 2
export type DateOrder = 'dmy' | 'mdy'
export type Terms = Partial<Locale['terms']>

/** A year (1826, '1826'), an ISO date ('1826-06-01') or 'today' */
export type LimitInput = number | string

export interface WarnRule {
  readonly before?: LimitInput
  readonly after?: LimitInput
  readonly message: string
}

/** What a host passes in. Every field is optional and has a neutral default. */
export interface ConfigInput {
  readonly semantics?: Semantics
  readonly min?: LimitInput | null
  readonly max?: LimitInput | null
  readonly warn?: readonly WarnRule[]
  readonly maxLevel?: Level | string | null
  readonly locale?: string
  readonly terms?: Terms
  /** The current time; injectable for tests. Defaults to new Date(). */
  readonly now?: Date
}

export interface Limit {
  /** Inclusive ISO date (YYYY-MM-DD) */
  readonly iso: string
  /** How to name the limit in messages */
  readonly label: string
  readonly today: boolean
}

export interface ResolvedWarnRule {
  readonly before: string | null
  readonly after: string | null
  readonly message: string
}

export interface Config {
  readonly semantics: Semantics
  readonly min: Limit | null
  readonly max: Limit | null
  readonly warn: readonly ResolvedWarnRule[]
  readonly maxLevel: Level
  readonly locale: string
  readonly terms: Terms
  readonly now: Date
  /** The order of day and month in slash dates for this locale */
  readonly dateOrder: DateOrder
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

function todayIso(now: Date): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** `edge` says which end of a year-only limit to use: a min of 1800 means 1800-01-01 */
function resolveLimit(input: LimitInput, edge: 'start' | 'end', now: Date): Limit {
  const raw = String(input).trim()
  if (raw === 'today') return { iso: todayIso(now), label: 'today', today: true }
  if (/^\d{1,4}$/.test(raw)) {
    const year = Number(raw)
    return {
      iso: edge === 'start' ? isoDate(year, 1, 1) : isoDate(year, 12, 31),
      label: raw,
      today: false,
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { iso: raw, label: raw, today: false }
  throw new ConfigError(`Expected a year, an ISO date or 'today', got ${JSON.stringify(input)}`)
}

function resolveDateOrder(locale: string): DateOrder {
  const types = new Intl.DateTimeFormat(locale)
    .formatToParts(new Date(2000, 11, 31))
    .map((p) => p.type)
  return types.indexOf('month') < types.indexOf('day') ? 'mdy' : 'dmy'
}

function resolveLevel(input: ConfigInput['maxLevel']): Level {
  if (input == null || input === '') return 2
  const level = Number(input)
  if (level === 0 || level === 1 || level === 2) return level
  throw new ConfigError(`maxLevel must be 0, 1 or 2, got ${JSON.stringify(input)}`)
}

export function resolveConfig(input: ConfigInput = {}): Config {
  const now = input.now ?? new Date()
  const locale = input.locale ?? 'en'
  const min = input.min == null || input.min === '' ? null : resolveLimit(input.min, 'start', now)
  const max = input.max == null || input.max === '' ? null : resolveLimit(input.max, 'end', now)
  if (min && max && min.iso > max.iso) throw new ConfigError('min is later than max')
  return {
    semantics: input.semantics ?? 'event',
    min,
    max,
    // A warning applies when the date is entirely before `before` (or after `after`)
    warn: (input.warn ?? []).map((w) => ({
      before: w.before == null ? null : resolveLimit(w.before, 'start', now).iso,
      after: w.after == null ? null : resolveLimit(w.after, 'end', now).iso,
      message: w.message,
    })),
    maxLevel: resolveLevel(input.maxLevel),
    locale,
    terms: input.terms ?? {},
    now,
    dateOrder: resolveDateOrder(locale),
  }
}
