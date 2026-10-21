# Deep code audit: TS libs (core-crypto, invoice-schema, chain-adapters)

Date: 2026-10-21. Branch: claude/remote-extensions-1. Read-only audit; no source, test or config edited; no commit.
Nothing was executed (no vitest, tsc, node or forge). Every claim below is from reading the code; line numbers refer to the working tree as read.

## Read first (accepted deviations, not re-reported)

- packages/core-crypto/DEVIATIONS.md: rejects 66-hex single-key meta-address; reduces s_h mod n with zero check; strict hex/EIP-55; no silent key fallback.
- packages/invoice-schema/DEVIATIONS.md: signature covers full plaintext (not ciphertext hash); invalid sig returns verdict, does not throw; totals not cross-checked; lowercase addresses.
- packages/chain-adapters/DEVIATIONS.md: fee recipient not in calldata; manifest-vs-chain check not implemented (release gate); fiat `quotedTokenAmount` supplied by caller; log fault split (provider throws, content skipped); hand-written manifest validator; gen-abi by construction; RPC retry classes.
- packages/chain-adapters/TODO-VERIFY.md: unverified token addresses, empty FEEDS, unverified chain parameters.
- docs/audits/01-completeness-audit.md: A-07 (no manifest-vs-chain check), A-09 (no fallback reconciliation), A-12 (FEEDS empty), A-13 (no TWAP), C-18/K-08 (no 0x47500002 path), W-09 (non-router announcements unverified).
- docs/DEPLOYMENT_MANIFEST.md: manifest `signature` is format-checked only, never verified (confirmed in deployments.ts:116-117, see L-05 below as a doc note, not a defect).

## Summary

| Severity | Count |
|---|---|
| critical | 0 |
| high | 0 |
| med | 1 |
| low | 7 |
| info | 9 |

No cryptographic maths defect found in core-crypto. Scheme-1 derivation, view-tag check, key recovery and metadata layout match ADR-0001 as written in code. invoice-schema parse order, canonical-form check, AAD binding and signature scope are internally consistent.

## Findings

### M-01 (med): scan ignores reorg signal, yields rolled-back payments with no retraction
- File: packages/chain-adapters/src/adapter.ts:205-231 (`scan`), reorg field from packages/chain-adapters/src/logs.ts:55-56 and 229-239.
- Evidence: `scan` calls `fetchAnnouncements` in a loop (adapter.ts:209) and keeps only `res.announcements` and `res.cursor` (adapter.ts:210, 228). `res.reorg` is never read. `fetchAnnouncements` sets `reorg` and rolls `next` back when the stored `cursor.last.hash` no longer matches (logs.ts:179-185). `scan` has no way to yield a retraction; `DetectedPayment` (adapter.ts:84-91) has no reorg marker.
- Failing scenario: range spans >50 requests (50 x 1000 blocks), so the loop runs a second `fetchAnnouncements` call. Block 49_999 is reorged between calls. Call 2 detects the mismatch, re-reads from ~49_937, and yields the replacement announcement. The announcement from the orphaned block was already yielded by call 1 and is never retracted. A consumer counting `DetectedPayment`s sees the same payment twice, or a payment that no longer exists on the canonical chain. The `id` differs (blockHash differs), so the adapter's own dedupe does not catch it.
- Test gap: logs.test.ts:241 ("detects a reorg that happens while scanning") tests `fetchAnnouncements` only. No adapter-level test covers it.
- Fix: either (a) surface `reorg` on `DetectedPayment` / a separate event so consumers drop `blockNumber >= rolledBackTo`, or (b) have `scan` track yielded `id`s and emit a retraction event, or (c) document that `scan` must not span a cap boundary without persisting cursor, and re-scan after a reorg-flagged call.

### L-01 (low): `scan` ignores `range.toBlock` in the fetch and scans to chain head
- File: packages/chain-adapters/src/adapter.ts:209-212 and 228-229; logs.ts:33-47 (`FetchOptions` has no `toBlock`), logs.ts:198-203.
- Evidence: `fetchAnnouncements` is called without an upper bound. `range.toBlock` is applied afterwards as `continue` (adapter.ts:212). Paging only stops at `!res.truncated` (head) or `cursor.nextBlock > range.toBlock` after a truncated page.
- Failing scenario: `scan({fromBlock: 0n, toBlock: 5n})` on a chain with 60 000 blocks issues about 61 `eth_getLogs` calls (see adapter.test.ts:153-160 which uses exactly this) and returns one result. Quota and latency cost scale with chain height, not with the requested range.
- Test gap: adapter.test.ts:153-160 asserts the result length only, not the number of `getLogs` calls, so the over-scan is not caught.
- Fix: add `toBlock` to `FetchOptions`, clamp `to` to it, and stop when `next > toBlock`.

