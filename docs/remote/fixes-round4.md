# Round 4: verify and fix haiku-audit findings (relayer, web, chain-adapters, btc-silent-payments)

Branch `claude/remote-extensions-4`. Source audits: `docs/remote/audits/{code,security,bugs}-{btcapps,tslibs}.md` (static reads). Method: failing test first, then fix. For fixed items the new tests were confirmed to fail without the fix (subagent stash/revert runs). Not run: `apps/relayer/src/e2e.anvil.test.ts`, web Playwright e2e, any live RPC/oracle.

## Final runs (coordinator, real)

| Package | Before | After | tsc/lint | Coverage after (stmts/br/funcs/lines) |
|---|---|---|---|---|
| apps/relayer | 192 | 209 | clean | 98.41 stmts, 98.97 lines (full table in agent run) |
| apps/web | 316 | 331 | clean | 95.48 / 91.24 / 92.42 / 97.38 (was 95.69 / 91.51 / 92.71 / 97.47) |
| packages/chain-adapters | 216 | 241 | clean | 98.58 / 97.93 / 96 / 99.7 |
| packages/btc-silent-payments | 299 | 313 | clean | 97.44 / 95.65 / 96.45 / 99.44 |

No coverage threshold lowered. Web and btc coverage dipped slightly (more code, thresholds still met). Existing tests changed because behaviour changed: `rpc.test.ts` (wss now rejected), `settings.test.ts` (same), relayer `api.test.ts` shutdown test (quote refused after shutdown), `relayer.config.example.json` (`feeTo` removed).

## Findings

| ID | Finding | Status | Test(s) |
|---|---|---|---|
| W1 | Web sweep POST lacks `chainId`; relayer 400 | VERIFIED, FIXED | `apps/web/src/lib/relayerContract.test.ts` (web body into relayer `parseSweepRequest`; failed before), `sweep.test.ts`, `relayerClient.test.ts` |
| R1 | Breaker latches in `half_open` | VERIFIED, FIXED (`releaseProbe`; health `degraded`) | `apps/relayer/src/hardening.test.ts` R1 group |
| R2/W2 | feeTo not pinned to manifest `feeRecipient` | FIXED both sides (relayer startup + default; web `getSweepQuote`) | `hardening.test.ts`, `config.test.ts`, `sweep.test.ts` |
| R3 | Lane DoS | VERIFIED, FIXED (pre-lane balance/allowance check, 2 eth_calls/request) | `hardening.test.ts`, `chain.test.ts` getSweepFunding |
| R4 | Limiter clock step | VERIFIED, FIXED | `hardening.test.ts` |
| R5 | `quote()` no shutdown check | VERIFIED, FIXED | `hardening.test.ts` |
| R6 | Gas staleness at send time | VERIFIED, NOT FIXED (documented, DEVIATIONS 17-20) | characterization test |
| W3 | scanClient mid-batch worker error hang; key not zeroized if createWorker throws | VERIFIED, FIXED | 2 tests in `scanClient.test.ts` |
| W4 | sendPayment ignores invoice/quote expiry | FIXED | `payExec.test.ts` |
| W5 | relayerClient reads full body before cap | FIXED | `relayerClient.test.ts` |
| W6 | tags save race | VERIFIED, FIXED | `tags.test.ts` concurrency |
| W6 | tags `list` all-or-nothing | VERIFIED, NOT FIXED: existing test asserts throw; changing needs a design decision |
| W6 | permitReader `0x` nonce SyntaxError | FIXED | `pay.test.ts` |
| W6 | session.ts un-zeroized on throw | FIXED | `sessionZeroize.test.ts` |
| W6 | Sweep.tsx stale balance/quote | FIXED by reading; no UI test |  |
| W6 | Pay delay minutes label | FIXED | `format.test.ts` (`minutesLabel`) |
| C1 | scan ignores `toBlock` | FIXED | `audit-fixes.test.ts` |
| C2 | Reorg inside truncated scan (BUG-01) | FIXED (window boundary hashes) | "reorg of window 1/2" |
| C2 | Cross-call reorg (M-01) | FIXED fail-closed (scan throws "reorganised"), results not retracted | "throws when page 2 finds page 1 was reorged" |
| C3 | wss accepted by validateRpcUrl, rejected by transport | FIXED (reject wss/ws; web settings aligned) | `rpc.test.ts`, `settings.test.ts` |
| C4 | NaN/non-finite retries/timeouts | FIXED | `it.each` cases |
| C5 | Impossible dates, duplicate manifest keys | FIXED | `deployments` tests in `audit-fixes.test.ts` |
| C6 | grossForNet top of range | FIXED | `audit-fixes.test.ts` |
| C7 | Non-2xx body not cancelled | FIXED | `audit-fixes.test.ts` |
| C8 | Sponsor fee 0 for small amounts | REJECTED: documented round-down of 300 bps cap; boundary test pins it |  |
| C9 | Permit deadline unchecked | PARTLY FIXED (reject deadline 0; future check when `now` passed). `signDigest` export VERIFIED, NOT FIXED (web uses it) |  |
| B1 | Scanner byKey misattribution | FIXED (all outputs per key kept with own outpoint/amount) | `btc .../audit-fixes.test.ts` |
| B2 | feeFor zero fee | FIXED (reject) | same |
| B3 | Leftover burn without change | REJECTED: code matches DEVIATIONS wording; boundary test pins it |  |
| B4 | BlindBit timeout/size/http/bounds | FIXED (30 s race timeout, 32 MiB stream cap, https unless loopback, vout/amount bounds). Timeout is `Promise.race`, request not aborted | same |
| B5 | `buildBitcoinUri` URIError | FIXED (`INVALID_URI`) | same |
| B6 | Weak fee guard | VERIFIED, NOT FIXED (tightening blocks legit small sweeps); pinned by test |  |
| B7 | `SecretBytes` species leak | VERIFIED, NOT FIXED | — |

