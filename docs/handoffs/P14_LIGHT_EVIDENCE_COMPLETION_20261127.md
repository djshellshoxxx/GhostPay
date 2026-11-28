# P14 light-source evidence completion — 2026-11-27 UTC

## Scope and source pins

PR: [#745](https://github.com/djshellshoxxx/GhostPay/pull/745). Branch:
`finish/core-branch-completion-20261127-d81a`. Base main:
`9ae770203d69d23bdc8735912dfe98af5944d4d6`.

This finishes an **already-integrated** P14 acceptance contract, not a unique unmerged
implementation. Original light-source implementation: `1fa557fffbc24b2f0966082d66e0b1644b3f8081`;
consolidation import: `aab4511b6cafe503189f00e26afd4fb763c32743`. Qualification source #658,
`claude/priv-t02-rpc-disclosure`, head `9aed3886693270524beb118685e5947469899c43`, records
F2 as unfinished. Current main's F1 ownership entry explicitly excludes F2–F4.

All 154 open PR heads were compared with main for the selected runtime paths; no source
overlap was found. Historical README edits concern PIR/padded-range documentation, not
the corrected light-client row. Donor and archive refs remain unchanged.

## Completed behavior

The wrapper previously set `integrity: 'proof'` from `LightClient.verifiesLogs`, despite
having no per-result inclusion-proof operation. It now reports `unverified` for either
capability value. Block-identity checks are retained. The original inner result object,
announcements, head, coverage and skipped count are unchanged; existing mismatch,
missing-header, inconsistent-header, source-disagreement and chain refusals remain.

Tests cover both capability values and inner integrity unverified/proof, before and
after fetch, plus all existing omission, altered-record, header and reorg cases. The
public compatibility field remains. No verifier, backend, contract, chain, dependency,
data format, wallet request, signing change or browser activation was added. Inclusion
and interval completeness remain unverified; this is not a privacy certification.

## Executed checks and independent review

Node **22.23.5**, npm **10.9.9**, original lockfile, lifecycle scripts disabled.
Runtime implementation: local `b4d65a51038d0e938362839f37c80819bfb6bc97`.
Independent test source: `e7eb25e4142c74ec33d09f364e21fbe739906c0f`, cherry-picked as
`0f7c88289f32d9811d1e0f5ac93de07ac4a0178a`. Published Git-data commits have matching
trees; verify the final local/published tree before advancing the task ref.

| Check | Actual result |
| --- | --- |
| Original-lock `npm ci --ignore-scripts --no-audit --no-fund` | Passed, 722 packages in full private worktree |
| Baseline `npm run build:libs` | Passed |
| Original `npm test -w @ghostpay/scan-source` | 121 passed, 10 files; coverage gates passed |
| Independent original focused baseline | 39 passed |
| Revised focused tests against original runtime | **4 failed / 39 passed**; all failures were the misleading proof label |
| Corrected complete scan-source test suite | **125 passed**, 10 files, no failures/skips; existing coverage gates passed |
| Scan-source typecheck, lint and build | Passed |
| Web `vitest run src/lib/scanDisclosure.test.ts src/lib/scanPrivacy.indexer.omission.test.ts src/test/rpcDisclosure.test.ts --coverage=false` | **69 passed**, 3 files |
| Web typecheck | Passed |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web` | Passed, including unchanged bundle scan |
| Secret scan and whitespace check | Passed |
| Independent review at local runtime commit above | No blocking findings; independently repeated 125 tests, typecheck, lint and build successfully |

Independent coverage: 98.64% statements, 95.45% branches, 100% functions/lines. The reviewer
confirmed that updated assertions replace the accepted defect while preserving useful
fetch/header behavior. Review was by a separate AI worker, not a professional audit or
human release approval.

All runtime tests used synthetic local fixtures. No real funds, remote RPC testing,
physical device, external wallet or live Tor qualification was performed. There is no
new reachable browser flow: the light-source factory remains unactivated in the app.
Local matching-Chromium download is blocked by the environment's CDN gateway; browser
setup smoke tests are not counted as GhostPay acceptance. Current-head hosted
browser/Pages/beta checks remain gates wherever triggered.

## Integration checkpoint

Exact published-head CI and integration are pending at this source checkpoint. The draft
PR is the live qualification record. Re-fetch main/source, resolve findings, verify all
applicable checks, acquire the cooperative lock, merge normally, and verify resulting
main before advancing. Record final published/merge SHAs and remaining checks in the PR's
integration handoff. Local results do not establish merge or release approval.

### Released lock metadata reconciliation

Generation-65 release `ba8eb74c7ab8a40251476a2f840b6caf8c383115` set expiration equal to
heartbeat/release, failing the unchanged stored validator. Its acquisition parent
`09172ab5efae51e565e561be1e67f9ef24ebeeee` recorded expiry
`2026-11-27T02:49:25.000Z`. Independently reviewed correction
`7f9c0bb4dc9e3fec21b09453a49de86b11c2bdb5` restores **only that field**, preserving the
released state and all ownership/release fields. It is a one-file metadata commit with
the prior release as sole parent, published non-force with the exact expected prior SHA.
Remote parent/tree/state readback and the unchanged validator passed. This grants no
ownership: a new valid generation is required for integration. Metadata history is
preserved and never merged into application branches.

## Resumable donor queue

Reuse the existing inventories. Discovery enumerated **838 remote heads**, **154 open
PRs** (2 pages), and **579 closed PRs** (6 nonempty pages plus an empty terminal page),
including **244 closed-unmerged PRs**. Sixty-one closed-unmerged sources had source/test
blob residuals; these are not automatic proof of missing behavior. All prior 723-branch
inventory `J-no-pr-residual-diff` entries were inspected.

| Candidate | Source SHA | Classification / next action |
| --- | --- | --- |
| Private durable scan journal #248 | `18b367457103fb1731a5b4ef5c51faa37a010e47` | **E/F:** missing private store/lifecycle and durable discovery, but FC-06 ownership remains unresolved and integration overlaps scanner/P1-LATE work. Await explicit handoff and architecture reconciliation. |
| Refund lifecycle `nodata/practical-johnson-e0fbpm` | `85cc394451313e24104ef7089379e720b4e70526` | **E/F:** unique lifecycle/settlement source is explicitly P0 Worker B owned; verifier/executor/provider contracts and user journey remain incomplete. |
| Timestamp retention #383 → #587 → #609 | #587 `19a11f90db0bcf84c94a0b883a310e103ce8878a`; #609 `00078ed6a2561e948fae50593ab9eb36d5f47be9` | **D/F:** newer explicit owner decision defers persistent vault timestamp cleanup beyond v1.0 beta; presentation retention is separate. |
| #319 SellerKeys operation completion | `627ab977c9cc4e5ebc682eda822cfe792cd76fc1` | **C:** superseded by #684; current main retains and extends its ownership tests. |
| #528 policy journal; #595 migration fixture | See prior source-pinned inventory and their closure records | **C:** integrated; do not reopen historical "nearly complete" rows. |
| #704 merge train | `69a4d3e17fc46833fb31c41cbab6aafeb0bfad9c` | **C:** integrated through #718; remaining differences are newer main additions. |
| #151 payment checks | `2527d6b9367887508d7d8f678a18564132652a03` | **C:** superseded by #203 and stronger final-send checks. |
| #664 FC round 1 | `d205fc30257a2da5e05d8b232d744a6f461305a2` | **C:** component PRs integrated; multipart label carried separately. |
| Pasted-invoice boundary | `b5045aec476833a5c87f1d733521dcd76e1843d1` | **C:** strict fragment/control handling represented; main deliberately retains HTTP(S) compatibility. |
| #603 minimal-sharing fixture | `2d612e37f3f71b785129f447c14731cbef9143c7` | **C:** anchored regex versus exact-string role query is equivalent. |
| #724, #728, #744 and related active lanes | Refresh live heads before next work | **E:** active ownership; preserve source branches and claimed paths. |
| Ten stopped workstreams / 34 frozen archive refs | Current owner directive | **D:** preserve; no feature-specific completion, activation or merge. |

Historical local product/CLI checkouts were untouched, including the dirty detached
accessibility worktree. Commits absent from stale tracking refs are not called
unpublished: their handoffs record equivalent-tree publication through #92/#93.

Next independent question: P14 F4's truthful `caughtUp` result is explicitly unclaimed,
but shares `scanClient.ts` with active scanner work; recheck exact regions and ownership.
This is not exhaustive semantic clearance of all 838 branches or all privacy requirements.
