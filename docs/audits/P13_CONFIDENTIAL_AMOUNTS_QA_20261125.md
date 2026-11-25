# P13 confidential amounts: fuzz, stress, QA, security audit and bug search (2026-11-25)

**Status: self-run, AI-assisted review. This is not an independent professional audit.** The code is still dormant:
it is not exported from the package entry, off by default, refuses settlement, and has no app wiring.

- Scope: the whole `@ghostpay/confidential-amounts` package. That covers the P13 core in `src/future/p13/`, the older
  proof of concept (PoC) in `src/*.ts` and `src/backends/`, and `browser/`. Out of scope: `confidential-contracts`
  (open PRs #220 and #442), apps/web, the rest of GhostPay.
- Base: main `69485773` (PR #642). Branch `nodata/eloquent-shannon-gfv6t9`. Commits: `6b0a4980` (test suites),
  `c827a4f6` (fixes for A1–A11 and B1), `1c21bfbb` (fixes for B2–B10).
- Method:
  - Two independent agents reviewed read-only and ran their own probes: audit A covered the P13 core, bug search B
    covered the PoC.
  - The lead verified every finding.
  - A third agent fixed B2–B10 test-first.
  - The lead fixed A1–A11 and B1 test-first.
  - Each fix has a regression test that failed on the earlier code.

## 1. Testing added

| Suite | What it does | Result |
|---|---|---|
| `src/future/p13/fuzz.test.ts` (fast-check, seed `20261125`; `P13_FUZZ_RUNS` scales runs) | Totality and contract properties for the number parsers, asset/record decoders (hostile values, byte mutations), envelope bit flips and truncation, hostile backup import, the gate, the secret scanner and invoice fee policy. Differential check against `CleartextLedger`. | 13 properties; a 20,000-run campaign found 0 counterexamples, before and after the fixes |
| `src/future/p13/stress.test.ts` | Create, list, export and restore of 1,000 records. Paged export past one page. 2-, 8- and 32-way compare-and-set races with interleaving. A 16-way race to create the same record. 20 retrying writers with no lost update. Reconciliation of 600 records, run twice. 200 plans prepared and reviewed. | Pass, about 4 s |
| `src/future/p13/audit.test.ts`, `src/payment.provenance.test.ts`, `src/ledger.test.ts`, `src/zama.manifest.test.ts` and additions to existing tests | Regression tests for the findings | Pass; each failed before its fix |
| `npm run test:browser` (Chromium 158) | Reload persistence, an index-only key and ciphertext-only storage. Two real tabs race the same review over shared IndexedDB for 25 rounds. 300 plans through IndexedDB and WebCrypto. Zero requests leave the local origin. | Pass. Exactly one commit per round; the loser got `P13_RECORD_CONFLICT`. Prepare 680 ms, restore 268 ms, reconcile 366 ms. |

## 2. Findings and status

Severity reflects the dormant state: nothing is wired into the app. B1 would be critical once the app shows payments.

| ID | Sev | Area | Finding | Status / regression test |
|---|---|---|---|---|
| B1 | High | `payment.ts`, P13 `lifecycle.ts` | A decryptable announced handle was treated as payment. Anyone owning a ciphertext can `FHE.allow` it to the stealth address and token (fhEVM ACL `allow` needs only the caller's own permission), and anyone can call the announcer. | Fixed. `verifyPaymentProvenance` requires the pinned router's `ConfidentialPayment(token, handle)` and the pinned token's `ConfidentialTransfer(router, stealth, handle)`. Otherwise `interpretEvidence` returns `unknown/unverified-source`. Tests: `payment.provenance.test.ts` and `audit.test.ts` B1 |
| B2 | Med | `backends/zama.ts`, `manifest.ts` | Router, operator and token were never checked against the manifest. `verifyManifestOnChain` skipped GhostPay contracts. | Fixed. An injected manifest is checked; the shipped manifest pins none, so CT-1 refuses every chain. Tests: `zama.manifest.test.ts` |
| A1 | Med | P13 `store.ts` | Backup import could replace a submitted record and its tx hash with a divergent cancelled branch. | Fixed. Replacement is allowed only by a higher revision of the same plan that keeps its possible effect and its tx hash. Test: `audit.test.ts` A1 |
| A2 | Med | P13 `store.ts` | A cap applied only to reads meant that at 1,001 records list, export and reconcile locked out permanently. | Fixed. Writes are capped (default 10,000), reads tolerate twice that, `exportBackupPages` added. Tests: `audit.test.ts` A2, `stress.test.ts` |
| A3 | Med | P13 `disclosure.ts`, `asset.ts` | The cleartext fixture's consent text said "hides how much" and included operator-trust lines. | Fixed. Copy sets are per protocol, and asset trust statements are limited to their own protocol. Tests: `audit.test.ts` A3, `policy.test.ts` |
| B3 | Med | `calldata.ts` | The operator window trusted `nowSec`, so a millisecond clock gave a near-unlimited approval. | Fixed. `nowSec` must be in [1.6e9, 2^32). Test: `calldata.test.ts` B3 |
| B4 | Med | `decrypt.ts` | A throwing `isolate`, `sleep` or `random` hung jobs and raised unhandled rejections. The timer leaked on cancel. `enqueue` threw synchronously. | Fixed. Tests: `decrypt.test.ts` B4 |
| A4 | Low | P13 store, lifecycle, gate, plan | Caller inputs were read more than once, so getters could switch state, a fake `delivered` could verify, and coerced addresses were accepted. | Fixed. Inputs are snapshotted once and type-checked. Tests: `audit.test.ts` A4 |
| A5 | Low | P13 `lifecycle.ts`, `plan.ts` | authorized → cancelled was allowed, although an authorized record may already be signed. | Fixed. Test: `audit.test.ts` A5 |
| A6 | Low | P13 `strict.ts` | Property descriptors were built before size checks: a 5M-element array cost 7.8 s and about 330 MB. | Fixed. Test: `audit.test.ts` A6 (2M elements refused in under 250 ms) |
| B5 | Low | `backends/zama*.ts` | Raw viem/SDK errors escaped `userDecrypt`/`encryptAmount`; with key `0xff…ff` the message contained the key scalar. | Fixed. Fixed-message `CtError`s. Tests: `zama.manifest.test.ts` B5 |
| B6 | Low | `backends/ledger.ts` | The test ledger diverged from Solidity: unwrap request consumed before the proof check, zero receiver accepted, no uint64 supply cap, ETH accepted on non-payable calls, constructor checks missing. | Fixed. Test: `ledger.test.ts` |
| B7 | Low | `calldata.ts`, `metadata.ts` | No chain guard in `encodePayConfidential`; zero addresses and handles accepted. | Fixed. Tests: `calldata.test.ts`, `metadata.test.ts` |
| B8 | Low | `backends/zama.ts` | `finalizeUnwrap` opened a relayer session before validating the token. | Fixed. Test: `zama.manifest.test.ts` B8 |
| A7 | Info | P13 `record.ts` | A BOM-prefixed record decoded. | Fixed. Test: `audit.test.ts` A7 |
| A8 | Info | P13 `disclosure.ts` | Prototype keys were accepted as routes. | Fixed. Test: `audit.test.ts` A8 |
| A9 | Info | P13 `record.ts` | A raw `JsonParseError` escaped as `P13_INTERNAL`. | Fixed (now `P13_RECORD_INVALID`). Test: `audit.test.ts` A9 |
| A10 | Info | P13 `store.ts`, `cipher.ts` | The envelope cap was 1 MiB against a largest valid size of 65,589 bytes; no nonce sanity check. | Fixed: exact cap, all-zero and repeated nonces refused. Test: `audit.test.ts` A10 |
| A11 | Info | P13 `store.ts` | `RecordPatch.sessionEpoch` could rebind a plan's session. | Removed. Test: `audit.test.ts` A11 |
| B9 | Info | `manifest.ts` | A wrong EIP-55 checksum was accepted. | Fixed. Test: `manifest.test.ts` B9 |
| B10 | Info | `copy.ts`, docs | The wording check missed "audited", "deployed", "mainnet-ready" and "verified seller"; docs said SDK 3.7.0. | Fixed. Test: `misc.test.ts` B10 |
| A12 | Info | P13 `secret.ts` | `structuredClone`/`v8.serialize` produce `{}` silently rather than refusing; browser devtools can show private fields. | Accepted and documented. There is no leak; JavaScript offers no stronger guard. |

## 3. Clean checks

The audits checked these and found nothing:
- **AAD and header layout:** unambiguous; header and plaintext identity are cross-checked.
- **Tampering:** gives a uniform authentication error.
- **Strict decoding:** duplicate keys, `__proto__`, -0, huge integers, escapes and lone surrogates are all rejected.
- **ReDoS:** none.
- **Fee arithmetic:** exhaustive for 1..200,000 and at the uint64 boundaries.
- **Gate:** hardened against getters and Proxies.
- **Digests:** no amount reaches an unkeyed digest.
- **Router and ledger core:** fee, zero transfer, operator boundary and epoch rules match.
- **ABI:** argument order and widths match.
- **Randomness:** Web Crypto only, no `Math.random`.
- **Zama SDK import:** dynamic only.
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities.
- **Banned APIs:** none in the sources.

## 4. Residual risks and open items

- **Rollback across sessions:** a storage writer can still restore an older valid envelope after a reload. Closing
  this needs an external monotonic counter (owner decision D6).
- **CT-1 is not usable:** it needs reviewed manifest pins (router, tokens, code hashes) and a chain reader that feeds
  `interpretEvidence` real receipt logs.
- **Copy flaw outside P13:** `CTM_INFO.whatItDoesNotHide` in the PoC still lists FHE lines for the cleartext backend.
  P13 filters them out; the PoC's own consumers would not.
- **Lifecycle changes for future callers:** cancelling an authorized plan is now refused, and evidence requires
  provenance.
- **Not run:** Firefox, WebKit, mobile, real Sepolia, Foundry/Hardhat contract tests (contracts unchanged).

## 5. Reproduce

```bash
npm ci --ignore-scripts && npm run build:libs
cd packages/confidential-amounts
npm test                                   # 408 tests; coverage 99.11/96.1/100/99.83
npm run typecheck && npm run lint && npm run build
P13_FUZZ_RUNS=20000 npx vitest run src/future/p13/fuzz.test.ts --coverage=false --testTimeout=3600000
npm run test:browser                       # Chromium; GHOSTPAY_CHROMIUM overrides the binary
```