## Unverified / left open

- Relayer R6, web tags `list`, `signDigest` export, B6, B7 as above.
- Not owned (core-crypto / invoice-schema / contracts): BUG-03 date check is in chain-adapters (fixed); BUG-06 sparse lineItems, S3-12 bidi, M-1 unpinned payee, L-4 rng params: not touched.
- Oracle metadata trust (security-btcapps M3): B1 removes ambiguity but outputs are still oracle-supplied.
- `getSweepFunding` pre-lane check and e2e anvil test not exercised against a real chain.

## Round 4b (second batch, from round-1 audits and assurance reports)

Per-area detail with test names: `fixes-round4-relayer.md`, `fixes-round4-web.md`, `fixes-round4-webkeys.md`, `fixes-round4-adapters.md`. Each fixed item had a test that failed first (agent-reported; relayer: 22 of its 28 first-written tests failed on unfixed code). Real runs by the coordinator on the final tree:

| Package | Tests (round 4 -> 4b) | Coverage stmts/br/funcs/lines | tsc/lint |
|---|---|---|---|
| apps/relayer (anvil e2e not run) | 209 -> 239 | 98.35 / 96.13 / 99.39 / 98.94 | clean |
| apps/web | 331 -> 373 | 95.60 / 91.14 / 92.78 / 97.50 | clean |
| packages/chain-adapters | 243 -> 274 | 98.85 / 98.31 / 96.61 / 99.73 | clean |
| packages/btc-silent-payments | 313 -> 346 | 97.58 / 96.33 / 96.62 / 99.47 | clean |

Web branch coverage is 0.10 below the previous baseline; no threshold was changed and vitest reports no threshold failure.

Fixed: relayer breaker counts gas-price/quote/funding RPC failures (healthz degraded); front-run re-simulation; XFF rightmost-trusted parsing and `trustProxyHops` config check; per-client queue cap; budget reconcile after receipt timeout; `fee_below_gas` send-time check (R6 now implemented, characterization test changed 200 -> 422); high-S/bad-v rejected; log failures non-fatal; socket timeouts. Web: scan worker timeout and working cancel; reorg surfaced; `ScanMatch.chainId`; token allowlist on both sweep paths; `signTransactionHash` replaces exported `signDigest`; bidi marking; linear URL trimming; linear bundle-scan tokenizer; wipe-keys locks tag vault; keystore import allowlist and scrypt bounds; `listReport()` for damaged tag records. Chain-adapters/btc: hostile head checks, opt-in `historySize`, `verifyLogBlocks`, `verifyDeploymentOnChain`, optional signature hook, scanner `crossCheck`/`verifyOutput`, bounds.

Behaviour changes to note: tests edited openly: R6 characterization (200 -> 422), one `session.test` fixture (malformed meta now rejected), SellerKeys label 10 -> 12, config literals gained `maxPerClient`.

Not done / open: wiring `packages/secret-box` into web (needs `@ghostpay/secret-box` dependency in apps/web, `build:libs` change, a lockfile entry, and a product decision on idle auto-lock); manifest signature trust root; reorgs deeper than `finalityDepth` in the web scanner; BlindBit timeout does not abort the request; per-IP connection cap and IPv6 /64 bucketing; web handling of the relayer's `fee_below_gas` (no web code references it, so users see a generic error); `normalize-sbom.mjs` SBOM fix (outside my directories); donation feature (waiting for `packages/donation`). Not run: relayer anvil e2e, web Playwright e2e on this batch.