### L-02 (low): wss:// endpoints accepted by the validator but rejected by the default transport
- File: packages/chain-adapters/src/rpc.ts:85 (accepts `wss:`), rpc.ts:95 (`fetchTransport` rejects non-http(s)). Tests lock both behaviours: rpc.test.ts:14-16 and :211.
- Evidence: `createClient(chain, 'wss://...')` calls `validateRpcUrl` (accepts), then `fetchTransport.send` fails with `RPC_URL_REJECTED: fetch transport needs http(s)`. `isRetryable` returns false for it, so no retry. The web settings UI tells the user "use https:// or wss://" (apps/web/src/lib/settings.ts:30-35) and then calls `createClient` with the default transport (apps/web/src/lib/defaultServices.ts:28).
- Failing scenario: user enters a wss RPC, the URL is accepted, then every scan/pay fails at client creation with RPC_URL_REJECTED.
- Fix: either drop `wss:` from `validateRpcUrl` (and from the UI copy), or implement a WebSocket transport. Fail-closed, so no security impact.

### L-03 (low): sponsor fee is zero for amounts 1..33 units, unreimbursed gas, no lower bound
- File: packages/chain-adapters/src/fees.ts:141-151 (`sponsorFee`), 162-167 (`assertSponsorFeeAcceptable`).
- Evidence: `cap = floor(amount*300/10000)`, which is 0 for amount < 34. `capped` then sets `fee = 0`. `assertSponsorFeeAcceptable(33n, 0n)` passes (0 < amount, 0 <= cap). Fee tests use only 1_000_000n and 1_001n (fees.test.ts:113-117), so the zero-fee branch is untested. Verified by arithmetic from the code, not by running.
- Failing scenario: relayer sweeps 33 units with gas term 0.5 units. It signs fee 0 and absorbs the gas cost. Relayer-side minimum amount was not found in apps/relayer/src/service.ts (grep); not fully verified.
- Fix: enforce a minimum sweep amount or `fee >= gasTerm` in relayer, and add a boundary test at 33/34 units.

### L-04 (low): `decodePaymentCalldata` accepts `payERC20WithBuffer` calls the router reverts on
- File: packages/chain-adapters/src/router.ts:251-258 (buffer decode), 285-296 (`assemble`); contract GhostPayRouter.sol:143 `if (msg.value > maxBufferWei) revert BufferTooLarge();`.
- Evidence: `assemble` checks `value >= 1` for buffer methods but never `value <= maxBufferWei`. The doc block at router.ts:215-219 promises rejection of "calls that the router itself would revert on for static reasons". `buildPaymentTx` does enforce `maxBufferWei >= bufferWei` (router.ts:183), so only decode is lax.
- Failing scenario: crafted calldata with `msg.value = 10`, `maxBufferWei = 5` decodes to a valid preview. The user is shown a payment that reverts on-chain. Not a funds-loss path (the tx reverts), but the preview is not "what the transaction will do".
- Test gap: no decode-side negative test for this (router.test.ts:138-139 covers build-side only).
- Fix: in `assemble`, when `method === 'payERC20WithBuffer'`, require `r.value <= maxBufferWei` and add a test.

### L-05 (low): fiat conversion has no feed-to-asset binding in the library API
- File: packages/chain-adapters/src/quote.ts:83-106 (`readPrice` takes any `feed` string), 123-144 (`fiatToTokenAmount` checks only fiat currency vs caller-supplied `priceQuoteCurrency`, line 132); adapter.ts:119-120 and 173 (`quotedTokenAmount` taken as given).
- Evidence: nothing ties the feed address to `inv.token`. `findFeed` (quote.ts:46-48) is the only binding and it is not called inside the library. apps/web/src/lib/pay.ts:142 does bind by symbol, so the web path is covered.
- Failing scenario: a caller passes the ETH/USD feed for a USDC invoice. The amount is off by roughly the ETH price, and the adapter builds a payment for that amount with no error.
- Fix: have `readPrice`/`fiatToTokenAmount` take a `FeedConfig` (base, quote, chainId) and check `base === token.symbol` and `chainId` against the invoice.

