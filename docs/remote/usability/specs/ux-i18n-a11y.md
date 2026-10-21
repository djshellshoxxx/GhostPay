# Spec: accessibility helpers (ux-i18n)

## Requirements
1. `buildAccessibleName({label,context,state,hint})` -> `label, context, state, hint`; sanitised; <=160 chars (ellipsis); empty label throws.
2. `buildLiveRegionMessage(text, politeness, previous?)` -> role `status`/`alert`, `aria-live`, `aria-atomic=true`; identical repeat toggles a trailing NBSP so it re-announces.
3. WCAG 2.x `relativeLuminance`, `contrastRatio` (unrounded), `rateContrast`: text AA 4.5 / AAA 7; large text 3 / 4.5; UI component 3. Only opaque `#rgb`/`#rrggbb`.
4. `validateFocusOrder(items,{rtl})`: duplicate-id, positive-tabindex, hidden-focusable, disabled-focusable, visual-order-mismatch (8 px row tolerance; RTL flips).
5. `validateAriaLabels(nodes)`: duplicate-id, unknown-role, missing-name, dangling labelledby/describedby, hidden-focusable, name-too-long, label-in-name.

## Acceptance tests
- black/white = 21; `#767676`/white = 4.5424 (AA), `#777777`/white = 4.4778 (fail), `#595959` AAA; `#12`, `red`, `#ffffff80` rejected; property: symmetric, in [1,21].
- Name with `‮` and NUL stripped; 500-char label capped at 160.
- Findings list exactly as asserted in `a11y.test.ts` for a mixed bad tree; clean trees give `[]`.
