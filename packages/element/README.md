# edtf-input

`<edtf-input>` is a date input that stores [EDTF](https://www.loc.gov/standards/datetime/) (ISO 8601-2) values. People answer in whatever way they can: an exact date, a year, a decade, a range, "before 1931", their own words, or "I don't know". Each part of a date can be marked as rough or not certain. The element writes valid EDTF, says what it will record in plain words, and draws it on a small timeline.

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/edtf-input/dist/edtf-input.standalone.js"
></script>

<form>
  <edtf-input
    name="date"
    label="When was this photo taken?"
    max="today"
    warn-before="1826"
    warn-message="That’s earlier than the oldest known photograph. Is the year right?"
    earliest-name="date_earliest"
    latest-name="date_latest"
  ></edtf-input>
</form>
```

It's a form-associated custom element. It submits with the form, takes part in validation (`required`, `checkValidity()`, `reportValidity()`), resets with the form and is disabled by a disabled `<fieldset>`. No build step is needed.

## Installing

```sh
npm install edtf-input
```

```js
import 'edtf-input' // defines <edtf-input>
```

The package's main entry keeps `edtf-input-core`, `edtf` and `edtf-humanize` as dependencies, for bundlers and Rails `bin/importmap pin edtf-input`. `edtf-input/standalone` is a single file with everything inlined.

> **Bundling:** edtf.js uses class names as type names, and some bundlers rename its `class Date` because it shadows the global. If labels come out empty after bundling, turn on your bundler's keep-names option (`keepNames` in esbuild and rolldown). The standalone file already does.

## Attributes

| Attribute                      | Default        | What it does                                                                       |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------- |
| `name`                         |                | Form field name                                                                    |
| `value`                        |                | Initial EDTF value; loaded into the guided options where it can be                 |
| `label`, `hint`                | `Date`         | The question and a line under it                                                   |
| `semantics`                    | `event`        | `event` (one moment, maybe fuzzy) or `period` (a span; typed only, until phase 3)  |
| `min`, `max`                   |                | A year, an ISO date or `today`; inclusive                                          |
| `warn-before`, `warn-message`  |                | A soft warning for dates entirely before a year                                    |
| `max-level`                    | `2`            | Highest EDTF level accepted                                                        |
| `locale`                       | nearest `lang` | Month names, slash-date order and labels                                           |
| `earliest-name`, `latest-name` |                | Also submit the earliest and latest possible days (ISO), for sorting and filtering |
| `required`, `disabled`         |                | As for native inputs                                                               |

Properties: `value`, `result` (the full result: label, bounds, warnings…), `terms` (edtf-humanize term overrides, e.g. "around" instead of "circa"), `warn` (more warning rules) and `form`.

## Events

`edtf-change` fires when the answer changes, with the result as `detail`: `{ value, valid, status, level, label, caption, earliest, latest, warnings, notes, error, … }`. A plain `change` event fires too.

## Styling

Set `--edtf-accent`, `--edtf-surface`, `--edtf-text`, `--edtf-muted`, `--edtf-line`, `--edtf-focus`, `--edtf-error` and `--edtf-radius` on the element or an ancestor. Light and dark follow `prefers-color-scheme`. Parts: `panel`, `label`, `hint`, `option` and `result`.

## Licence

BSD-3-Clause
