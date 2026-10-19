import {
  analyse,
  ConfigError,
  fromValue,
  generate,
  incomplete,
  invalid,
  message,
  parsePeriodText,
  parseText,
  resolveConfig,
  type Certainty,
  type Config,
  type EventState,
  type Result,
  type Terms,
  type WarnRule,
} from 'edtf-input-core'
import {
  answerOf,
  controlsFor,
  EMPTY_CONTROLS,
  MODES,
  type Controls,
  type DateFields,
  type Field,
  type Mode,
} from './controls.js'
import { styles } from './styles.js'
import { timeline } from './timeline.js'

/** The detail of `edtf-change`: the core Result, plus whether it can be submitted */
export type EdtfChangeDetail = Result & { readonly valid: boolean }

const OPTIONS: Readonly<Record<Mode, readonly [title: string, hint: string]>> = {
  exact: ['I know the exact date', 'Day, month and year'],
  year: ['I know the year', 'And maybe the month or season'],
  decade: ['I know roughly which decade', 'Like “the 1960s” or “the late 70s”'],
  between: ['Somewhere between two dates', 'Like “not before 1950, not after 1960”'],
  beforeAfter: ['Only before or after a certain date', 'Like “before 1931”'],
  text: ['Let me type it', 'In your own words'],
  unknown: ['I don’t know', 'That’s fine, you can leave it unknown'],
}

const CERTAINTY: readonly [Certainty, string][] = [
  ['sure', '✓ Sure'],
  ['approximate', '≈ Roughly'],
  ['uncertain', '? Not certain'],
  ['both', '≈? Roughly, not certain'],
  ['unknown', 'Don’t know'],
]

const SEASONS: readonly [number, string][] = [
  [21, 'Spring'],
  [22, 'Summer'],
  [23, 'Autumn'],
  [24, 'Winter'],
]

const EVENT_EXAMPLES = [
  'about 1965',
  'summer 1975',
  'late 1940s',
  'June 1982?',
  'between 1950 and 1960',
  'before 1931',
]
const PERIOD_EXAMPLES = [
  '1950 to 1962',
  'about 1890 to 1905',
  'June 1975 to present',
  'the 1920s',
  'since 2004',
]

const DECADE_PARTS = [
  ['any', 'Not really'],
  ['early', 'Early'],
  ['mid', 'Middle'],
  ['late', 'Late'],
] as const

