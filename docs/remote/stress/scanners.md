# Stress: btc-silent-payments scanner/spend, chain-adapters scan

Scope: `packages/btc-silent-payments` (`scan/scanner.ts`, `scan/blindbit.ts`, `receiver.ts`, `spend.ts`, `sender.ts`) and `packages/chain-adapters/src/logs.ts` (`fetchAnnouncements`, `validateAnnouncementLog`). No source/test/config edited. Harness lives outside the repo in `/tmp/claude-0/stress/` (vitest + fast-check 4.10.2, already a devDependency of both packages; `node_modules` symlinked to repo root).

Environment caveat: 4 vCPU, 16 GB, shared with other agents; `uptime` load average 8-9 during runs. ALL timings are inflated (rough factor 2) and are for relative scaling, not absolute budgets. Memory numbers are `process.memoryUsage().heapUsed`.

## Commands

```
cd /tmp/claude-0/stress           # config: vitest.config.ts (aliases @ghostpay/core-crypto, invoice-schema -> src)
V=/home/user/ghostpay/node_modules/.bin/vitest
$V run btc-scan.stress.ts   --reporter=verbose   # 10m42s; results appended to btc-scan.log
$V run btc-spend.stress.ts  --reporter=verbose   # 7m44s;  btc-spend.log
$V run btc-spend-prop.stress.ts -t property      # fast-check spend property, 150 runs, seed 99; btc-spend-prop.log
$V run btc-spend-reg.stress.ts -t "regular destinations"
$V run btc-spend-prof.stress.ts                  # raw @scure/btc-signer preimageWitnessV1 scaling; btc-spend-prof.log
$V run chain-scan.stress.ts --reporter=verbose   # ~20s, 20 tests; chain-scan.log
```
Files: `/tmp/claude-0/stress/{btc-scan,btc-spend,btc-spend-prop,btc-spend-reg,btc-spend-prof,chain-scan}.stress.ts` plus `*.log`/`*.out`. (Other agents also use that directory; mine are prefixed `btc-`/`chain-`.)

Results: all property/fuzz invariants held (see "Passed"); one assertion failed on purpose (S-1). Everything below was run unless marked UNVERIFIED.

## Findings

### S-1 MEDIUM: duplicate x-only key in one block lets a later output overwrite txid/vout/amount of the victim's real output
Evidence: `scan/scanner.ts:61-67`: `byKey.set(toHex(o.xOnlyPublicKey), o)` last write wins; `meta` is looked up by x-only key only. An attacker who sees a pending/confirmed payment can emit an output with the SAME x-only key (copying a public output key is trivial) in a later transaction of the same block; the receiver then reports the attacker's `txid`, `vout`, `amountSats` for the genuine output.
Repro (`btc-scan.stress.ts`, test "FINDING? duplicate x-only key"): block with victim tx paying `addr`; `outputs=[real, {same xOnlyPublicKey, txid: fakeTxid('attacker'), vout: 7, amountSats: 1n}]`. Result: `found=1`, `txid != real.txid`, `amount 1n`, `vout 7`. The test fails by design (`expect(r[0].txid).toBe(real.txid)`).
Impact: wallet balance understated / wrong outpoint recorded; `buildSpendTransaction` would reference the attacker txid:vout with the real key (funds are genuinely spendable via the real outpoint but the wallet does not know it; the copy is also spendable by the same key, so the attacker donates dust, but visibility of the real amount is lost until rescan; with oracle-side ordering the oracle can choose the order). No fund loss shown.
Fix: key `byKey` by key -> list of outputs and yield every (txid, vout), or reject/flag duplicates (`REORG_DETECTED`-style fail closed); `consumed` set in `receiver.ts` already dedups by key so the scanner must emit all matches itself.

### S-2 MEDIUM (perf/DoS): scan cost grows linearly with label count, ~1.5 s per tweak at 10,000 labels
Evidence: `receiver.ts:156` loops `labels.entries` (point add + affine `xOnly` + hex per label) for every k that did not match the unlabeled key. Measured, 200 no-match tweaks, `scanTweakAgainstSet`:

