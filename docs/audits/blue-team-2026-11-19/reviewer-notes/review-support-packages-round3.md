> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay supporting packages audit — round 3 bounded worker

## Outcome

**No new actionable browser-reachable vulnerability was established.** All assigned production, test, test-support, documentation and manifest variants in `packages/hygiene`, `packages/metadata-hardening` and `packages/payment-uri` are complete. Exactly **16 chain-adapter test variants / 3,334 variant-lines** remain for a fresh worker. This is a bounded source-review result, not a full-product assurance claim.

This worker performed immutable-source inspection only. No target source, tests, configuration or dependencies were edited. No application code, builds, tests, exploit reproductions, transactions or live probes were executed. No Git mutations were performed. Only this worker's scratch Markdown/JSON reports were written. The parent owns integration into repository audit notes.

- Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Primary candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Assignment came from the exact 89 pending path/blob variants in `review-adapters-packages-round2.json`.
- All 1,972 recorded branch/SHA references for completed variants were independently matched to immutable Git trees across 28 distinct frozen SHAs.

## Completed coverage

Counts are path-and-blob variants and variant-lines. Main/candidate counterparts can repeat unchanged lines. The JSON ledger is authoritative and records representative SHA, blob, line count, kind, full range, method, and verified references.

| Package | Production variants / lines | Test or test-support variants / lines | Docs or manifest variants / lines |
|---|---:|---:|---:|
| `hygiene` | 12 / 1,081 | 6 / 1,048 | 4 / 147 |
| `metadata-hardening` | 13 / 1,671 | 11 / 1,117 | 3 / 134 |
| `payment-uri` | 14 / 1,214 | 6 / 1,370 | 4 / 127 |
| **Total** | **39 / 3,966** | **23 / 3,535** | **11 / 408** |

All 39 runtime variants were read in full as line-numbered immutable blobs. Main manifests for the three packages were covered by the complete reviewed candidate file plus a complete candidate-to-main blob diff. The main `payment-uri` fuzz and negative test counterparts were covered the same way; their changes only replace literal bidi test characters with source escapes. These five base variants are separate ledger records, not silently included in a candidate record.

The initial inventory output was truncated because it contained repeated reference arrays; it carried no source coverage credit. One combined source read truncated `metadata-hardening/src/derive.ts`; the entire 187-line blob was reread in a subsequent bounded output. No coverage depends on missing output.

## Source-backed observations

### SP-O1 — Hygiene derivation and local enforcement

`hygiene/src/destination.ts:59-81,100-154` derives each destination from domain-separated indexed key material through the core stealth routines, wipes the copied key material and retained stream seed in `finally`, and verifies that a recovered secret maps to the recorded destination. `ledger.ts:49-54,70-134,151-195` rejects index conflicts and duplicate persisted rows/indexes, and prevents a different source from reusing a destination unless the caller chooses the explicit acknowledged-reuse method. Zero, protocol and own-source destinations remain refused.

These are local address-hygiene checks. `hop-source.ts:19-59` states that the caller must persist allocations across restarts; one source object keeps a local high-water index. The ledger does not establish network-wide address freshness or hide the public sweep link. No externally reachable violation of these boundaries was established in the completed reads. Tests were inspected for determinism, recovery, malformed persisted data, index conflicts and cleanup on both success and throw; they were not executed.

### SP-O2 — Older log helpers retain a stronger RPC trust assumption

`hygiene/src/verify.ts:46-101` validates the shape of returned Transfer logs but does not retain or check the emitter, log index or block hash, and does not recheck that returned blocks fall inside the requested range. Its helper passes token/range constraints to the injected RPC and relies on that filtering. `spentCheck` at `177-216` adds each matching returned outflow without deduplicating log identities.

**This is unranked and is not a newly established browser vulnerability.** Exact helper-name searches of `apps/web/src` on frozen main and the primary candidate found no calls to `addressFreeReceipt`, `sweepConfirmed`, `spentCheck`, `batchedRead` or `pickDecoys`. The browser currently imports the ledger and funding guard from this package (`apps/web/src/lib/sweep.ts:20`). This search is limited reachability evidence; it is not full-file coverage or a proof about every possible aliased call in every branch. The older helpers must not be confused with the substantially stronger chain-adapter payment proof already reviewed in round 2. No behavior against a live provider was measured.

### SP-O3 — URI parsing and authentication boundary

`payment-uri/src/eip681.ts:14-26,75-134` bounds positive exact amounts to uint256, allows native or ERC-20 transfer requests only, rejects duplicate/unknown parameters, and refuses `value` on token transfers. `query.ts:67-111` rejects malformed query structure and bounds ordinary URI input to 2,048 characters. `text.ts:3-27` rejects control, bidi, default-ignorable, surrogate and non-NFC display text.

