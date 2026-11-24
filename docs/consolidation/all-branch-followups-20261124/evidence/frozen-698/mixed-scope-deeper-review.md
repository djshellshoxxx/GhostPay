# Mixed-scope branch review — 2026-11-24

## Scope and source pins

Read-only review of all nine rows classified `mixed_scope_unresolved` in the coordinator's held-branch eligibility snapshot. Compared actual Git source against production `fb12a3302d9a85aa8777805bbdaab1bf2770ea16` / frozen composition `87bee07895679deaef345c3dd4aaf2e8f8651f1c`. The vault candidate was additionally checked against follow-up `3e927a9c41f08c42f753786c541b4f8bcfb30d10`.

No repository source, branch, or remote ref was changed. No application tests, stress cases, or vulnerability reproductions were executed. This review identifies separable recoveries and strengthens concrete remaining dependencies; it does not certify each large stack as a whole or claim fresh hosted qualification.

Static commit census: 301 non-merge commits reachable from the nine heads but not the frozen composition; 83 small source-bearing commits under the bounded file/line filter. Fifty-three retain at least one exact production postimage on a reviewed head that differs from current. A changed blob is only a review lead: several are older implementations or comments, and several fix modules absent from current production.

## Independent recovery candidates

### 1. Portable-keystore temporary-buffer cleanup — confirmed narrow recovery

Original commit: `9bad95e5cc0ee73f5adb8d2c587161074b21e080`.

Paths:

- `packages/ux-vault/src/keystore-portable.ts`
- `packages/ux-vault/src/keystore-portable-memory.test.ts`

The production file at both fb12a330 and 3e927a9c has blob `59e998e772e26be386aea4b8369d5240222ea1f9`, exactly the donor's parent blob. The new test file is absent. Donor source changes only the existing private derive function: retain the normalized passphrase byte buffer, await derivation inside try, and zero both owned input and derived bytes in finally. Normalization, scrypt parameters, AES-GCM import options, format, and guards are unchanged. Immutable caller strings cannot be erased; the donor says so accurately.

The 69-line existing test file has four ordinary lifecycle cases: successful round trip, derivation rejection, key-import rejection, and deferred derivation. This has no dependency on the unfinished stealth-export format. The same donor postimage is carried by #246/#249/#240/#262/#251/#264/#260.

### 2. Fixed-label React root error reporting — recover with its smoke failure boundary

Original source commits:

- `ec7dd86db9b20ab906582c35fcb370b043e44ec4`
- `e73fdb16f81f2e4811931585f59c041441ba1c78`

Paths: `apps/web/src/main.tsx` and `apps/web/src/main.test.tsx`.

Current main.tsx calls createRoot without custom handlers. The donor adds caught/uncaught/recoverable callbacks that emit a fixed class label without reading mutable error names, messages, or stacks. The final donor test file is an 85-line ordinary compatibility file. This is independent of the large recovery/privacy stacks.

The paired production gate correction is `c8e0a703df3cacd7c0ee9092c08dd053f40cecce`: seven added lines in `scripts/pages/smoke.mjs` detect the fixed console prefix and append only a fixed failure marker. Current smoke watches pageerror only. Preserve this explicit failure path when installing custom React reporting.

The original complete smoke regression file, `scripts/pages/smoke-render-errors.test.mjs`, comes from `5a502e55ee18889bdca75ae9cddf9e585ef48782`. Its cases include initial, navigation-walk, and fixture-invoice checkpoints. The latter two phases are absent current production. To retain this file verbatim, also recover the coherent test-tool addition `153965f2298150987b2673e49f4e8ff180d279a6`:

- `scripts/pages/smoke-walk.mjs`
- `scripts/pages/smoke-walk.test.mjs`
- `scripts/pages/fixtures/smoke-invoice.txt`
- its hunks in `scripts/pages/smoke.mjs`

Current AppShell CORE_ORDER contains the same nine lean views. This helper navigates only; it does not create keys, connect wallets, or submit payments. Its original tests and fixture still require current qualification. Do not copy the complete smoke.mjs blob from c8: it also contains an unrelated earlier --expect-origin change. Recover scoped commits/hunks or qualify a narrower compatibility harness for current smoke; do not silently drop failure detection.

### 3. Existing IndexedDB browser-check caller repair — tooling-only candidate

Original commit: `6e48ce51ac6b550c998d0331fc7692621dcf174d`.

Path: `apps/web/scripts/test-reconciliation-idb.mjs`.

Current script still calls invalidateFrom with one argument. Current production API in `packages/ux-vault/src/reconciliation-portable.ts` requires block, observations, and canonicalHash, and immediately maps the observations parameter. The donor supplies the missing arguments, checks the exact stored height queried, and preserves the two-tab invalidation assertion. The method is already used correctly by current unit tests; only this standalone browser harness is stale.

The same commit also adds installed-browser discovery. Its historical hard-coded candidates should be reconciled with the current launch configuration rather than treated as required runtime dependencies. The API-call hunk is independently useful and requires no production change. Qualification should run the repaired existing browser check.

### 4. PIR URL terminal-separator scan — independently useful source subset

Original commit: `d37b0ab37d0e9968bda21c57bd18d78c2897487d`.

Paths: `packages/pir-two-server/src/client.ts` and the ordinary URL-normalization case in `packages/pir-two-server/src/client.test.ts`.

Current createHttpLink still uses a suffix regular-expression replacement. Donor production changes only that operation to a backward terminal-separator scan; host validation, chain restrictions, internal path bytes, endpoints, and transport behavior stay unchanged. The ordinary test verifies configured-path preservation and endpoint construction.