### L-06 (low): core-crypto redaction is lost on derived views (`species`)
- File: packages/core-crypto/src/secret.ts:24-30 (`SecretBytes`, `Symbol.species` returns `Uint8Array`).
- Evidence: `TypedArray.prototype.subarray`, `slice`, `map`, `filter` build results through `constructor[Symbol.species]`, which returns plain `Uint8Array`. So `secret.subarray(0, 32)` is a non-redacting view that shares the secret buffer. `JSON.stringify`, template strings and `console.log` work on it. Redaction (secret.ts:31-45) holds only on the original object. Reasoned from the ECMAScript species rules; not executed.
- Failing scenario: a debug log or error path does `log(spendingSecret.subarray(0, 32))`, which prints the key.
- Fix: keep `species` as `SecretBytes` (so derived views stay redacting), or make `subarray` and `slice` throw, or document the bypass in README and `unsafeRevealSecret`.

### L-07 (low): `policyFlatFee` accepts 0 in the manifest, but the fee config rejects 0
- File: packages/chain-adapters/src/deployments.ts:152-155 (`UINT_DECIMAL` allows "0"), fees.ts:189-193 (`validateFlatSecurityFee` rejects `amount === 0n`).
- Evidence: the same field is validated two ways with different rules. A manifest with `policyFlatFee: "0"` loads, then `validateFlatSecurityFee` on the same value throws.
- Fix: reject 0 in `parsePolicy`, or document that a zero flat fee is legal and remove the second check.

### I-01 (info): `checkAnnouncement` does not validate the viewing secret at runtime
- File: packages/core-crypto/src/stealth.ts:148-168. The doc says `INVALID_SCALAR` for bad key arguments, but `viewingSecret` is only type-branded (secret.ts:15, `declare const` brand). A JS caller passing a zero or >= n scalar gets a raw noble error, not `GhostPayCryptoError`. Not executed; exact noble error class not verified.
- Fix: call `isScalarBytes` on the secret (or `secretScalarFromBytes`-style check) at entry, or correct the doc.

### I-02 (info): `generateKeySet` does not zeroize on `publicKeyOf` failure
- File: packages/core-crypto/src/keys.ts:45-58. Secrets are zeroized only on the `KEY_REUSE` branch. An exception from `publicKeyOf` (line 53-54) leaves both secrets unwiped. Unreachable in practice (valid scalars), so info only.

### I-03 (info): `checkExpiry` and schema accept zero fiat amounts
- File: packages/invoice-schema/src/schema.ts:92 (`DEC_RE` admits `0`), 235 (`fiat.minorUnits`), 274 (`tax.minorUnits`). A valid signed invoice can carry `fiat.minorUnits: "0"`. quote.ts:133 rejects it at conversion time, so the pay path fails closed, but the schema itself does not express "positive".

### I-04 (info): manifest `signature` never verified (documented)
- File: packages/chain-adapters/src/deployments.ts:116-117, 134. Format only. docs/DEPLOYMENT_MANIFEST.md:26 and :39 say so. Listed for completeness; the trust consequence (fee recipient and router address come from an unauthenticated JSON file) belongs to the release gate.

### I-05 (info): dead exports
- packages/chain-adapters/src/rpc.ts:320-330 `requestWithFallbackCheck` (exported, used only in rpc.test.ts). No runtime caller. The audit row A-09 says reconciliation is missing; this helper exists but is unwired.
- packages/chain-adapters/src/router.ts:388 `ROUTER_NATIVE_MARKER`: no importer found.
- packages/chain-adapters/src/fees.ts:189 `validateFlatSecurityFee`: only tests call it (expected until PolicyAccountFactory lands).

### I-06 (info): asymmetric signing self-checks
- packages/chain-adapters/src/sweep.ts:212-217 `signSweep` cross-checks viem digest against `sweepDigestManual`. `signPermit` (sweep.ts:308-311) does not cross-check, and `buildPermitTypedData` runs the `DOMAIN_SEPARATOR` comparison only when a reader provides it (sweep.ts:280). Recommend the same manual cross-check for permits.

