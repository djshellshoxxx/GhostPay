> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay core package source review — bounded batch

## Outcome

**No new actionable browser-reachable vulnerability was established in this five-package batch.** This is source inspection, not proof of cryptographic correctness, a test-pass claim, or a full-product audit. Portable vault/scanner work and other package/application/build lanes remain incomplete here.

The reads examined input validation, canonicalization, signature and trust boundaries, secret ownership, key derivation, address/display checks, QR integrity, camera cleanup, and public seller/settings exchange. No target code or tests were executed. No live probes, transactions, exploit reproductions, Git mutations, or application/test/configuration edits were made. Only review notes were written.

- Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Combined candidate #302: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Read method: immutable Git objects; exact-SHA read-only GitHub file retrieval during the workspace reset; restored Git objects for final blob accounting.
- `review-core-packages.json` records path, commit, blob, total lines, actual completed read ranges and comparison status. A changed main blob is reviewed by complete candidate plus complete diff; it is not claimed as a second independent full-file read.

## Completed coverage

| Package | Implementation files / lines | Test/support files / lines |
|---|---:|---:|
| `core-crypto` | 8 / 755 | 12 / 1,635 |
| `secret-box` | 3 / 455 | 3 / 514 |
| `invoice-schema` | 11 / 2,179 | 16 / 3,771 |
| `address-safety` | 6 / 391 | 4 / 363 |
| `qr-exchange` | 10 / 1,330 | 7 / 1,321 |
| **Total** | **38 / 5,110** | **42 / 7,604** |

All **80 package source files / 12,714 lines** are fully read. Additional full reads: the shared public deterministic fixture `test-vectors/scheme1.json` (137 lines), `apps/web/src/lib/qrMultipart.ts` (33 lines), and `apps/web/src/components/CameraImporter.tsx` (365 lines). The invoice reference test utility duplicates the fully read core utility except for one comment line; its complete difference was inspected and that method is recorded. All ten package README/DEVIATIONS files were read (403 lines). Repo instructions and entry/build-resolution context are separately ledgered.

All main-to-candidate changes in the five packages' `src` trees were compared, including test-only changes. Core-crypto and secret-box runtime implementations are unchanged between the two pins. Package manifest and invoice documentation deltas were also inspected. Associated tests were read as code, not run; their existence is not evidence of cryptographic correctness or device behavior.

## Findings and known changes

There are no new unfixed findings requiring severity ranking in this batch. The table records **candidate fixes or intentional behavior changes**, with high confidence in the source difference. An externally controlled route is not inferred where none was established.

| Change | Classification and status | Pinned source | Reachable impact and qualification |
|---|---|---|---|
| CP-K1 — Base64url runtime type guard | low-impact public-API hardening; no direct browser exploit established; **fixed-on-candidate** | `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/base64url.ts:52-55` | Non-string programmatic input now yields fixed Base64UrlError. Fragment entry already checks string type. |
| CP-K2 — Dense data-array canonicalization | signature-input hardening for programmatic objects; **fixed-on-candidate** | `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/json.ts:200-222` | Rejects sparse/decorated/accessor arrays and snapshots data properties before recursion. Imported strict JSON cannot encode JavaScript getters/proxies, so no external payload reachability established. |
| CP-K3 — Merchant-profile invalid-clock rejection | low-impact fail-closed clock validation; **fixed-on-candidate** | `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/merchantProfile.ts:156-158` | Non-finite and negative injected clocks no longer bypass expiry comparison. No externally controlled clock path established. |
| CP-K4 — Rejected QR conflict preserves inactivity deadline | low availability/session-lifetime hardening; **fixed-on-candidate** | `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/assembler.ts:75-87` | Rejected conflicting input no longer refreshes partial-session activity. It did not bypass final payload integrity; web conflict path resets assembly. |
| CP-K5 — Precise verification failure classes | diagnostic/API behavior change; **present-on-candidate** | `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/envelope.ts:162-203,312-330,356-365` | Missing signatures, unsupported versions and unavailable local crypto are classified separately; no relaxed success path observed. |
| CP-K6 — Minimal receipts | intentional protocol/API behavior change; **present-on-candidate** | `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/receipts.ts:24-25,66-108,147-167` | Allows signed receipts omitting one-time address; conditional recipient binding is explicit in tests and must remain explicit in UI. |

CP-K1 is present byte-for-byte in runtime source from `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` (`automation/20261119T2243Z/bug/base64url-runtime-input`); the test differs only by removing an unused callback argument. CP-K4 implementation and test match `172695efb41665a4e50d335029e54184bbb5b328` (`fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7`). These are the two explicitly compared recent package branches; the parent retains the broader branch-union reconciliation.

