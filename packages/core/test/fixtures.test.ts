import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  analyse,
  generate,
  parsePeriodText,
  parseText,
  resolveConfig,
  type ConfigInput,
  type Semantics,
} from '../src/index.js'

interface TextFixture {
  id: string
  semantics: Semantics
  locale: string
  now: string
  config: ConfigInput
  input: { text: string }
  edtf?: string
  level?: number
  earliest?: string | null
  latest?: string | null
  label?: { en: string }
  notes?: string[]
  error?: string
}

interface ValueFixture {
  id: string
  input: { edtf: string }
  level?: number
  earliest?: string | null
  latest?: string | null
  start?: string
  end?: string
  label?: { en: string }
  error?: string
}

const load = <T>(name: string): T[] =>
  JSON.parse(
    readFileSync(new URL(`../../../fixtures/${name}.json`, import.meta.url), 'utf8'),
  ) as T[]

/** "2026-10-19" as local noon, so 'today' is that day in any time zone */
const localNoon = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12)
}

function runText(f: TextFixture) {
  const config = resolveConfig({
    ...f.config,
    semantics: f.semantics,
    locale: f.locale,
    now: localNoon(f.now),
  })
  const parsed =
    f.semantics === 'period'
      ? parsePeriodText(f.input.text, config)
      : parseText(f.input.text, config)
  if ('error' in parsed) return { error: parsed.error.code }
  const r = generate(parsed.state, config)
  if (r.status !== 'valid') return { error: r.error?.code }
  return {
    edtf: r.value,
    level: r.level,
    earliest: r.earliest,
    latest: r.latest,
    label: { en: r.label },
    notes: [...parsed.notes, ...r.warnings].map((n) => n.code),
  }
}

describe.each(['event-text', 'period-text'])('fixtures/%s.json', (name) => {
  it.each(load<TextFixture>(name).map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const { id, semantics, locale, now, config, input, ...expected } = f
    expect(runText(f)).toEqual(expected)
  })
})

describe('fixtures/values.json', () => {
  const config = resolveConfig({ locale: 'en-NZ' })
  it.each(load<ValueFixture>('values').map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const { id, input, ...expected } = f
    const r = analyse(input.edtf, config)
    const actual =
      r.status === 'valid'
        ? {
            level: r.level,
            earliest: r.earliest,
            latest: r.latest,
            start: r.start,
            end: r.end,
            label: { en: r.label },
          }
        : { error: r.error?.code }
    expect(actual).toEqual(expected)
  })
})
