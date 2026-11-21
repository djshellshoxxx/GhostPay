# GhostPay unique-work archaeology — generation 1

Observed 2026-11-19. Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Selected application baseline: PR #278, `c993bb2340942c85dbf10303b61f69a91c4944e0`. This report concerns source uniqueness and preservation, not a release approval.

## Result

Five recently published fixes add distinct behavior missing from the selected candidate. The coordinator reproduced the failures and integrated their original production commits with attribution. No additional Pages runtime change was proven necessary in the other prioritized current consolidation branches. Several contain separately useful tooling, documentation, or deferred non-EVM/policy work; those must remain preserved rather than be merged wholesale.

The selected #278 candidate already retains the original #269, #270, #274 and #279 heads by ancestry. Its newer recovery, network authority, request cancellation, scanning and transaction safeguards must remain intact.

## Complete mechanical census

- **299 live branches**, from `git ls-remote --heads origin`, captured at `2026-11-19T23:33:07.716782+00:00`.
- **177** branch heads are ancestors of main.
- **32** additional branch heads are ancestors of candidate #278.
- **89** related branch heads are not ancestors of either target; those are not 89 missing features.
- **1** unrelated-history branch is `gh-pages`, retained as deployment history.
- **282** PR heads are available locally. Connector search returned only 260 PRs; individually reading the 22 missing numbers completed the metadata inventory.
- Complete PR snapshot: **73 open, 67 merged, 142 closed without merge**. PR states were sampled and can change.
- No tag refs were present in the freshly fetched clone.

`branch-summary.json` records all 299 exact branch heads, ancestry, divergence, patch counts, prior dispositions, selected direct source comparisons and remaining scope. `branch-inventory.json` retains the larger path/commit/blob evidence. `pull-request-complete-inventory.json` records every discovered PR and its current head/state. The prior 287-branch ledger and 292-branch delta remain preserved separately.

These counts are a complete ref/patch census, **not 299 fresh semantic audits**. The semantic classification field is null for branches not individually reassessed. Historical dispositions remain dated. Ancestry proves retained history, not that every historical behavior survives later edits. Patch equivalence does not prove runtime equivalence. Current CI for every historical branch was not re-run or freshly certified by this worker.

## Five verified unique runtime changes

For every row, the candidate production blob exactly matched current main before integration; the proposed source blob differed. Full Git blob identities are in `narrow-fix-source-evidence.json`.

| PR | Behavior absent from candidate | Integrated production commit |
| --- | --- | --- |
| #280 | Runtime build-profile values other than explicit `full` and absent/full overrides fail closed to lean | `50b790d5` |
| #281 | A scan covering less than the available 30-day window marks the displayed privacy counts partial | `ae303a91` |
| #282 | Stored merchant signer-pin JSON rejects duplicate member names using the existing strict parser | `82d7f89c` |
| #285 | Unknown or inherited QR payload/frame classifications reject rather than produce undefined or misleading categories | `b9e7940d` |
| #289 | Public base64url decoding rejects non-string runtime inputs with the fixed decoder error | `17467d9a` |

Coordinator verification reported actual repository baseline RED (six failing test cases) and focused GREEN (73 web cases and five base64url cases). This worker independently established source necessity and inspected all five production/test diffs; it did not execute those runtime suites. The duplicate-signer variants in #282 exceed the prior 128-character storage cap, so the shorter duplicate-`v` case provides the meaningful baseline failure for that change.

## Important deduplication findings

| Source | Disposition for this beta candidate |
| --- | --- |
| #262 `40b64e8f` | The application source from `c7e09bc7` is retained. Three commits ahead comprise a main reconciliation and two documentation/evidence commits. Preserve historical evidence; no product remerge. |
| #267 `57dff1ad` | Portable-hosting source and tests are byte-identical to candidate. No missing timestamp/HTTP validator behavior remains. |
| #264 `bf510471` | Do not merge wholesale. Its network-authority file would remove current payment-key-export method/address binding and monotonic grant sampling. Its strict network-selection requirement is already represented. Remaining policy, BTC, Solana, TRON, deployment and nightly differences need their separate scopes. |
| #249 `c17e5c38` | CSP enforcement is retained. Candidate has a stronger TypeScript AST sink scanner; the older comment-stripping scanner must not replace it. |
| #251 `3ae0b4f6` | Remaining Settings tests assume an obsolete Direct fallback for unacknowledged profiles. Candidate explicitly blocks those profiles and adds saved/session-only coverage. |
| #250 / #271 | Five historical adapter blobs match exactly. Candidate RPC source adds `credentials: omit`, `no-referrer`, and `no-store`; retaining it preserves the stronger behavior. Extra TRON qualification remains outside beta scope. |
| #218 `b1327d4d` | Twenty-six touched product blobs match. Candidate relayer client has stronger bounded requests, cancellation, padding and error-class controls; invoice handling distinguishes missing-signature and unavailable-verification failures. Older files are not drop-in improvements. |
| #211 `a92658b1` | Candidate has newer checkpoint v4/session guards, private scan cancellation and clipboard cleanup. Remaining policy/non-EVM differences are outside lean scope. A distinct focus-scope browser assertion exists, but exercises already implemented focus behavior and needs current fixture qualification. |
| `claude/lucid-meitner-apalzc` | Candidate quote handling has stronger runtime type/price/decimal checks and sequencer/reference validation. Candidate sink scanning uses AST. Deferred pool changes remain separate. |
| #260 `f3bb7c66` | Six touched product blobs match. Remaining AppShell differences predate stronger idle/network/recovery safeguards; browser differences use the authoritative public-export fixture. |

### Multiple merge bases matter

Candidate #278 and final #262 have **two** best common ancestors: main `c977b5d6` and application checkpoint `c7e09bc7`. A plain triple-dot diff can pick main and misleadingly enumerate hundreds of already represented source files. Use `git merge-base --all`, right-only commit inspection, patch IDs and direct final-tree blob comparison together. The census stores all available merge bases for non-ancestor heads.

## Preserved actionable work beyond runtime deduplication

1. **#261 integration-lease CLI and tests:** `scripts/automation/integration-lock.mjs` and its tests are absent from #278. This is genuinely separate developer tooling, not a missing payment feature. Qualify in its own scope before integration. The live metadata control branch itself must never be merged into application source.
2. **#209 release/nightly tooling:** release CI Anvil parity tests, additional scheduled suites and deployment-image maintenance remain distinct. They need isolated workflow validation and scope review; no workflow was activated or changed here.
3. **Deferred non-EVM, policy, relayer and pool branches:** preserved as source history. They are not justification to expand the static EVM beta.
4. **Historical documentation/evidence:** retain original refs and source identities. Do not recast an older source's green receipt as qualification of the new candidate.
5. **Dependency/action updates:** major and minor updater branches remain separate candidates. No dependency downgrade or blanket upgrade was recommended from commit-count differences.

## Successor guidance

The root checkout is `/workspace/scratch/0a7bc3583588/GhostPay`, branch `integration/ghostpay-continuous-20261119`. Last observed root head was `a080c2db` after the five fixes and lint-fixture repair; refresh it before use. QA and security have separate owned tasks. Do not restart their work or replace their current files with old branch versions.

Before any further extraction, refresh live main and exact source refs, check the source-specific changed paths against current candidate, establish a failing behavior or clear tooling gap, and run the relevant tests. Keep whole-branch merging separate from selective recovery. No main merge, publication, source-PR closure or branch deletion was performed by this archaeology worker.