## Security boundaries and integration observations

### Cryptography and secret ownership

Core generation samples valid nonzero scalars from the supplied/global cryptographic RNG. Parsing validates compressed points and distinct spend/view keys; recovery checks the derived address before returning a spending key. Independent, differential, edge-case and vector tests were read without execution. This is not an independent mathematical proof or external cryptographic audit. Sources: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/core-crypto/src/rng.ts:31-44`, `keys.ts:1-102`, and `stealth.ts:1-232` in that same directory.

The candidate explicitly records a known confidentiality relationship between viewing-key delegation and one-time private-key export. It is not a newly found primitive break. The custody reviewer was notified to keep export/delegation promises consistent with the scheme. Source: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/core-crypto/src/viewing-key-boundary.test.ts:1-4`. No recovery procedure is included here.

`SecretBox.copyOf` creates an owned copy and zeroes the source by default on successful return. Input/label validation failures precede consumption. `take()` transfers the internal buffer without zeroing it and makes the receiver responsible for its lifetime. Synchronous/asynchronous borrowing clears the temporary copy afterward. These are best-effort serialization/copying guardrails, not same-realm isolation or guaranteed zeroization. Source: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/secret-box/src/secretBox.ts:47-57,72-109,156-212`. The custody lane received this ownership confirmation directly.

### Invoice trust, encryption and receipts

Bounded canonical parsing precedes signature verification. Default parsing can return an invalid-signature state and requires caller gating. Required-pin mode rejects invalid/unpinned results, while the caller chooses the intended seller pin set. An undecrypted passphrase prompt has an unauthenticated header. Source: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/envelope.ts:356-372,440-488,491-536`.

Bearer encryption places its decryption key inside the fragment by design. Passphrase mode bounds derivation parameters and binds the clear header as authenticated data. These modes do not independently establish seller identity; expiry/payment policy remains caller responsibility. Source: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/README.md:74-122`, corroborated by complete implementation reads of envelope, passphrase, signing and expiry modules.

Receipts establish signer control and field consistency, not independent proof of on-chain payment. Candidate minimal receipts may omit the one-time address, so recipient comparison is conditional on the receipt carrying it, even when the caller supplied an expected address. The tests expressly preserve that behavior. Source: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/receipts.ts:143-167` and `receipts.test.ts:68-94` in the same directory. The payments reviewer confirmed proper seller-attestation labels and conditional address display but will record a **low integration wording mismatch** in `apps/web/locales/en.json:973`, whose introduction still promises a prepared-recipient check for minimal receipts. That application observation belongs to the payments lane; no receipt-signature bypass was established here.

### Address and QR boundaries

Address helpers check address form/checksum and selected known-destination lookalikes. Text sanitization rejects selected Unicode classes and flags mixed Latin/Cyrillic/Greek tokens, without implementing a general confusable detector. Meta-address fingerprints are display aids. Caller enforcement remains necessary. Sources: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/address-safety/src/address.ts:1-147`, `text.ts:1-78`, and `meta.ts:21-50` in that directory.

Address-safety documentation still describes Node-only `node:crypto`, although the current implementation imports noble SHA-256. This is documentation maintenance, not a runtime finding. Do not use the stale description to exclude browser code. Sources: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/address-safety/README.md:13`, `DEVIATIONS.md:4`, and `src/meta.ts:1-2`.

