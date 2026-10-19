# EDTF date input: design

Shortcut: [sc-177700](https://app.shortcut.com/oncell/story/177700). Reference prototype: [`docs/prototype.html`](../prototype.html).

This document settles the repo layout, tooling and the design of phase 1 (`edtf-input-core`). The story remains the source of truth for UI behaviour; this covers how it is built.

## Decisions

| Topic            | Decision                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Layout           | pnpm monorepo, one package per deliverable                                               |
| Language / build | TypeScript, tsup, ESM only, `.d.ts` emitted                                              |
| Dependencies     | `edtf` and `edtf-humanize` stay external; `edtf-input` also ships a standalone bundle    |
| Labels           | `edtf-humanize` (npm, `mytours/edtf-humanize-js`) from phase 1; no throwaway label code  |
| Tooling          | Same as edtf-humanize-js: pnpm 10, TS 6, tsup, vitest 5, eslint 10, prettier             |
| Releases         | changesets, independent versions starting at 0.1.0; release workflow deferred to phase 2 |
| Licence          | BSD-3-Clause                                                                             |

## 1. Repo and tooling

```
edtf-date-picker/
  package.json              private workspace root; scripts fan out with pnpm -r
  pnpm-workspace.yaml       packages/*, examples
  tsconfig.base.json        strict, ES2022, moduleResolution: bundler
  eslint.config.js, .prettierrc
  vitest.workspace.ts       core in node; element in happy-dom (browser mode later)
  packages/
    core/      edtf-input-core       deps: edtf@4.11.1, edtf-humanize@^0.1
    element/   edtf-input            deps: edtf-input-core
    react/     edtf-input-react      peer: react >=18
    stimulus/  edtf-input-stimulus   peer: @hotwired/stimulus
  fixtures/    shared JSON test cases
  examples/    static HTML: photo / event / period setups (become the demo site)
  docs/
  .github/workflows/ci.yml   typecheck, lint, test, build, publint
```

- Every package builds ESM plus types with tsup. `edtf-input` additionally builds `dist/edtf-input.standalone.js` with all dependencies inlined, for a single `<script type="module">` from a CDN.
- **Why the standalone bundle:** edtf.js is ESM but imports nearley, which is CommonJS/UMD. Rails `bin/importmap pin` (jspm), esm.sh and bundlers convert it; a raw importmap pointing at `node_modules` does not. The externalised build keeps edtf deduplicated with the host (which may also use edtf-humanize); the standalone build covers drop-in use.
- Local work on edtf-humanize: a root `pnpm.overrides` entry `"edtf-humanize": "link:../edtf-humanize-js"`, switched on only while landing upstream fixes. CI always uses the npm release.

## 2. Core architecture (`edtf-input-core`)

No DOM. Pure functions over a resolved config.

| Module        | API                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`   | `resolveConfig(attrs \| object) → Config`: `semantics`, `min`, `max` (years, or `'today'` resolved against an injectable clock), `warn: [{ before \| after, message }]`, `maxLevel`, `locale`, `terms` |
| `model.ts`    | State types (below)                                                                                                                                                                                    |
| `generate.ts` | `generate(state, config) → Result`                                                                                                                                                                     |
| `parse/`      | `parseText(text, config)` and `parsePeriodText(text, config)` → state + notes, or an error                                                                                                             |
| `bounds.ts`   | `bounds(edtf) → { earliest, latest, openStart, openEnd }`                                                                                                                                              |
| `analyse.ts`  | `analyse(edtf, config) → Result`, for advanced mode and pre-existing values                                                                                                                            |

### State

```ts
type Certainty = 'sure' | 'approximate' | 'uncertain' | 'unknown'
type Part<T> = { value: T | null; certainty: Certainty }
type DateParts = { year: Part<number>; month?: Part<number>; day?: Part<number> } // month 1–12 or season 21–24

type EventState =
  | { kind: 'date'; parts: DateParts }
  | { kind: 'decade'; decade: number; part: 'any' | 'early' | 'mid' | 'late' }
  | { kind: 'between'; from: DateParts; to: DateParts }
  | { kind: 'beforeAfter'; dir: 'before' | 'after'; at: DateParts }
  | { kind: 'unknown' }

type Endpoint =
  | { kind: 'date'; parts: DateParts }
  | { kind: 'decade'; decade: number }
  | { kind: 'unknown' }
  | { kind: 'open' }

type PeriodState = { kind: 'period'; start: Endpoint; end: Endpoint }
```

- "Type it in your own words" is not a state. The parser produces one of the states above, so "Adjust this using the options above" is just loading the parsed state into the guided controls.
- `between` takes full `DateParts` on both ends (the prototype used years only). This answers the story's open question about full pickers for the single-moment "between" option: yes.

### Result

```ts
type Result = {
  status: 'valid' | 'incomplete' | 'invalid'
  value: string | null
  level: 0 | 1 | 2 | null
  label: string | null
  caption: string | null
  earliest: string | null // ISO date, for hidden inputs
  latest: string | null
  timeline: TimelineShape | null // data only; the element draws it
  warnings: Message[]
  error: Message | null
}
type Message = { code: string; params: Record<string, unknown>; text: string }
```

The `edtf-change` event detail is a superset of `Result`. Messages carry a code and params so wording can be localised or overridden later.

## 3. Generation, bounds and labels

### `generate()` rules, in order

1. **Validate parts.** Year range and config min/max give hard errors. Impossible days ("February 1975 only had 28 days") are errors, and so is a season combined with a day.
2. **Unknown parts** become `X`; everything unknown becomes `XXXX`.
3. **Qualifiers.** If every known part has the same qualifier, use the trailing form (`1982-03-12~`); otherwise, prefix each part (`1982-?03-~12`). Trailing `X` parts are dropped when they would sit next to a qualifier (`1982-?03`, not `1982-?03-XX`). If a qualifier still can't be expressed (an inner `X`, or a season), the qualifiers are dropped and a warning is added.
4. **Shape by semantics.**
   - Event: decade → `196X`; early/mid/late → set range `[1960..1963]`; between → `[a..b]` with both ends padded to equal precision (`[1890-01-01..2020-12-25]`); before/after → `[..a]` / `[a..]`.
   - Period: decade → `196`; endpoints → `a/b`, with prefix form on both ends if either end needs it (`~1890/1905-05-?03`); open → `..`; unknown → empty. At least one end must be a date and the end can't be before the start. Errors are scoped to the end ("Start: …").
5. **Config limits.** `maxLevel` is checked against `edtf(v).level`. min/max clip decade parts, as in the prototype. Soft warnings come from `config.warn`.
6. **Verify with edtf.js.** Every value is passed to `edtf()` before it is returned. A failure is a bug: `status: 'invalid'`, code `internal`, never emitted silently.

### `bounds()`

Computed from the `parse()` tree, not `edtf().min/max`, which is wrong for several types (checked against edtf.js 4.11.1):

| Input                      | edtf.js says      | Problem                                            |
| -------------------------- | ----------------- | -------------------------------------------------- |
| `[1667..1672]`             | max = end of 1667 | sets take the first member's max                   |
| `[1890-01-01..2020-12-25]` | max = 1890-01-01  | same                                               |
| `Y170000002`               | min/max = NaN     | long years unsupported                             |
| `2001-25`, `2001-33`       | identical ranges  | hemisphere seasons not distinguished from quarters |

Rules:

- Date, Year and Decade: edtf.js min/max are correct, so use them. Long years are computed from their digits.
- Seasons: our own table for 21–24 (northern hemisphere), 25–32 (hemisphere-specific), 33–36 (quarters), 37–41 (quadrimesters, semesters).
- Sets and lists: earliest member's min and latest member's max. `[..a]` and `[a..]` give open bounds.
- Intervals: lower end's min and upper end's max. `Infinity` means open and `null` means unknown; both are reported.
- Output is ISO `YYYY-MM-DD` (`±YYYYYY` for years outside 0000–9999), or `null` when unbounded.

### Labels

- `label = humanize(value, { locale })`, where the locale object has `config.terms` merged in (`{ ...en, terms: { ...en.terms, ...overrides } }`). This gives the public vs catalogue wording split with no new humanize API.
- `caption` describes the _shape_ ("one moment somewhere in this range", "a span with an unknown end") and is owned by core: a small lookup keyed by shape.

### Upstream work in edtf-humanize-js

Separate PRs, not blocking phase 1. Gaps found by probing 0.1.0:

| Input          | Current output                       | Wanted                                  |
| -------------- | ------------------------------------ | --------------------------------------- |
| `1982-?03-~12` | circa March 12, 1982?                | per-part wording                        |
| `-0500`        | -0500                                | 501 BCE                                 |
| `[1667..1672]` | 1667, 1668, 1669, 1670, 1671 or 1672 | one of 1667 to 1672 (for larger ranges) |

Core's tests pin the current humanize output, so each upstream fix shows up here as a deliberate fixture change.

Already covered by 0.1.0: open vs unknown interval ends (`since 1950` / `1950 to unknown date`), `189X`, seasons and quarters, before/after sets, significant digits, locale term overrides.

## 4. Natural-language parser

A regex approach (as in the prototype), restructured so that vocabulary comes from a locale table rather than being written into the patterns.

```
parse/
  vocab/en.ts     months (+ abbreviations), seasons, qualifier words, connectives,
                  before/after/since/until words, present words, unknown phrases
  normalise.ts    lower-case, fold quotes and dashes, collapse whitespace
  qualifiers.ts   leading about/around/circa/c./ca./~ and trailing -ish/~ → approximate;
                  trailing ?, maybe/probably/perhaps/I think → uncertain; both → %
  single.ts       one expression → DateParts | decade: ISO, slash dates (locale order
                  via Intl formatToParts), d-month-y, month-d-y, month-y, season-y,
                  year, decades (1960s, '60s, 60s, early/mid/late, "the 1920s")
  event.ts        between/from…to, before/after/since/until, A–B with mixed precision
  period.ts       start/end split; present → open; unknown → unknown;
                  a lone decade → 1920/1929
```

- **Notes** are returned alongside the state, using the same `Message` shape: the assumed slash-date order, and the two-digit decade choice with its alternative.
- Two-digit decades resolve to the most recent decade allowed by config, against the injectable clock, so tests are deterministic.
- A qualifier applies to the whole expression unless it is attached to one side of a range: "about 1890 to 1905" marks only the start. Whether to offer a "both ends?" chip is a phase 3 UI decision.
- **Deferred:** the story asks for parser vocabulary to come from the humanizer's locale files. Those hold output terms, whereas the parser needs many input synonyms per meaning. Vocabulary lives in core for now, in a shape that could later move into edtf-humanize.

## 5. Testing

### Fixtures

`fixtures/*.json`, one file per area: `event-guided`, `event-text`, `period-guided`, `period-text`, `bounds`, `errors`.

```json
{
  "id": "event-approx-year",
  "semantics": "event",
  "locale": "en-NZ",
  "now": "2026-10-19",
  "config": {},
  "input": { "text": "about 1965" },
  "edtf": "1965~",
  "level": 1,
  "earliest": "1965-01-01",
  "latest": "1965-12-31",
  "label": { "en": "circa 1965" },
  "notes": []
}
```

`input` is either `{ "text": … }` or `{ "state": … }`. Seed with every example in the story and the prototype. The JSON format is the contract for a later Ruby runner (via the legacy translator), which is out of scope for this repo.

### Test types (vitest)

- **Fixture runner:** parse → generate (or generate from state), then check bounds and label.
- **One unit test per generation rule**, including each edtf.js rejection we work around. These also record the evidence for the open question of whether the rejections are ISO 8601-2 rules or edtf.js gaps.
- **Property test (fast-check):** random valid `EventState` / `PeriodState` → `generate()` is `valid`, parses in edtf.js, and has `earliest <= latest`.
- **Round trip** for the guided subset: `parseText(humanize(generate(s).value))` regenerates the same value. Starts as `it.todo`, enabled fixture by fixture once we agree which humanize phrasings the parser must accept.
- **Bounds regressions:** the table in section 3, plus seasons 21–41 and open vs unknown intervals.

## Phase 1: definition of done

- Monorepo scaffold, tooling and CI green.
- `edtf-input-core` exports `resolveConfig`, `generate`, `parseText`, `parsePeriodText`, `bounds` and `analyse`.
- Fixtures cover every example in the story; property and bounds tests pass.
- `element`, `react` and `stimulus` exist as empty placeholder packages.

Out of scope: any DOM, the edtf-humanize PRs (tracked separately), the legacy-syntax translator, the usability test.

## Findings on open questions

From probing edtf.js 4.11.1 (not yet checked against the ISO 8601-2 text):

- Rejected: qualifier next to `X` (`1982-?03-XX`, `XXXX-?03`), qualified seasons (`2001-21~`, `2001-~21`), trailing qualifier on one interval end with a prefix qualifier on the other (`1890~/1905-05-?03`), unequal precision in set ranges (`[1890..2020-12-25]`).
- Error positions: syntax errors report `offset` and the offending token, which is enough for the advanced-mode character highlight. Grammar-level failures (qualified seasons) report only "No possible parsings", so advanced mode needs a generic fallback message.

## Changes made during phase 1

Found while building the core; the code and tests are the reference.

- `Certainty` has a fifth value, `both` (`%`), for "about 1965?".
- More edtf.js rules turned up: a season needs a known year (`XXXX-21` is rejected); seasons can't be interval or set ends; two-ended set ranges reject qualifiers in every position, while open-ended sets accept prefix qualifiers only; and an interval's end must _begin_ strictly after its start begins (`1966/196X` and `1965-06/1965` parse, but building them throws). The generator uses a candidate chain (natural form, then prefix form, then unqualified with a warning) rather than hand-coding every set rule.
- In the parse tree, interval and set members with `X` digits (`196X`) have no `type`, and an open interval end is `Infinity`, not `null`. `asLeaf()` in `bounds.ts` normalises both. Before that fix, `196X/198X` came out unbounded; the property test now compares the result's `start`/`end` with the state, which catches it.
- Two-sided "between" collapses to a single date when both ends are the same.
- edtf-humanize 0.1.0 lists every member of a set range. Core labels sets that contain ranges itself (each range in the locale's interval wording, joined with its set connectors) until that's fixed upstream.
- In period mode, a lone decade gives `1920/1929` (story §3 and the prototype), not `196` (story §1). "until 1931" gives `/1931` (unknown start), as in the prototype.
- `min`/`max` are inclusive ISO days, not years, so `max="today"` rejects 1 December this year.
- `timeline` is left out of `Result` until phase 2, when the element draws it; `start`/`end` (`date`, `open`, `unknown`) carry what it needs.
- Messages that the design gave as `{ code, params }` also carry English `text`.

### More for edtf-humanize-js

- `en` formats dates US-style ("March 12, 1982"); en-NZ, en-GB and en-AU users need day-first wording.
- `196X` reads as "1960s (year unknown)", so decade-to-decade periods become "1960s (year unknown) to 1980s (year unknown)".
- `/1931` reads as "unknown date to 1931".

## Phase 2: the `<edtf-input>` element

Scope: the event guided UI, per-part certainty, the timeline, form association and `edtf-change`. With `semantics="period"`, phase 2 shows only the "type it" box (core already parses periods); the start and end panels are phase 3.

### Structure

| Module        | Does                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element.ts`  | `EdtfInputElement`: shadow DOM, attributes, form association, events. Builds its DOM once and updates it in place; no framework.                                           |
| `controls.ts` | Pure mapping between the guided controls' values (`Controls`) and core `State`, both ways, so `fromValue()` and "Adjust this using the options above" fill the controls.   |
| `timeline.ts` | Pure `timeline(result)`: an axis and marks in percentages, or null when there's nothing to place or the span is over 5,000 years. The element only turns it into elements. |
| `styles.ts`   | Shadow CSS. Themed with `--edtf-*` custom properties and `::part()`; light and dark via `prefers-color-scheme`.                                                            |

### Element API

- Attributes: `name`, `label`, `hint`, `value`, `semantics`, `min`, `max`, `warn-before`, `warn-message`, `max-level`, `locale`, `required`, `disabled`, `earliest-name`, `latest-name`. Properties for what attributes can't carry: `terms` and `warn` (an array of rules).
- `value` (EDTF string), `result` (the last core `Result`) and `validity` / `validationMessage` / `checkValidity()` / `reportValidity()` via `ElementInternals`.
- Events: `edtf-change` (bubbles, composed) with the `Result` plus `valid`; a plain `change` too, for frameworks that listen for it.

### Form association

- `setFormValue` gets a `FormData` when `earliest-name` / `latest-name` are set, so one element submits three fields with no hidden inputs. Otherwise it's just the value.
- Validity: an `invalid` result sets `customError` with the message. `incomplete` does too, once the person has started an answer, so a half-entered date can't be submitted by accident. Nothing chosen and `required` gives `valueMissing`.
- `formResetCallback` restores the `value` attribute, `formStateRestoreCallback` restores the value, and `formDisabledCallback` disables the controls.

### Testing

The element's tests run in real Chromium (Vitest browser mode with Playwright), because happy-dom and jsdom don't implement `ElementInternals`. Core's tests stay in Node.
