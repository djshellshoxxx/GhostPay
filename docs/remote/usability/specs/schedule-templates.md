# Spec: payment templates (ux-schedule)

## Requirements
- T1 Template = id, name (1-64 chars), chain, asset, recipient, amount (positive integer string, base units), optional memo (<=140 code points), createdAtMs, updatedAtMs.
- T2 All input is untrusted: plain object only, unknown keys rejected, no control or bidi-override characters in name/memo, recipient printable ASCII without spaces (chain-specific checks live elsewhere).
- T3 Update merges a patch, id immutable, full revalidation, createdAt preserved.
- T4 List: max 200, unique id, unique name (case-insensitive). Import is all-or-nothing.
- T5 Clock injected; invalid clock throws.

## Acceptance tests (template.test.ts)
amount `0`, `01`, `1.5`, `1e3`, number type, 79 digits rejected; `__proto__` key rejected; name with U+202E rejected; memo 141 code points rejected while 140 emoji accepted; duplicate name "ALPHA" vs "Alpha" rejected; 201-entry import rejected.