| labels | ms per tweak |
|---|---|
| 1 | 6.1 |
| 100 | 19.6 |
| 1000 | 144.7 |
| 10000 | 1466.9 |

A mainnet block with ~3000 eligible tweaks at 1000 labels = ~7 min of synchronous CPU per block (inflated x2 by load). `scanBlocks` is an async generator but the inner loop is synchronous, so it blocks the event loop for that long (no yield between tweaks).
Repro: `btc-scan.stress.ts` "label table size N". Fix: invert the lookup: for each candidate output `O` compute `O - P_k` and look it up in a `Map` of label points (O(candidates) not O(labels)); also yield to the event loop every N tweaks.

### S-3 MEDIUM (perf/DoS): `buildSpendTransaction` is super-quadratic in input count; `MAX_INPUTS = 5000` is not practically usable and exceeds standard tx size
Evidence (all-P2TR sweep, build time incl. signing and `verifyKeyPathSpend`):

| inputs | build ms | vsize |
|---|---|---|
| 1 | 42 | 99 |
| 100 | 2790 | 5792 |
| 250 | 6905 | 14417 |
| 500 | 18444 | 28794 |
| 1000 | 68579 | 57544 |
| 2000 | 233387 | 115044 |
| 2500 | 345328 | 143794 |

Root cause isolated to dependency: raw `@scure/btc-signer` 2.4.1 `Transaction.preimageWitnessV1(i, scripts, 0, amounts)` x n with no GhostPay code: 100: 242 ms, 200: 654, 400: 2624, 800: 14149 (x5.4 per doubling). `spend.ts:297` (sign) and `spend.ts:144` (`verifyKeyPathSpend`) each call it once per input, so cost is paid twice. Extrapolated 5000 inputs: tens of minutes (UNVERIFIED, not run). Synchronous: freezes the thread.
Also: 2000 inputs give vsize 115,044 and 2500 give 143,794, above Bitcoin Core's 100,000 vB standard-tx limit (`MAX_STANDARD_TX_WEIGHT` 400,000 WU); `estimateKeyPathVsize` is exact but no weight cap is enforced (`spend.ts:70`, `:176`). Such a tx would be non-relayable.
Repro: `btc-spend.stress.ts` "sweep N inputs"; `btc-spend-prof.stress.ts`. Fix: cap inputs by weight (about 1500 P2TR inputs) rather than 5000; compute BIP-341 shared sighash components (sha_prevouts/amounts/scriptpubkeys/sequences/outputs) once, or sign in chunks/off the main thread.

### S-4 MEDIUM: malicious oracle can freeze the caller for ~30 s with one `/tweaks` response; no response-size cap in BlindBitClient
Evidence: `blindbit.ts:167-176` accepts up to `MAX_ENTRIES = 200_000` entries, each validated with `parseCompressedPoint` (curve decompression) synchronously. Measured (`btc-scan.stress.ts` "200000 entries"): 200,000 valid points = 33.2 s, heap 36 -> 75 MB; 200,001 rejected in 0 ms (`INVALID_RESPONSE`, limit holds). Repeating one point still costs full validation per entry. `FetchLike` is injected; `res.json()` has no byte cap in this class (size cap must come from the injected `fetch`; UNVERIFIED that production wiring has one). Fix: lower `MAX_ENTRIES` (real blocks have < 10k eligible txs), cap bytes, and yield between chunks.

### S-5 LOW: oracle-controlled range, no upper bound on requests per scan
Evidence: `scanner.ts:49-50`: `toHeight` from `source.getTipHeight()` is only checked to be an integer; `BlindBitClient.getTipHeight` accepts any safe integer (`blindbit.ts:45`, tip `2^53-1` accepted, verified). A hostile oracle can make a `scanBlocks` run (with default `toHeight`) issue unbounded sequential requests (2 per height). Measured: 20,000 requests issued in 444 ms until I aborted via `AbortSignal`. Abort works. Fix: caller-side max span or sanity check of tip against a second source / expected chain height.

