> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay chain-adapter and transaction-review audit — round 2 bounded worker

## Outcome

**No new actionable browser-reachable vulnerability was established in the completed reads.** This worker completed every assigned production variant in `packages/chain-adapters` and `packages/tx-review`, read the transaction-review tests, and read part of the associated adapter tests. The remaining tests and three other packages are explicitly pending. The absence of a new finding is not a full-product assurance claim.

This was immutable-source inspection only. No target source, test, configuration, or dependency file was changed. No target code, test, build, exploit reproduction, transaction, or live probe was executed. This worker performed no Git mutation. Review notes and read-accounting helpers were written outside the checkout; the parent owns audit-document integration.

- Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Primary candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Pending production variants were taken exactly from `coverage-pending.json`, using their `source_sha` and blob. Source-bearing branch references were reconciled by immutable path/blob identity across the branch list in `source-scope.json`.
- Changed variants were covered by a complete full-file base read plus a complete blob-to-blob diff. The JSON ledger records the reviewed base blob and the inherited-line method. It does not describe each variant as an independent full-file read.
- The first oversized read had an output truncation; the missing adapter and barrel ranges were subsequently re-read in bounded chunks. No coverage depends on omitted output.

## Completed coverage

The following are **path-and-blob variants and variant-lines**, so unchanged lines in a changed main/candidate pair can appear in more than one row total. They are not a claim of distinct implementation lines.

| Package | Production variants / lines | Test or test-support variants / lines | Documentation / manifest variants / lines |
|---|---:|---:|---:|
| `chain-adapters` | 34 / 7,505 | 18 / 4,029 | 5 / 264 |
| `tx-review` | 5 / 699 | 6 / 797 | 4 / 111 |
| **Total** | **39 / 8,204** | **24 / 4,826** | **9 / 375** |

The transaction-review production count includes the supplemental 206-line `src/types.ts`, which is not in the runtime closure but was read to understand the intent and policy contracts. Its runtime files are otherwise the four assigned variants. Every completed ledger entry has the exact path, blob, representative SHA, full read range, method, kind, and verified branch/SHA references. All references were checked against Git tree objects; worktree contents were not assumed to equal a frozen reference.

The complete adapter runtime reads cover generated ABIs; chain/token tables; construction and preview comparison; EIP-712 sweep and permit handling; registry lookup, delegation and ENS resolution; RPC transport and reconciliation; manifest validation/signatures/read-back; log validation and pagination; secondary log comparison; direct receipt evidence; deduplication; bulk evidence and cancellation scheduling; pricing and fee calculation. The transaction-review reads cover closed transaction/typed-data decoding, expected-intent comparisons, allowlists, deadlines, allowance amounts and fee caps.

Associated tests were read as source, not run. Test assertions are evidence of intended behavior, not observed pass results. In particular, the local-EVM `.anvil.test.ts` files remain unread in this worker and were never invoked.

## Confirmed candidate changes and boundaries

### AP-K1 — Manifest calendar validation

Candidate `packages/chain-adapters/src/deployments.ts:71-79` checks calendar components after parsing. Main's corresponding blob only tests the RFC3339 pattern and whether `Date.parse` returns a number. This corrects acceptance of calendar-impossible days. Candidate `src/deployments.test.ts:73-85` adds regression expectations for that distinction. No route from this display/date validation difference to payment redirection or a manifest-signature bypass was established.

Candidate blob: `1fbaa3af3f200622596bd552d7af6e330d1c2fb8`; main blob: `a6d2aa4c10ec317cd3c91b0ac09447d755180425`.

### AP-K2 and AP-K3 — RPC transport and retry hardening

