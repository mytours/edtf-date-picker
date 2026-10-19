import { EdtfInputElement } from './element.js'

export { EdtfInputElement, type EdtfChangeDetail } from './element.js'
export { timeline, type Mark, type Timeline } from './timeline.js'

if (!customElements.get('edtf-input')) customElements.define('edtf-input', EdtfInputElement)

declare global {
  interface HTMLElementTagNameMap {
    'edtf-input': EdtfInputElement
  }
  interface HTMLElementEventMap {
    'edtf-change': CustomEvent<import('./element.js').EdtfChangeDetail>
  }
}
