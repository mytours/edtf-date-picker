# edtf-input

A date input that stores [EDTF](https://www.loc.gov/standards/datetime/) (ISO 8601-2) values and is usable by the public, not just cataloguers.

| Package                                    | What it is                                                 | Status      |
| ------------------------------------------ | ---------------------------------------------------------- | ----------- |
| [`edtf-input-core`](packages/core)         | Model, generator, natural-language parser, bounds. No DOM. | In progress |
| [`edtf-input`](packages/element)           | The `<edtf-input>` Web Component                           | Planned     |
| [`edtf-input-react`](packages/react)       | React wrapper                                              | Planned     |
| [`edtf-input-stimulus`](packages/stimulus) | Stimulus controller (progressive enhancement)              | Planned     |

Design: [`docs/plans/2026-10-19-edtf-input-design.md`](docs/plans/2026-10-19-edtf-input-design.md).

## Development

```sh
pnpm install
pnpm test        # vitest, all packages
pnpm typecheck
pnpm lint
pnpm build
```

Labels come from [edtf-humanize](https://github.com/mytours/edtf-humanize-js). To develop against a local checkout, add `"pnpm": { "overrides": { "edtf-humanize": "link:../edtf-humanize-js" } }` to the root `package.json` (don't commit it).