### S-6 LOW: BlindBit accepts impossible values
`blindbit.ts:190-191`: `vout` accepted up to `2^53-1` (valid range is u32) and `amount` up to `2^53-1` sat (> total supply 2.1e15 is 2^50.9; accepted value 9.007e15). Verified: `vout= 9007199254740991 amountSats= 9007199254740991`. Downstream `buildSpendTransaction` rejects vout > 0xffffffff (`INVALID_INPUT`) and amount > 21e14 (`INVALID_AMOUNT`), so impact is a late failure, not a silent one. Fix: bound at parse time.

### S-7 LOW: zero-fee transactions for fee rates below 0.0005 sat/vB
`spend.ts:90-93` `feeFor` rounds `feeRate*1000` to an integer. Verified sweeps of 100,000 sats: `feeRate=0.0004`, `1e-300`, `5e-324` -> `OK fee=0 vsize=99`; `0.0005` -> fee 1. Valid per the `feeRate > 0` check but unrelayable (min relay feerate > 0). Fix: enforce a floor (e.g. 0.1 sat/vB) or reject `fee == 0n`.

### S-8 LOW: chain-adapters `fetchAnnouncements` livelock when `maxRequests` is smaller than the halvings needed
Evidence: `logs.ts:193,199,207-210`: the halved `window` is local and not stored in the cursor, and every rejected `eth_getLogs` counts as a request. If provider limit < range and `maxRequests` <= number of halvings, every call returns `truncated: true` with an unchanged cursor, forever.
Repro (`chain-scan.stress.ts` "livelock"): head=1, range cap 2, provider max 1 block, `maxRequests: 1`: after 1000 calls cursor still 0. Realistic: `getLogsMaxRange 1000`, provider limit 10 blocks, caller `maxRequests: 5`: cursor 0, `truncated true`, 5 requests (needs 8). Default `maxRequests = 50` is safe. Fix: persist the learned window (return it in `FetchResult`/cursor) or do not count halving retries, or clamp `maxRequests` to >= `ceil(log2(range))+1`.

### S-9 LOW: reorg deeper than `finalityDepth` leaves stale stored announcements with no signal
Evidence: `logs.ts:182-183`: rollback = `last.number - depth + 1`; only `cursor.last` is compared, and it is then overwritten with the new hash. Repro (`chain-scan.stress.ts` "reorg of depth N", finalityDepth 5, scanned 0..100, then fork from `101-N`): depth 1,3 -> `rolledBackTo=96`, 0 stale; depth 10 -> 5 stale blocks (91..95) keep old logs; depth 50 -> 45 stale blocks; the following call reports no reorg (`third_call_reorg=false`), so the divergence is never surfaced. With `finalityDepth = 0` `rolledBackTo = last+1`: nothing dropped even for a 6-block reorg (verified: last=30 -> rolledBackTo=31). Chain table values are 12-250 so the real exposure is chains with reorgs deeper than the configured depth (L2s) or a custom config of 0. Fix: walk back through `parentHash` until a stored hash matches (store a small hash window in the cursor), and reject `finalityDepth < 1`.

### S-10 LOW: option validation gaps in `fetchAnnouncements`
Verified with a request budget of 20,000 `eth_getLogs` per client:
- `maxRequests: NaN` -> never truncates (`requests >= NaN` is false): 19,950 requests until my budget aborted it (head inflated to 2^64 by the provider). `Infinity` and `maxLogs: NaN/Infinity` behave the same by code (`logs.ts:199`); my first runs of these cases were contaminated by an exhausted budget, so only NaN is confirmed non-terminating. With defaults and head=2^64 the call stops after 50 requests (truncated), good.
- `maxRange: NaN` -> raw `RangeError: The number NaN cannot be converted to a BigInt` (not `ChainAdapterError`). `0`, negative, `0.5` clamp to 1 (31 requests for 30 blocks).
- `cursor.nextBlock = -5n` -> `RPC_FAILURE: transport failure` (provider rejects `0x-5`), message uninformative. `nextBlock` > head returns `ok` with zero requests and unchanged cursor, no signal (e.g. cursor from another network).
- One transient -32005 permanently halves the window for the rest of the call: head=5000, provider healthy after first error: 11 requests at size 500 vs 5 at 1000 (amplification x2 only).
Fix: validate with `Number.isSafeInteger`, throw typed errors.

