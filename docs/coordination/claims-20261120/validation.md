# Reconciliation validation and limits

Source cutoff: **2026-11-20 18:52:23 America/Los_Angeles / 2026-11-21 02:52:23 UTC**. Frozen main: `aec179910c39081d820396409ff3139ff2264132`.

This validates the inventory, evidence joins and bounded claim dispositions. It does not qualify a GhostPay product branch, prove end-to-end recovery, or authorize integration.

## Executed verification

| Verification | Actual outcome |
| --- | --- |
| Paginated live inventory | Initial pages: branches 100/100/100/100/20, PRs 100/20. Final pages: branches 100/100/100/100/23, PRs 100/23. All original heads and main unchanged; three additions explicitly included. |
| Immutable source comparisons | All 423 refs and 123 PRs accounted for, with all 437 required commit objects present. Main, donor and target operands use full commit IDs. |
| Full changed-path evidence | 68,171 donor path-state entries retained. Independent initial review covered 64,073 entries; final delta review covered the additional 4,098. No 300-file truncation. |
| Current versus advertised target bases | All 123 current-base diffs and their advertised-base provenance retained. 76 target metadata mismatches identified; current comparisons use the frozen target branch tip. |
| Overlap accounting | 5,025 pairs share a changed path: 746 have non-document overlap and 4,279 overlap only in documentation. This does not prove a merge conflict. |
| Patch evidence | Real `git patch-id --stable` over 1,848 non-document commit patches from 3,427 nonmerge commits. Empty documentation deltas never imply implementation equivalence. |
| Independent reproducibility | Original full dataset regenerated with one worker versus four: byte-identical three JSON outputs. Generator unchanged for the independently checked three-ref extension. |
| False-positive controls | Isolated 12-branch/3-PR fixture passed: squashes, patch later reverted, nonancestor exact content, docs-only empty patch, main-only additions, 305 paths, metadata/publication refs, advanced/retired parents and stale advertised bases. |
| Registry source verification | Root independently reconstructed all 14,210 section occurrences from 418 pinned Git source versions. All 506 unique text hashes and 507 record identities reconciled; all 168 absent registries verified absent. |
| PR qualification evidence | 123 PR/head mappings exact; 4,064 reported checks preserved, with 3,994 selected and 70 explicitly excluded older/alternate-context records. All 123 latest status contexts and 10 review submissions retained. No formal approvals observed. |
| Remaining-content coverage | 79 preserved source rows: original 76 plus three cutoff additions. All 78 currently mechanically unresolved refs are covered exactly; now-contained #352 retains its original review. Every row has a source pin and next action. |
| Historical ledger corrections | Separate source reviewer approved three precise reason corrections and the historical banner. Original source SHAs, result fields and historical test records preserved. |

The machine receipts are [independent-validation.json](independent-validation.json) and [assembly-validation.json](assembly-validation.json). The former retains the original full review and the final delta review separately. The latter records root's independent source-text reconstruction and cross-artifact accounting. The original source snapshot remains available to reproduce the initial receipt hashes.

## Commands and method

The source generator was executed against the saved inventory with Python's standard library and a local full Git mirror:

```sh
python docs/coordination/claims-20261120/build_branch_ledger.py \
  --snapshot docs/coordination/claims-20261120/source-snapshot.json \
  --git-dir /path/to/GhostPay.git \
  --output-dir /tmp/ghostpay-branch-reconciliation \
  --workers 4
```

Independent checks used `git merge-base`, `git rev-list`, `git diff --no-renames --name-only`, `git ls-tree`, `git show`, `git cherry`, object/mode comparisons, JSON accounting and SHA-256 digests. Source statements were inspected at their frozen commits; meaningful historical patch matches were kept separate from present content and functional acceptance.

PR checks were read through paginated commit check-run/status and PR-review endpoints. The first 120 PR observations retain their 02:26 UTC timestamps; the last three were observed at 02:53:46 UTC. Those are reported hosted results, not tests run by this reconciliation. The current-context selection retains excluded evidence and never removes a job merely because it failed.

## Scope limits

- No product unit tests, builds, browser suites, live-chain transactions or external acceptance checks were executed by this reconciliation.
- Bounded semantic review verifies named claims and priority source families. It is not a complete behavior audit of every changed file in historical or broad integration branches.
- An ancestor, a matching patch ID, a matching changed-file state, or a successful observed check does not establish full current feature acceptance.
- Existing owners and the integration lease remain authoritative. No registry absence, old claim or expired lease releases ownership automatically.
- The report's eventual publication is a documentation operation. It does not merge a product candidate, change runtime code or CI policy, dispatch a workflow manually, delete a branch, release or deploy.

Future source or CI observations must be appended as a new observation phase. Do not silently replace these source pins or copy historical green checks onto another commit.
