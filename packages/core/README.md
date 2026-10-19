# edtf-input-core

The model, generator, natural-language parser and bounds behind [`<edtf-input>`](../element). No DOM, so it runs anywhere: browsers, Node, tests.

```ts
import { generate, parseText, resolveConfig } from 'edtf-input-core'

const config = resolveConfig({ semantics: 'event', locale: 'en-NZ', max: 'today' })

const parsed = parseText('about 1965', config)
if (!('error' in parsed)) {
  const result = generate(parsed.state, config)
  result.value // '1965~'
  result.label // 'circa 1965'
  result.earliest // '1965-01-01'
  result.latest // '1965-12-31'
}
```

## API

| Function                        | Does                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `resolveConfig(input)`          | Fills in defaults. Accepts attribute-style strings (`max: 'today'`, `maxLevel: '1'`).  |
| `generate(state, config)`       | Guided UI state → `Result`. Every value is checked with edtf.js before it is returned. |
| `parseText(text, config)`       | Event text ("late 1940s", "before 1931") → `{ state, notes }` or `{ error }`.          |
| `parsePeriodText(text, config)` | Period text ("about 1890 to 1905", "since 2004") → `{ state, notes }` or `{ error }`.  |
| `analyse(value, config)`        | Checks and describes a raw EDTF value (advanced mode, or a value loaded from a host).  |
| `bounds(value)`                 | Earliest and latest possible days, worked out from the parse tree.                     |

A `Result` has a `status` of `valid`, `incomplete` or `invalid`, plus `value`, `level`, `label`, `caption`, `earliest`, `latest`, `start` and `end` (`date`, `open` or `unknown`), `warnings`, `notes` and `error`. Messages are `{ code, params, text }`: `text` is English, and `code` is there so hosts can localise.

### Config

| Field       | Default      | Notes                                                                                            |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `semantics` | `'event'`    | `'event'` (one moment, possibly fuzzy) or `'period'` (a span)                                    |
| `min`/`max` | none         | A year, an ISO date or `'today'`; inclusive                                                      |
| `warn`      | `[]`         | `[{ before: 1826, message: '…' }]`: a soft warning when the date is entirely before (or `after`) |
| `maxLevel`  | `2`          | Highest EDTF level accepted                                                                      |
| `locale`    | `'en'`       | Labels (via edtf-humanize) and slash-date order                                                  |
| `terms`     | `{}`         | edtf-humanize term overrides, such as `approximatePrefix` for "around" instead of "circa"        |
| `now`       | `new Date()` | Injectable clock, for `'today'` and two-digit decades                                            |

## Why not just use edtf.js min/max?

edtf.js is the parser and validator here, but its bounds are wrong for several shapes, so `bounds()` works from the parse tree instead: set ranges (`[1667..1672]` gives a max of the end of 1667), long years (`Y170000002` gives `NaN`), and hemisphere seasons (`2001-25` gets the same range as `2001-33`). It also tells open interval ends (`1950/..`) from unknown ones (`1950/`), which edtf.js reports the same way.

## Licence

BSD-3-Clause