### S-11 INFO: no upper bound on announcement metadata size; heavy-ish validation
`validateAnnouncementLog` accepts a 1,000,000-byte `metadata` (validate 190 ms, 2,000,002 hex chars kept in memory). A provider response is capped by `maxResponseBytes` (2 MiB default) so total memory per call is bounded to about 50 x 2 MiB at defaults; the dust-spam vector is anyone calling the announcer with large metadata. Throughput: 20,000 valid logs = 5.7 s (0.29 ms each, ABI decode + re-encode canonical check), 20,000 truncated-data logs = 1.05 s. Fix: cap metadata length (ERC-5564 metadata is small) before decoding.

### S-12 INFO: non-`SilentPaymentError` exceptions on malformed JS objects
`buildSpendTransaction(base([null]))` -> `TypeError: Cannot read properties of null (reading 'txid')`; output without `txid` -> TypeError (`spend.ts` reads `o.txid.toLowerCase()` before shape checks). TypeScript callers cannot hit it; JS/untrusted-deserialized callers can. Fix: shape-validate first.

## Passed (no defect found)

Scanner (`btc-scan.stress.ts`):
- Throughput, no match, labels=change only: 1000 tweaks x 1000 outputs 8.4 ms/tweak (11.0 s), 5000 -> 6.6 ms/tweak (42.5 s), 20000 -> 7.5 ms/tweak (187.5 s); heap 21->27, 39->37, 66->58 MB (no growth). Per-tweak cost is dominated by 1 ECDH multiply + `mulG` + a label add, not by output count (O(1) set lookup).
- 2323 outputs to one receiver in one tx (K_MAX): sender 3607 ms, scan finds 2323 in 2748 ms; sender with 2324 same-address recipients throws.
- 300 blocks x 3 txs: 5.6 s, 6 found as expected (heap 39 MB).
- Reorg/inconsistency between `getTweaks` and `getOutputs` (hash mismatch, tweak height mismatch, output height mismatch): all `REORG_DETECTED`.
- fast-check, 500 runs: arbitrary `fromHeight`/`toHeight` (ints, doubles, NaN, Infinity, -0, undefined) only ever throw `SilentPaymentError`.
- BlindBit: fast-check 2000 runs of arbitrary JSON into `getTweaks/getOutputs/getInfo/getTipHeight`, 3000 runs structured entry fuzz (bad hex, wrong lengths, off-curve points, nulls, 2^53, -1, 1e21, booleans): 0 non-`SilentPaymentError` escapes. Heights -1, 1.5, NaN, Infinity, 2^32, 2^53 -> `INVALID_INPUT`; 2^32-1 accepted. Hex: only uppercase block hash accepted (normalized to lowercase); `0x` prefix, whitespace, trailing newline, non-ASCII, wrong length all rejected.

