# GhostPay branch disposition: 695 refs, 356 PR records

Observed: 2026-11-24T10:09:53.807523+00:00. Main: `706188000c38b3dde5a3a362370a530870aa7587`.

All original 693 branch heads are unchanged. The two new refs are PR615’s integration and documentation-only near-finished qualification. The PR inventory preserves the prior 355 records and adds live public PR615; it is not a full new PR-state enumeration.

## Current source states

| State | Head | Tree |
|---|---|---|
| Published PR611, unchanged | `100de4006569ee1f65736adce8d111446dfafa59` | `4aa8d250452fd2770e197cd07b67538ba5771390` |
| Current local composition | `a107d993c1aed73827d853924ea36036f083400f` | `85ce383194962080baf8b6d741111f8523b843bb` |
| Qualified remediation, now composed | `03054ea700f69bb3e11465973b2a1bbccf61cc81` | `41d4208d5da5228e06ff46120e9e72398110f13b` |

Current local source retains **141 code-different snapshot branch heads**. This is ancestry, not 141 separate features or main integration. It includes original PR615/C1, all five small recoveries with #515 regression provenance, and #525/#531/#567. Root reports no more feature selection planned. The two QR-kind/TRON-network heads remain original parents in published history and exact source/test copies locally. Final combined gates and publication remain pending.

The remediation is implemented and composed into the current local head. Its isolated source passed all six package full-coverage/build/typecheck/lint gates: **660 tests in 27 files and 24 gates**, including24 ordinary wallet compatibility cases. Tested isolated source: `0d8e9cc57404409d676b1705282b0be8e785ec1b`; the final isolated delta was documentation only. **Combined qualification is in progress; final CodeQL is not yet observed.** Root independently reviewed all seven replacements and verified the source merge preserved C1 guards. `historical_review` is performing a second final-delta review; its final result is not yet recorded.

## Retained selection history

The union of local `a107d993c1aed73827d853924ea36036f083400f` and published `100de4006569ee1f65736adce8d111446dfafa59` retains **351 snapshot branch rows /347 distinct head SHAs**, including206 main-ancestor rows and main itself. Within code-different rows, **141 are local ancestors** and **144 are retained across the union**. The three published-only rows are the original QR primitive-kind head, the original TRON-network head, and the published PR611 tip itself. Both donor source/test sets remain byte-identical locally. Counts include aliases and integration branches and do not represent independent features or completed main integration.

| History | All branch rows | Distinct heads | Code-different rows |
|---|---:|---:|---:|
| Local current composition |348|344|141|
| Published PR611 |221|218|14|
| Union |351|347|144|
| Intersection |218|215|11|
| Published only |3|3|3|

## Mutually exclusive dispositions

| Disposition | Branches |
|---|---:|
| behavior_covered_local_candidate | 3 |
| coheld_code_open_prs | 23 |
| diagnostic_tooling_or_qualification | 5 |
| dormant_future_module_awaiting_qualification | 4 |
| evidence_only | 85 |
| exact_changed_code_equivalent_main | 7 |
| historical_residual_needs_semantic_review | 11 |
| included_head_open_pr611 | 2 |
| included_local_candidate_awaiting_gates | 141 |
| infrastructure_coordination_metadata | 1 |
| infrastructure_dependency_awaiting_review | 8 |
| infrastructure_deployment_history | 1 |
| integrated_main_ancestry | 206 |
| main | 1 |
| no_net_delta | 1 |
| open_pr611_combined_candidate | 1 |
| open_successor_covered | 119 |
| owner_qualification_or_duplicate | 3 |
| partial_recovery_open_pr611 | 1 |
| preserved_infrastructure_dependency_lane | 3 |
| production_intent_superseded_main | 12 |
| same_head_active_alias | 1 |
| unique_or_residual_awaiting_qualification | 56 |
| **Total** | **695** |

Mechanical census: 206 main ancestors, 85 evidence-only, 7 changed-code equivalent, 394 code-different, 1 no-net-delta, 1 unrelated deployment history and main. Of 394 code-different branches, 257 have exact open successors; of the other 137, 28 have all remaining changed-code blobs coheld in an open PR and 109 lack either structural coverage. Code equivalence concerns donor delta paths, not complete trees.

## New PR mapping

| PR | Head | Inherited code-different heads |
|---|---|---:|
| #605 | `73f521bad57c24e44fe5c69fbdeecd1d2da2fec1` | 4 |
| #606 | `f941ac01fd9464fc881266dcc2d2e1e530d5f15b` | 63 |
| #607 | `78193fca9477c297a62937e4cdd032fdb15772c4` | 2 |
| #608 | `0d3d804b3f53ad8b463117824ca1fd1b3332d798` | 3 |
| #609 | `00078ed6a2561e948fae50593ab9eb36d5f47be9` | 63 |
| #610 | `874d38097591624468ea19c77be3181c5a6e5b2c` | 1 |
| #611 | `100de4006569ee1f65736adce8d111446dfafa59` | 13 |
| #612 | `e580fcac85e1e7fc2a42a4c7ea7d5a581418aab8` | 63 |
| #613 | `17fa04b0ad4af4d88739bcffd9042d76d27c8237` | 63 |
| #614 | `9aff7941bdeec30c4ebeab10795da4df9903d08a` | 10 |
| #615 | `70970c3b739dcba51c0fb6cd0b1b75f73f6aae95` | 124 |