### I-07 (info): response size cap measured in UTF-16 units
- packages/chain-adapters/src/rpc.ts:222 `text.length > maxBytes`. The default transport enforces bytes (rpc.ts:117), so this matters only for injected transports. Use `new TextEncoder().encode(text).length` or document it.

### I-08 (info): reorg rollback bounded by `finalityDepth`
- packages/chain-adapters/src/logs.ts:179-185. Only the single stored `last.hash` is compared, and the rollback is `finalityDepth` blocks. A deeper reorg is not detected. This is a design limit, but audit row A-10 ("reorg-safe cursor") overstates it. Suggest wording in docs.

### I-09 (info): `buildPaymentRequest` ignores `quotedTokenAmount` for `fixed_token` silently
- packages/chain-adapters/src/adapter.ts:171-174. Passing a quote for a fixed invoice is silently discarded. Consider rejecting.

## Doc inaccuracies

- packages/chain-adapters/src/quote.ts:60 says `answer / 10^decimals` is per "1 base unit". The formula at quote.ts:138-140 (and worked example: 300 USD at answer 3000e8 gives 0.1 ETH) treats the answer as price per whole token. Fix the comment.
- docs/audits/01-completeness-audit.md A-10 "reorg-safe": see I-08.

## Test quality gaps

- adapter.test.ts:153-160 asserts result length only; does not assert `getLogs` call count (L-01 not caught).
- No adapter-level reorg test (M-01); logs.test.ts:241 covers only `fetchAnnouncements`.
- fees.test.ts:111-117: no boundary test at 33/34 units for `sponsorFee` (L-03).
- router.test.ts: no decode-side test for `value > maxBufferWei` (L-04).
- rpc.test.ts: `fetchTransport` assertions seen are the scheme rejection (rpc.test.ts:211). I did not read every case; no evidence of size-cap or timeout tests for the real transport was checked.
- core-crypto: no test asserts that derived `subarray` views of a `SecretBytes` remain redacted (L-06); expected to fail today.
- Positive: core-crypto has a 1000-payment differential test vs the SDK (DEVIATIONS), rejection-sampling tests (negative.test.ts:72), and a view-tag/ZERO_HASH mock test (hash-edge.test.ts). invoice-schema has tamper, AAD, UTF-8, JSON, base64 and size-boundary tests (envelope.test.ts:124-321, 362-383).

## Checked and found consistent (no finding)

- core-crypto: ADR-0001 hash path (secret.ts, stealth.ts:69-77, 111-127), `deriveStealthSecret` address round-trip (stealth.ts:196-215), metadata 57-byte layout and selector/token cross-checks (metadata.ts:95-115), `parseCompressedPoint` prefix and curve checks (secret.ts:119-127), strict hex and EIP-55 (hex.ts).
- invoice-schema: base64url non-canonical bit check (base64url.ts:211), strict JSON limits (json.ts:6-175), canonical-form equality before schema (envelope.ts:242), AAD = "GPI1"||chainId||signer on both sides (envelope.ts:112-116, 177, 276), signature low-s both ways (sign.ts:83, 105-108), decrypt-before-verify ordering with no oracle (envelope.ts:272-299).
- chain-adapters: routerFee/grossForNet/MAX_ROUTER_GROSS arithmetic (fees.ts:26-92), payer-pays rounding, metadata net equality in `assemble` (router.ts:308), ERC-20 vs native token branch (router.ts:309-311), reencode-based canonical check (router.ts:268), logs provider/content fault split (logs.ts:89-149), ERC-5564 topic0 (logs.ts:9).

## Could not verify

- Runtime behaviour of any claim (nothing executed). Specifically unverified: L-06 species leak, I-01 thrown error class, L-03 relayer minimum amount (only grepped apps/relayer/src/service.ts), M-01 exact call count needed to reach the second page under real providers.
- Contract-side rules beyond the lines cited (GhostPayRouter.sol:143 read; other `_validate` branches not re-read here).
- Whether test suites currently pass (audit doc 01 reports pass counts; not re-run here).
- Full test-file contents; coverage claims in audit doc 01 not re-checked.
