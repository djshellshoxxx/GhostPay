# Read-only evidence tooling recovery — 2026-11-24

## Candidate and source pins

Both bounded units are eligible for independent integration review. No intrinsic source blocker was found for their documented contracts. The branch is `integration/readonly-tooling-recovery-20261124`, based on `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` / tree `8add357748674afb128926a797982badb54bac6b`.

- Claim before source edits: `632a6904ed60196c89cc7f5000a77b83eaf6d499`.
- #358 bounded recovery: `c3d15bec` (full identity in the qualification receipt), from original head `c9e53c2c5908cbb64c104d096ce84773cf804ccc`.
- #468 bounded recovery and tested combined source: `90415efdbc9af2db3537148f4702e8f8f5791815`.
- Tested tree: `dbe3c892f9206942d2a5362bf0fd68902ffc448c`.
- #468 original head: `cb63ec21cbac15b0a665b61ada37a9f0662ff79a`.

This handoff and its adjacent qualification/archive are documentation-only additions after the tested source. Only five exact donor source/test blobs were recovered. The whole historical branches, historical census reports, analyzer findings, workflow changes and unrelated product stacks were not merged. Original donor refs are unchanged.

The clean completed portable-keystore worktree was reused. Its old branch remains at `20d12d860bed893d1c29215ea4f4131bdc75a5d7`.

## #358: useful exact-object comparator; explicit input boundary

Recovered unchanged:

- `scripts/coordination/reconcile-claims.mjs`
- `scripts/coordination/reconcile-claims.test.mjs`
- `scripts/tests/reconcile-claims.test.mjs`, which imports the canonical suite for existing CI discovery

The tool distinguishes ancestry from exact blob/mode/type postimages, represents unrelated/multiple-base history without inventing an empty successful delta, retains raw claims without interpreting authority, records snapshot drift and changed-path overlap, and works from pinned commit objects instead of mutable refs. It requires a full clone with the named objects; replacements/lazy fetching are disabled and shallow/grafted history is refused. It does not fetch, mutate Git refs, merge, dispatch CI or decide qualification.

`scripts/coordination/RECONCILE_CLAIMS_INPUT_V1.md` documents the existing canonical input contract, output semantics and resource boundaries. The 64-MiB cap applies to each Git subprocess output, not to the entire input or generated report.

**The current refresh/2 format cannot be consumed directly.** Its `{ branch, head }` refs, capture timestamp and changed-ref analysis do not supply the comparator's complete canonical PR rows or integration target. The later unversioned final-ref snapshot has the same boundary. Both actual current files were checked against `validateSnapshot` and rejected before any Git comparison. A meaningful live invocation requires an explicit normalization step with complete, separately captured PR provenance, accurate endpoint observation times/counts and the exact captured open integration head. A PR's `updated_at` is not an observation timestamp, and missing states or heads must not be invented. No adapter or new full-census replay is claimed here.

This is a concrete caller-integration boundary, not a blocker to retaining the useful standalone comparator under its canonical contract.

## #468: useful offline summary; no identity or clearance inference

Recovered unchanged:

- `scripts/audit/mythril-evidence.mjs`
- `scripts/tests/mythril-evidence.test.mjs`

The 8-MiB helper accepts five well-formed report objects, rejects malformed/count/severity/location cases and emits a small selected field set without descriptions, traces or arbitrary issue properties. Findings remain open. The exact five-target order was compared with current `packages/contracts/scripts/run-mythril.sh` and matches.

`scripts/audit/MYTHRIL_EVIDENCE_CONTRACT.md` makes the limits explicit. Target labels are positional, not authenticated identities. Five reports could include a substituted/duplicated target without the helper being able to establish identity. `complete: true` refers to count and parsed shape. The legacy `clean` verdict/exit 0 means zero reported issues in those accepted objects; it does not prove a successful analyzer exit, complete symbolic exploration, source/bytecode identity, artifact authenticity or security clearance. Ignored diagnostic lines are not a success decision.

The current runner, its abnormal-exit/finding assertions and all CI gates remain untouched. There is no new workflow invocation of the summary helper and no actual analyzer execution. The original helper output, exit codes and test assertions were preserved.

## Actual qualification

Local environment: Node `v24.22.3`, Git `2.56.1`, existing `jq`. No installation was performed.

| Check | Actual result |
|---|---|
| Original canonical reconciliation suite | 13 passed; 0 failed/skipped |
| Existing CI entry + summary suite + current offline runner suite | 37 passed; 0 failed/skipped |
| Breakdown of those 37 distinct cases | 13 reconciliation, 5 summary, 19 preexisting runner |
| Syntax checks for all five recovered `.mjs` files | Passed |
| Current refresh/final-ref rejection and current runner target-order compatibility | Passed |
| Product diff whitespace | Passed |

The 13 canonical cases were exercised again through CI discovery; they are not counted twice. The runner suite supplies its own offline synthetic `myth` executable. Passing it is not Mythril/native execution. Required Node 22 hosted qualification remains a distinct gate.

Independent preservation checks found all **4,402 preexisting entries** unchanged except the additive ownership record; the original record is an exact prefix. All **985 preexisting test/spec paths** remain unchanged. Entire `apps`, `packages` and `.github` trees are identical to the base. The five recovered files match their original donor mode/type/blob entries exactly. Root manifests, lockfile, dependencies, current source guards and existing workflow assertions are preserved.

The existing scratch evidence packager and selection file still match their previously inventoried hashes. No edits were made to root/followup/main worktrees or refs, other owners' branches, or remote state.

## Evidence and next gate

[QUALIFICATION.json](readonly-tooling-recovery-20261124/QUALIFICATION.json) retains the full source pins, commands, exits, original log hashes, preservation receipt and limitations. [run-logs.tar.gz](readonly-tooling-recovery-20261124/run-logs.tar.gz) contains nine original logs and the small ordinary contract-check script. All ten members were read back and hash-verified. Archive SHA-256: `c9610137fc3dbc48273066c4c8185c5000a6f5092be4bdadc8c21962620d9225`.

The coordinator owns independent source review, publication and exact-head hosted gates. No main merge, release, analyzer success, finding clearance or live-inventory completion is asserted by this candidate.