QR reassembly is bounded to one session, 64 chunks and 32 KiB of decoded payload. Canonical encoding, part consistency and session digest are checked. CRC/digest provide transfer integrity; sender authenticity comes from the decoded application payload and trust decision. Accepted duplicates intentionally refresh the inactivity timer and have an explicit regression test. Sources: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/qr-exchange/src/assembler.ts:63-134`, `assembler.test.ts:117-128`, and `README.md:14-23` in that package.

Camera/image cleanup, cancellation checks, text/image limits and UTF-8 handling were inspected. The application importer revokes camera, paste and image work while hidden and guards asynchronous delivery. Real cameras, native decoders and browser lifetimes were not exercised. Source: `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/components/CameraImporter.tsx:123-174,296-319`; complete package camera/readers coverage is in the ledger.

## Lean browser closure

`lean-closure.json` is a conservative static graph rooted at `apps/web/src/main.tsx`. It resolves the lean `./App` substitution to `AppLean.tsx`, relative imports, dynamic imports, Worker URLs, package browser exports, and these Vite aliases:

| Alias | Resolved source |
|---|---|
| `@ghostpay/ux-vault/portable` | `packages/ux-vault/src/portable.ts` |
| `@ghostpay/invoice-schema` | `packages/invoice-schema/src/index.ts` |
| `@ghostpay/qr-exchange` | `packages/qr-exchange/src/index.ts` |

The graph contains **270 files: 115 web files / 29,662 lines and 155 package files / 21,827 lines**, with no unresolved first-party static edges. It is a pre-tree-shaking superset, not proof of emitted/callable runtime. Barrels and named type imports can overinclude modules. For example `pir-two-server` appears in the lexical graph although the lean rendered-module guard rejects that deferred runtime. Actual bundle/CI reconciliation belongs to the root reviewer. Import inventory for `AppShell` or service containers must not count as a full implementation review.

## Exact unread handoff

A fresh worker should read the **eight portable-vault implementation files in the closure (2,951 lines)**, associated tests, the **three scanner/worker implementation files (188 lines)** and four scanner tests. Nonportable vault paths remain explicitly pending an exclusion decision. All **37 pending entries / 7,827 lines** below have zero completed read ranges in this lane; exact candidate/main blobs are in the JSON ledger.

| Pending path | Lines | Disposition |
|---|---:|---|
| `apps/web/src/lib/scanner.worker.ts` | 15 | core-closure-runtime |
| `apps/web/src/lib/scannerCore.bench.nocov.test.ts` | 54 | associated-test-or-support |
| `apps/web/src/lib/scannerCore.fuzz.test.ts` | 38 | associated-test-or-support |
| `apps/web/src/lib/scannerCore.spam.nocov.test.ts` | 194 | associated-test-or-support |
| `apps/web/src/lib/scannerCore.test.ts` | 256 | associated-test-or-support |
| `apps/web/src/lib/scannerCore.ts` | 167 | core-closure-runtime |
| `apps/web/src/lib/workerFactory.ts` | 6 | core-closure-runtime |
| `packages/ux-vault/src/backup.ts` | 84 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/bytes.ts` | 75 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/confusables.test.ts` | 155 | associated-test-or-support |
| `packages/ux-vault/src/confusables.ts` | 235 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/contacts.test.ts` | 224 | associated-test-or-support |
| `packages/ux-vault/src/contacts.ts` | 220 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/envelope.test.ts` | 187 | associated-test-or-support |
| `packages/ux-vault/src/envelope.ts` | 257 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/errors.ts` | 40 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/index.ts` | 9 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/keystore-portable-memory.test.ts` | 69 | associated-test-or-support |
| `packages/ux-vault/src/keystore-portable.ts` | 443 | core-closure-runtime |
| `packages/ux-vault/src/memory.testutil.ts` | 43 | associated-test-or-support |
| `packages/ux-vault/src/merge.ts` | 171 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/portable-errors.ts` | 145 | core-closure-runtime |
| `packages/ux-vault/src/portable-parity.test.ts` | 45 | associated-test-or-support |
| `packages/ux-vault/src/portable.ts` | 8 | core-closure-runtime |
| `packages/ux-vault/src/reconciliation-amounts.test.ts` | 145 | associated-test-or-support |
| `packages/ux-vault/src/reconciliation-amounts.ts` | 90 | core-closure-runtime |
| `packages/ux-vault/src/reconciliation-portable.ts` | 1146 | core-closure-runtime |
| `packages/ux-vault/src/schema.test.ts` | 280 | associated-test-or-support |
| `packages/ux-vault/src/schema.ts` | 175 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/search.ts` | 54 | not-in-lean-closure-exclusion-decision-pending |
| `packages/ux-vault/src/seller-scope.ts` | 10 | core-closure-runtime |
| `packages/ux-vault/src/stealth-export-portable.property.test.ts` | 161 | associated-test-or-support |
| `packages/ux-vault/src/stealth-export-portable.test.ts` | 858 | associated-test-or-support |
| `packages/ux-vault/src/stealth-export-portable.ts` | 855 | core-closure-runtime |
| `packages/ux-vault/src/tag-archive-portable.ts` | 254 | core-closure-runtime |
| `packages/ux-vault/src/vault.test.ts` | 364 | associated-test-or-support |
| `packages/ux-vault/src/vault.ts` | 295 | not-in-lean-closure-exclusion-decision-pending |

Remaining packages in the closure are parent-assigned work. The parent also owns application custody/payment decisions, manifest/deployment, build/CI and branch-union reconciliation. Third-party implementation internals, fixture generator, package tooling configuration and emitted bundle behavior were not audited in this batch. No claim here substitutes for those unread areas.