`invoice-link.ts:3-25,44-69` bounds complete links to 22,200 characters and checks host, scheme, path and base64url structure. Its returned envelope is expressly unauthenticated. Authenticating the invoice and signer remains the responsibility of invoice-schema and the application. The optional non-EVM parsers were read because the static closure exports them; this does not assert that optional full-profile UI is emitted or callable in the lean build. The tests exercise amount bounds, query duplication, invalid encodings, unsafe text, network conflicts and round-trip behavior; assertions are intent evidence, not pass results.

### SP-O4 — Stale package integration documentation

`payment-uri/DEVIATIONS.md:3` says app parsers are unused. Candidate `apps/web/src/lib/qrClassify.ts:234-258` actually calls `parseInvoiceLink` and `parsePaymentUri`. The package README already acknowledges QR classification at line 27.

`metadata-hardening/README.md:3` says the package is not wired into `apps/web`. Candidate `apps/web/src/lib/relayerClient.ts:1-5,104-116` imports and invokes `padBody` for padded request bodies. Its README line 50 also names `viem 2.57.7`, whereas the candidate manifest pins `2.57.19` at line 39. These are documentation maintenance observations. They do not mean all hardening-menu features are integrated.

The supporting JSON contains exact evidence blobs for these observations. The three application files were read only in recorded supplemental ranges to reconcile reachability/documentation; they receive no additional full-file coverage credit from this worker.

## Limits and integration guidance

- No new ranked finding is added. Preserve the existing AP-Q1 secondary comparison work-budget observation as unranked under the scan lane; this worker did not reassess or duplicate it.
- No external standard, address list, dependency advisory, chain deployment, live RPC behavior, cryptographic vector or statistical claim was independently revalidated against external services in this batch.
- Source tests are not execution evidence. No build, test, lint, coverage run or application smoke test was performed.
- Main/candidate manifest dependency-version changes were inspected as source; this is not a dependency vulnerability audit.

## Exact remaining handoff

Only these 16 chain-adapter test variants remain from the original 89. Every pending record in the JSON preserves its exact source SHA, blob, line count, kind, and empty read range. No assigned file has partial source coverage at handoff.

| Path | Lines | Blob |
|---|---:|---|
| `packages/chain-adapters/src/eip712.independent.test.ts` | 99 | `9470d3c9304a1e969965d36b8fc86e4a8688566c` |
| `packages/chain-adapters/src/logs.test.ts` | 466 | `e10267684a88385ecd9b289f3d85f29546961196` |
| `packages/chain-adapters/src/payments.anvil.test.ts` | 230 | `fe6523aa89555b5b0fa4c17109aa931c4aff8a64` |
| `packages/chain-adapters/src/permit.test.ts` | 197 | `a59fe67b62b7b368e072ad37fb5fa9a818367dfa` |
| `packages/chain-adapters/src/quote.anvil.test.ts` | 111 | `b0d274199e3ff7aaab1926e88eafc2437534d617` |
| `packages/chain-adapters/src/quote.guards.test.ts` | 148 | `a0b5058d01dcea87a2e20fc3b7f63a4b5cc45f29` |
| `packages/chain-adapters/src/quote.test.ts` | 207 | `a6348941fa36533ca408d8a10e059fcd52ed5884` |
| `packages/chain-adapters/src/quote.test.ts` | 211 | `ab98c68605acba6a7d094e631ab1431ab88e2763` |
| `packages/chain-adapters/src/registry.compat.test.ts` | 114 | `ffcc3420bf57ec069bc9ad1995497c0a85da21fb` |
| `packages/chain-adapters/src/registry.test.ts` | 111 | `b705e66f46759ee506fa7cea74b4fa84ed59bc02` |
| `packages/chain-adapters/src/registryDelegation.test.ts` | 184 | `e80fdc0c4e0a681336552f866d0d0e4dd66dfe24` |
| `packages/chain-adapters/src/registryEns.test.ts` | 88 | `890f227fa0a11ec5ab7104444173187cc2de2540` |
| `packages/chain-adapters/src/router.anvil.test.ts` | 159 | `bca50477b3cb2768b2aa6729bd3fc22a5f247336` |
| `packages/chain-adapters/src/router.test.ts` | 304 | `0e5791a4bfba226e85ef4028469dcda095254951` |
| `packages/chain-adapters/src/scanHardening.test.ts` | 493 | `d6f41acbfe8cab313bd07fbc9c366e92bd80221e` |
| `packages/chain-adapters/src/sweep.test.ts` | 212 | `60526c7f94d0f6851b6f1dd64ec1ef9668b94392` |

The `quote.test.ts` main/candidate pair can be covered by one full immutable read plus the complete blob-to-blob diff. All other pending variants are already deduplicated by path/blob. Read them as source only; do not invoke the local-EVM `.anvil.test.ts` files.

A fresh worker should read the parent task constraints and this ledger, finish exactly the remaining list, and produce a separate coverage report for parent integration. Preserve the read-only conditions: no target edits, tests/builds, transactions, live probes, PoCs, or Git mutations. Stop with exact coverage before any context compaction.
