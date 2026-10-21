# Bug hunt: packages/btc-silent-payments, apps/relayer, apps/web

Scope: `packages/btc-silent-payments` (incl. `src/spend.ts`), `apps/relayer`, `apps/web`. Read-only pass. No source, test or config edited. Branch `claude/remote-extensions-1`, 2026-10-21.
Read first: `docs/SPEC_REVIEW.md`, `docs/CONTRACTS_SPEC.md` (sections on sweep), `docs/MULTICHAIN_SPEC.md`, `docs/APP_AND_RELAYER_SPEC.md`, `docs/FEE_SCHEDULE.md`, `packages/btc-silent-payments/DEVIATIONS.md`, `apps/relayer/DEVIATIONS.md`, `apps/web/DEVIATIONS.md`, `docs/audits/03-security-review-client-relayer.md`.
Known/accepted items not re-reported: relayer DEVIATIONS 7 (one in-flight tx), 9 (per-owner limit after sig), 12 (manifest keys); web DEVIATIONS 5 (manifest unsigned), 14 (RPC verification), 16 (fragment clear).

## Verification status

- Executed (only these):
  - `packages/btc-silent-payments`: `vitest run` = 18 files, 299 tests pass. `tsc -p tsconfig.json --noEmit` = exit 0.
  - `apps/relayer`: `vitest run --exclude src/e2e.anvil.test.ts` = 5 files, 192 tests pass.
  - Scratch probes (outside repo, in session scratchpad `probe/`): spend fee at low feerates, spend leftover with no change address, `buildBitcoinUri` lone surrogate, relayer breaker wedge through `src/harness.testutil.ts` (FakeChain, fake clock).
- Not run: `apps/web` unit tests fail at suite load (`Failed to resolve entry for package "@ghostpay/chain-adapters"`, workspace packages have no `dist/`; DEVIATIONS web item 2). Not built, to avoid writing `dist/`. Web findings below are code-read only. No e2e (playwright). No live RPC, oracle or relayer.

## Summary

| Severity | Count |
|---|---|
| critical | 0 |
| high | 1 |
| medium | 2 |
| low | 11 |
| info | 3 |

## Findings

### H1 (high). Relayer circuit breaker wedges in `half_open`; chain refuses all sweeps until restart
- Files: `apps/relayer/src/breaker.ts:41-48` (`allow()`), `:36-38` (`isBlocking()` returns false in half_open), `:51-59` and `:61-72` (`recordSuccess`/`recordFailure` only resolve half_open); `apps/relayer/src/service.ts:282` (`isBlocking` pre-check), `:319` (`if (!breaker.allow()) throw breaker_open`), `:332-335` (low-balance path), `:344-345` (SimulationRevert rethrown), `:350-352` (`budget_exhausted`), `:312` (`gas_price_too_high`).
- Mechanism: after cooldown, first caller of `allow()` moves state `open` to `half_open` and becomes the probe. The probe job only records an outcome through `op()` (RPC failures) or `settled` (receipt). Any probe that exits earlier (user-caused simulation revert, gas price over cap, daily budget exhausted, gas limit too high) records nothing. State stays `half_open` forever. Later `allow()` calls return false, so every sweep gets `503 breaker_open`. `isBlocking()` is false in `half_open`, so `/healthz` reports `status: ok`.
- Reproduced (probe, FakeChain harness): 3 RPC errors, breaker open. After +61 s, one sweep whose simulation reverts with `SimulationRevert('ERC20InsufficientBalance')` returned `422 simulation_reverted`. RPC restored, +3600 s: sweep returns `503 breaker_open`. `/healthz` returned `200 {"status":"ok", breaker "half_open"}`.
- Impact: availability DoS of a chain. Triggerable by any party who can sign a sweep (owner key, no balance needed): send one sweep that reverts in simulation at the moment the cooldown ends. Also triggerable by a transient gas spike or budget exhaustion during the probe. Only a relayer restart recovers.
- Suggested fix: record a breaker outcome on every probe exit (or in a `finally` in `runJob`: `success` for user-caused reverts, since they are not operational failures, and `failure` otherwise). Alternatively, in `allow()` let a `half_open` breaker re-admit a probe after another cooldown. Add a test: probe reverts with `SimulationRevert` then next request must not be `breaker_open`.

