# Branch consolidation and source provenance

Snapshot: 2026-11-19 11:34:36 UTC. Remote branch inventory was captured at 11:30:11 UTC.

| Identity | Exact source |
| --- | --- |
| Current main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Initial main for this work | `8f56376427c96881f49590920ff0bf8543ec81b4` |
| Selected Pages baseline, PR #270 | `73545f63112910d46002718354ab5e99f8652e1f` |
| Product consolidation checkpoint | `35978ab796b7c476eb35dd9ed634ca4ff86ff9b9` |
| Canonical local branch | `release/ghostpay-beta-qualification-20261119` |
| Candidate after main refresh | `73124433c08c8ef6835f11d03709060c6eea7a3f` |

The candidate was selected because #270 retains #262's stronger authorization and privacy implementation, adds canonical-array/scanner repairs, and preserves the current merchant profile. Choosing an older broad consolidation would lose newer behavior. No historical head is accepted merely because it is larger or reports more passing checks.

## Machine-readable census

[branch-disposition-ledger.json](branch-disposition-ledger.json) extends the 278-branch census preserved by [PR #273](https://github.com/djshellshoxxx/GhostPay/pull/273). It inventories **287 live branches**. Exact ancestry was refreshed for every head; historical semantic classifications were reused only for unchanged heads, with their original source caveats. This is a mechanical inventory plus focused source reviews, not a claim of 287 fresh adversarial audits.

| Disposition | Count | Meaning |
| --- | ---: | --- |
| Integrated | 201 | 177 exact heads retained in main; 24 additional heads retained in the unqualified candidate |
| Still actionable | 44 | Unique source, evidence or current head still needs reconciliation |
| Superseded | 19 | Historical supersession evidence retained for unchanged heads |
| Equivalent | 16 | Historical patch/content equivalence retained with source limits |
| Deferred | 5 | Preserved work outside the lean EVM milestone or awaiting later qualification |
| Incompatible | 2 | Coordination/publication history excluded from source integration |

No branch was deleted. No source PR was closed. No merge to main was performed by this engineering lane. Branch ancestry establishes history retention; it does not by itself prove that every old feature survives or that tests passed.

## Focal source dispositions

| PR | Observed head | Decision and retained value |
| --- | --- | --- |
| [#238](https://github.com/djshellshoxxx/GhostPay/pull/238) | `198aa5baff22272453733a0f3dcfcac0e0994eec` | Ancestor of selected candidate; recovery, privacy and Pages history retained |
| [#262](https://github.com/djshellshoxxx/GhostPay/pull/262) | `40b64e8f3a0f34f7b19235ba4655ef918687f22e` | Product base `c7e09bc7...` retained through #270; latest head adds main/docs/evidence, not new product inputs |
| [#264](https://github.com/djshellshoxxx/GhostPay/pull/264) | `bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a` | Preserve broad history; newer candidate supersedes relevant recovery/privacy behavior. Do not overwrite current code wholesale |
| [#269](https://github.com/djshellshoxxx/GhostPay/pull/269) | `683f8587b8de45448f14aab0539cb07a5f21bce3` | Original ancestry retained through worker merge `b456f863...`; final integration `acdebc5a...`. Fresh secret-export grants, scan error/cancellation and checkpoint fixes recovered |
| [#270](https://github.com/djshellshoxxx/GhostPay/pull/270) | `73545f63112910d46002718354ab5e99f8652e1f` | Selected base; canonical-array descriptors and unsupported scanner-scheme handling retained |
| [#272](https://github.com/djshellshoxxx/GhostPay/pull/272) | `63ff40d57af879a3d82166450f63aadb7bf0d5ff` | Semantically merged at `72079315...`; preserves existing network grants, destination ledger and post-handoff journal |
| [#255](https://github.com/djshellshoxxx/GhostPay/pull/255) | `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` | Active analyzer/deployment work preserved; no blanket acceptance or Mythril exception. Strict-gate review retained |
| [#256](https://github.com/djshellshoxxx/GhostPay/pull/256) | `e2ebb4902e53e2249c6585a1d72be6e1e416c36c` | Sleep-aware session requirements represented by later source; do not replace stronger recovery-aware authority code |
| [#240](https://github.com/djshellshoxxx/GhostPay/pull/240) | `38d69832ddc58ec27a19c00dbe3c89347c577495` | Later backup/export code distinguishes downloaded and verified bytes; older recovery source retained as provenance |
| [#271](https://github.com/djshellshoxxx/GhostPay/pull/271) | `429a4de80b9ec53177b17d89d18ce8ec91a08814` | Six relevant blobs already identical. Keep candidate's newer RPC no-credentials/no-referrer/no-store protections. Unique TRON missing-height tests deferred |
| [#274](https://github.com/djshellshoxxx/GhostPay/pull/274) | `a4c6f945adef0438bfd0b347fb7c11057e3973ce` | Included at `c60f7cc3...`; monotonic invoice wait expiry independently reviewed and tested |
| [#273](https://github.com/djshellshoxxx/GhostPay/pull/273) | `b05a71f2859adef19f51f89d1855535b0bb80b53` | Census reused with provenance; documents remain preserved on source branch |
| [#275](https://github.com/djshellshoxxx/GhostPay/pull/275) | `dc821780e05483d1b35062a74b07be7ed9ca2f1c` | Late policy-fixture repair; inspect during full workspace qualification without enabling policy runtime |
| [#276](https://github.com/djshellshoxxx/GhostPay/pull/276) | `f39a9dd36c09f8b02d937c5f3d19676d334976d6` | Integrated with original ancestry; original six verifier tests and complete 101-test Pages tooling selection passed independently. Execution against the final generated artifact remains required |

## New engineering and review

The integration adds helper review assertions before key derivation/signatures (`1d8445b6...`), suppresses stale component errors and passes those guards (`04ded6b5...`), handles session expiry before authorization (`89ec593b...`), rejects invalid/rollback grant clocks (`676093a3...`), and requires fresh native balances to equal the amount reviewed (`3f6fcb84...`). Tests reproduced each relevant failure before correction; details are in [TEST_RESULTS.md](TEST_RESULTS.md).

[combined-source-review.json](combined-source-review.json) pins the exact Sweep component, sweep helper, jitter, Scan and network-authority blobs. All five match their reviewed implementations after the main refresh. The ten-line main advance is audit documentation only. This source comparison does not replace final-source CI.

## Coordination boundary

A separate worker owns the integration lease: `20261119T105500Z-0bed53303053-root`, generation 3, observed acquisition 10:52 UTC and expiry 11:52 UTC. Check current lease and ownership before promotion; elapsed time alone is not takeover authorization. The `automation/ghostpay-integration-lock` branch is control metadata and must never be merged into source. Existing workers, claims and historical branches remain intact.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