Spend (`btc-spend*.stress.ts`):
- 5001 inputs and 0 inputs -> `INVALID_INPUT`; 2324 same-address SP destinations -> `GROUP_LIMIT_EXCEEDED`; 2323 -> OK in 10.2 s; 100 / 1000 / 2400 distinct SP destinations: 0.97 s / 11.5 s / 25.1 s (about 10 ms each, linear); 100 / 1000 regular destinations (10 inputs, change): 1.3 s / 5.6 s.
- Amount bounds: input = 21e14 ok, 21e14+1 `INVALID_AMOUNT`; dest 0, -1, 2^64 -> `INVALID_AMOUNT`; 1 and 545 `DUST_OUTPUT`; 546 ok; number instead of bigint -> `INVALID_AMOUNT`. 3 inputs of 21e14 each (63M BTC) are accepted (inputs are caller-trusted; INFO).
- feeRate 0, negative, NaN, Infinity, string, null -> `INVALID_INPUT`; 10000 ok path, 10000.0001 and 1e308 -> `FEE_TOO_HIGH`.
- Bad outputs: short/uppercase txid (uppercase accepted, normalized), vout 2^32 / -1 / 1.5 rejected, 31-byte x-only, wrong key, zero / 0xff / short tweak all `INVALID_INPUT`; duplicate outpoint case-insensitive -> `INVALID_INPUT`. Addresses: empty, wrong network, truncated, whitespace, newline, regtest `bcrt`, `network: 'regtest'|undefined` -> `INVALID_ADDRESS`.
- fast-check property (150 runs, seed 99, 1-6 inputs 1..2e12 sat, 0-4 destinations mixing p2wpkh / p2tr / SP, feeRate 0.001..1000, dust in {0,1,546,5000}, sweep/change toggles): 116 built, 34 rejected (`INSUFFICIENT_FUNDS` 29, `DUST_OUTPUT` 4, `INVALID_AMOUNT` 1), all with `SilentPaymentError`. For all 116: sum(outputs)+fee == sum(inputs), reported `vsize` == re-parsed `tx.vsize`, `fee >= floor(feeRate*vsize)`, destination amounts preserved in order, change >= dust. An earlier 120-run variant (seed 4242) had 45 rejections of `INVALID_ADDRESS` caused by my invalid p2tr fixture keys; superseded.

chain-adapters (`chain-scan.stress.ts`):
- `validateAnnouncementLog`: 50,000 random-structure logs + 100,000 mutated valid logs (char flip/delete/append in address, data, blockNumber, blockHash, logIndex, topics): only `ChainAdapterError` escaped (outcomes of mutation run: INVALID_LOG 85,411, skipped 10,839, accepted 3,750). Non-object logs (null, number, string, boolean) -> `INVALID_LOG`; array `[]` -> `INVALID_LOG: wrong emitter`.
- 2 MB hex-looking `data` with trailing non-hex: 5 ms (no regex blowup); 1,000,000 topics: 133 ms rejected.
- Quantity/hash form: leading-zero or `0X` blockNumber and logIndex >= 0x1000000 -> `INVALID_LOG`; uppercase blockHash/topic0 and lowercase emitter accepted.
- Pagination: head=1e6, default caps -> 50 requests, truncated, next=50,000 in 6 ms; `maxRequests` 1e6 -> 1001 requests to completion in 15 ms, heap 19->23 MB. Head = 2^64 with defaults -> 50 requests, truncated.
- fast-check property (400 runs, seed 777; random head 0-150, range 1-12, provider limit 1-14, maxRequests 1-6, maxLogs 1-6, up to 40 logs incl. garbage-content logs, random start): repeated resumed calls return exactly the valid ground-truth set, no duplicates, cursor never moves backwards and always advances while truncated (excluding the S-8 livelock region, filtered with `fc.pre`).
- Reorg: depth 1 and 3 with finalityDepth 5 detected and rolled back to 96; lagging provider (head 90 < last 100) treated as reorg, rolledBackTo=96 (conservative, no loss); head hash flipping between the head read and the final read -> `RPC_FAILURE: chain reorganised during scan; retry`.

## Not covered
- Real BlindBit network/transport (fetch with real timeouts, body size) and real Bitcoin blocks; synthetic `InMemoryTweakSource` only.
- Heap numbers are `heapUsed` snapshots, not peak RSS; no leak run longer than 300 blocks.
- 5000-input spend not executed (extrapolated). Timings under 2x CPU contention.