Do not take the whole commit automatically: it also changes an unrelated Settings fixture and adds a timing/stress case. No such case was executed here. The production hunk and existing ordinary normalization case are the separable subset compatible with this session's scope.

## Concrete hold and supersession findings for all nine rows

| PR / exact head | Stronger disposition evidence |
|---|---|
| #246 — `509a800439f2feb6173b20d2543746c3d74e9a42` | Retain aggregate after narrow recoveries. Relayer padding is a two-sided protocol transition: web calls now pad by default and retry unpadded only after a specific parsing refusal, while hosted server/config accepts or requires the pad field. Bulk payment evidence adds RouterEvidenceBatch/selectEvidenceTargets/fetchRouterEvidence and changes verification reads; its cancellation follow-up cannot be grafted onto the current per-claim API alone. The remaining portable secret-export format and network authority need their coherent owner lanes. |
| #249 — `c17e5c387e3c2b83f48b02ac33a669c44c69ced6` | New consent/profile selection, settings persistence, private-scan scheduling, padded scan-source requests, and CSP-origin propagation must agree. networkSelection and related saved-field semantics are feature additions, not standalone current checks. Reconcile with #251's action-scoped authorization rather than selecting inconsistent validation/defaults from each. |
| #240 — `38d69832ddc58ec27a19c00dbe3c89347c577495` | Retain Spec18 feature: new stealth-export-portable codec, public/keypair/master export records, payment-key loans, verification UI, replacement consent, and session-backup state. ASCII-file and cleanup follow-ups target those new modules. The small existing keystore derive cleanup above is separable; the larger codec is not required for it. |
| #218 — `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` | Correct the old hold wording: requirePinnedSigner, invalid-signature rejection, and both typed errors already exist with the same executable behavior. envelope/errors differences are explanatory comments; ux-core differs only in one explanatory message. Remaining meaningful source is hosted relayer/limiter/CLI work. The tiny client_queue_full client change depends on the new server admission contract: current server does not emit that class. Preserve it with that contract rather than calling it a current missing Pages fix. |
| #262 — `40b64e8f3a0f34f7b19235ba4655ef918687f22e` | Merchant clock and earlier canonical-array fixes are already recovered or strengthened. New networkAuthority, InvoiceSignerVerification, and paymentKeyExport modules are absent current production; fixes to them need their parent features. BTC local spentness adds canonical-input coverage and state/rollback evidence consumed by headers, scans, UI, and sweep checks; a disclosure or preflight hunk alone would overstate what current scanning proves. |
| #251 — `3ae0b4f642a8941592fad48c26e9ed1bbec327f4` | The apparently tiny unknown-preference-field patch `325a915664b9c8ce44f136d08c6e0ec3c64a6ace` edits networkAuthorization.ts, which does not exist current production. The new authority binds action/category/endpoint, checks persisted profile snapshots, owns cancellation/expiry, and supplies opaque RPC capabilities. It requires dispatcher/services/UI integration, not only importing its validation helper. |
| #264 — `bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a` | Retain master aggregate after narrow extraction. It combines the same authority/recovery/BTC feature obligations with new Solana protocol/domain/cluster exports and TRON meta-address changes. Its TRON skeleton deliberately changes build() to always refuse until announcement memo binding exists; this is a capability contract change requiring corresponding callers/docs, not a transparent bug fix. |
| #260 — `f3bb7c662274c4a4394324c405b49517ad2b1461` | Retain reconciled Spec18 feature with #240/#572/#573/#596 authority review. Its byte-exact file verification and beforeunload changes depend on the new export/verification lifecycle. Current SellerKeys already tracks controller-owned operations, a generation counter, captureSessionVersionGuard, and own-completion acknowledgement; replacing it with an old recovery view risks losing those newer ownership guarantees. |
| #211 — `a92658b1ef6b95ff0145b2e1933d0047d51289d5` | Significant safety work is already covered: derive.ts, limits.ts, eip712.ts, router.ts, and client.ts under policy-scheme match current production; index.ts only reorders an export. Current pay.ts already binds method/account/owner/policy/R/metadata and send.ts reuses that check. Current token coverage additionally requires matching seller keys before positive confirmation; donor would regress to policy-hash-only confirmation. Remaining Solana/TRON wire-format, adapter/CLI, and backup-UX changes need their feature owners. |

## Additional coherent release-build candidate, not a one-line extraction

`21fdd4350d1a4a2fa04198d7e11e922cd7f3da31` adds known-fixture release-key rejection in `apps/web/scripts/validate-deployments.mjs`, its declaration, `apps/web/src/releaseKeyDenylist.test.ts`, and `scripts/pages/build-pages.sh`. This is still absent and potentially valuable. The production/development distinction and propagation of the development flag through the build's sanitized environment are part of the behavior. Lift the coherent release-build unit only after checking current manifest fixtures and release policy; importing only the denylist would omit its compatibility contract.

## Review limits and accounting

No whole mixed stack is approved by this pass. Do not retain the old implication that all signer-policy or policy-payment guard source is still missing: the comparisons above prove otherwise. Conversely, do not mark private-scan, secret-export, authorization, BTC spentness, or chain-format feature stacks integrated merely because selected low-level fixes are recovered.

Known QR continuations and #410/#341/#220 were not re-audited. One incidental RPC-difference check showed only loss of the already-retained finite-retry guard in the old donor; no new RPC candidate is proposed.
