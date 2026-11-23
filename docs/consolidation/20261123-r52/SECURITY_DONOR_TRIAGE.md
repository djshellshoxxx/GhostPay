# GhostPay R52 — uncapped security donor triage and source-proof validator

Checked at **2026-11-23T01:04:26.412Z UTC**; baseline main `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Source pinned to these immutable donor commit SHAs (not branch names alone):
- `repair/ghostpay-native-fee-recovered-20261119` → `cbc96840c3dc4fede90afff55b4dfd94f66784da`
- `codex/ghostpay-export-authorization-20261119` → `b0abb726c138ad1df2f03b7b102c9bd9de318887`
- `repair/ghostpay-analyzer-recovered-20261119` → `e4d54a6829fcc861de7af1669c0e0f64f62aa137`
- Recovery owner PR [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) at `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`.

## Completed independent structural proof

Fetched each *complete recursive Git tree* (4,638 / 4,539 / 4,697 blobs respectively; each API tree explicitly reported `truncated:false`) and the complete #372 recovery tree (5,762 blobs, `truncated:false`). Compared exact path-to-Git-blob-SHA maps. Historical compare endpoints' capped changed-file totals were **not** used as proof.

| Donor | Paths absent from #372 | Differing shared-path blobs |
| --- | ---: | ---: |
| Native fee | 11 | 216 |
| Export authorization | 11 | 219 |
| Analyzer recovery | 14 | 222 |

The **same eleven donor-only paths have precisely matching blob SHAs across all three donors**: `apps/relayer/src/{hardening,privacy}.test.ts`, four `packages/cli/src/{global-switches,observation-input,reconcile-stored-only,untrusted-echo}.test.ts`, `packages/confidential-contracts/contracts/mocks/ReturnBombStealth.sol`, `packages/relayer-guard/src/limiter.abuse.test.ts`, `scripts/contract-analysis/mythril-disposition-check.mjs`, `scripts/tests/mythril-disposition-check.test.mjs`, and `scripts/tests/policy-predeploy.test.mjs`.

The analyzer-recovery donor adds **three** paths absent from both siblings and #372: `packages/contracts/scripts/capture-mythril-evidence.py`, `scripts/tests/mythril-completeness.test.mjs`, `scripts/tests/mythril-evidence.test.mjs`. The latter two contain synthetic fail-closed regression fixtures; these do **not** establish actual symbolic analysis coverage or resolution of previously reported Mythril findings. The disposition-check script explicitly identifies itself as **UNWIRED**, states that counting JSON documents cannot establish which contracts ran, and does not authorize relaxing the strict Mythril gate. The passive capture script attempts to pin five targets, source/compiler identities, raw outcomes, and per-target completeness sidecars. It needs owner review, integration into the actual runner, runtime testing, and an independent security assessment before any security qualification claim.

No donor received a whole-branch finalized disposition. Path overlap between the three donors **does not prove** the 216–222 differing shared blobs redundant, nor does it prove the 11/14 absent paths should all be introduced into the current browser-only product. Non-Pages CLI, relayer, contract and analyzer code must not widen the Pages beta; recover evidence tooling on a separately owner-approved branch if warranted. Security gates remain red until genuinely qualified.

## Validator engineering

Existing PR [#471](https://github.com/djshellshoxxx/GhostPay/pull/471) owns `scripts/consolidation/validate-ledger.mjs` and its tests. Added regression cases **first** at `c55df6267d9ce52b0fb4d42aa45f25b4aa11023c`, then fail-closed source fixes at `1ec20c8dc9a35f431a8df69e0eeb33d97d12e491`:
- A claimed new branch must exist at exactly the named SHA in the census; duplicates are rejected.
- Advanced-head provenance must name an inventoried branch, give the current SHA, and show a different valid prior SHA.
- Prior-finalized + newly-finalized accounting, when present, must match the actual count of finalized records.

Three new Node test definitions cover positive and negative cases. This is *tooling code*, not a payment feature or security-gate modification. Native Node tests had not executed in the connector-only executor when the commits were created; exact-head hosted CI must be checked. Do not count historical successful R51 CI as qualification for R52.

## Scope and ownership

The generation-11 integration lock is still `held` by another coordinator, commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; expiry alone does not transfer the lock. Recovery #372 owns security/recovery implementation. New BUG-only PRs #487/#488 are owner-held. No main merge, feature deployment, contract policy change, funds interaction, branch deletion or force push was performed.

## Next nonconflicting action

Ask #372's current owner to reconcile the three unique evidence-capture files against the actual Mythril runner and current CI without suppressing findings; qualify the tests on an isolated owner branch. Continue semantic reconciliation of the 216–222 differing shared paths, prioritizing actually unique, safe Pages-beta functionality. Re-census all branches and PRs after any further publication before claiming an exhaustive final state.
