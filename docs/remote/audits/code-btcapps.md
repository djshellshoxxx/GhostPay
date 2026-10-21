# code-btcapps (haiku, static read, unverified)

Audit done, read-only; nothing run (no tests, no builds). I did not write `docs/remote/audits/code-btcapps.md` because the agent instructions bar report .md files, so the full findings are below.

**Counts:** High 2, Medium 1, Low 8, Info 5.

**Top 3**
1. **High, wire mismatch breaks every relayed sweep.** `apps/web/src/lib/sweep.ts:133-141` and `relayerClient.ts:104` post `{sweep, sweepSig, permit, quoteToken}` with no top-level `chainId`. `apps/relayer/src/validate.ts:76` requires `chainId`, so the relayer returns 400 `invalid_request`. Tests miss it: `sweep.test.ts:115` and `relayerClient.test.ts:50-59` use fake fetch and assert the chainId-less body. Fix: add `chainId` to `SweepSubmission` and the POST, and add a cross-app contract test.
2. **High, relayer breaker latches in half_open (known S3-05, re-verified, now user-triggerable).** `service.ts:319` `allow()` returns false in half_open. The probe exits without recording an outcome at `:332` (gasPrice throw), `:344` (simulation revert), `:347` and `:350`. `health()` at `:177` still reports ok. An owner-signed sweep that reverts in simulation, sent as the probe after cooldown, leaves every sweep 503 until restart. Fix: record a result on every probe exit (or release the probe), and report half_open as degraded. `api.test.ts:427-448` covers only success and failed-probe paths.
3. **Medium, block scanner misattributes outputs.** `scan/scanner.ts:62,67`: `byKey` is keyed only by x-only key, last write wins, and txid/vout/amount come from whichever block output shares the key. Another tx in the block paying the same key can supply the wrong outpoint and amount; the sweep then signs the wrong amount and fails to broadcast. Likely a targeted DoS, not direct fund loss (my analysis, not exercised). Fix: bind tweak to tx, or reject ambiguous keys and verify amounts via RPC.

**Low**
- `btc-silent-payments/src/spend.ts:90-93`: `feeFor` rounds `feeRate*1000`, so feeRate below 0.0005 gives fee 0 and a success result.
- `spend.ts:237`: arbitrary `fee*2n > total && fee > 10000n` guard.
- `scan/blindbit.ts:106-118`: no default timeout and unbounded `res.json()`; `MAX_ENTRIES` is checked only after parsing. `getOutputs` does not bound `vout` to u32.
- `web/src/lib/scanClient.ts:74`: a worker `error` reply during a batch is routed to the start resolver and dropped, so the batch can hang. Currently theoretical.
- `web/src/views/Pay.tsx:451`: `Math.round(delayMinSec/60)` shows "0" minutes for sub-30 s values and "1 to 1" for narrow ranges.
- `web/src/lib/session.ts:156`: `keySetFromScalars` throw path leaves copies un-zeroized.
- `btc-silent-payments/src/ecc.ts:23`: `scalarOf` is exported and unused.
- `relayer/src/service.ts:188` (`quote`): no shutdown check. `sweep()` checks it at `:~272`.

**Info**
- `relayer/src/limiter.ts:125`: `Date.now` can step backwards.
- `relayer/src/runtime.ts:55`: the `createClient` result is discarded, so the RPC chain id is not checked per call (known S3-14).
- `web/src/lib/payExec.ts` `ensureAllowance`: approve from non-zero to non-zero is not handled (USDT-style tokens; no mainnet tokens allowlisted).
- Test gaps: no cross-app relayer contract test, no duplicate-x-only block test, no sub-0.0005 feeRate test, no half-open user-revert probe test.
- Web DEVIATIONS item 9 is stale relative to the relayer README, which documents `chainId`.

**Not verified:** web views, `wallet.ts`, `keystore.ts` and `tags.ts` (rely on audit 03), BIP-352 vectors, Playwright e2e, and any live oracle or RPC. The fee and tax rounding results come from reading the arithmetic.
