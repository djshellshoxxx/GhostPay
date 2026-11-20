# Validation and closure

**Final scope: 991 unique path/blob versions across 770 paths, 222,767 version-lines, with zero pending source, resource or test/support versions.** This validates the recorded static review and its accounting. It does not claim executed tests, generated-artifact verification or a live deployment assessment.

## Independent checks

The original accounting pass and the final independent pass are retained in [audit-accounting-validation.md](audit-accounting-validation.md) and [final-audit-validation.md](final-audit-validation.md), with corresponding machine-readable JSON records. The original pass is a historical snapshot; its then-pending assignments have been completed.

The final pass checks immutable commit/path/blob mappings, actual ref memberships, independently recomputed Git blob hashes, line counts, complete ranges, coverage evidence references, complete-diff lineage, composed English ranges and canonical source-link bounds. It also reconciles the final branch extension and the single source/test overlap. Every selected version has accepted full-read or explicit full-baseline/complete-diff evidence. The final report records exact query/check counts and input hashes.

Canonical findings retain seven production issues, four Medium and three Low. Test harness issues, weaker-than-described assertions, qualification limits, known hardening and maintenance observations remain separately classified. The existing Pay route regression correction and the additional receipt-help wording remain under their original finding IDs.

## Accounting findings resolved

| Independent review item | Resolution |
|---|---|
| ACCT-01: ambiguous early root read method | The 54 historical records deduplicate to 42 pairs. Five have separate explicit full-read evidence. All other 37 were freshly reviewed in round 8: 27 full reads and ten complete diffs rooted in identified fresh baselines. Generic historical attestations are superseded for final credit. |
| Final AppShell counterpart ambiguity | A separate 551-line quick-hide AppShell version received a fresh complete read in round 10. Its old ambiguous diff record is superseded; no parent was guessed. |
| ACCT-02: prose in six portable-vault ref fields | Replaced with exact verified frozen-ref memberships and retained the descriptive text as a scope note. |
| ACCT-03: stale consolidated and repo copies | Regenerated the final ledgers, both empty pending lists, manifests and repository copies from all completed successors. Historical report banners identify their former pending lists as checkpoints. |
| ACCT-04: combined-total overlap | Subtracted the 46-line ERC5564Announcer path/blob shared by production and test/support categories. Category memberships total 992; distinct versions total 991. |
| ACCT-05: evidence preservation | Preserved browser review_method, notes, source pins and exact report selectors. Included explicit full-read context/supplemental records. The reconciler's output is corroborated by independent identity, range and lineage validation. |

The English baseline is covered by disjoint root/successor ranges totaling 2,530 lines; all three variant diffs were read completely. The final hosting dependency closure and four required fixture/helpers are complete. Optional I2P and interactive-wizard commands remain excluded by the documented call-path scope; unrelated older hosting test variants are not silently represented as reviewed.

## Read-only boundary

The audit changes only `docs/audits/blue-team-2026-11-19/**` and its own entry in `docs/ai/ACTIVE_WORK.md`. Source review used immutable Git objects. No application/test/configuration/dependency edits, target test/build execution, servers, probes, wallet actions or transactions were performed.

The branch publication attempt was rejected by automatic approval review and was not retried or bypassed. The completed local notes branch is the reviewable publication artifact. No release, main-branch merge or deployment was performed.