Candidate `packages/chain-adapters/src/rpc.ts:103-113` explicitly selects `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and `cache: 'no-store'`. Main lacks those explicit settings. The network/application lane owns the final browser privacy assessment; this is a confirmed source change and should be deduplicated against its findings.

Candidate `rpc.ts:227-229` also clamps a nonfinite requested retry count to zero. Main's `Math.min/Math.max` expression preserves `NaN`, making the later retry-termination comparison ineffective for that programmatic input. No externally controlled browser path to this option was established. The corresponding retry and fetch-option assertions in `rpc.test.ts` were read, with the complete main diff.

Candidate blob: `1c8d1edc486c70b7ea7fee96ec62c57af00e421e`; main blob: `60b3505d3bc62089afd1ed4741bea29273ebea8a`.

### AP-K4 — Bulk receipt evidence and cancellation

Candidate `packages/chain-adapters/src/payments.ts:186-221,236-318,335-348` adds cover-target selection, bulk receipt/transaction/block reads and batch-backed verification. Missing evidence stays unverified; the batch path does not fall back to a lone receipt query for a match. Explicit balance observation remains a separate opt-in input. Cover selection intentionally retains every requested match even when the included matches exceed the nominal cover cap; tests preserve that behavior.

Cancellation discards partial evidence and stops subsequent scheduling. It does not abort already dispatched RPC requests, which retain the client timeout/retry policy. This limitation is documented directly at `payments.ts:233-234` and is reflected by the source. `payments.bulkCancellation.test.ts` was read completely and covers already-aborted work, cancellation after a pending head, per-member dispatch checks, partial receipt pairs and the final block recheck.

Candidate blob: `c57c9a2dc3bcb45c2b66df17e8be26d0a1dcbbcc`; main blob: `c910b8cceb25c308fdd9a93204be1022a611ae02`.

### AP-O1 — Payment proof, provider trust and deployment trust

The completed source binds `received` to the canonical block, a successful direct router transaction and receipt, matching calldata, and the exact announcement. Supported ERC-20 evidence additionally requires the payer-to-recipient `Transfer` event of the asserted net amount. A current balance alone is not sufficient. Transfer identities are consumed only after successful verification, and optional secondary evidence must agree before the claim remains received. Indirect smart-wallet calls deliberately remain unverified through this path. Sources: candidate `payments.ts:320-430,465-504`; main shares the corresponding evidence checks outside the new batching abstraction.

These checks retain explicit trust in the configured RPC providers and verified deployment inputs. The provider wrapper compares answers; it cannot independently establish that two URLs operate separate backends. Manifest signing keys must be supplied through a trusted build/distribution path. Registry/announcer code presence and behavioral probes are not independently pinned runtime hashes. These boundaries are documented in `rpc.ts:419-428,461-491`, `verify.ts:104-133,184-238`, `registry.ts:135-194`, and `registryEns.ts:26-34`.

### AP-O2 — Transaction review boundary

`packages/tx-review/src/decode.ts:103-125,200-233` restricts decoded selectors and typed-data shapes, uses canonical re-encoding, and refuses EIP-7702 authorization lists. `src/review.ts:85-127,152-173` then compares decoded facts with a separately supplied expected intent and the supplied policy. The library cannot authenticate an expected intent and policy that were both supplied by a compromised caller. This is an explicitly documented same-caller boundary, not a newly found bypass.

The adapter can construct `payERC20WithBuffer`, while transaction review deliberately refuses that method. Both documentation and tests say so. Preserve the distinction when describing supported browser payment flows. Direct sweeps apply gas and fee-share policy; approvals require associated payment gross and cannot exceed it. Permit domain name/version are not part of the returned permit intent by design, while the builder/preflight code separately reads and compares the token domain when configured. No new externally reachable authorization bypass was established in these reads.

### AP-O3 — Stale verification TODO text

`packages/chain-adapters/TODO-VERIFY.md:9-12,29-36` still describes only two listed USDC entries and an empty `FEEDS` table. Current `src/config/tokens.ts:18-42` lists additional sourced testnet entries, and `src/quote.ts:46-93` contains four testnet feed entries. This is documentation maintenance. This source-only batch did not independently validate those external addresses, issuer claims, oracle availability, or deployment bytecode against a live chain.

## AP-Q1 — Secondary comparison work budget: unranked followup

`packages/chain-adapters/src/scanVerify.ts:75-93,101-142,143-165` splits/retries a primary page's block range and retains secondary accepted logs without its own aggregate request/log budget. `fetchAnnouncements` separately limits primary calls and accepted logs, but those limits do not directly cap the secondary comparison's splitting or accumulation. A more restrictive or inconsistent secondary can therefore cause substantially more work than the primary page used. The code remains bounded by the caller's block range; no infinite-loop or measured amplification claim is made.

The fresh `scan_network_round2` worker independently reported that candidate `scanClient.ts` wraps both providers in `scopedClient`, checking active ownership before and after each call and racing cancellation. Candidate cancellation is therefore covered at the application boundary; the missing `AbortSignal` parameter in the package is not evidence that candidate Cancel fails. The same worker reports that main lacks this wrapper and retains the main cancellation assessment. Neither variant appears to supply an explicit aggregate secondary request/log budget at the callsite. That application worker owns final severity and deduplication.

A defensive improvement would give secondary comparison an explicit total request, retained-log and elapsed-work budget, return a clear incomplete/disagreement result on exhaustion, and preserve cancellation gating. This observation remains unranked pending integrated scope assessment. No probe, exploit, or reproduction was performed.

## Exact pending handoff

**89 variants / 11,243 variant-lines remain unread in this worker.** Each exact pending `source_sha`, path, blob and zero read range is preserved in `review-adapters-packages-round2.json`. A fresh worker should consume that list, not the original broader pending list, and save a separate coverage report for the parent to merge.

| Pending group | Production variants / lines | Test/support variants / lines | Docs/manifests / lines |
|---|---:|---:|---:|
| `chain-adapters` | 0 / 0 | 16 / 3,334 | 0 / 0 |
| `hygiene` | 12 / 1,081 | 6 / 1,048 | 4 / 147 |
| `metadata-hardening` | 13 / 1,671 | 11 / 1,117 | 3 / 134 |
| `payment-uri` | 14 / 1,214 | 6 / 1,370 | 4 / 127 |

### Remaining adapter test variants

| Path | Lines | Blob |
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

The pending `quote.test.ts` main/candidate pair can be covered by one full read plus its complete diff. All other pending branch variants are already deduplicated by path and blob. No method should claim a grep, import inventory, or unviewed output as a complete source read.

The three unstarted packages may include optional-chain parser modules through barrels. The authoritative scope list includes those modules as a conservative source closure; this does not establish that optional Bitcoin/Solana/TRON UI is emitted or callable in the lean profile. Preserve the user's exclusion of optional full-profile UI, `pir-two-server`, legacy extension/CLI, and live services. Contract production was parent-reviewed; contract tests remain a separate parent assignment.

The next worker must retain the read-only conditions: no source/test/config/dependency changes, no test/build execution, no network probes, no transactions, no PoCs and no Git push. The parent can integrate these source-backed notes separately from any future approved remediation work.
