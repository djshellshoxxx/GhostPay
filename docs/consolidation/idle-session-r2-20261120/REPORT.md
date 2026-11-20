# Sleep-aware idle-session recovery on the current Sweep candidate

## Outcome and source

Recovered the accepted GP-PAGES-04 completion from [PR #256](https://github.com/djshellshoxxx/GhostPay/pull/256) onto [PR #325](https://github.com/djshellshoxxx/GhostPay/pull/325). The normal merge retains both histories and preserves the newer backup-operation and Sweep authority protections. The application is locally qualified by the focused checks below; full-suite, build and hosted promotion gates remain separate.

| Source | Immutable identity |
| --- | --- |
| Current integration base | `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a` |
| Narrow idle donor | `e2ebb4902e53e2249c6585a1d72be6e1e416c36c` |
| Ownership claim | `178c09317c6f456b9f819fa15631595c31cacd37` |
| Tests before runtime | `c13ee784410771dc56d818fd96ac684deba2ccc3` |
| Independently reviewed/tested product | `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4` |
| Product tree | `a349e60b012bff674530933088ed16196d701d22` |
| Subsequent two-row guidance correction | `2605e1bf7a8528b0ccbf66161a17fcdf7298e541` |

The product merge's parents are the tests-only checkpoint and the final donor. The older broad #238 feature branch was not imported. This report and the guidance correction are documentation children; they do not alter application, test, dependency or workflow bytes after the reviewed product.

## Behavior and reconciliation

The recovered code checks wall and monotonic deadlines together, binds timers to their owning session, rejects retired callbacks and checks expiry before protected operations and awaited continuations. At expiry it synchronously invalidates ordinary key authority and pending operations. It preserves potentially sole-copy keys only for the existing encrypted backup/verification recovery routes until normal import or vault unlock. Retained private checkpoint caches also lose authority; stale key-lending snapshots are rejected and temporary copies are wiped.

`AppShell.tsx`, `session.ts`, `keyVault.ts` and `scanCursorSlot.ts` match the reviewed narrow donor exactly. SellerKeys gains only the suspension subscription and visibility gates: the current `unlockBusy`/`vaultWriteBusy` separation and operation ownership remain intact. Current Sweep/helper guards, scan-tag scope, invoice behavior and dependency inputs remain unchanged. Each of the four locale catalogs gains exactly the four donor idle messages, preserving all previous key/value pairs. Their existing source-English/draft translation convention remains; no native translation approval is implied.

Only the additive ownership registry conflicted. Resolution preserves every nonempty line from both parents. Source blobs, parent relationships and preservation checks are recorded in `EVIDENCE.json`.

## Browser fixture correction

The donor's full and lean browser runs failed the same invoice-expiry message assertion. Their retained DOMs showed an empty Pay form and an inactivity-lock status: the fixture jumped the payer clock two hours, crossing the normal 15-minute idle deadline before clicking Send. The original later wallet/journal assertions did not execute and are not claimed passing. The donor's dedicated 11-case idle browser selection passed in those historical runs; that does not qualify this new composition.

The core journey now reads the signed invoice expiry, sets only the payer clock to five minutes before it **before app opening**, and advances to five minutes after it before Send. The ten-minute interval crosses invoice expiry while remaining within the unchanged idle limit. The existing Pages fixture uses the same isolation. Every original expired-message, no-submission, zero-wallet-request, empty-journal and expired-reopen assertion remains. The new candidate's two modified/default-profile specs collect **17 cases in each full/lean configuration**; no browser or server launched and no browser assertion executed locally.

## Independent review and executed local checks

A fresh `/root/idle_review_r2` reviewer approved immutable product `1ca7105e` before GREEN, with no blocking source finding. The review independently checked donor blobs, protected newer source, the whole SellerKeys operation-handler region, catalog union, ownership preservation and browser clock ordering. The nonblocking IDLE-R2-DOC-01 finding identified two stale live-guidance rows; the separate documentation child aligns them with the accepted verified-copy and suspended-recovery policy. The coordinator independently reviewed those two rows at `2605e1bf` and approved their wording; this final documentation checkpoint also corrects the guide’s relative link to the tracked `docs/user/session-security.md`.

| Check | Actual result |
| --- | --- |
| Existing-API RED selection at `c13ee784` | 10 controls passed, 18 expected behavioral failures, 40 cases filtered; no missing-export/import failure; 4.336 seconds |
| Complete affected GREEN selection at `1ca7105e` | **575 passed, zero failed/skipped across 26 complete files**; 117.064 seconds |
| Original full web TypeScript | Passed; 17.451 seconds |
| Original full web typed ESLint | Passed; 39.144 seconds |
| Original secret scan and base-range whitespace | Passed |
| Full/lean browser collection | 17 cases each; collection only |

The 575 cases cover 190 donor clock/session/vault/checkpoint/application checks, 305 existing Sweep/consent checks and 80 additional backup, archive, storage and tag-scope checks. These are disjoint files within this run. Earlier RED cases and historical donor results overlap and must not be added to that count. There were no retries, changed assertions, new skips, dependency changes or gate modifications.

The command and per-file result indexes are in `EVIDENCE.json`. Original output bytes are retained in JSON text wrappers under `outputs/`, with both original and wrapper hashes. Wrapping preserves trailing blank lines without introducing whitespace-only changes into repository files.

## Dependencies and remaining qualification

The existing Sweep dependency installation was reused without installation, copying or removal. Eight existing dependency and configuration inputs, including root/web manifests and the lockfile, plus the complete `packages/` source tree were verified identical to the prior dependency/build source. This is a reuse claim, not a fresh install or library rebuild. Local runtime is Node 24.22.3; hosted Node 22 remains a separate gate.

The coordinator scheduled the **complete original web coverage and no-coverage stages** next, with unchanged test selection/configuration/thresholds, followed by the original lean production build and postbuild scan. Those results are not yet claimed in this source checkpoint. They will be attached as separate source-pinned evidence so this source branch can remain frozen during hosted qualification.

Full and lean browser execution, Pages acceptance and hosted analyzer/security checks remain required before promotion. Local browser socket restrictions remain unchanged. No main merge, deployment, release, live-wallet operation or live-chain transaction is claimed by this worker. Persistent invoice/transaction retention, broader privacy branches, fee policy and contract changes remain outside this recovery.
