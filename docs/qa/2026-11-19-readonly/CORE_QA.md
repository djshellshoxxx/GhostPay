# GhostPay core QA handoff — 2026-11-19 Pacific

## Scope and result

Audited application source: `c977b5d6723f6822c3b5d86cd6b231712c53c395` (`main` when this review began). The review covered ordinary data handling in `invoice-schema`, `payment-uri`, `qr-exchange`, and `tx-review`. No application, test, dependency manifest, or configuration source was edited. Supplemental harnesses/outputs live outside the checkout; only documentation/evidence should be committed.

**Two distinct functional/API findings were confirmed.** The aggregate URI length finding affects three builders but is one root cause. The decimal option finding is a lower-priority developer-facing input-contract defect; current payment URI callers use valid fixed precision constants.

Original repository tests: **284 distinct cases passed, 0 failed**: the complete **199-test payment-uri suite passed its original coverage gate**, plus 85 focused cases across the other three packages. The initial payment-uri selection of 23 cases was rerun within the full suite and is not added again. The other packages still have 348 deliberately unselected cases among the files sampled. This is not a whole-repository pass, browser signoff, or release qualification.

Supplemental deterministic checks: **10,229 cases**, with **six boundary failures belonging to the two findings**. The other 10,223 cases passed, including normal data roundtrips, one expected invalid-option rejection, and bounded local stress. No network, live payments, real wallets, or physical camera was involved.

## CORE-QA-01 — Builders emit payment links their own parser refuses

**Priority:** P2 / medium library correctness. **State:** reproduced on pinned main; no fix applied.

**Locations:** `packages/payment-uri/src/bitcoin.ts:119–141` (return 141); `solana.ts:93–104` (return 104); `tron.ts:74–82` (return 82). The conflicting aggregate bound is `query.ts:4,98–100` (`MAX_URI_LENGTH = 2048`). Per-field byte limits are `text.ts:9–13`: label 128, message 512, Solana memo 256.

**Expected:** A successful builder call produces a link the matching parser accepts with the same semantic values. When separately valid fields combine into an overlength URI after percent encoding, the builder should issue the documented typed size rejection before returning a string.

**Observed:** Builders validate individual decoded field sizes, percent-encode them, and concatenate without applying the whole-URI cap. Normal NFC Unicode text can expand past that cap.

Examples use existing public test fixtures from `packages/payment-uri/src/fixtures.testutil.ts`. All labels are `"é".repeat(64)` (128 UTF-8 bytes); messages are `"é".repeat(256)` (512 bytes), within documented field bounds.

| Builder | Other valid input | Returned URI length | Matching parse result |
| --- | --- | ---: | --- |
| `buildBitcoinUri` | `address: F.BTC_BECH32`, `silentPayment: F.spAddr('sp')`, `amountSats: 1n` | 2,124 | `PaymentUriError`, `TOO_LONG` |
| `buildSolanaPay` | `recipient: F.SOL`, `amount: '1'`, `memo: 'é'.repeat(128)` (256 bytes) | 2,770 | `PaymentUriError`, `TOO_LONG` |
| `buildTronUri` | `recipient: F.TRX`, `token: F.TRX2`, `network: 'mainnet'`, `amount: '1000000000000000000000000000000'` | 2,071 | `PaymentUriError`, `TOO_LONG` |

**Impact:** Integrators can create/copy a request that GhostPay's own QR/text intake refuses. QR image capacity is a separate limit; fitting a QR image does not guarantee the URI parser accepts it.

**Limits:** This is a shared-library/API defect. `PaymentRequestQr.tsx:38–48` delegates to Solana/TRON builders and its props allow labels/messages, but this pass did not render those combinations. `PlainPaymentRequest` exposes recipient and amount only. Optional Solana/TRON views are paused for Pages scope; EVM builder cases passed; the current BTC view uses a separate `btc-silent-payments` builder. No active EVM checkout failure or funds-loss impact is established.

An independent QC worker found affected builder/cap/text files byte-identical at main `c977b5d`, release #278 `417f7c7`, quick-hide #300 `1376289`, consolidation #302 `e22c174`, and formatting #303 `a9e0715`. This establishes unchanged source applicability, not execution of every branch tree. No matching fix was located in reviewed recent PRs or main audit/handoff keyword searches.

**Repair handoff:** Enforce the existing whole-URI length policy at each affected builder's final output boundary. Preserve accepted semantic data and stable typed errors; do not silently truncate. Avoid differing duplicate limits.

**Acceptance:** Add all three regressions. A builder may reject with `PaymentUriError('TOO_LONG')`; any returned URI must round-trip. Cover encoded lengths below/at/above 2,048, ASCII/multibyte NFC text, optional token/reference/address combinations, and aggregate fields. Retain normal vectors/property roundtrips and run the original coverage-enabled gate. Check consumers show their unavailable/error state instead of a nonparseable URI.

## CORE-QA-02 — Decimal precision escapes the typed error contract

**Priority:** P3 / low developer API robustness. **State:** reproduced on pinned main; no fix applied.

**Location:** `packages/payment-uri/src/decimal.ts:20–28`, exported from `src/index.ts:3`. README line 15 promises `PaymentUriError` with a stable code. Adjacent `toAtomic`/`formatAtomic` validate integer precision before arithmetic (`decimal.ts:34–47`).

**Expected:** Unsupported precision settings use the package's typed rejection channel before bigint conversion.

**Observed:** `parseDecimal('1', maxScale, 1000n)` reaches `BigInt(maxScale - frac.length)` for fractional/nonfinite precision; it throws native `RangeError` without a package error code.