### M1 (medium). Relayed-sweep fee recipient is relayer-chosen, not the manifest `feeRecipient`; default is the hot key
- Files: `apps/relayer/src/config.ts:197` (`feeTo` defaults to `ctx.hotKeyAddress`), `:188-189` (only `sweepRelayer` is read from the manifest, `feeRecipient` is ignored), `apps/relayer/src/service.ts:229` (`sweep.feeTo` checked only against the relayer's own `cfg.feeTo`). Web: `apps/web/src/lib/sweep.ts:79-85` (checks fee cap, expiry, and that feeTo is not owner/destination), `:116` (`feeTo: i.quote.feeTo` is what the user signs), `apps/web/src/views/Sweep.tsx:152` (displays it). Manifest parser `packages/chain-adapters/src/deployments.ts:100-102,124` does carry `feeRecipient`.
- Spec: `docs/FEE_SCHEDULE.md` lines 10 and 41 say the fee recipient is the manifest's `feeRecipient`, shown from the manifest, and that the hot key should not be the recipient. `docs/APP_AND_RELAYER_SPEC.md:34` says relayer checks `sweep.feeTo == relayer feeTo`, which is a relayer-local value.
- Behaviour: fee for relayed sweeps goes to whatever address the relayer config holds. With no `feeTo` in config it is the hot key that also pays gas. The web client accepts any `feeTo` (with the fee at or under the 300 bps cap) and signs it. Nothing ties it to `manifest.feeRecipient`.
- Failing scenario: relayer config omits `feeTo`. Quote returns `feeTo = hot key`. Client signs the order with that `feeTo`, fee up to 3 %. Fee is paid to the hot key, not the manifest recipient, and the UI shows "to 0x…" with no warning.
- Suggested fix: (a) relayer startup refuses unless `feeTo` equals manifest `feeRecipient` when a manifest is loaded; no default to hot key. (b) web `getSweepQuote` rejects `quote.feeTo !== manifest.feeRecipient` (same as `checkDestination` does for destination).
- Not verified: whether a deployed relayer is configured with `feeTo` set. Config-only check.

### M2 (medium). Spend without change address silently burns leftover up to dust + fee; code contradicts DEVIATIONS
- File: `packages/btc-silent-payments/src/spend.ts:232-234`. Doc: `packages/btc-silent-payments/DEVIATIONS.md`, "Spending" section, fee-policy bullet: "a leftover larger than that [dust] without a change address is refused instead of burned."
- Code refuses only when `leftover > feeNoChange + dust`. Leftover in `(dust, feeNoChange + dust]` is accepted and becomes miner fee.
- Reproduced (probe): input 50 600 sat, one 50 000 sat destination, no `changeAddress`, feeRate 1. Result `ok`, `feeSats = 600`, `changeSats = 0`, `vsize = 99`. Needed fee about 99 sat. No error.
- Impact: bounded overpay (up to ~dust + fee, ~650 sat at 1 sat/vB), returned in `feeSats` only. Doc and behaviour disagree.
- Suggested fix: refuse when `leftover >= dust` and no change address (match the doc), or change the doc to state the threshold.

### L1 (low). Fee computed with `Math.round(feeRate*1000)` gives zero fee for feeRate < 0.0005 sat/vB
- File: `packages/btc-silent-payments/src/spend.ts:90-93` (`feeFor`). Doc says `fee = ceil(feerate * vsize)` (DEVIATIONS "Spending" bullet).
- Reproduced (probe): feeRate 0.0004, 0.0001, 1e-9 each return `feeSats = 0n`, tx built and signed. Such a tx will not relay.
- Fix: `ceil(feeRate * 1000)` in milli-units, or reject `feeRate < 0.001` with `INVALID_INPUT`.

### L2 (low). `buildBitcoinUri` throws `URIError`, not a `SilentPaymentError`
- File: `packages/btc-silent-payments/src/uri.ts:45-46` (`encodeURIComponent(p.label)`).
- Reproduced (probe): `label = '\uD800'` throws `URIError: URI malformed`. Callers that expect typed errors get an untyped exception.
- Fix: wrap in try/catch, return `fail('INVALID_URI')`.

### L3 (low). BlindBit client: no default timeout, unbounded body read before size checks
- File: `packages/btc-silent-payments/src/scan/blindbit.ts:106-122` (`get`): `transport(...)` is called with `signal` only when the caller passes one. `:118` `await res.json()` reads the whole body. Entry-count cap `MAX_ENTRIES` (`:167,184`) is applied only after parsing.
- Impact: a stalled oracle hangs `scanBlocks` forever if the caller passes no signal. A huge body is fully buffered first.
- Fix: default `AbortSignal.timeout(...)` in `get`, check `content-length` / stream with a byte cap.
- Not run (code read).

### L4 (low). `apps/web` relayer client reads the full body before the 16 KiB cap
- File: `apps/web/src/lib/relayerClient.ts:41-42` (`await res.text()` then `text.length > MAX_RESPONSE`). Memory is spent before the check. Timeout is 15 s (`:23`), so the bound is time-limited.
- Fix: check `content-length`, or read a stream with a byte cap.

### L5 (low). Prepared payment can be sent after invoice or quote expiry (up to 20 min later)
- Files: `apps/web/src/lib/payExec.ts:118-122` (`sendPayment` checks only `built.preview.deadline`, the router deadline, not `invoice.expiresAt` or `quote.expiresAt`). `apps/web/src/views/Pay.tsx:300-312` (`onSend` uses stale `built`/`ctx` from state; no `reviewInvoice` re-run). Expiry is re-checked only in `refreshContext` (`Pay.tsx:90-`) at the delay end or on continue.
- Impact: user can confirm and send after the invoice expired, if the user sits on the "prepared" screen. Business-logic issue, not fund loss.
- Fix: in `sendPayment`, re-run `reviewInvoice` and `checkExpiry(inv, now)` before `assertReadyToSend`.

### L6 (low). Relayer rate limiter: clock step and LRU eviction
- File: `apps/relayer/src/limiter.ts:126` (`tokens + (t - b.last) * ratePerMs` with `now = Date.now`; negative elapsed after a backwards clock step lowers `tokens`), `:26-33` (LRU eviction at `maxKeys`). An attacker with more than `maxKeys` distinct keys can evict a victim's bucket and reset it.
- Fix: use a monotonic clock for `now`; clamp `t - b.last` at 0.

### L7 (low). `scanClient.runScan` can hang on a worker `error` message mid-batch
- File: `apps/web/src/lib/scanClient.ts:71-75` (worker `error` is routed to `ready?.(m)`, the already-resolved start promise) and `:105-108` (batch waits only on `pending` or `onerror`). Current worker posts `error` only for start or `NOT_STARTED`, so this is latent.
- Fix: route `error` to `failed` or to the pending batch resolver.

### L8 (low). `scanClient.runScan` leaves viewing key unzeroized if `createWorker()` throws
- File: `apps/web/src/lib/scanClient.ts:67` (`createWorker()` before the `try` at `:91`), zeroize at `:140`. The caller (`views/Scan.tsx:66`) made a copy with `unsafeRevealSecret`.
- Fix: move `createWorker()` inside the `try`, or zeroize in a catch.

### L9 (low). Local tags: racy duplicate records and all-or-nothing list
- File: `apps/web/src/lib/tags.ts:147-158` (`save` reads `existing`, then `put`; two concurrent saves for one lookup create two `recordId`s), `:182-188` (`list` opens every record; one undecryptable record makes the whole list throw).
- Fix: serialize writes per vault (promise chain); make `list` skip-and-report bad records.

### L10 (low). `permitReader.nonce` throws `SyntaxError` on empty `eth_call` result
- File: `apps/web/src/lib/pay.ts:267` (regex accepts `0x`), `:280` (`BigInt(await call(token, data))`). `BigInt('0x')` throws, not a `UserFacingError`.
- Fix: require at least one hex byte, or catch and map to `UserFacingError`.

### L11 (low). Sweep view keeps balance and quote across selection change
- File: `apps/web/src/views/Sweep.tsx:19-20` (state), `:31-45` (effect sets `balance` only on success; no reset when `sel`/`tokenAddr` change). `quote` resets only when destination changes (`:133`).
- Impact: after switching the selected payment, a quote for the previous owner stays; submitting gives a relayer `invalid_quote` (400). Other amounts are bound by the relayer, so no fund loss found.
- Fix: reset `balance` and `quote` in the effect cleanup.

### I1 (info). `parseBitcoinUri` matches keys case-sensitively; unknown keys ignored
- File: `packages/btc-silent-payments/src/uri.ts:88-94`. `AMOUNT=` or `SP=` are silently ignored. Whether BIP-21/BIP-321 mandate case-insensitive keys was not checked against the spec text (not in repo).

### I2 (info). BlindBit `getOutputs` does not bound `amount` or `vout`
- File: `packages/btc-silent-payments/src/scan/blindbit.ts:190-191` (`uint` only: safe integer). `amountSats` may exceed `MAX_MONEY_SATS`; `vout` may exceed 2^32-1. Spend path re-checks (`spend.ts:111-114`), so impact is limited to scanner output (UI display).

### I3 (info). `txInputFromHex` does not validate `vout`
- File: `packages/btc-silent-payments/src/tx.ts:112-120`. Only `txid` is parsed. `serializeOutpoint` (`:34`) rejects bad `vout` later. Harmless.

## Checked, no bug found (short)
- `receiver.ts` scan loop, label handling (m=0 always), `consumed` set, K_MAX, tweak sign; `sender.ts` grouping and `k`; `inputs.ts` P2PKH/P2SH/P2TR extraction, annex and NUMS skip; `spendsFutureSegwit`; `bech32m.ts`/`address.ts` strict decode; `bip32.ts`; `units.ts`; `uri.ts` `req-`, duplicate-key, fragment rules.
- `spend.ts`: vsize estimate exact (`estimateKeyPathVsize`, cross-checked at `:304`); parity handling vs output key (`:255`); RBF sequence values.
- Relayer `validate.ts`, `codec.ts`, `quoteToken.ts` (HMAC over all bound fields, `timingSafeEqual`), `server.ts` body cap, origin check, headers; `lane.ts` serialization; `chain.ts` `waitForReceipt` never throws; `config.ts` address checksumming (token and sweepRelayer consistent with comparisons).
- Web `keystore.ts` (scrypt bounds, AAD binds meta, NFKC consistent), `session.ts`, `invoiceCreate.ts`, `format.ts` (bigint math, tax half-up), `jitter.ts` (rejection sampling, monotonic clock), `wallet.ts` (account and chain recheck, tx verification), `embed` script (same-origin https, no innerHTML).

## Not verified / open
- Web unit tests not run (unbuilt workspace packages). Web findings are code-read only.
- No e2e, no live RPC, oracle, relayer or wallet.
- M1 depends on deployed relayer config (not inspected).
- Probe files are in the session scratchpad only, not in the repo.
