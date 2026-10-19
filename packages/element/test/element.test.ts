import { afterEach, describe, expect, it } from 'vitest'
import '../src/index.js'
import type { EdtfChangeDetail, EdtfInputElement } from '../src/index.js'

afterEach(() => {
  document.body.replaceChildren()
})

function mount(html: string): EdtfInputElement {
  document.body.innerHTML = html
  const el = document.querySelector('edtf-input')
  if (!el) throw new Error('no <edtf-input>')
  return el
}

const shadow = (el: EdtfInputElement) => {
  if (!el.shadowRoot) throw new Error('no shadow root')
  return el.shadowRoot
}

// Typed like querySelector: the caller says what the selector finds
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function $<T extends Element = HTMLElement>(el: EdtfInputElement, selector: string): T {
  const found = shadow(el).querySelector<T>(selector)
  if (!found) throw new Error(`nothing matches ${selector}`)
  return found
}

/** Sets a control the way a person would, firing input and change */
function set(el: EdtfInputElement, selector: string, value: string): void {
  const control = $<HTMLInputElement | HTMLSelectElement>(el, selector)
  control.value = value
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function choose(el: EdtfInputElement, mode: string): void {
  const radio = $<HTMLInputElement>(el, `input[name="mode"][value="${mode}"]`)
  radio.click()
}

const label = (el: EdtfInputElement) => $(el, '.label-text').textContent
const messages = (el: EdtfInputElement) =>
  [...shadow(el).querySelectorAll('.messages li')].map((li) => li.textContent)

const events = (el: EdtfInputElement) => {
  const seen: EdtfChangeDetail[] = []
  el.addEventListener('edtf-change', (e) => seen.push(e.detail))
  return seen
}

describe('<edtf-input>', () => {
  it('shows its label, hint and options, with nothing recorded yet', () => {
    const el = mount(
      '<edtf-input label="When was this photo taken?" hint="A guess is fine"></edtf-input>',
    )
    expect($(el, '.title').textContent).toBe('When was this photo taken?')
    expect($(el, '.hint').textContent).toBe('A guess is fine')
    expect(shadow(el).querySelectorAll('input[name="mode"]')).toHaveLength(7)
    expect(label(el)).toBe('Choose an option above')
    expect(el.value).toBe('')
  })

  it('records a year and fires edtf-change', () => {
    const el = mount('<edtf-input locale="en-NZ"></edtf-input>')
    const seen = events(el)
    choose(el, 'year')
    set(el, '[data-path="year.year"]', '1965')
    expect(el.value).toBe('1965')
    expect(label(el)).toBe('1965')
    expect(seen.at(-1)).toMatchObject({
      value: '1965',
      valid: true,
      earliest: '1965-01-01',
      latest: '1965-12-31',
    })
  })

  it('chooses an option when you type in its fields', () => {
    const el = mount('<edtf-input></edtf-input>')
    set(el, '[data-path="year.year"]', '1965')
    expect($<HTMLInputElement>(el, 'input[name="mode"][value="year"]').checked).toBe(true)
    expect($(el, '.opt[data-mode="year"]').classList.contains('open')).toBe(true)
  })

  it('writes per-part certainty', () => {
    const el = mount('<edtf-input></edtf-input>')
    choose(el, 'exact')
    set(el, '[data-path="exact.day"]', '12')
    set(el, '[data-path="exact.month"]', '3')
    set(el, '[data-path="exact.year"]', '1982')
    set(el, '[data-certainty="exact.month"]', 'uncertain')
    set(el, '[data-certainty="exact.day"]', 'approximate')
    expect(el.value).toBe('1982-?03-~12')
  })

  it('disables a part marked “don’t know”', () => {
    const el = mount('<edtf-input></edtf-input>')
    choose(el, 'exact')
    set(el, '[data-path="exact.month"]', '3')
    set(el, '[data-path="exact.year"]', '1982')
    set(el, '[data-certainty="exact.day"]', 'unknown')
    expect($<HTMLSelectElement>(el, '[data-path="exact.day"]').disabled).toBe(true)
    expect(el.value).toBe('1982-03-XX')
  })

  it('picks a decade, pages centuries and narrows it down', () => {
    const el = mount('<edtf-input></edtf-input>')
    $<HTMLButtonElement>(el, '[data-century="-100"]').click()
    expect($(el, '.century-label').textContent).toBe('1900–1999')
    $<HTMLButtonElement>(el, '[data-decade="1960"]').click()
    expect(el.value).toBe('196X')
    expect($(el, '[data-decade="1960"]').getAttribute('aria-pressed')).toBe('true')
    $<HTMLInputElement>(el, 'input[name="decade-part"][value="late"]').click()
    expect(el.value).toBe('[1967..1969]')
  })

  it('disables decades outside min and max', () => {
    const el = mount('<edtf-input max="today"></edtf-input>')
    expect($<HTMLButtonElement>(el, '[data-decade="2030"]').disabled).toBe(true)
    expect($<HTMLButtonElement>(el, '[data-decade="2020"]').disabled).toBe(false)
    expect($<HTMLButtonElement>(el, '[data-century="100"]').disabled).toBe(true)
  })

  it('reads text, shows notes, and can move it into the guided options', () => {
    const el = mount('<edtf-input locale="en-NZ"></edtf-input>')
    choose(el, 'text')
    set(el, '[data-path="text"]', "'60s")
    expect(el.value).toBe('196X')
    expect(messages(el)).toEqual(['We read that as the 1960s. Type “2060s” if you meant that.'])
    set(el, '[data-path="text"]', 'about 1965')
    expect(el.value).toBe('1965~')
    const adjust = $<HTMLButtonElement>(el, '.adjust')
    expect(adjust.hidden).toBe(false)
    adjust.click()
    expect($<HTMLInputElement>(el, 'input[name="mode"][value="year"]').checked).toBe(true)
    expect($<HTMLInputElement>(el, '[data-path="year.year"]').value).toBe('1965')
    expect($<HTMLSelectElement>(el, '[data-certainty="year.year"]').value).toBe('approximate')
    expect(el.value).toBe('1965~')
  })

  it('fills the text box from an example', () => {
    const el = mount('<edtf-input></edtf-input>')
    const example = [...shadow(el).querySelectorAll<HTMLButtonElement>('.example')].find(
      (b) => b.textContent === 'late 1940s',
    )
    example?.click()
    expect(el.value).toBe('[1947..1949]')
  })

  it('shows errors and warnings from config', () => {
    const el = mount(
      '<edtf-input max="today" warn-before="1826" warn-message="Earlier than the oldest known photograph."></edtf-input>',
    )
    choose(el, 'year')
    set(el, '[data-path="year.year"]', '2090')
    expect(el.value).toBe('')
    expect(messages(el)).toEqual(['That’s in the future, and this date can’t be.'])
    set(el, '[data-path="year.year"]', '1820')
    expect(el.value).toBe('1820')
    expect(messages(el)).toEqual(['Earlier than the oldest known photograph.'])
  })

  it('draws a timeline for dates it can place', () => {
    const el = mount('<edtf-input></edtf-input>')
    choose(el, 'year')
    set(el, '[data-path="year.year"]', '1965')
    set(el, '[data-certainty="year.year"]', 'approximate')
    expect($(el, '.timeline').hidden).toBe(false)
    expect($(el, '.mark').className).toContain('soft-start')
    choose(el, 'unknown')
    expect(el.value).toBe('XXXX')
    expect($(el, '.timeline').hidden).toBe(true)
  })
})

describe('<edtf-input> in a form', () => {
  it('submits its value, and earliest and latest when asked', () => {
    document.body.innerHTML =
      '<form><edtf-input name="date" earliest-name="date_earliest" latest-name="date_latest"></edtf-input></form>'
    const el = document.querySelector('edtf-input')
    const form = document.querySelector('form')
    if (!el || !form) throw new Error('not mounted')
    choose(el, 'text')
    set(el, '[data-path="text"]', 'late 1940s')
    expect([...new FormData(form).entries()]).toEqual([
      ['date', '[1947..1949]'],
      ['date_earliest', '1947-01-01'],
      ['date_latest', '1949-12-31'],
    ])
    expect(el.form).toBe(form)
  })

  it('submits just the value by default', () => {
    document.body.innerHTML = '<form><edtf-input name="date" value="1965~"></edtf-input></form>'
    const form = document.querySelector('form')
    if (!form) throw new Error('not mounted')
    expect([...new FormData(form).entries()]).toEqual([['date', '1965~']])
  })

  it('is missing when required and empty', () => {
    const el = mount('<edtf-input required></edtf-input>')
    expect(el.checkValidity()).toBe(false)
    expect(el.validity.valueMissing).toBe(true)
    choose(el, 'unknown')
    expect(el.checkValidity()).toBe(true)
  })

  it('is invalid for an impossible date, and for a half-entered one', () => {
    const el = mount('<edtf-input></edtf-input>')
    expect(el.checkValidity()).toBe(true)
    choose(el, 'exact')
    set(el, '[data-path="exact.year"]', '1975')
    expect(el.checkValidity()).toBe(false)
    expect(el.validationMessage).toBe('Add the month.')
    set(el, '[data-path="exact.month"]', '2')
    set(el, '[data-path="exact.day"]', '29')
    expect(el.validationMessage).toBe('February 1975 only had 28 days.')
    expect(messages(el)).toEqual(['February 1975 only had 28 days.'])
    set(el, '[data-path="exact.day"]', '28')
    expect(el.checkValidity()).toBe(true)
  })

  it('resets to its value attribute', () => {
    document.body.innerHTML = '<form><edtf-input name="date" value="1965"></edtf-input></form>'
    const el = document.querySelector('edtf-input')
    const form = document.querySelector('form')
    if (!el || !form) throw new Error('not mounted')
    set(el, '[data-path="year.year"]', '1970')
    expect(el.value).toBe('1970')
    form.reset()
    expect(el.value).toBe('1965')
    expect($<HTMLInputElement>(el, '[data-path="year.year"]').value).toBe('1965')
  })

  it('disables its controls with the form', () => {
    document.body.innerHTML = '<form><fieldset disabled><edtf-input></edtf-input></fieldset></form>'
    const el = document.querySelector('edtf-input')
    if (!el) throw new Error('not mounted')
    expect($<HTMLInputElement>(el, 'input[name="mode"]').disabled).toBe(true)
  })
})

describe('<edtf-input> with an existing value', () => {
  it('loads it into the guided options', () => {
    const el = mount('<edtf-input value="1982-?03-~12"></edtf-input>')
    expect($<HTMLInputElement>(el, 'input[name="mode"][value="exact"]').checked).toBe(true)
    expect($<HTMLSelectElement>(el, '[data-path="exact.month"]').value).toBe('3')
    expect($<HTMLSelectElement>(el, '[data-certainty="exact.month"]').value).toBe('uncertain')
    expect(el.value).toBe('1982-?03-~12')
  })

  it('keeps a value the options cannot show until something is chosen', () => {
    const el = mount('<edtf-input value="{1960,1961}"></edtf-input>')
    expect(el.value).toBe('{1960,1961}')
    expect(label(el)).toBe('1960 and 1961')
    expect(messages(el)).toEqual(['Choosing an option above replaces this date.'])
    choose(el, 'unknown')
    expect(el.value).toBe('XXXX')
  })

  it('takes a new value from the property without firing edtf-change', () => {
    const el = mount('<edtf-input></edtf-input>')
    const seen = events(el)
    el.value = '[..1931]'
    expect($<HTMLInputElement>(el, 'input[name="mode"][value="beforeAfter"]').checked).toBe(true)
    expect(el.value).toBe('[..1931]')
    expect(seen).toEqual([])
  })
})

describe('<edtf-input semantics="period">', () => {
  it('reads a period typed in words', () => {
    const el = mount('<edtf-input semantics="period"></edtf-input>')
    set(el, '[data-path="period-text"]', 'about 1890 to 1905')
    expect(el.value).toBe('1890~/1905')
    expect(label(el)).toBe('circa 1890 to 1905')
  })
})
