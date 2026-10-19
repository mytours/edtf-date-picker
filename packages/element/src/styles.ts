/**
 * Shadow DOM styles. Hosts theme the element with --edtf-* custom properties
 * on <edtf-input> (or an ancestor), and can reach inside with ::part().
 */
export const styles = /* css */ `
:host {
  --_bg: var(--edtf-surface, #ffffff);
  --_text: var(--edtf-text, #141b26);
  --_muted: var(--edtf-muted, #56606f);
  --_line: var(--edtf-line, #d6dce5);
  --_accent: var(--edtf-accent, #24539b);
  --_on-accent: var(--edtf-on-accent, #ffffff);
  --_open: var(--edtf-open-bg, #e9eff8);
  --_focus: var(--edtf-focus, #e08a00);
  --_track: var(--edtf-track, #e3e8ef);
  --_err: var(--edtf-error, #b3261e);
  --_err-soft: var(--edtf-error-bg, #fbe9e7);
  --_info-soft: var(--edtf-info-bg, #e6edf8);
  --_radius: var(--edtf-radius, 12px);
  display: block;
  color: var(--_text);
  font: inherit;
  max-width: 40rem;
}
@media (prefers-color-scheme: dark) {
  :host {
    --_bg: var(--edtf-surface, #171e29);
    --_text: var(--edtf-text, #e8edf4);
    --_muted: var(--edtf-muted, #9aa6b6);
    --_line: var(--edtf-line, #2b3544);
    --_accent: var(--edtf-accent, #8fb3ea);
    --_on-accent: var(--edtf-on-accent, #0f141c);
    --_open: var(--edtf-open-bg, #1a2333);
    --_focus: var(--edtf-focus, #ffb547);
    --_track: var(--edtf-track, #253041);
    --_err: var(--edtf-error, #f2b8b5);
    --_err-soft: var(--edtf-error-bg, #3a1f1e);
    --_info-soft: var(--edtf-info-bg, #1b2433);
  }
}
:host([hidden]) { display: none; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

.panel { background: var(--_bg); border: 1px solid var(--_line); border-radius: var(--_radius); overflow: hidden; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
legend { padding: 0; width: 100%; }
.title { display: block; font-size: 1.25em; font-weight: 700; line-height: 1.25; padding: 20px 20px 4px; }
.hint { margin: 0; padding: 0 20px 16px; color: var(--_muted); }
.hint:empty { padding-bottom: 12px; }

.opt { border-top: 1px solid var(--_line); position: relative; }
.opt::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: transparent; }
.opt.open { background: var(--_open); }
.opt.open::before { background: var(--_accent); }
.opt-head { display: flex; gap: 14px; align-items: flex-start; padding: 14px 20px; cursor: pointer; min-height: 44px; }
.opt-head input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--_accent); flex: none; }
.opt-head strong { display: block; }
.opt-head small { display: block; color: var(--_muted); font-size: 0.9em; }
.opt-body { display: none; padding: 0 20px 20px 54px; }
.opt.open .opt-body { display: block; }
@media (max-width: 480px) { .opt-body { padding-left: 20px; } }

.row { display: flex; flex-wrap: wrap; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 8rem; min-width: 0; }
.field.narrow { flex: 0 1 8rem; }
.field > label { display: flex; flex-direction: column; gap: 4px; }
.field > label > span, .sub { font-size: 0.9em; color: var(--_muted); margin: 0; }
.sub { margin: 14px 0 8px; }
input:not([type=radio]), select {
  font: inherit; min-height: 44px; padding: 8px 12px; width: 100%; min-width: 0;
  border: 1px solid var(--_line); border-radius: 8px; background: var(--_bg); color: var(--_text);
}
select.certainty {
  min-height: 36px; padding: 4px 8px; font-size: 0.85em; color: var(--_muted);
  border-style: dashed; background: transparent;
}
select.certainty.set { color: var(--_accent); border: 1px solid var(--_accent); font-weight: 700; background: var(--_bg); }
input:disabled, select:disabled:not(.certainty) { opacity: 0.4; }
:focus-visible { outline: 3px solid var(--_focus); outline-offset: 2px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { position: relative; }
.chip input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.chip span { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border: 1px solid var(--_line); border-radius: 999px; background: var(--_bg); cursor: pointer; }
.chip input:checked + span { background: var(--_accent); border-color: var(--_accent); color: var(--_on-accent); }
.chip input:focus-visible + span { outline: 3px solid var(--_focus); outline-offset: 2px; }

button { font: inherit; cursor: pointer; color: var(--_text); }
.century { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.pager, .decade { min-height: 44px; min-width: 44px; border: 1px solid var(--_line); border-radius: 8px; background: var(--_bg); }
.pager:disabled, .decade:disabled { opacity: 0.35; cursor: not-allowed; }
.decades { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
@media (max-width: 420px) { .decades { grid-template-columns: repeat(3, 1fr); } }
.decade[aria-pressed="true"] { background: var(--_accent); color: var(--_on-accent); border-color: var(--_accent); }
.examples { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.example { border: 1px dashed var(--_line); background: transparent; border-radius: 6px; padding: 4px 10px; min-height: 32px; }
.link { background: none; border: 0; padding: 0; margin-top: 12px; color: var(--_accent); text-decoration: underline; min-height: 32px; }
.small { font-size: 0.9em; color: var(--_muted); margin: 10px 0 0; }

.result { border-top: 1px solid var(--_line); padding: 18px 20px 22px; }
.kicker { margin: 0; font-size: 0.9em; color: var(--_muted); }
.label-text { margin: 2px 0 4px; font-size: 1.5em; line-height: 1.25; font-weight: 700; }
.label-text.empty { color: var(--_muted); font-weight: 400; font-size: 1.15em; }
.caption { margin: 0; color: var(--_muted); }
.messages { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.messages li { padding: 10px 12px; border-radius: 8px; background: var(--_info-soft); font-size: 0.95em; }
.messages li.error { background: var(--_err-soft); color: var(--_err); }

.timeline { position: relative; height: 66px; margin-top: 14px; }
.track { position: absolute; left: 0; right: 0; top: 28px; height: 6px; border-radius: 3px; background: var(--_track); }
.mark { position: absolute; top: 22px; height: 18px; border-radius: 9px; background: var(--_accent); }
.mark.hatched { background: repeating-linear-gradient(135deg, var(--_accent) 0 3px, transparent 3px 8px); border: 1.5px solid var(--_accent); }
.mark.point { width: 18px !important; transform: translateX(-50%); }
.mark.soft-start.soft-end { -webkit-mask-image: linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent); mask-image: linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent); }
.mark.soft-start:not(.soft-end), .mark.fade-start:not(.fade-end):not(.soft-end) { -webkit-mask-image: linear-gradient(90deg, transparent, #000 30%); mask-image: linear-gradient(90deg, transparent, #000 30%); }
.mark.soft-end:not(.soft-start), .mark.fade-end:not(.fade-start):not(.soft-start) { -webkit-mask-image: linear-gradient(90deg, #000 70%, transparent); mask-image: linear-gradient(90deg, #000 70%, transparent); }
.mark.fade-start.fade-end { -webkit-mask-image: linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent); mask-image: linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent); }
.mark.point.soft-start { width: 54px !important; -webkit-mask-image: radial-gradient(closest-side, #000 30%, transparent); mask-image: radial-gradient(closest-side, #000 30%, transparent); }
.mark.dashed-start, .mark.dashed-end { background-color: transparent; border: 2px dashed var(--_accent); }
.mark.dashed-start:not(.dashed-end) { border-right-style: solid; }
.mark.dashed-end:not(.dashed-start) { border-left-style: solid; }
.mark.dashed-start:not(.hatched), .mark.dashed-end:not(.hatched) { background: color-mix(in srgb, var(--_accent) 25%, transparent); }
.unknown-end { position: absolute; top: 20px; width: 22px; height: 22px; border-radius: 50%; border: 2px dashed var(--_accent); background: var(--_bg); color: var(--_accent); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; transform: translateX(-50%); }
.axis { position: absolute; left: 0; right: 0; top: 46px; height: 20px; font-size: 13px; color: var(--_muted); }
.axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (prefers-reduced-motion: no-preference) { .mark { transition: left 0.3s ease, width 0.3s ease; } }
`