const ATTRIBUTES = [
  'name',
  'label',
  'hint',
  'value',
  'semantics',
  'min',
  'max',
  'warn-before',
  'warn-message',
  'max-level',
  'locale',
  'required',
  'disabled',
  'earliest-name',
  'latest-name',
] as const

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`)

type FormControl = HTMLInputElement | HTMLSelectElement

/**
 * <edtf-input>: a date input that stores EDTF. Form-associated, so it
 * submits a value and reports validity like a native input.
 */
export class EdtfInputElement extends HTMLElement {
  static readonly formAssociated = true
  static readonly observedAttributes = ATTRIBUTES

  /** edtf-humanize term overrides, e.g. "around" instead of "circa" */
  terms: Terms = {}
  /** Soft warnings, in addition to warn-before / warn-message */
  warn: readonly WarnRule[] = []

  readonly #internals = this.attachInternals()
  readonly #root = this.attachShadow({ mode: 'open', delegatesFocus: true })
  #built: { locale: string; semantics: string } | null = null
  #result: Result = analyse('', resolveConfig())
  #touched = false
  /** A loaded value the guided controls can't show; kept until the person changes something */
  #kept: string | null = null
  /** The decade buttons show this century */
  #century = Math.floor(new Date().getFullYear() / 100) * 100
  /** The last text the parser understood, for "Adjust this using the options above" */
  #parsed: EventState | null = null

  connectedCallback(): void {
    if (!this.#built) {
      this.#build()
      this.#load(this.getAttribute('value') ?? '')
    }
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (!this.#built || old === value) return
    if (name === 'label' || name === 'hint') {
      this.#renderText()
      return
    }
    if (name === 'value' && !this.#touched) {
      this.#load(value ?? '')
      return
    }
    if (name === 'locale' || name === 'semantics') {
      const controls = this.#readControls()
      this.#build()
      this.#writeControls(controls)
    }
    this.#update(false)
  }

  /** The EDTF value, or '' when there isn't a valid one */
  get value(): string {
    return this.#result.status === 'valid' ? (this.#result.value ?? '') : ''
  }

  set value(v: string) {
    this.#touched = false
    this.#load(v)
  }

  /** The last result: label, bounds, warnings and so on */
  get result(): Result {
    return this.#result
  }

  get form(): HTMLFormElement | null {
    return this.#internals.form
  }

  get validity(): ValidityState {
    return this.#internals.validity
  }

  get validationMessage(): string {
    return this.#internals.validationMessage
  }

  checkValidity(): boolean {
    return this.#internals.checkValidity()
  }

  reportValidity(): boolean {
    return this.#internals.reportValidity()
  }

  formResetCallback(): void {
    this.#touched = false
    this.#load(this.getAttribute('value') ?? '')
  }

  formStateRestoreCallback(state: unknown): void {
    if (typeof state === 'string') this.#load(state)
  }

  formDisabledCallback(disabled: boolean): void {
    for (const el of this.#root.querySelectorAll<FormControl | HTMLButtonElement>(
      'input, select, button',
    ))
      el.disabled = disabled
    if (!disabled) this.#syncControls()
  }

  // ---- configuration ----

  #config(): Config {
    const attr = (n: string) => this.getAttribute(n)
    const semantics = attr('semantics') === 'period' ? 'period' : 'event'
    const locale =
      attr('locale') ?? this.closest('[lang]')?.getAttribute('lang') ?? navigator.language
    const before = attr('warn-before')
    const warn = [
      ...(before ? [{ before, message: attr('warn-message') ?? '' }] : []),
      ...this.warn,
    ]
    try {
      return resolveConfig({
        semantics,
        min: attr('min'),
        max: attr('max'),
        maxLevel: attr('max-level'),
        warn,
        locale,
        terms: this.terms,
      })
    } catch (e) {
      // A bad attribute shouldn't break the field; drop the limits and say why
      if (!(e instanceof ConfigError)) throw e
      console.warn(`<edtf-input>: ${e.message}`)
      return resolveConfig({ semantics, locale, terms: this.terms })
    }
  }

  // ---- DOM ----

  // Typed like querySelector: the caller says what the selector finds
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  #$<T extends Element>(selector: string): T | null {
    return this.#root.querySelector<T>(selector)
  }

  #build(): void {
    const config = this.#config()
    const months = Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat(config.locale, { month: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2000, i, 15)),
      ),
    )
    const period = config.semantics === 'period'

    const select = (path: string, label: string, options: string) =>
      `<label><span>${label}</span><select data-path="${path}">${options}</select></label>`
    const certainty = (path: string, what: string) =>
      `<select class="certainty" data-certainty="${path}" aria-label="How sure are you about the ${what}?">${CERTAINTY.map(
        ([v, t]) => `<option value="${v}">${t}</option>`,
      ).join('')}</select>`
    const dayOptions = (empty: string) =>
      `<option value="">${empty}</option>${Array.from({ length: 31 }, (_, i) => `<option value="${String(i + 1)}">${String(i + 1)}</option>`).join('')}`
    const monthOptions = (empty: string, seasons: boolean) =>
      `<option value="">${empty}</option><optgroup label="Month">${months
        .map((m, i) => `<option value="${String(i + 1)}">${escapeHtml(m)}</option>`)
        .join('')}</optgroup>${
        seasons
          ? `<optgroup label="Season">${SEASONS.map(([v, t]) => `<option value="${String(v)}">${t}</option>`).join('')}</optgroup>`
          : ''
      }`
    /** Day, month and year fields in the locale's order */
    const dateRow = (
      prefix: string,
      opts: {
        certainty: boolean
        optional: boolean
        seasons?: boolean
        monthLabel?: string
        monthEmpty?: string
        kinds?: readonly ('day' | 'month' | 'year')[]
      },
    ) => {
      const kinds = opts.kinds ?? ['day', 'month', 'year']
      const html: Record<string, string> = {
        day: `<div class="field narrow">${select(`${prefix}.day`, 'Day', dayOptions('–'))}${opts.certainty ? certainty(`${prefix}.day`, 'day') : ''}</div>`,
        month: `<div class="field">${select(`${prefix}.month`, opts.monthLabel ?? 'Month', monthOptions(opts.monthEmpty ?? (opts.optional ? '–' : 'Choose'), opts.seasons ?? false))}${opts.certainty ? certainty(`${prefix}.month`, 'month') : ''}</div>`,
        year: `<div class="field narrow"><label><span>Year</span><input data-path="${prefix}.year" inputmode="numeric" maxlength="4" placeholder="1965" autocomplete="off"></label>${opts.certainty ? certainty(`${prefix}.year`, 'year') : ''}</div>`,
      }
      const order = config.dateOrder === 'mdy' ? ['month', 'day', 'year'] : ['day', 'month', 'year']
      return `<div class="row">${order
        .filter((k) => kinds.includes(k as 'day'))
        .map((k) => html[k] ?? '')
        .join('')}</div>`
    }
    const chips = (name: string, items: readonly (readonly [string, string])[]) =>
      `<div class="chips">${items
        .map(
          ([v, t], i) =>
            `<label class="chip"><input type="radio" name="${name}" value="${v}"${i === 0 ? ' checked' : ''}><span>${t}</span></label>`,
        )
        .join('')}</div>`
    const examples = (list: readonly string[]) =>
      `<div class="examples" aria-label="Examples">${list.map((t) => `<button type="button" class="example">${escapeHtml(t)}</button>`).join('')}</div>`

    const bodies: Record<Mode, string> = {
      exact: `${dateRow('exact', { certainty: true, optional: false })}<p class="small">Not sure about a part? Use the small menu under it.</p>`,
      year: dateRow('year', {
        certainty: true,
        optional: false,
        seasons: true,
        kinds: ['month', 'year'],
        monthLabel: 'Month or season (if you know it)',
        monthEmpty: 'Just the year',
      }),
      decade: `<input type="hidden" data-path="decade.decade">
        <div class="century"><button type="button" class="pager" data-century="-100" aria-label="Previous century">‹</button>
        <strong class="century-label"></strong>
        <button type="button" class="pager" data-century="100" aria-label="Next century">›</button></div>
        <div class="decades" role="group" aria-label="Decade"></div>
        <p class="sub" id="part-label">Can you narrow it down?</p>${chips('decade-part', DECADE_PARTS)}`,
      between: `<p class="sub">No earlier than</p>${dateRow('between.from', { certainty: false, optional: true })}
        <p class="sub">No later than</p>${dateRow('between.to', { certainty: false, optional: true })}
        <p class="small">The day and month are optional.</p>`,
      beforeAfter: `${chips('before-after', [
        ['before', 'Before'],
        ['after', 'After'],
      ])}
        <div style="margin-top:12px">${dateRow('beforeAfter.at', { certainty: false, optional: true })}</div>`,
      text: `<div class="field"><label><span class="visually-hidden">Date in your own words</span>
        <input data-path="text" placeholder="For example: about 1965" autocomplete="off"></label></div>
        ${examples(EVENT_EXAMPLES)}<button type="button" class="link adjust" hidden>Adjust this using the options above</button>`,
      unknown: '',
    }

    const options = MODES.map(
      (mode) => `<div class="opt" data-mode="${mode}">
        <label class="opt-head" part="option"><input type="radio" name="mode" value="${mode}">
          <span><strong>${OPTIONS[mode][0]}</strong><small>${OPTIONS[mode][1]}</small></span></label>
        ${bodies[mode] ? `<div class="opt-body">${bodies[mode]}</div>` : ''}</div>`,
    ).join('')

    const periodText = `<div class="opt open"><div class="opt-body" style="padding-left:20px;padding-top:14px">
      <div class="field"><label><span>When did it start and end?</span>
      <input data-path="period-text" placeholder="For example: about 1890 to 1905" autocomplete="off"></label></div>
      ${examples(PERIOD_EXAMPLES)}</div></div>`

    this.#root.innerHTML = `<style>${styles}</style>
      <div class="panel" part="panel">
        <fieldset>
          <legend><span class="title" part="label"></span></legend>
          <p class="hint" part="hint"></p>
          ${period ? periodText : `<div class="options">${options}</div>`}
        </fieldset>
        <section class="result" part="result" aria-live="polite">
          <p class="kicker">We’ll record this as</p>
          <p class="label-text"></p>
          <p class="caption"></p>
          <div class="timeline" aria-hidden="true" hidden></div>
          <ul class="messages"></ul>
        </section>
      </div>`

    this.#root.addEventListener('input', (e) => {
      this.#onInput(e)
    })
    this.#root.addEventListener('change', (e) => {
      this.#onInput(e)
    })
    this.#root.addEventListener('click', (e) => {
      this.#onClick(e)
    })
    this.#built = { locale: config.locale, semantics: config.semantics }
    this.#renderText()
    this.#renderDecades()
  }

  #renderText(): void {
    const title = this.#$<HTMLElement>('.title')
    const hint = this.#$<HTMLElement>('.hint')
    if (title) title.textContent = this.getAttribute('label') ?? 'Date'
    if (hint) hint.textContent = this.getAttribute('hint') ?? ''
  }

  #renderDecades(): void {
    const grid = this.#$<HTMLElement>('.decades')
    if (!grid) return
    const config = this.#config()
    const minYear = config.min ? Number(config.min.iso.slice(0, -6)) : -Infinity
    const maxYear = config.max ? Number(config.max.iso.slice(0, -6)) : Infinity
    const allowed = (from: number, to: number) => to >= minYear && from <= maxYear
    const chosen = this.#$<HTMLInputElement>('[data-path="decade.decade"]')?.value ?? ''
    const c = this.#century
    const label = this.#$<HTMLElement>('.century-label')
    if (label) label.textContent = `${String(c)}–${String(c + 99)}`
    grid.replaceChildren(
      ...Array.from({ length: 10 }, (_, i) => {
        const d = c + i * 10
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'decade'
        b.dataset.decade = String(d)
        b.textContent = `${String(d)}s`
        b.disabled = !allowed(d, d + 9)
        b.setAttribute('aria-pressed', String(String(d) === chosen))
        return b
      }),
    )
    const prev = this.#$<HTMLButtonElement>('[data-century="-100"]')
    const next = this.#$<HTMLButtonElement>('[data-century="100"]')
    if (prev) prev.disabled = c - 100 < 0 || !allowed(c - 100, c - 1)
    if (next) next.disabled = c + 100 > 9900 || !allowed(c + 100, c + 199)
  }

  // ---- reading and writing the controls ----

  #readControls(): Controls {
    const val = (path: string) => this.#$<FormControl>(`[data-path="${path}"]`)?.value ?? ''
    const cert = (path: string) =>
      (this.#$<HTMLSelectElement>(`[data-certainty="${path}"]`)?.value ?? 'sure') as Certainty
    const field = (path: string): Field => ({ value: val(path), certainty: cert(path) })
    const date = (p: string): DateFields => ({
      day: field(`${p}.day`),
      month: field(`${p}.month`),
      year: field(`${p}.year`),
    })
    const checked = (name: string) =>
      this.#$<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null
    const mode = checked('mode')
    return {
      mode: MODES.find((m) => m === mode) ?? null,
      exact: date('exact'),
      year: { month: field('year.month'), year: field('year.year') },
      decade: {
        decade: val('decade.decade'),
        part: (checked('decade-part') ?? 'any') as Controls['decade']['part'],
      },
      between: { from: date('between.from'), to: date('between.to') },
      beforeAfter: {
        dir: checked('before-after') === 'after' ? 'after' : 'before',
        at: date('beforeAfter.at'),
      },
      text: val('text'),
    }
  }

  #writeControls(c: Controls): void {
    const set = (path: string, f: Field) => {
      const v = this.#$<FormControl>(`[data-path="${path}"]`)
      const q = this.#$<HTMLSelectElement>(`[data-certainty="${path}"]`)
      if (v) v.value = f.value
      if (q) q.value = f.certainty
    }
    const date = (p: string, d: DateFields) => {
      set(`${p}.day`, d.day)
      set(`${p}.month`, d.month)
      set(`${p}.year`, d.year)
    }
    const check = (name: string, value: string | null) => {
      for (const r of this.#root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
        r.checked = r.value === value
    }
    check('mode', c.mode)
    date('exact', c.exact)
    set('year.month', c.year.month)
    set('year.year', c.year.year)
    const decade = this.#$<HTMLInputElement>('[data-path="decade.decade"]')
    if (decade) decade.value = c.decade.decade
    if (c.decade.decade) this.#century = Math.floor(Number(c.decade.decade) / 100) * 100
    check('decade-part', c.decade.part)
    date('between.from', c.between.from)
    date('between.to', c.between.to)
    check('before-after', c.beforeAfter.dir)
    date('beforeAfter.at', c.beforeAfter.at)
    const text = this.#$<HTMLInputElement>('[data-path="text"]')
    if (text) text.value = c.text
    this.#renderDecades()
  }

  /** Opens the chosen option, and disables parts marked "don't know" */
  #syncControls(): void {
    const mode = this.#$<HTMLInputElement>('input[name="mode"]:checked')?.value
    for (const opt of this.#root.querySelectorAll<HTMLElement>('.opt[data-mode]'))
      opt.classList.toggle('open', opt.dataset.mode === mode)
    for (const q of this.#root.querySelectorAll<HTMLSelectElement>('select.certainty')) {
      q.classList.toggle('set', q.value !== 'sure')
      const target = this.#$<FormControl>(`[data-path="${q.dataset.certainty ?? ''}"]`)
      if (target) target.disabled = q.value === 'unknown' || this.matches(':disabled')
    }
  }

  // ---- loading, computing, rendering ----

  #load(value: string): void {
    if (!this.#built) return
    const config = this.#config()
    const v = value.trim()
    this.#kept = null
    this.#parsed = null
    const state = v ? fromValue(v, config) : null
    if (config.semantics === 'event' && state && state.kind !== 'period') {
      this.#writeControls(controlsFor(state, EMPTY_CONTROLS))
    } else {
      this.#writeControls(EMPTY_CONTROLS)
      const text = this.#$<HTMLInputElement>('[data-path="period-text"]')
      if (text) text.value = ''
      if (v) this.#kept = v
    }
    this.#update(false)
  }

  #compute(config: Config): Result {
    this.#parsed = null
    if (config.semantics === 'period') {
      const text = this.#$<HTMLInputElement>('[data-path="period-text"]')?.value ?? ''
      if (!text.trim()) return this.#kept ? analyse(this.#kept, config) : analyse('', config)
      const p = parsePeriodText(text, config)
      if ('error' in p) return p.error.code === 'empty' ? incomplete(p.error) : invalid(p.error)
      const r = generate(p.state, config)
      return { ...r, notes: [...p.notes, ...r.notes] }
    }
    const answer = answerOf(this.#readControls())
    if (answer == null) return analyse(this.#kept ?? '', config)
    if ('missing' in answer) return incomplete(message('missing', { part: answer.missing }))
    if ('text' in answer) {
      const p = parseText(answer.text, config)
      if ('error' in p) return p.error.code === 'empty' ? incomplete(p.error) : invalid(p.error)
      this.#parsed = p.state
      const r = generate(p.state, config)
      return { ...r, notes: [...p.notes, ...r.notes] }
    }
    return generate(answer.state, config)
  }

  #update(fromUser: boolean): void {
    const config = this.#config()
    const before = this.#result
    const r = this.#compute(config)
    this.#result = r
    this.#syncControls()
    this.#renderResult(r)
    this.#syncForm(r)
    if (
      fromUser &&
      (before.value !== r.value || before.status !== r.status || before.label !== r.label)
    ) {
      const detail: EdtfChangeDetail = { ...r, valid: this.#internals.validity.valid }
      this.dispatchEvent(new CustomEvent('edtf-change', { detail, bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  #renderResult(r: Result): void {
    const label = this.#$<HTMLElement>('.label-text')
    const caption = this.#$<HTMLElement>('.caption')
    const list = this.#$<HTMLUListElement>('.messages')
    const tl = this.#$<HTMLElement>('.timeline')
    if (!label || !caption || !list || !tl) return

    const valid = r.status === 'valid'
    label.classList.toggle('empty', !valid)
    label.textContent = valid ? (r.label ?? '') : 'Choose an option above'
    caption.textContent = valid ? (r.caption ?? '') : ''

    const items: [string, string][] = [
      ...(this.#kept && valid
        ? [['note', 'Choosing an option above replaces this date.'] as [string, string]]
        : []),
      ...r.notes.map((m) => ['note', m.text] as [string, string]),
      ...r.warnings.map((m) => ['warning', m.text] as [string, string]),
      ...(r.error && (r.status === 'invalid' || this.#touched)
        ? [['error', r.error.text] as [string, string]]
        : []),
    ]
    list.replaceChildren(
      ...items.map(([kind, text]) => {
        const li = document.createElement('li')
        li.className = kind
        li.textContent = text
        return li
      }),
    )

    const adjust = this.#$<HTMLButtonElement>('.adjust')
    if (adjust) adjust.hidden = this.#parsed == null

    const t = timeline(r)
    tl.hidden = t == null
    if (!t) {
      tl.replaceChildren()
      return
    }
    const m = t.mark
    const bar = document.createElement('div')
    bar.className = [
      'mark',
      m.fill,
      m.point ? 'point' : '',
      `${m.start}-start`,
      `${m.end}-end`,
    ].join(' ')
    bar.style.left = `${String(m.from)}%`
    bar.style.width = `${String(Math.max(m.to - m.from, 0))}%`
    if (m.point) bar.style.left = `${String((m.from + m.to) / 2)}%`
    const axis = document.createElement('div')
    axis.className = 'axis'
    axis.append(
      ...t.ticks.map((tick) => {
        const s = document.createElement('span')
        s.style.left = `${String(tick.at)}%`
        s.textContent = tick.label
        return s
      }),
    )
    const unknown = t.unknownAt.map((at) => {
      const q = document.createElement('div')
      q.className = 'unknown-end'
      q.style.left = `${String(at)}%`
      q.textContent = '?'
      return q
    })
    const track = document.createElement('div')
    track.className = 'track'
    tl.replaceChildren(track, bar, ...unknown, axis)
  }

  #syncForm(r: Result): void {
    const value = r.status === 'valid' ? (r.value ?? '') : ''
    const name = this.getAttribute('name')
    const earliestName = this.getAttribute('earliest-name')
    const latestName = this.getAttribute('latest-name')
    if (earliestName || latestName) {
      const data = new FormData()
      if (name) data.append(name, value)
      if (earliestName) data.append(earliestName, r.status === 'valid' ? (r.earliest ?? '') : '')
      if (latestName) data.append(latestName, r.status === 'valid' ? (r.latest ?? '') : '')
      this.#internals.setFormValue(data, value)
    } else {
      this.#internals.setFormValue(value, value)
    }

    const anchor =
      this.#$<HTMLElement>('input[name="mode"], input[data-path="period-text"]') ?? undefined
    const started = this.#touched && answerOf(this.#readControls()) != null
    if (r.status === 'invalid' && r.error) {
      this.#internals.setValidity({ customError: true }, r.error.text, anchor)
    } else if (r.status === 'incomplete' && r.error && started && r.error.code !== 'empty-edtf') {
      this.#internals.setValidity({ customError: true }, r.error.text, anchor)
    } else if (!value && this.hasAttribute('required')) {
      this.#internals.setValidity(
        { valueMissing: true },
        'Please give a date, or choose “I don’t know”.',
        anchor,
      )
    } else {
      this.#internals.setValidity({})
    }
  }

  // ---- events ----

  #onInput(e: Event): void {
    const target = e.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return
    // Typing in an option's fields chooses that option
    const opt = target.closest<HTMLElement>('.opt[data-mode]')
    const radio = opt?.querySelector<HTMLInputElement>('input[name="mode"]')
    if (radio && !radio.checked && target !== radio) radio.checked = true
    this.#touched = true
    this.#kept = null
    this.#update(true)
  }

  #onClick(e: Event): void {
    const target = e.target
    if (!(target instanceof HTMLElement)) return
    const button = target.closest('button')
    if (!button) return
    if (button.dataset.century) {
      this.#century += Number(button.dataset.century)
      this.#renderDecades()
      return
    }
    if (button.dataset.decade) {
      const decade = this.#$<HTMLInputElement>('[data-path="decade.decade"]')
      if (decade) decade.value = button.dataset.decade
      const radio = this.#$<HTMLInputElement>('.opt[data-mode="decade"] input[name="mode"]')
      if (radio) radio.checked = true
      this.#renderDecades()
      this.#touched = true
      this.#kept = null
      this.#update(true)
      return
    }
    if (button.classList.contains('example')) {
      const input = this.#$<HTMLInputElement>('[data-path="text"], [data-path="period-text"]')
      if (!input) return
      input.value = button.textContent
      const radio = this.#$<HTMLInputElement>('.opt[data-mode="text"] input[name="mode"]')
      if (radio) radio.checked = true
      this.#touched = true
      this.#kept = null
      this.#update(true)
      input.focus()
      return
    }
    if (button.classList.contains('adjust') && this.#parsed) {
      this.#writeControls(controlsFor(this.#parsed, this.#readControls()))
      this.#update(true)
      this.#$<HTMLElement>('.opt.open input:not([type=radio]), .opt.open select')?.focus()
    }
  }
}
