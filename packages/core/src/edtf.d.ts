// edtf.js ships no type declarations. Only what this package uses is declared.
//
// The default export (the edtf() function) is avoided: edtf's CommonJS build
// has no __esModule marker, so bundlers' interop can resolve it to the module
// object. parse() behaves the same from ESM and CommonJS.
declare module 'edtf' {
  export interface Constraints {
    level?: 0 | 1 | 2 | 3
  }

  /** A qualifier is `true` for the whole value, or a bitmask: year 15, month 48, day 192 */
  export type Qualifier = boolean | number

  export interface DateNode {
    type: 'Date'
    level: number
    /** [year, monthIndex (0-11), day] */
    values: number[]
    /** Bitmask of X digits: year 1/2/4/8 per digit, month 48, day 192 */
    unspecified?: number
    approximate?: Qualifier
    uncertain?: Qualifier
  }

  export interface YearNode {
    type: 'Year'
    level: number
    values: [number]
    significant?: number
  }

  export interface DecadeNode {
    type: 'Decade'
    level: number
    values: [number]
    approximate?: boolean
    uncertain?: boolean
  }

  export interface CenturyNode {
    type: 'Century'
    level: number
    values: [number]
    approximate?: boolean
    uncertain?: boolean
  }

  export interface SeasonNode {
    type: 'Season'
    level: number
    /** [year, season code 21-41] */
    values: [number, number]
  }

  export type LeafNode = DateNode | YearNode | DecadeNode | CenturyNode | SeasonNode

  /** Interval and set members with X digits (196X) come without a `type` */
  export type MemberNode = LeafNode | Omit<DateNode, 'type'>

  export interface IntervalNode {
    type: 'Interval'
    level: number
    /** Infinity for an open end (`..`), null for an unknown one (empty) */
    values: [MemberNode | number | null, MemberNode | number | null]
  }

  export interface SetNode {
    type: 'Set' | 'List'
    level: number
    /** A two-element array is a range `a..b` */
    values: (MemberNode | [MemberNode, MemberNode])[]
    earlier?: boolean
    later?: boolean
  }

  export type ParseResult = LeafNode | IntervalNode | SetNode

  export function parse(input: string, constraints?: Constraints): ParseResult
}
