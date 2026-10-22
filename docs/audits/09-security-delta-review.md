# Preliminary security delta review

**Status:** preliminary review of the in-progress `integration/consolidated-2026-10-21` changes. This is an early delta review, not the requested extensive final security audit. It is not an external audit, and no real-chain deployment or hostile-RPC integration was exercised.

## Findings

### S3-D1 — A successful RPC retry could be trusted before the chain was rechecked (fixed in review)

**Severity:** High (wrong-chain reads can influence payment or deployment decisions when an RPC endpoint changes backend).

**Affected code:** `packages/chain-adapters/src/rpc.ts`, `rawRequest()` and `guarded()`.

On a transport failure, `rawRequest()` sets `dirty = true`. If its built-in retry then succeeds, it returns that result directly. `guarded()` only checks `dirty` before entering `rawRequest()`, so it does not recheck `eth_chainId` between the failed attempt and the successful retry. With the default retry count, an RPC load balancer or endpoint can fail one attempt and serve the retry from a backend on a different chain; the result from that backend is returned to the caller. The next request would perform a check, but the first result has already been trusted.

**Trigger:** use the default retry behavior; cause a transport or retryable HTTP failure, then have the endpoint return a successful response from a different chain on the retry.

**Review status:** root added a per-request reconnect check and regression coverage for a backend switch inside a retry. A second review found and reported a concurrent dirty-reset race; root addressed it with a failure generation captured per response, and added a deferred concurrent-check regression. The focused RPC suite passed according to root, and I re-reviewed the generation handling without finding a remaining defect in this path. This closes S3-D1 for the reviewed changes.

### S3-D2 — Scan results could remain marked verified after a second-provider disagreement (fix added)

**Severity:** Medium-high (a forged payment can remain actionable even though the configured cross-check detects it).

**Affected code:** `apps/web/src/lib/scanClient.ts`, `runScan()`; `apps/web/src/views/Scan.tsx`, scan result rendering.

`runScan()` verifies each match and invokes `onMatch` before it cross-checks the page with `compareProviders()`. The Scan view immediately puts that match in app state. If the primary RPC fabricates a router announcement and the configured secondary omits it, the later comparison reports a discrepancy and withholds the checkpoint, but does not remove or demote the already surfaced match. The UI shows a separate warning that results may be forged while the card can still say `verified`.

**Trigger:** configure two providers; the primary returns a fabricated in-range router announcement and the secondary returns the honest range without that log. The user can still see the forged payment marked verified after the disagreement is reported.

**Recommended correction:** withhold matches for a page until its second-provider comparison completes, or remove/demote matches from every discrepant page and ensure the UI does not present them as verified.

**Review status:** the scan implementation buffers page matches until after its second-provider comparison completes and drops matches for discrepant pages. An independent review found that a later agreeing page could still advance the checkpoint beyond an earlier withheld page. The scanner now stops at the first discrepant page, leaves the cursor at that page's start, and has a two-page regression that proves no later page is fetched or saved. The focused web scan/scanner/Scan run passed 54 tests.

### S3-D3 — A direct announcement could borrow an old balance as proof of a new payment (fixed in review)

**Severity:** High (a forged announcement can be shown as a verified payment and trigger goods or service release).

**Affected code:** `packages/chain-adapters/src/scanVerify.ts`, `verifyReceipt()`; `apps/web/src/lib/scanClient.ts`, which uses it for Scan results.

For non-router announcements, `verifyReceipt()` returns `verified` when the stealth address balance at the announcement block **or** at the finalized height is at least the claimed amount. That does not link an incoming transfer to the announcement. Stealth addresses and ephemeral keys are visible in prior announcements. An attacker can reuse a prior funded announcement's public stealth address and ephemeral key in a new direct announcement, choose metadata amount no greater than the existing balance, and have the recipient's scanner match it. The old balance satisfies the check even though the new announcement moved no funds. The Scan UI then treats it as `verified`.

**Trigger:** a recipient has a funded stealth address from an earlier payment; an attacker posts a new direct ERC-5564 announcement reusing its published stealth address and ephemeral key and claiming an amount up to that balance. The new record is shown as verified without a corresponding transfer.

