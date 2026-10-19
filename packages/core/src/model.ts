/** How sure someone is about one part of a date */
export type Certainty = 'sure' | 'approximate' | 'uncertain' | 'both' | 'unknown'

export interface Part {
  /** null while the field is empty */
  readonly value: number | null
  readonly certainty: Certainty
}

/**
 * The parts of one date. `month` is 1-12, or a season 21-24.
 * Leave `month` out for year precision, and `day` out for month precision.
 */
export interface DateParts {
  readonly year: Part
  readonly month?: Part
  readonly day?: Part
}

export type DecadePart = 'any' | 'early' | 'mid' | 'late'

export type EventState =
  | { readonly kind: 'date'; readonly parts: DateParts }
  | { readonly kind: 'decade'; readonly decade: number; readonly part: DecadePart }
  | { readonly kind: 'between'; readonly from: DateParts; readonly to: DateParts }
  | { readonly kind: 'beforeAfter'; readonly dir: 'before' | 'after'; readonly at: DateParts }
  | { readonly kind: 'unknown' }

export type Endpoint =
  | { readonly kind: 'date'; readonly parts: DateParts }
  | { readonly kind: 'decade'; readonly decade: number }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'open' }

export interface PeriodState {
  readonly kind: 'period'
  readonly start: Endpoint
  readonly end: Endpoint
}

export type State = EventState | PeriodState

/** Shorthand for building parts in code and tests */
export const part = (value: number | null, certainty: Certainty = 'sure'): Part => ({
  value,
  certainty,
})