Counts exclude each PR’s own head and overlap. PR615 preserves 11 direct original donor heads; #515/#594/#601/#607 gained exact successor coverage. PR615 itself is now composed locally, still unmerged in main. Its title describes its earlier 686-branch comparison; this report covers 695 refs.

New evidence-only ref: `qualification/near-finished-20261124` at `fc92ba5386c36d0ec45aeb2066c698aab276628f`.

## CodeQL evidence and remediation

C1 `1a7447d58c08363209b6b9b67e9a6afad07d87f3` passed six normal workflows, but separate CodeQL check 138228881370 failed at 2026-11-24T04:58:49Z with seven new high-severity alerts. This remains the recorded failed result.

Public unauthenticated GitHub REST annotations were retrieved successfully. Previous connector failure meant unsupported endpoint, **not access denial**. All seven report polynomial regular expressions:

| Source | Line |
|---|---:|
| `packages/payment-uri/src/decimal.ts` | 55 |
| `packages/ux-connect/src/hex.ts` | 82 |
| `packages/ux-connect/src/hwsigner.ts` | 356 |
| `packages/ux-export/src/amount.ts` | 28 |
| `packages/ux-fees/src/amount.ts` | 79 |
| `packages/ux-fiat/src/decimal.ts` | 109 |
| `packages/ux-privacy/src/policy.ts` | 201 |

Six operations format trailing zeros on fractional strings already bounded to36,38 or77 digits by their existing guards; one classifies wallet messages. These bounds inform triage; scanner alerts are not proof of confirmed exploitability. No stress scenarios or vulnerability reproductions were performed.

Implemented and composed remediation replaces the operations with equivalent linear processing while preserving formatting, return errors, same-line semantics and message taxonomy priority. Root independent review confirmed C1 guards remain intact; final combined qualification and CodeQL are not yet observed. No suppressions, dismissals, policy changes or remote writes. The public response is preserved in `codeql-138228881370-annotations-public.json`.

## Source distinctions and remaining work

- #605 and #614 have competing QR vendor packaging. #605 is not ancestral to #614: earlier #581 uses CommonJS `vendor/jsQR.cjs`; newer #581 uses ESM `src/vendor/jsqr-1.4.0.mjs`. The package difference is 15 files, 426 additions and 427 deletions. Preserve useful dense-QR/version-23/provenance regressions when choosing canonical packaging.
- All nine previously flagged small fixes (#407/#439/#470/#475/#479/#483/#484/#498/#432) are now original-head ancestors of the local composition. Their JSON evidence remains; they are no longer missing from selected source.
- #594 duplicate canonical locales and original #567 canonical-array snapshot are now composed. Root resolved #567 to exact donor source with prior tests retained. Full old #270/#275 stacks are not thereby adopted.
- #409 is superseded by #458; #419 by stronger #422; #416 countdown/Unix behavior is represented by C1 and its older parseUnits hunk by #301. Different blobs alone do not prove unique behavior.
- Selective deployment-date, RPC-bounds/credentials and plan-only refund reservation repairs remain included. Full refund lifecycle, settlement-policy and merchant-refunds modules remain unactivated.
- 69 code-different branches have no open PR. Eleven historical residual stacks retain semantic qualification needs. Coordination metadata and unrelated deployment history are not application merge sources.

## Files and verification

- `branch-disposition-latest.json` and `.csv`: all 695 exact-head rows, original-head selections, current overlays and manual provenance.
- `branch-census-695.json` and `branch-ref-snapshot-695.json`: authoritative refreshed 695-ref inputs.
- `open-pr-snapshot-356.json`, `pr615-public.json`, `disposition-expanded-695.json`: PR and ancestry/coholder evidence.
- `branch-census-latest.json` deliberately remains the frozen 693-ref input; equality against that older file alone is not expected.
- `additional-bounded-runtime-candidates.json` records the nine fixes now locally included; the older 144-entry small-runtime scan remains historical triage, not semantic approvals.

Original ownership analysis is unchanged: `07a6a6a4908dba82be4bdc2c2bd929cbbd082225418b69e6e571c1089d30c70c`. Counts and every branch name/head are validated against the combined 695-ref inputs. No repository/source/ref or remote changes were made by this report worker. Qualification outcomes are attributed to their owning workers.

This is complete structural accounting plus bounded manual review, not a full semantic audit of every historical stack. Remaining valuable work is not declared exhausted. Open successors and local candidates remain distinct from main integration. Final hosted results must refresh the overlay without erasing frozen evidence.