**Recommended correction:** require evidence of an incoming transfer tied to the announcement or its transaction (including sender/recipient/token/amount and block/receipt association). If that cannot be established for a direct announcement, keep it claimed/unverified; an address balance alone is not proof that this announcement paid it.

**Review status:** the web scanner no longer calls legacy `verifyReceipt()`. It uses `verifyClaimedPayment()`, maps only `received && final` to `verified`, maps evidence-backed nonfinal results to `pending`, and leaves other results `claimed`. Direct announcements stay claimed regardless of balance. The adapter checks chain/caller binding, amount and asset, canonical block, and transfer/receipt evidence. See S3-D7 for the newly found integration bypass and fix.

### S3-D4 — Bounded scans could read beyond their requested end and miss a mid-scan fork (fixed in scanner delta)

**Severity:** Medium-high (stale-fork announcements or scan work outside the caller's requested range).

**Affected code:** `packages/chain-adapters/src/logs.ts`, `fetchAnnouncements()`; `packages/chain-adapters/src/adapter.ts`, `scan()`.

The previous fetch API did not accept an inclusive `toBlock`; callers could only discard out-of-range results after the RPC query had already covered the provider head. Reorg validation checked the stored cursor and, in some cases, the current head, but did not anchor and recheck every completed response window. A fork inside a truncated/bounded scan could therefore leave stale announcements in its result while advancing a cursor.

**Trigger:** ask for a scan bounded below a higher provider head, or have a provider reorganize an already-read range before a truncated scan completes. The old code could issue an `eth_getLogs` request past the requested end, or return old-fork events without a reliable per-window canonical check.

**Correction:** added inclusive `FetchOptions.toBlock` and passed a fixed `ScanRange` end through the EVM adapter; the observed head is capped at 10,000,000,000. Each successful log page records its end-block hash, verifies accepted event block hashes against canonical block data, and rechecks page-end hashes after page work. A changed page returns only earlier stable-page events and a rollback cursor; because the fetch API persists one checkpoint, an unknown/deep checkpoint mismatch resets to genesis instead of applying a finality-depth guess. The adapter buffers matched payments across the bounded scan, rechecks each batch checkpoint before yielding, and throws on reorg; accepted matches are capped at 10,000 and batches at 100. Oversized accepted-log pages are narrowed before progress; if a single block exceeds the caller's log cap, the fetch fails closed.

**Resource bounds:** `maxRequests` counts only `eth_getLogs` page calls and remains capped at 50 per fetch. Accepted logs are capped at 10,000. Canonical event-block reads have an independent cap of 1,000 distinct blocks; window checks add at most 50 pre-read and 50 post-read calls, plus fixed checkpoint/head/final-cursor reads. These ancillary reads do not consume the page-request budget. One EVM adapter scan is capped at 100 fetch batches, so the conservative hard ceiling across a scan is 5,000 `eth_getLogs` calls and approximately 110,400 ancillary block reads (100 × (1,000 event-block + 100 window + up to 3 fixed reads), plus the adapter's 100 final checkpoint reads and initial head read). This is a ceiling, not typical cost, and is bounded even for adversarial log volume.

At the web layer, one scan now also caps processing at 100,000 accepted announcements and retains at most 10,000 cryptographic matches. If the next page exceeds a budget, the scanner leaves that page unprocessed, preserves the preceding stable cursor, and reports a resumable safety-limit state. This prevents the default `maxPages` loop from accumulating unbounded work or results.

**Review status and remaining limitation:** focused scanner tests cover `toBlock` below head, adapter propagation of the upper bound, `toBlock` below cursor, accepted-log overflow, hostile head, deep checkpoint reset, and a truncated-window reorg. A single RPC endpoint can still lie consistently about both logs and canonical block reads; the checks reduce accidental/stale-fork acceptance but do not provide independent consensus. This early delta review does not establish the full production RPC trust model.

## Reviewed areas and limits

### S3-D5 — A stale camera permission request could overwrite a newer stream (fixed in review)

**Severity:** Medium (camera preview/reader can stop unexpectedly and detached camera tracks may remain active).

**Affected code:** `apps/web/src/components/CameraImporter.tsx`, `begin()`/`cancel()`; `packages/qr-exchange/src/camera.ts`, `startCamera()`.

`cancel()` aborts the current request and immediately enables another Start. If the browser has not yet resolved the first `getUserMedia()` prompt, a second acquisition can begin. When the first promise resolves late, `startCamera()` assigns its stream to the shared video element before it checks the aborted signal. It can overwrite a newer stream; its subsequent `stopVideo(video)` then stops whichever stream is attached rather than the stale local stream. This can orphan a stream's tracks or terminate the newer scan.

**Trigger:** leave `getUserMedia()` for scan A pending, click Stop, click Start again and let scan B attach, then resolve the old scan A request. The old async completion still writes to the shared video element.

**Recommended correction:** after acquisition, if the request is aborted or no longer the active generation, stop the returned stream's own tracks without assigning it to the video. Only attach when the generation is current; keep cleanup scoped to the stream owned by that invocation. Consider ignoring late `onText` completion after cancellation as well: `scanFromVideo()` awaits async callbacks, so a callback can still finish with accepted state after Stop/unmount. Existing call sites inspected here use synchronous validation callbacks; the generic component API nevertheless permits async side effects.

**Correction and status:** `CameraImporter` now keeps one stable video element and only the active controller generation can update UI state. `startCamera()` checks abort after permission resolves and stops only the returned stale stream before attaching it. `scanFromVideo()` captures its stream at entry and never stops a replacement stream; track stops are idempotent. The importer checks generation/abort after its async `onText` callback before applying acceptance state. Regression tests defer permission A, stop it, start B, resolve B then A, and assert A is stopped while B remains attached and active; they also assert stable video identity. Focused camera suites pass (20 tests); web and qr-exchange typechecks pass. An async caller-provided callback can still perform its own side effects after cancellation; the importer suppresses its own post-callback state changes but cannot cancel arbitrary callback internals.

### S3-D6 — PayJoin receiver accepted sender-claimed prevouts when chain lookup was absent (fixed in review)

**Severity:** Medium before this fix. The earlier High BITCOIN-01 fee-burn was already bounded by the absolute `maxContributionFeeRate` cap, so I did not reproduce the old unbounded-loss claim against current code.

**Affected code:** `packages/btc-payjoin/src/receiver/checks.ts`, `checkOriginal()`; `packages/btc-payjoin/src/signers.ts`, `ReceiverWallet`.

Before this review, prevout verification ran only when optional `wallet.getPrevOut` was supplied. If omitted, `checkOriginal()` still computed `F0` from sender-provided PSBT UTXO fields. The fee cap limited direct receiver loss, but the receiver continued making policy decisions from unauthenticated values, and deployments could silently lack the authoritative check.

**Trigger:** use a receiver wallet without `getPrevOut` and submit a finalized PSBT whose `witness_utxo` amount or script does not match the referenced chain output. The prior implementation proceeded into fee calculation instead of refusing the request.

**Correction and status:** `ReceiverWallet.getPrevOut` is now required. Runtime checks also fail closed for a missing method or RPC error (`unavailable`), unknown/spent outpoint or amount/script mismatch (`psbt_invalid`). The lookup receives each PSBT input's txid and output index before fee calculation. The absolute fee cap remains defense in depth. Regression coverage includes inflated claimed amounts, mismatches, unknown outpoints, lookup failures, and missing runtime capability. Focused PayJoin receiver/session/transport/silent-payment tests passed (77 tests total, `--maxWorkers=1 --no-isolate`); package typecheck passed.

### Historical finding SOLANA-TRON-01 — duplicate announcement memos

I rechecked the current `packages/solana-stealth/src/scan.ts`: `scanAnnouncements()` deduplicates by `(signature, stealthAddress)` before crediting the transaction delta, and `scan.test.ts` repeats one memo five times and asserts one detection. The original audit finding is already fixed in the current target; no new defect was found in this path.

### S3-D7 — Scan UI used an attested-caller shortcut instead of transfer evidence (fixed in review)

**Severity:** High (a router-attributed announcement without a corresponding transfer could be presented as verified).

**Affected code:** `apps/web/src/lib/scanClient.ts`, `packages/chain-adapters/src/payments.ts`.

The web scanner called legacy `verifyReceipt()`, which treated a final router caller as sufficient proof. The newer `verifyClaimedPayment()` helper existed but was not wired into scan results. That bypassed the token transfer or native receipt checks that bind payment evidence to the announced amount. The verifier also trusted the RPC to honor its `eth_getLogs` filter, allowing an unrelated same-amount event to pass without local topic/from/to checks.

**Trigger:** a primary RPC returns a final router-attributed announcement but no matching token transfer, or returns an unrelated same-amount event while ignoring the requested topics. The former previously rendered `verified`; the latter could satisfy the old transfer verifier.

**Correction and status:** `runScan()` now verifies router claims with `verifyClaimedPayment()` and only renders `verified` after `received && final`. The verifier checks chain binding, the manifest router caller, positive amount and allowlisted token, canonical block, and the exact Transfer event's topic, sender, recipient, amount, token, block, transaction hash, and log index. Native balance is observation only; the verifier requires a successful receipt/transaction bound to the exact announcement. The “verify payment by transaction hash” path now also binds the receipt hash, canonical receipt block, and each announcement log's transaction/block hashes to the requested transaction; it no longer overwrites provider-supplied log hashes. When a second client is configured, both must identify the same evidence and finality. A per-page temporary evidence set commits only after provider reconciliation, so one event/transaction cannot credit two claims; discarded pages, cancellation, and reorg do not consume evidence. Page and scan-level claim dedupe prevent replay cards across log pages. Two RPCs remain an operational trust assumption, not cryptographic authentication.

### S3-D8 — Standard scanning had no opt-in path for wrong view tags (implemented in review)

**Severity:** Availability/recovery gap; an otherwise legitimate payment announcement was omitted if the payer published an incorrect one-byte view tag.

**Affected code:** `apps/web/src/lib/scannerCore.ts`, `apps/web/src/lib/scanClient.ts`, `apps/web/src/views/Scan.tsx`.

The core crypto API supports bypassing the one-byte prefilter while still checking the full stealth address, but the web worker protocol did not expose that option. The standard scan therefore missed router announcements with an incorrect view tag.

**Correction and status:** added an explicit “Deep scan (also check wrong view tags)” opt-in with a CPU warning. Only manifest-router announcements receive `skipTag`; the worker still validates the full stealth address and returns a `tagMatches` diagnostic. A wrong-tag match remains subject to payment verification and is visibly labeled. Cumulative per-run bounds stop deep scan after at most 100,000 accepted announcements and 10,000 retained matches, with a resumable limit state. Focused worker and UI tests passed in the final 54-test run.

### S3-D9 — Payment verification leaks matched addresses to the configured RPC (partially mitigated)

**Severity:** Medium privacy leak; it let the configured RPC provider correlate scan results to the seller's IP.

**Affected code:** `packages/chain-adapters/src/payments.ts`, `verifyClaimedPayment()`.

Verification previously read `eth_getBalance` or ERC-20 `balanceOf` for each matched address, including untrusted direct announcements. The address was sent to the provider even though the returned balance no longer establishes payment.

**Correction and status:** per-address balance observation is now opt-in through `observeBalance`; Scan disables it by default, so the old balance-read leak is removed. This does **not** restore RPC unlinkability: ERC-20 proof checks still ask for `Transfer(router → stealth)` logs using the exact one-time recipient topic, and native proof checks request the matched transaction receipt. Those match-correlated queries reveal which public announcements matched to the RPC (and correlate them with the scan client's network identity). A configured second provider receives the same evidence requests. The Scan privacy notice now says this directly and recommends trusted private RPC or a self-hosted node. Full query unlinkability would need bulk/page-wide evidence collection with local matching (and compatible receipt gathering); this pass does not implement that. The focused regression only establishes that no `eth_getBalance` or `eth_call` is sent by default, not privacy against verification query correlation.

## Audit 05 economic and source-verification spot-check

These are current-target spot checks, not closure of all audit 05 findings or the migration P0.

- **CONTRACTS-POOLS-01 (old portable paymaster/gas extraction):** the sponsor now checks user-op verification/call gas, aggregate maximum cost, live max-fee multiplier, priority-fee cap and calldata-derived `preVerificationGas` in `packages/payer-sponsor/src/sponsor/service.ts#checkUserOp`; it rechecks sender token balance before submission. `packages/payer-hiding-contracts/src/GhostPayVerifyingPaymaster.sol` also enforces constructor-pinned max fee, max priority fee and max `preVerificationGas`, and `GhostPayErc4337.t.sol` has above-cap/self-bundle regressions. The sponsor service tests passed (23 tests). Current source inspection closes the old testnet PoC path within those configured bounds; there is no real deployment here to verify the deployed immutable values or actual EntryPoint behavior.
- **CONTRACTS-POOLS-02 (pool relayer gas grief):** `packages/pool-relayer/src/service.ts#relay` refuses a simulated gas limit above `gasEstimate * gasCapBps / 10_000` before sending, and charges confirmed unreimbursed gas cost to the bounded loss budget. Defaults cap the simulated limit at 1.5× the priced gas estimate. The service test asserts refusal just above the cap and acceptance at/below it; focused pool-relayer service tests passed (18 tests).
- **SUPPLY-CHAIN-CI-06 (source-verification shell evaluation):** `scripts/testnet/verify-sources.sh` no longer evaluates manifest strings as shell. It validates address/compiler patterns and passes commands as Bash arrays; its `declare -n` target names come from a fixed two-item loop. All four `scripts/testnet/verify-sources.test.mjs` cases passed with the bundled `cast` utility on `PATH`, including valid-manifest command construction and injection/malformed-input regressions.

These findings were rechecked against the working tree, whose local edits are not a final committed snapshot. Root reports a separate Foundry contract suite run; I did not rerun Foundry in this pass. No contract deployment, real RPC, live relayer or production configuration was exercised.

- `apps/web/src/lib/tags.ts`: the v2 record AAD binds ciphertext to chain ID, record ID, and lookup token. Legacy v1 reads verify the decrypted address against the keyed lookup token before writing the upgraded record. No backwards-data-loss or authentication defect was identified in this pass. As designed, metadata remains visible in IndexedDB; this does not protect against active same-origin script execution.
- `packages/chain-adapters/src/registry.ts` and the web registry panel: the transaction builder validates the meta-address and the panel verifies the registry before publication or lookup. The check is a behavioral probe and does not pin a runtime code hash; a hostile RPC can forge the code and call results. This is an explicit trust limitation in the implementation, not independent deployment verification.
- `packages/chain-adapters/src/index.ts`: reviewed the compatibility exports for ambiguous or unsafe verification API naming; no issue identified in this pass.
- `packages/contracts/src/GhostPayRouter.sol`, `GhostPaySweepRelayer.sol`, `GhostPayPolicyRouter.sol`, `PolicyAccount.sol`, and `PolicyAccountFactory.sol`: reviewed the payment, signature, nonce, reentrancy, destination, and withdrawal-limit paths. No additional concrete contract defect was identified in this pass. This was source review only; no new Foundry, fuzz, or invariant run was performed.
- `packages/chain-adapters/src/payments.ts`, `scanVerify.ts`, and `verify.ts`: the early review found that the web scanner bypassed payment-specific evidence and that ERC-20 validation trusted RPC-side filtering; S3-D7 records the concrete fixes and focused tests. Deployment readback still depends on RPC observations and does not establish independent deployment authenticity.
- Root reports that focused RPC tests pass, including retry backend-switch and concurrent stale-check regressions. I independently ran the focused chain-adapter scanner suite after the scanner change: `adapter.test.ts`, `logs.test.ts`, `adapter.deep.test.ts`, and `scanHardening.test.ts` passed (53 tests, `--maxWorkers=1 --no-isolate`); current chain-adapter typecheck passed. The web scan/scanner/Scan suites passed 54 tests; chain-adapter payment tests passed 24 tests; targeted ESLint for changed scan and BTC disclosure files passed; web and chain-adapter typechecks passed. The `adapter.test.ts` fixture now supplies canonical per-block hashes and includes a cross-page reorg test asserting that buffered matches are not yielded after the scan fails. I did not run a full test suite.

## Scope

This review covered the in-progress RPC client/reconciliation changes, registry compatibility APIs and exports, tag-record binding plus legacy migration, core contract payment/signature/withdrawal logic, and chain-adapter payment and deployment verification. It does not establish overall application correctness, wallet safety, production configuration, or chain deployment authenticity. A full audit should follow the final integration and include targeted adversarial tests, focused contract fuzz/invariant runs, and review of the complete payment path.
