# Round 4 fixes: web key lifecycle (keystore, session, tags)

Scope: `apps/web/src/lib/{keystore,session,tags}.ts` and their tests, plus minimal key-lock / wipe-keys UI wiring. Every claim was reproduced with a failing test before the fix (real `vitest` runs), unless marked otherwise. Not committed.

## Results

Run in `apps/web` (2026-10-21, final state, includes the other agent's concurrent work):

- `npx tsc -p tsconfig.json --noEmit`: pass.
- `npm run lint`: pass (0 problems).
- `npx vitest run --coverage`: 33 files, **373 tests pass** (baseline 331; 20 of the new tests are from this change). Coverage stmts/branches/funcs/lines **95.60 / 91.14 / 92.78 / 97.50** (baseline 95.48 / 91.24 / 92.42 / 97.38; branches -0.10 across the mixed tree, thresholds 90/85/90/90 unchanged). Files touched here: `keystore.ts` 97.22/95.16/100/98.9, `session.ts` 100/91.66/100/100, `tags.ts` 98.43/97.01/100/100.

## Item 1: "Wipe keys" leaves the tag vault unlocked (round-audit web M2): VERIFIED, FIXED

- Reproduced: after "Wipe keys from memory", `services.vault.unlocked` stayed `true`; loading a different identity also left the old identity's vault unlocked; and `lock()` or `wipe()` called while an `unlock()` was still awaiting storage was overridden, because the unlock installed its keys afterwards (a race, found while doing this item).
- Fix:
  - `session.ts`: new `onSessionCleared(listener)`. Listeners run on every `clearSession`, including when `install` replaces one identity with another. Keys are zeroized before any listener runs. A listener that throws does not stop the others, and the first error is rethrown afterwards. If a listener fails during `install`, the new keys are zeroized and not installed.
  - `tags.ts`: `lock()` increments an epoch counter. An `unlock()` that finishes after a lock or wipe drops the keys it derived. `list` and `listReport` throw "locked" when the vault is locked, even when the store is empty.
  - `App.tsx` (view edit): a `useEffect` registers `onSessionCleared(() => { vault.lock(); setMatches([]) })`.
- `sweepTarget` is **kept on purpose**: `Sweep.test.tsx` "tells the user when their keys are gone from memory" expects the Sweep view to show its notice that the keys are gone, and that file belongs to the other agent. Residual for that owner: after an identity change, the Sweep view still holds the previous identity's match.
- Storage: the vault's CryptoKeys are non-extractable and only ever lived in memory. IndexedDB holds the salt, a check ciphertext and the tag ciphertexts, none of which is key material. Wipe keys deliberately does not delete tags; "Delete all tags" does.
- Tests:
  - `SellerKeys.test.tsx`: "wiping keys also locks the tag vault (round-audit web M2)"; "loading a different identity locks the previous identity's tag vault".
  - `Scan.test.tsx`: "round 4: wiping keys clears the scan matches and locks the tag vault (web M2)".
  - `tags.test.ts`: "lock() during an in-flight unlock leaves the vault locked (wipe-keys race)"; "wipe() during an in-flight unlock leaves the vault locked".
  - `session.test.ts`: "notifies wipe listeners on clear and when one identity replaces another"; "still wipes keys when a wipe listener throws"; "does not install new keys past a failing wipe listener".
  - Mutation check: with the two `App.tsx` listener lines commented out, all three view tests fail; with the lines restored, they pass.

## Item 2: keystore import hardening: VERIFIED, FIXED

- **scrypt cost (S3-13, fuzz F9, KL-13).**
  - Reproduced: the earlier bound N ≤ 2^20, r ≤ 16, p ≤ 4 was real but too loose. A file with N=2^20 or 2^19, r=16 or p=2 got past parsing and ran scrypt (about 9.6 s in the test) before AEAD rejected it.
  - Fix: an allowlist, N ∈ {2^14 … 2^18} (powers of two) with r = 8 and p = 1, checked before scrypt for both import and export. `maxmem` is now the exact noble figure for that maximum, 128·8·(2^18+2) bytes (about 256 MiB), down from 2 GiB.
  - Test: "rejects scrypt parameters outside the allowlist before running scrypt (KL-13, S3-13, F9)" asserts each rejection takes under 100 ms. Also "refuses to write a keystore above the import cost cap".
- **Field allowlist.**
  - Reproduced: unknown top-level, `kdfParams` and `meta` keys were accepted.
  - Fix: exactly the v1 key sets are allowed at every level. `meta.signer` must be a 33-byte compressed hex key. `meta.metaAddress` must match `st:<chain>:0x<hex>`, which also rules out the `|` AAD separator (sec-crypto-keys note 4).
  - Test: "accepts only the documented fields (allowlist), rejecting unknown keys at every level".
- **Passphrase (L2, KL-14).**
  - Fix: a new export now needs at least 12 Unicode code points after NFKC, and at least 5 distinct characters. Import is unaffected, so older files still open.
  - Tests: "requires at least 12 code points and some variety for a new passphrase (KL-14, L2)" and "still imports a keystore whose passphrase predates the 12-character rule".
  - UI label changed to "Passphrase (at least 12 characters)" (`SellerKeys.tsx`).
- **Zeroization.**
  - Reproduced: the UTF-8 passphrase bytes passed to scrypt were never wiped.
  - Fix: they are now wiped in `finally`, on success and when the passphrase is wrong.
  - Tests in `keystoreZeroize.test.ts`: "wipes the passphrase bytes fed to scrypt on export and import"; "wipes the passphrase bytes when the passphrase is wrong".
- **Behaviour change in an existing test, by design:** `session.test.ts` "rejects a keystore holding invalid keys" used `meta {metaAddress:'x', signer:'y'}`, which is now rejected as malformed. The fixture was changed to well-formed placeholder public values. Its assertions (`must differ`, invalid keys) are unchanged.
- **`SellerKeys.test.tsx`:** the label string and `/at least 10/` were changed to 12. This is the same behaviour change, and the test is not weakened.

## Item 3: wire `packages/secret-box` into the web session: evaluated, UNFIXED (blocked)

- **API fit:**
  - `SecretBox` is not a `Uint8Array`.
  - `requireSession()` hands `StealthKeySet`/`SecretScalar` to core-crypto and to `sweep.ts`, `scanClient.ts` and `Scan.tsx`. Those files belong to the other agent or are out of scope.
  - Re-basing the session on boxes therefore needs a core-crypto API change. The spec and DEVIATIONS 1 call for an ADR first.
  - The temporaries in `keystore.ts` and `session.ts` are already wiped in `finally`, which is the same guarantee `withScopeAsync` would give.
- **Dependency:**
  - The package resolves through `dist`, which is not built.
  - Root `build:libs` (used by CI `setup-node-libs` and by `release.yml`) does not build it.
  - Adding the dependency would therefore break a fresh-checkout typecheck and build. `apps/web/package.json` was not edited.
- **Changes needed:**
  - `apps/web/package.json` dependencies: `"@ghostpay/secret-box": "0.1.0"`.
  - Root `package.json` `build:libs`: add `-w @ghostpay/secret-box`.
  - `npm install`: in the lockfile, only `packages["apps/web"].dependencies` should gain that entry. The `node_modules/@ghostpay/secret-box` link already exists.
- **Idle auto-lock:**
  - The secret-box spec describes no idle timer, so none was added.
  - `key-lifecycle.md` KL-27 ("lock or tab-hide drops keys within 60 s") is still open. Because it forces a keystore re-import after every tab switch, it needs a product decision.
  - The only idle timer today is the existing tag-vault idle lock in `App.tsx`.

## Item 4: tags `list` is all-or-nothing on a damaged record: VERIFIED, FIXED (additive)

- Decision: skip-and-report is warranted. One corrupted record, or one written under another key, hid every tag, and anyone who can write to the origin's IndexedDB can cause that.
- New `TagVault.listReport(chainId?)` returns `{ tags, damaged }`. It skips and counts damaged records and never deletes them. A vault that gets locked mid-listing throws "locked" rather than counting the remaining records as damaged.
- The strict `list()` is **unchanged**, and its existing throw test still passes untouched. The Scan "Local client tags" panel now uses `listReport` and shows "N stored tag(s) could not be decrypted … and are not shown." (`Scan.tsx` view edit.)
- Also fixed, S3-16 splice:
  - Reproduced: after the iv and ciphertext of two records were swapped, `find(A)` returned Bob's payload.
  - Fix: `open()` now checks that the HMAC of the decrypted address equals the record's `lookupKey`; a mismatch is reported as damaged.
  - The AAD is unchanged (no format migration), so moving a record's metadata still relies on this check.
- Tests:
  - `tags.test.ts`: "detects spliced records … (S3-16)"; "listReport skips a damaged record, returns the rest and counts what it skipped"; "listReport refuses (does not count as damage) when locked".
  - `Scan.test.tsx`: "round 4: one damaged tag record no longer hides the others; the list says how many were skipped".

## Item 5: other key-lifecycle error paths

- **`decryptKeystore`: FIXED.** When the decrypted body held a malformed key after valid ones, the keys already decoded were not wiped. Test: "wipes keys already decoded when a later key in the body is malformed" (failed before the fix).
- **`install` with a failing wipe hook: FIXED,** see item 1.
- **Already correct, VERIFIED:**
  - `importSession` and `importKeystore` zeroization on error.
  - `exportKeystore` wipes the revealed copies.
  - `TagVault.unlock` wipes the viewing key copy in `finally`.
- **Not fixable in JS:** JS strings (passphrase, hex inputs) and noble bigints cannot be wiped.

## View files edited (minimal)

- `apps/web/src/App.tsx`: one `useEffect` for `onSessionCleared`.
- `apps/web/src/views/SellerKeys.tsx`: passphrase label text.
- `apps/web/src/views/Scan.tsx`: the `Tags` component's `refresh` uses `listReport`.
- `apps/web/src/views/Scan.test.tsx`: two tests appended.
- `Scan.tsx` and `Scan.test.tsx` were also being edited by the other agent at the same time; the edits merged in place without conflict.
