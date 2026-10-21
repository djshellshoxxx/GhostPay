# Deep security audit: packages/chain-adapters

Branch `claude/remote-extensions-1`. Findings only; no fixes applied, no source/test/config edited, nothing committed.
All `file:line` refs are `packages/chain-adapters/src/<file>:<line>` as of this run.

## 0. Method and evidence

- Read every non-test source file (rpc, adapter, logs, fees, deployments, router, sweep, quote, errors, types, config/*, index; ABI files skimmed).
- Ran: `npx vitest run` in the package: 10 files, 216/216 pass (baseline only; the suite has no PoC for any finding below).
- Ran: `npm audit --omit=dev --workspace @ghostpay/chain-adapters`: 0 vulnerabilities (deps pinned exact: viem 2.57.7, @noble/curves 2.4.0, @noble/hashes 2.4.0).
- Ran PoCs (vitest, files in the session scratchpad only, `.../scratchpad/ca/poc.test.ts`, not in repo). Results are tagged `[PoC]` below.
- Cross-checked: `docs/threat-model/THREAT_MODEL.md`, `docs/audits/03` IDs (S3-01, S3-02, S3-14), `docs/remote/audits/{security,bugs,code}-tslibs.md` (unverified haiku reports; each claim I reuse is re-verified and tagged), `GhostPayRouter.sol` / `GhostPaySweepRelayer.sol` (ABI arg order of 4 router entry points matches; permit wrapped in try/catch at router and relayer, so permit front-running is not a DoS).
- Not run: real network, real chain, Foundry differential for fee math (DEVIATIONS 13), ABI regeneration (`gen-abi.sh`).

## 1. Threat model

Assets: (a) payer funds in flight (calldata correctness, router/token/amount, fee recipient disclosure); (b) stealth spending keys during sweep/permit signing (`SecretScalar` passed into `signSweep/signPermit/signDigest`); (c) viewing key during `scan`; (d) seller's belief about received payments (`DetectedPayment`); (e) user privacy (what the RPC provider/relayer learns); (f) availability of scanning/RPC under hostile input.

Trust boundaries: caller app (trusted code, untrusted data: invoice, manifest text, relayer quote) | RPC provider (untrusted for integrity, trusted-by-necessity today) | chain contents (any account can call the announcer; attacker-controlled bytes) | token contracts (allowlist only, `config/tokens.ts`) | deployment manifest (unauthenticated file) | Chainlink feeds read through the same RPC.

Adversaries: malicious/compromised RPC (forge/omit logs, lie on head, price, nonce, name/version, slow-loris, oversize); malicious relayer (fee/feeTo in quote); malicious invoice author (phishing meta-address, odd amounts); on-chain spammer (announcements); malicious dApp/wallet supplying `tx`+`preview`; supply-chain (deps, ABI gen); local operator misconfiguration (RPC URL).

## 2. Findings summary

| ID | Sev | Title |
|---|---|---|
| CA-01 | High | Manifest `signature` never verified; no on-chain read-back; everything keyed to manifest is circular (known S3-01) |
| CA-02 | Medium | `adapter.scan` ignores `reorg`, yields unfinalized hits with no finality marker |
| CA-03 | Medium | `adapter.scan` unbounded against hostile head; no overall deadline; abort not wired into transport |
| CA-04 | Medium | `assertPreviewMatchesCalldata` does not pin the target to the manifest router [PoC] |
| CA-05 | Medium | `DetectedPayment` is key-match only; no value/transfer verification (known S3-02) |
| CA-06 | Medium | `signSweep`/`signPermit` sign any typed data; no cap/spender/deadline guard in the package [PoC] |
| CA-07 | Medium | Price read: single-RPC `eth_call`, no L2 sequencer/deviation/min-max guard (latent: `FEEDS` empty) |
| CA-08 | Low | `retries: NaN` gives unbounded retry loop [PoC] |
| CA-09 | Low | `validateRpcUrl` accepts private/loopback/link-local hosts over https [PoC] |
| CA-10 | Low | `fetchTransport` leaks Referer/credentials context; no `referrerPolicy`/`credentials` |
| CA-11 | Low | `fiatToTokenAmount` does not validate `price.decimals`: non-ChainAdapterError, CPU/memory DoS [PoC] |
| CA-12 | Low | `signDigest` exported blind-signing oracle (reconfirms prior L-3) |
| CA-13 | Low | Manifest validator gaps: impossible dates accepted [PoC], no freshness, `flatFee` 0, role checks weaker than DEVIATIONS 8 claims |
| CA-14 | Low | Reorg/head validation weaknesses in `fetchAnnouncements` (null head ref, shallow-only rollback, no head monotonic check) |
| CA-15 | Low | `requestWithFallbackCheck` unwired and does not require independent endpoints; chain id verified once |
| CA-16 | Low | `buildPaymentTx` unbounded deadline when `now` omitted; decoder accepts `v` not in {27,28} and `minNet = 0` |
| CA-17 | Low | Scan metadata leakage to RPC and over-fetch past `toBlock` |
| CA-18 | Low | HTTP error response body not cancelled; byte cap check on `text.length` for injected transports |
| CA-19 | Info | `validateFlatSecurityFee` accepts non-checksummed token; `wss:` accepted but unusable; other notes |

Counts: High 1, Medium 6, Low 11, Info 1 (19 findings incl. one grouped Info).

## 3. Findings

### CA-01 (High) Manifest is the unauthenticated root of trust (known: S3-01)
- Evidence: `deployments.ts:20,36,116-117,134`: `signature` is only regex-checked (`/^0x[0-9a-fA-F]+$/`) and copied; grep over `src/` finds no verification, and no `eth_getCode`/`FEE_RECIPIENT()`/`ANNOUNCER()` read-back anywhere (`DEVIATIONS.md` item 2 admits this). `createEvmAdapter` (`adapter.ts:~140-150`) takes the manifest as given. `feeRecipient`, `router`, `announcer`, `sweepRelayer` therefore come from whatever text the host serves.
- Impact: a tampered manifest redirects payments to an attacker router/fee recipient; every "preview matches calldata" check is circular (CA-04).
- Reproduction: `loadDeployment(JSON.stringify({...manifestJson(), router: ATTACKER, signature: '0x00'}), chainId)` returns a valid manifest (see `fixtures.testutil.ts:manifestJson`).
- Suggested fix: verify detached signature against a pinned key and/or compile the manifest into the hashed bundle; add two-RPC read-back of `FEE_RECIPIENT()`, `FEE_BPS()`, `ANNOUNCER()` and code hash before enabling `buildPaymentRequest`.

### CA-02 (Medium) `scan` drops `reorg`, yields unfinalized logs
- Evidence: `adapter.ts:205-231`: result `res.reorg` is never read (grep `reorg` in `adapter.ts`: no match); `finalityDepth` is used only for rollback depth (`logs.ts:182`), not to hold back unfinalized blocks. `DetectedPayment` (`adapter.ts:84-91`) carries `blockNumber` via `announcement` but no confirmation/finality flag. On rollback the loop re-yields the same payments; payments from orphaned blocks are never retracted.
- Impact: seller may credit a payment that is later reorged out (double-count on re-yield, or phantom credit).
- Reproduction: not run (needs a scripted fork); by reading. Test idea: fake client that returns hash A then B for `last.number`, assert `scan` surfaces the rollback (it currently cannot).
- Suggested fix: yield only logs at depth `head - finalityDepth` (or tag with `confirmations`), and surface `reorg` events to the consumer.

### CA-03 (Medium) `scan` DoS: hostile head, no deadline, no abort in I/O
- Evidence: `logs.ts:187-198` trusts `blockNumber()`; `adapter.ts:205-229` loops `for(;;)` while `res.truncated`. [PoC P6] fake client returning `blockNumber = 2^200` caused 1017 `getLogs` calls in 1.5 s and the iterator never terminated until `signal.abort()` (a synchronously-resolving client also starves the event loop entirely: the first run hung the vitest worker). `signal` is only polled between requests (`adapter.ts:207,210`), never passed to the transport (`rpc.ts:101-107`). Worst-case latency per `fetchAnnouncements` = 50 requests x (1+retries<=5 -> 6 attempts) x 10 s timeout = 50 min.
- Also: `toBlock` is applied after fetching (`adapter.ts:212,229`): `fetchAnnouncements` has no upper bound (`logs.ts:33-47`) so scans past `toBlock` up to head (wasted RPC load, and 1 extra batch).
- Suggested fix: sanity-bound head (monotonic vs `cursor.last`, plausible vs time/blockTime), add total deadline/request budget in `scan`, pass `AbortSignal` into `RpcTransport.send`, add `toBlock` option to `fetchAnnouncements`.

### CA-04 (Medium) Preview check does not bind to the manifest router [PoC]
- Evidence: `router.ts:366-380` + `226-229`: router is taken from `tx.to` and compared with `preview.router`, both supplied by the caller; no `deployment` parameter. [PoC P3] `assertPreviewMatchesCalldata({...preview, router: ATTACKER}, {...tx, to: ATTACKER}, 11155111)` passes ("attacker router accepted").
- Impact: the function name suggests a safety gate but only proves self-consistency. A malicious dApp/wallet path supplying both objects defeats it. apps/web calls it at `apps/web/src/lib/pay.ts:219` with `built.preview`/`built.tx` produced locally, so exposure depends on callers; the exported API invites misuse.
- Suggested fix: require `expectedRouter` (from verified manifest) and optionally token allowlist as parameters; fail `PREVIEW_MISMATCH` otherwise.

### CA-05 (Medium) Detection is key-match only (known S3-02)
- Evidence: `adapter.ts:213-228`: `checkAnnouncement` match then yield; `viaRouter` is a hint (`a.caller == router`), nothing verifies the token transfer or balance. A malicious RPC can fabricate a valid-looking announcement (the recipient public keys are public; only the emitter address and shape are checked, `logs.ts:97-103`), and any account can announce directly to the announcer with chosen metadata (`metadata` field is parsed with `parseMetadata` and exposed as amount/token).
- Impact: forged "payments" of any amount/token if the UI trusts `metadata`.
- Suggested fix: require `viaRouter` for amount display, and verify on-chain transfer/balance (two RPCs) before crediting; document `metadata` as untrusted when `viaRouter == false`.

### CA-06 (Medium) Signing primitives sign arbitrary typed data [PoC]
- Evidence: `sweep.ts:212-217` signs any `SweepTypedData` (only owner==key check); `buildSweepTypedData` (`sweep.ts:79-106`) enforces `amount > fee` but no fee cap, no `now`/deadline sanity, no manifest binding of `verifyingContract`/`chainId`. `buildPermitTypedData` (`259-287`): any non-zero spender, `value` up to 2^256-1, any deadline; `DOMAIN_SEPARATOR` check is opt-in (`280`). [PoC P4] signed: sweep with `fee = 999_999 of 1_000_000`, `deadline = 2^256-1`; permit with `value = deadline = MAX_UINT256` to arbitrary spender. The fee cap exists only as separate `assertSponsorFeeAcceptable` (`fees.ts`), which the app calls (`apps/web/src/lib/sweep.ts:79`) but the package does not enforce at sign time.
- Impact: latent. Current app passes safe values; any future caller handling relayer data gets a stealth-key signature on unbounded authority. Far-future deadlines make a signed order valid forever (nonces are an unordered bitmap with no on-chain cancel in `GhostPaySweepRelayer.sol`: functions are `sweep`, `sweepWithPermit`, `nonceUsed`, `DOMAIN_SEPARATOR` only).
- Suggested fix: bind signing to manifest (`relayer`, chain), cap fee via `sponsorFee` bounds inside `buildSweepTypedData`, require `deadline <= now + max`, require spender allowlist and `value <= amount` in permit builder; make `domainSeparator` reader mandatory.

### CA-07 (Medium, latent) Price reads trust a single RPC with no extra guards
- Evidence: `quote.ts:150-170` (`createAggregatorReader`): `eth_call` at `'latest'` through one client; `readPrice` (`83-110`) checks staleness/round but no aggregator min/max answer bounds, no cross-provider agreement (`requestWithFallbackCheck` unused), no L2 sequencer-uptime check (Base/OP/Arbitrum are configured chains, `config/chains.ts`). `FEEDS` is empty (`quote.ts:36`), so impact is latent; `fiatToTokenAmount` also does not tie the feed's base asset to the token (caller-supplied `priceQuoteCurrency` only, `quote.ts:123-137`).
- Impact: a hostile RPC can set `answer` and `updatedAt=now`; payer overpays / seller underpriced.
- Suggested fix: two-endpoint agreement, sequencer feed on L2, min/max deviation guard, feed registry keyed by (chain, base, quote) validated against token symbol.

### CA-08 (Low) `retries: NaN` is an unbounded retry loop [PoC]
- Evidence: `rpc.ts:210` `Math.min(Math.max(NaN ?? 2, 0), 5)` = NaN; `rpc.ts:225` `attempt >= NaN` never true. [PoC P1] transport rejecting with a generic error: 501 attempts observed (harness stopped it). Reconfirms prior bugs-tslibs claim.
- Suggested fix: `Number.isInteger` check, default on non-finite.

### CA-09 (Low) RPC URL validation does not stop private-network targets [PoC]
- Evidence: `rpc.ts:75-90`. [PoC P2] accepted: `https://169.254.169.254/latest`, `https://localhost:8545`, `https://10.0.0.5`, `https://[::1]/`; also `...?key=SECRET#` (empty fragment is `''`). `LOCAL_HOSTS` restriction applies only to plain http. Relayer config (`apps/relayer/src/config.ts:207`) and web settings (`apps/web/src/lib/settings.ts:33`) route through it.
- Impact: SSRF-class if a server component ever takes the URL from untrusted input (relayer: operator-controlled, so low). DNS rebinding not addressed.
- Suggested fix: add `allowPrivateHosts` opt-in, resolve-and-check on server side.

### CA-10 (Low, privacy) Fetch request context not minimised
- Evidence: `rpc.ts:101-107`: no `referrerPolicy: 'no-referrer'`, `credentials: 'omit'`, `cache: 'no-store'`. In browsers the provider can receive the app origin as Referer; `content-type: application/json` forces preflight (fine). Positive: `redirect: 'error'` (`:106`) and no URL echo in errors.
- Suggested fix: set the three options.

### CA-11 (Low) `fiatToTokenAmount` unvalidated `price.decimals` [PoC]
- Evidence: `quote.ts:138` `10n ** BigInt(p.price.decimals)`; only `fiatDecimals`/`tokenDecimals` are bounded (`quote.ts:133-135` region). [PoC P5] `decimals: -1` throws plain `RangeError` (not `ChainAdapterError`); `decimals: 300000` computes for ~233 ms before failing with overflow; larger values scale CPU/memory. `Price` normally comes from `readPrice` (decimals<=30) so exposure is for direct callers (the type is `Pick<Price,...>`).
- Suggested fix: bound `price.decimals` 0..30 inside the function.

### CA-12 (Low) `signDigest` is a public blind-signing oracle
- Evidence: `sweep.ts:192-202`, re-exported via `index.ts:` `export * from './sweep.js'`; `apps/web/src/lib/sweep.ts` uses it for tx hashes. Reconfirms security-tslibs L-3. Self-recovery check (`:199-200`) is good; RFC6979 with no extra entropy (no fault-injection hardening; Info).
- Suggested fix: keep internal; export typed wrappers only.

### CA-13 (Low) Manifest validator gaps
- Dates: `deployments.ts:71-73` `Date.parse` accepts `2026-02-30` / `2026-02-31` (verified in node: returns a timestamp), contradicting DEVIATIONS 8 ("invalid calendar dates"). No freshness/expiry on `date`.
- `UINT_DECIMAL` accepts `"0"` so `policy.flatFee = 0n` is valid (`deployments.ts`), while `validateFlatSecurityFee` rejects 0.
- Role checks: `deployments.ts:102` only rejects feeRecipient == router/relayer (not announcer, not "must not be a contract" as DEVIATIONS 8 states; contract-ness is not checkable offline).
- `solcVersion`, `commit` format only; `chainId` must equal expected but enablement is not checked in `loadDeployment` (enforced later by `requireEnabledChain`).
- Positives: unknown keys, prototype, zero hashes/addresses, checksum, 16 KiB cap (`loadDeployment`) are enforced.

### CA-14 (Low) Reorg/head handling in `fetchAnnouncements`
- Evidence: `logs.ts:179-185` compares one stored hash and rolls back `finalityDepth` blocks only; deeper reorgs are not detected. `:233` skips the head cross-check when `getBlock(head)` returned `null` (`headRef !== null`). Intermediate-block `blockHash` values in `log.blockHash` are never verified against `getBlock` (only the last block), so a provider can attach arbitrary hashes to older logs; `id = blockHash:logIndex` dedupe relies on them (`logs.ts:147`). Head is not checked against previous `last.number` (provider can move head backwards; produces `processed=false` silently).
- Suggested fix: reject head < `last.number - finalityDepth`, hard-fail on null head ref, verify block hash for each window end, document the depth limit.

### CA-15 (Low) Provider-diversity helpers not enforced
- Evidence: `rpc.ts:320-330` `requestWithFallbackCheck` has no runtime caller (grep in `apps/` finds none) and does not check that the two clients use distinct endpoints/operators; `createClient` verifies `eth_chainId` only once (`rpc.ts:260`), a later-malicious provider is not re-checked. Matches THREAT_MODEL line 165 (S3-14).
- Suggested fix: wire into scan/price/read-back; add endpoint-distinctness check.

### CA-16 (Low) Builder/decoder edge cases
- `router.ts:126-127`: when `now` is omitted there is no deadline check at all and any deadline up to 2^256-1 is accepted (long-lived stuck-mempool tx); `adapter.ts` `BuildOptions.now` is optional.
- `router.ts:243-249`: decode accepts any `uint8 v` for permit (reconfirms I-4: token will reject, no fund risk); `router.ts:291` allows `minNet = 0` in decode while the builder requires `>= 1` (`router.ts:131`), so the checker is weaker than the builder.
- `adapter.ts:173`: `quotedTokenAmount` has no freshness/expiry binding and is silently ignored for `fixed_token` invoices.

### CA-17 (Low, privacy) Scanner metadata
- Evidence: `logs.ts:207` `eth_getLogs` filter is generic (announcer + scheme topic, no recipient data): good. The provider still learns client IP, scan start block (`range.fromBlock`, wallet birthday), cadence, and adapter `getBlock(last.number)` on resume; sweep-side balance/nonce reads add address linkage (D8 in THREAT_MODEL). No Tor/proxy hook in `RpcTransport` beyond injection. Over-fetch past `toBlock` (CA-03) widens the footprint.

### CA-18 (Low) Transport hygiene
- `rpc.ts:108` throws on `!res.ok` without cancelling `res.body` (connection held until GC; repeated 5xx retries up to 6x per call). `rpc.ts:222` compares `text.length` (UTF-16 units) with a byte cap, only relevant to injected transports that do not enforce bytes (default transport enforces bytes at `:117`). Prior reports claimed the same; both verified by reading.

### CA-19 (Info)
- `fees.ts:190` `validateFlatSecurityFee` regex accepts non-checksummed token (no EIP-55 check).
- `rpc.ts:85` accepts `wss:` but `fetchTransport` rejects non-http(s) (`:95`): no websocket transport exists, so wss URLs always fail at first request.
- `sponsorFee`/`assertSponsorFeeAcceptable` do not bound `amount` by `MAX_UINT256/300`; the Solidity side may revert where the client succeeds (untested, unverified).
- Positive controls verified: fixed-form error messages (`errors.ts`), no URL/secret echo, `redirect:'error'`, streamed byte cap, strict hex quantity regexes, id match, no batch responses, canonical re-encode check in calldata decode, cross-check of viem vs manual EIP-712 digest, self-recovery after signing, hostile-log split (provider fault throws; content fault skips), fee math exact bigint with floor parity, `grossForNet` loops bounded (<= few iterations by construction).

## 4. Status of prior (unverified haiku) claims touching this package

- VERIFIED: NaN retries (CA-08); `scan` ignores reorg (CA-02); permit builder spender/value/deadline unguarded (CA-06); `signDigest` exported (CA-12); `DOMAIN_SEPARATOR` check optional (CA-06); date validation weaker than documented (CA-13); `requestWithFallbackCheck` unused (CA-15); `text.length` vs bytes (CA-18); HTTP error body not drained (CA-18); `v` unvalidated on decode (CA-16).
- Line numbers in older reports no longer match the current files (e.g. `rpc.ts:210` and `logs.ts:226-237` match, others shifted); re-anchored above.
- NOT reproduced (no PoC run): payer-pays rounding bug claim at `fees.ts:86-91` in bugs-tslibs (current `grossForNet` at `fees.ts:~326-336` has the clamp loops after the range check; covered by existing property tests that pass; I did not re-derive an overshoot).

## 5. Could not verify
Token addresses and chain parameters (TODO-VERIFY.md), ABI generation by `gen-abi.sh`, router fee parity by EVM execution, behavior against real providers, browser `fetch` Referer behaviour (reasoned from spec, not run).
