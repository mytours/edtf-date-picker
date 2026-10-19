/** Lower case, straight quotes, plain hyphens, single spaces */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A regex alternation of words, longest first so "up to" wins over "up" */
export const anyOf = (words: readonly string[]): string =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')
