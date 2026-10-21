# ux-links-handle: pay-me handles

Handles are LOCAL labels mapped to meta-addresses in the user's own book. No registry, no network.

## Requirements
- R1 Format: optional `@`, 3..32 ASCII `[a-z0-9_-]` (upper case folded), alnum at both ends, no consecutive separators, not all digits, not `0x...`, not reserved.
- R2 Anti-homograph: any non-ASCII input is rejected; reason `CONFUSABLE_NON_ASCII` when a char is in the Cyrillic/Greek/Latin-ext table or NFKC-folds to ASCII (fullwidth, roman numerals). Whitespace, format, bidi, combining marks -> `INVISIBLE`.
- R3 `skeleton()` folds case, separators, `rn->m`, `vv->w`, `cl->d`, `0->o`, `1/i->l`, `5->s`, `3->e`. Handles whose skeleton equals a reserved word's are rejected (`LOOKALIKE_RESERVED`); `addEntry` refuses an entry whose skeleton equals an existing one.
- R4 Book: immutable, <=1000 entries, unique handle, skeleton and meta-address; `resolveHandle` is exact-match only; `findLookalikes` supports warnings.
- R5 JSON import (`parseBook`) is size-capped (512 KiB), exact-keys, canonical stored handles, and re-checks all collisions.

## Acceptance tests (handle.test.ts)
33 handle reason cases; skeleton equalities (`paypal`/`paypa1`, `modern`/`modem`, `vvorld`/`world`, `clock`/`dock`); property test on output charset; add/resolve/remove/immutability; duplicate, look-alike, duplicate-meta rejection; 1000-entry cap; JSON vector and 15 hostile imports.
