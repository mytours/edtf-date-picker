import {
  parse,
  type DateNode,
  type LeafNode,
  type MemberNode,
  type ParseResult,
  type Qualifier,
} from 'edtf'
import { asLeaf } from './bounds.js'
import type { Config } from './config.js'
import type { Certainty, DateParts, DecadePart, Endpoint, Part, State } from './model.js'

const YEAR = 15
const MONTH = 48
const DAY = 192
const YEAR_UNITS_X = 8

const has = (q: Qualifier | undefined, mask: number): boolean =>
  q === true || (typeof q === 'number' && (q & mask) !== 0)

function certainty(node: DateNode, mask: number): Certainty {
  const a = has(node.approximate, mask)
  const u = has(node.uncertain, mask)
  return a && u ? 'both' : a ? 'approximate' : u ? 'uncertain' : 'sure'
}

/** A Date or a season 21-24 as guided parts; null for anything the UI can't show */
function partsOf(node: LeafNode): DateParts | null {
  if (node.type === 'Season') {
    const [year, code] = node.values
    return code >= 21 && code <= 24
      ? { year: { value: year, certainty: 'sure' }, month: { value: code, certainty: 'sure' } }
      : null
  }
  if (node.type !== 'Date') return null
  const un = node.unspecified ?? 0
  // Partly unknown years (189X) are decades, not parts
  if ((un & YEAR) !== 0 && (un & YEAR) !== YEAR) return null
  const [year = 0, m0, day] = node.values
  const p = (value: number, mask: number): Part =>
    (un & mask) !== 0
      ? { value: null, certainty: 'unknown' }
      : { value, certainty: certainty(node, mask) }
  return {
    year: p(year, YEAR),
    ...(m0 != null ? { month: p(m0 + 1, MONTH) } : {}),
    ...(day != null ? { day: p(day, DAY) } : {}),
  }
}

/** 196X → 1960 */
function decadeOf(node: LeafNode): number | null {
  if (node.type !== 'Date' || node.values.length !== 1) return null
  return (node.unspecified ?? 0) === YEAR_UNITS_X && !node.approximate && !node.uncertain
    ? (node.values[0] ?? null)
    : null
}

const yearOnly = (p: DateParts): number | null =>
  !p.month && p.year.certainty === 'sure' ? p.year.value : null

/** [1967..1969] → the late 1960s, as generate() writes decade parts */
function decadePart(from: DateParts, to: DateParts): { decade: number; part: DecadePart } | null {
  const a = yearOnly(from)
  const b = yearOnly(to)
  if (a == null || b == null || Math.floor(a / 10) !== Math.floor(b / 10)) return null
  const decade = a - (a % 10)
  const offsets = `${String(a - decade)}-${String(b - decade)}`
  const parts: Readonly<Record<string, DecadePart>> = {
    '0-3': 'early',
    '4-6': 'mid',
    '7-9': 'late',
  }
  const part = parts[offsets]
  return part ? { decade, part } : null
}

function endpoint(member: MemberNode | number | null, text: string): Endpoint | null {
  const node = asLeaf(member)
  if (node == null) return text.trim() === '..' ? { kind: 'open' } : { kind: 'unknown' }
  const decade = decadeOf(node)
  if (decade != null) return { kind: 'decade', decade }
  const parts = partsOf(node)
  return parts ? { kind: 'date', parts } : null
}

function fromTree(tree: ParseResult, value: string, config: Config): State | null {
  switch (tree.type) {
    case 'Interval': {
      const slash = value.indexOf('/')
      const start = endpoint(tree.values[0], value.slice(0, slash))
      const end = endpoint(tree.values[1], value.slice(slash + 1))
      return start && end ? { kind: 'period', start, end } : null
    }
    case 'Set': {
      const [only, ...rest] = tree.values
      if (only == null || rest.length > 0) return null
      if (Array.isArray(only)) {
        if (tree.earlier || tree.later) return null
        const a = asLeaf(only[0])
        const b = asLeaf(only[1])
        const from = a && partsOf(a)
        const to = b && partsOf(b)
        if (!from || !to) return null
        const dp = decadePart(from, to)
        return dp ? { kind: 'decade', ...dp } : { kind: 'between', from, to }
      }
      const leaf = asLeaf(only)
      const at = leaf && partsOf(leaf)
      if (!at || !(tree.earlier || tree.later)) return null
      return { kind: 'beforeAfter', dir: tree.earlier ? 'before' : 'after', at }
    }
    case 'List':
      return null
    default: {
      const decade = decadeOf(tree)
      if (decade != null) {
        if (config.semantics === 'event') return { kind: 'decade', decade, part: 'any' }
        // A period that starts and ends in the same decade is written 196X
        const e: Endpoint = { kind: 'decade', decade }
        return { kind: 'period', start: e, end: e }
      }
      const parts = partsOf(tree)
      if (!parts) return null
      if (parts.year.certainty === 'unknown' && !parts.month && !parts.day)
        return { kind: 'unknown' }
      if (config.semantics === 'period') {
        const e: Endpoint = { kind: 'date', parts }
        return { kind: 'period', start: e, end: e }
      }
      return { kind: 'date', parts }
    }
  }
}

/**
 * The guided UI state for an existing EDTF value, so a saved value can be
 * edited with the same controls. Returns null for valid EDTF the guided UI
 * can't express (lists, centuries, significant digits, quarters…).
 */
export function fromValue(value: string, config: Config): State | null {
  const v = value.trim()
  let tree: ParseResult
  try {
    tree = parse(v)
  } catch {
    return null
  }
  return fromTree(tree, v, config)
}