| `maxScale` | Actual result |
| --- | --- |
| `0` | Accepts canonical amount `1` |
| `2` | Accepts canonical amount `1` |
| `-1` | `PaymentUriError`, `INVALID_AMOUNT` |
| `0.5` | Native `RangeError`, no code |
| `NaN` | Native `RangeError`, no code |
| `Infinity` | Native `RangeError`, no code |

**Impact/limits:** Direct helper callers depending on stable typed errors receive an unexpected exception class. Current production payment URI call sites use fixed precisions 8 or 18; no current Pages form path to invalid precision was established. This is distinct from web `parseUnits` PR #301/#303. Independent QC confirmed identical decimal blob `8d8ceb070d29d511a1080861f878bbc6d367798f` on main and #278/#300/#302/#303.

**Repair handoff:** Validate the supported precision domain before arithmetic, consistently with sibling helpers. Define/document the upper domain instead of silently introducing an arbitrary new bound. Preserve valid constants and exact amount behavior.

**Acceptance:** Add valid, fractional, nonfinite, and negative option cases. Require stable `PaymentUriError` rejection without native arithmetic errors; retain exact roundtrips across supported precision.

## Execution evidence

Runtime: Node `v24.22.3`, repository-pinned Vitest `5.0.5`. Direct source fixtures used Node's TypeScript transform with a scratch-only `.js`-to-`.ts` import resolver. This changes module/type loading only, not product algorithms; imports point to this checkout's actual source. Original Vitest selections give separate repository-tooling evidence. All work was local and bounded.

### Original repository tests

Initial focused commands used `--maxWorkers=1 --coverage.enabled=false`, JSON reports, and name filters. A subsequent full payment-uri run used `--coverage --maxWorkers=1` with the original configuration and thresholds, no filter, and a 1,024 MiB Node heap cap. Exact arguments are in `evidence/core-commands.json`. Unselected counts below are intentional exclusions in the other packages, not new skips.

| Package | Selected test files | Passed | Failed | Unselected |
| --- | --- | ---: | ---: | ---: |
| payment-uri (complete suite) | fuzz, vectors, negative | 199 | 0 | 0 |
| qr-exchange | multipart, assembler, generate, camera, settings-exchange, seller, readers | 47 | 0 | 186 |
| invoice-schema | base64url, expiry, schema, sign, envelope, fuzz | 27 | 0 | 161 |
| tx-review | property, golden | 11 | 0 | 1 |
| **Distinct total** | | **284** | **0** | **348** |

Full payment-uri coverage: **97.31% statements (543/558), 96.53% branches (530/549), 100% functions (47/47), 99.08% lines (433/437)**, original thresholds 95%/90%/95%/95%; process exit 0, no skipped tests. The full run retains the existing ordinary parser/property/validation tests and their bounded corpora. Both supplemental findings still exist: passing coverage does not establish complete aggregate-field or option-domain coverage.

Selected assertions cover normal URI vectors/roundtrips, exact decimals, standard invalid-address/precision handling, invoice canonical serialization/signature/encryption roundtrips, expiry boundaries, original 2,000-nonce and 300-encryption uniqueness checks, QR generation/jsQR decoding, shuffled multipart transfers, camera lifecycle/cancellation mocks, settings/seller exchange, and transaction-builder/decoder/review consistency. Original fast-check tests retained their own run counts/generated seed behavior; the reproducible supplemental seed below is separate.

### Supplemental deterministic normal-input checks

Seed: **1196446017 / `0x47505141`**, xorshift32 for synthetic data. No generated encrypted links or test private keys are recorded in the results.

| Check | Cases | Outcome |
| --- | ---: | --- |
| Exact decimal format/parse, 128-bit positive amounts, precision 0–36 | 5,000 | Passed |
| EVM native/ERC-20 URI roundtrips, chain IDs 1–4,294,967,296 | 2,000 | Passed |
| BTC/Solana/TRON ordinary Unicode/text roundtrips | 1,500 | Passed |
| Valid per-field text at aggregate encoded-length boundary | 3 | Failed, CORE-QA-01 |
| Multipart QR, 1–32,768 bytes, shuffle/duplicate/reset/copy isolation | 600 | Passed |
| Plain/encrypted invoice roundtrips with ordinary Unicode memos | 120 | Passed, 60 each mode |
| Settings exchange, supported delays/themes/lock ranges | 1,000 | Passed |
| Decimal option controls/boundaries | 6 | 3 controls passed, 3 failures, CORE-QA-02 |

QR stress processed **10,146,005 payload bytes**, **27,949 unique frames plus 27,949 duplicate additions**, and at most 64 frames per transfer. The final run completed that phase in **879.747 ms** (about **11 MiB/s**). Peak process RSS for the combined seeded run was **121,270,272 bytes**. These observed container/workload values are not device performance promises or sustained-load capacity limits.

`evidence/core-seeded-results.json` is the final supplemental result; the process exits 1 because the three legitimate boundary inputs caused one failed roundtrip group. `evidence/decimal-options-results.json` records six small option cases and exits 1 for three wrong error classes. An initial scratch-only loader ordering failure was fixed before those option checks ran; `decimal-option-loader-preflight.log` retains that preflight and is not a GhostPay defect.

## Remaining work

Fix CORE-QA-01 first and qualify the actual changed branch. Address CORE-QA-02 as scoped API maintenance. Sampled properties do not cover all possible data/schedules. Full coverage-enabled suites for invoice-schema/qr-exchange/tx-review, cross-browser/device acceptance, sustained physical-camera performance, deployment behavior, and broader application/release gates remain separate from these core results.

Final local integrity check: `git diff --name-only c977b5d6723f6822c3b5d86cd6b231712c53c395 -- packages/invoice-schema packages/payment-uri packages/qr-exchange packages/tx-review` and `git ls-files --others --exclude-standard` over the same scopes returned no paths. The JSON report counts were independently reconciled against all four original Vitest reports.
