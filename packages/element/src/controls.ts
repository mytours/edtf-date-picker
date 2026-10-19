import type { Certainty, DateParts, DecadePart, EventState, Part } from 'edtf-input-core'

/** The guided options, in the order they're shown */
export const MODES = [
  'exact',
  'year',
  'decade',
  'between',
  'beforeAfter',
  'text',
  'unknown',
] as const
export type Mode = (typeof MODES)[number]

/** One field as the form holds it: text, plus how sure the person is */
export interface Field {
  readonly value: string
  readonly certainty: Certainty
}

export interface DateFields {
  readonly day: Field
  readonly month: Field
  readonly year: Field
}

/** Everything the guided controls hold. Only the chosen mode's fields matter. */
export interface Controls {
  readonly mode: Mode | null
  readonly exact: DateFields
  /** month is '' for "just the year", 1-12, or a season 21-24 */
  readonly year: { readonly month: Field; readonly year: Field }
  readonly decade: { readonly decade: string; readonly part: DecadePart }
  readonly between: { readonly from: DateFields; readonly to: DateFields }
  readonly beforeAfter: { readonly dir: 'before' | 'after'; readonly at: DateFields }
  readonly text: string
}

const field = (value = '', certainty: Certainty = 'sure'): Field => ({ value, certainty })
const dateFields = (): DateFields => ({ day: field(), month: field(), year: field() })

export const EMPTY_CONTROLS: Controls = {
  mode: null,
  exact: dateFields(),
  year: { month: field(), year: field() },
  decade: { decade: '', part: 'any' },
  between: { from: dateFields(), to: dateFields() },
  beforeAfter: { dir: 'before', at: dateFields() },
  text: '',
}

const toPart = (f: Field): Part => {
  if (f.certainty === 'unknown') return { value: null, certainty: 'unknown' }
  const v = f.value.trim()
  return { value: v === '' || !/^-?\d+$/.test(v) ? null : Number(v), certainty: f.certainty }
}

/** Exact mode: all three parts, each of which may be unknown */
const exactParts = (d: DateFields): DateParts => ({
  year: toPart(d.year),
  month: toPart(d.month),
  day: toPart(d.day),
})

/** Range ends: the year, plus the month and day only if they're filled in */
function rangeParts(d: DateFields): DateParts {
  const hasDay = d.day.value.trim() !== ''
  const hasMonth = d.month.value.trim() !== '' || hasDay
  return {
    year: toPart(d.year),
    ...(hasMonth ? { month: toPart(d.month) } : {}),
    ...(hasDay ? { day: toPart(d.day) } : {}),
  }
}

/**
 * What the controls describe: a core state, text to parse, a choice that
 * still needs something before core can check it, or nothing chosen yet
 */
export type Answer =
  { readonly state: EventState } | { readonly text: string } | { readonly missing: 'decade' } | null

export function answerOf(c: Controls): Answer {
  switch (c.mode) {
    case null:
      return null
    case 'exact':
      return { state: { kind: 'date', parts: exactParts(c.exact) } }
    case 'year': {
      const month = c.year.month
      const withMonth = month.value.trim() !== '' || month.certainty === 'unknown'
      const parts: DateParts = {
        year: toPart(c.year.year),
        ...(withMonth ? { month: toPart(month) } : {}),
      }
      return { state: { kind: 'date', parts } }
    }
    case 'decade':
      if (c.decade.decade === '') return { missing: 'decade' }
      return { state: { kind: 'decade', decade: Number(c.decade.decade), part: c.decade.part } }
    case 'between':
      return {
        state: { kind: 'between', from: rangeParts(c.between.from), to: rangeParts(c.between.to) },
      }
    case 'beforeAfter':
      return {
        state: { kind: 'beforeAfter', dir: c.beforeAfter.dir, at: rangeParts(c.beforeAfter.at) },
      }
    case 'text':
      return { text: c.text }
    case 'unknown':
      return { state: { kind: 'unknown' } }
  }
}

const fromPart = (p: Part | undefined): Field =>
  p == null ? field() : field(p.value == null ? '' : String(p.value), p.certainty)

const fromParts = (p: DateParts): DateFields => ({
  day: fromPart(p.day),
  month: fromPart(p.month),
  year: fromPart(p.year),
})

/** Fills the controls from a state, keeping whatever else they held */
export function controlsFor(state: EventState, base: Controls = EMPTY_CONTROLS): Controls {
  switch (state.kind) {
    case 'date':
      return state.parts.day
        ? { ...base, mode: 'exact', exact: fromParts(state.parts) }
        : {
            ...base,
            mode: 'year',
            year: { month: fromPart(state.parts.month), year: fromPart(state.parts.year) },
          }
    case 'decade':
      return { ...base, mode: 'decade', decade: { decade: String(state.decade), part: state.part } }
    case 'between':
      return {
        ...base,
        mode: 'between',
        between: { from: fromParts(state.from), to: fromParts(state.to) },
      }
    case 'beforeAfter':
      return {
        ...base,
        mode: 'beforeAfter',
        beforeAfter: { dir: state.dir, at: fromParts(state.at) },
      }
    case 'unknown':
      return { ...base, mode: 'unknown' }
  }
}
