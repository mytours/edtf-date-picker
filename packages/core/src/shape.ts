import type { LeafNode, ParseResult } from 'edtf'
import { asLeaf, type Bounds } from './bounds.js'

/**
 * What kind of thing a value describes, for drawing it:
 * - moment: one date, as precise as written (1982-03-12, 1965~)
 * - oneOf: one moment somewhere in a range (196X, [1950..1960], [..1931])
 * - allOf: every one of several dates ({1960,1961})
 * - span: a period from a start to an end (1950/1960, 196)
 */
export type Shape = 'moment' | 'oneOf' | 'allOf' | 'span'

export interface Qualifiers {
  readonly approximate: boolean
  readonly uncertain: boolean
}

/** Qualifiers at each end; for anything but a span both ends are the same */
export interface EndQualifiers {
  readonly start: Qualifiers
  readonly end: Qualifiers
}

const PLAIN: Qualifiers = { approximate: false, uncertain: false }

const on = (q: boolean | number | undefined): boolean =>
  q === true || (typeof q === 'number' && q > 0)

function leafQualifiers(node: LeafNode | null): Qualifiers {
  if (!node || node.type === 'Year' || node.type === 'Season') return PLAIN
  return { approximate: on(node.approximate), uncertain: on(node.uncertain) }
}

const either = (a: Qualifiers, b: Qualifiers): Qualifiers => ({
  approximate: a.approximate || b.approximate,
  uncertain: a.uncertain || b.uncertain,
})

export function shapeOf(tree: ParseResult, b: Bounds): Shape | null {
  if (b.earliest == null && b.latest == null) return null
  switch (tree.type) {
    case 'Interval':
    case 'Decade':
    case 'Century':
      return 'span'
    case 'Set':
      return 'oneOf'
    case 'List':
      return 'allOf'
    case 'Year':
      return tree.significant ? 'oneOf' : 'moment'
    case 'Season':
      return 'moment'
    case 'Date':
      return (tree.unspecified ?? 0) & 15 ? 'oneOf' : 'moment'
  }
}

export function qualifiersOf(tree: ParseResult): EndQualifiers {
  switch (tree.type) {
    case 'Interval':
      return {
        start: leafQualifiers(asLeaf(tree.values[0])),
        end: leafQualifiers(asLeaf(tree.values[1])),
      }
    case 'Set':
    case 'List': {
      const all = tree.values
        .flatMap((v) => (Array.isArray(v) ? [v[0], v[1]] : [v]))
        .map((v) => leafQualifiers(asLeaf(v)))
        .reduce(either, PLAIN)
      return { start: all, end: all }
    }
    default: {
      const q = leafQualifiers(tree)
      return { start: q, end: q }
    }
  }
}
