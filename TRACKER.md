# SECONDARY coordinator tracker (GhostPay)

Coordinator id: SECONDARY. Shared claim registry: `origin/automation/ghostpay-work-claims` (`claims.json`, non-force CAS
push, created by PRIMARY 2026-11-28T02:08Z). Integration lock: `origin/automation/ghostpay-integration-lock`
(`integration-lock.json`, generation counter, non-force CAS push).

## Baseline (2026-11-28 ~02:10Z)

- main `b890a766` (#759). Hosted checks on main: 32/32 success (per #380 checkpoint 02Z).
- Integration lock: generation 77, released.
- Local env: /workspace/GhostPay (detached at main), `npm ci --ignore-scripts && npm run build:libs` OK. No Foundry
  (forge/anvil absent) -> contract and anvil-gated tests cannot run locally; report as SKIPPED, never passed.
- Push to non-`claude/` refs works (claims push to automation/ghostpay-work-claims succeeded).
- Backup: tracker + reports + helpers pushed to orphan branch `origin/secondary/tracker` (`/workspace/secondary/sync.sh`).

## Ownership map (who owns what; treat as unavailable)

| Owner | Scope / paths |
|---|---|
| PRIMARY P-COORD | docs/beta/FEATURE_COMPLETION_TRACKER.md; final stress test, code audit, bug audit, release qualification |
| PRIMARY P-M1 | Sweep.tsx direct review/signing, lib/sweep.ts directSweep, opStackFee.ts, sweep locale keys, docs/user/sweep-and-gas-privacy.md |
| PRIMARY P-M2 | state.tsx sweep lock, sweepAttemptJournal.ts |
| PRIMARY P-M3 | CreateInvoice.tsx result invalidation, useInvoiceDraft.ts |
| PRIMARY P-M4 | manifest.ts, deployment.ts, DEPLOYMENT_MANIFEST.md, deployments/README.md |
| #766 codex tooltips | 57 web files: all views, many components, 4 locales, help/privacy html, app.css |
| #762/#764/#742 audit owner (Claude session 01Tj2Ycz...) | Pages workflow/scripts, pagesOrigin, manifest/wallet origin binding, AppShell masking, WalletDisclosure, Pay.tsx, reconciliation-portable.ts (LATE-L1), LATE-M1 (claimed, redo pending), ERC-20 qualification |
| #763 / #468 | Mythril dispositions (contracts tests) |
| #765 | scripts/stress/* |
| #761 | PrivacyControls donor-300 tests |
| #753 | ERC-20 Pages qualification e2e |
| #726 automation bug rounds | packages/ux-flow reconcile tolerance |
| #720 (draft, 11/26) | router payERC20WithPermitAndBuffer + L2-I4 (contracts, chain-adapters, tx-review) |
| #678/#653/#643 | confidential-amounts / light-indexer / metadata-hardening (non-shipped packages) |
| #639 | README.md + package READMEs (docs housekeeping, draft) |
| #722 | docs/user beta exclusion notice + ar/es/ja locales |
| #380 ChatGPT ledger | docs/consolidation/autonomous-20261121/* hourly checkpoints |
| HELD | #371 #621 #614 #592 (stopped-product mixes) |

## SECONDARY claims

| Claim | Status | Branch | PR | Notes |
|---|---|---|---|---|
| S-COORD | active | — | — | read-only analysis A1–A4 |
| S-REV-I6 | active | secondary/journal-headroom/rev-i6 | — | worker sthr_01BBwZJC3BquB2aMJkvVmZgY; + REV-I5 row correction |
| S-SCAN-ROUTE | active | secondary/scan-route/route-snapshot | — | worker sthr_01FCt1pJYhKcEoZZk2Y67WTw (A1-C3 + A1-C1) |
| S-DOCS-ACCURACY | active | secondary/docs-accuracy/recovery-privacy | — | worker sthr_01MvMaTZxmKogmZVKbm8izey (A4 groups 1-3) |

## Workers

| Thread | Role | Task | Output |
|---|---|---|---|
| sthr_01BBwZJC3BquB2aMJkvVmZgY | engineer | S-REV-I6 | PR (draft) |
| sthr_01MtnUFj5nZ4Z62jqV5n8z7o | analyst | A1 findings census | DONE reports/A1-findings-census.md |
| sthr_01FCt1pJYhKcEoZZk2Y67WTw | engineer | S-SCAN-ROUTE | PR (draft) |
| sthr_014DKKprbq9PCmsmt5z2wt7H | analyst | A2 branch dispositions | DONE reports/A2-branch-dispositions.md: no unique unowned in-scope code since 11-24; C1 (#544 idle property test) and C2 (#632 e2e) need owner agreement |
| sthr_01T3BKy1k9o8bn56ghpp73hG | analyst | A3a core-crypto/secret-box/address-safety | RESUMED ~02:45Z |
| sthr_013jpfgfiS7zVA3tL5uqeJFt | analyst | A3b invoice-schema/payment-uri/scan-source | RESUMED ~02:45Z |
| sthr_01QyRyvtpWCG3GzxCJ6oHCJB | analyst | A4 docs accuracy | DONE reports/A4-docs-accuracy.md |
| sthr_01MvMaTZxmKogmZVKbm8izey | engineer | S-DOCS-ACCURACY | PR (draft) |

## Decisions / deferred

- LATE-M1: owned by #742 worker (owner-approved presence marker; redo pending). Not SECONDARY.
- QA-I1 (in-app reset for corrupt journal mirror): optional UI feature, not owner-required; not taken (no speculative features).
- Dependabot #493 (viem 2.57->2.58, vitest, vite, playwright...) and #492 (actions incl. setup-python v6->v7 major):
  dependency churn during final qualification; defer and offer to PRIMARY at the qualification barrier, not taken now.

## Queue (candidates not yet claimed)

| Id | Source | Blocker / reason |
|---|---|---|
| A1-C2 wss:// RPC accepted but unusable | A1 report; audit security-remediation-20261118 C-2 | Needs 4 locale catalogs + help.html (+ pages-devnet.spec.ts text): wait for #766 (and #762/#764) to land, then claim |
| Cross-tab scan checkpoint race (post-#723) | A1 report | Low; needs IndexedDB + lock design; not now |
| A4 P7 gas-funding advice (privacy-limits ~62/144, seller-privacy 67-69) | A4 | Hand-off to PRIMARY P-M1 (sweep/gas guidance) |
| A4 H1-H5 help.html/privacy.html | A4 | Hand-off to #766 owner |
| A4 O2 README status/hosting | A4 | Overlaps #639; after #639 resolves |
| New external branch automation/20261127/bug/browser-digest-deadline (701ae992) | A1 | owns apps/web/src/lib/browserChecks{,.test}.ts; avoid |

## Branch-disposition outcomes (A2, 231 branches dated >= 11-24 local/UTC)

- No unique, authorised, unowned product code stranded. Both in-scope leftovers are tests in stale open PRs (#544, #632);
  ownership not released, so not taken.
- For owners: #726's fix is already on main via #724 (merge 34ba63a2) but the PR is open; #614 (held) has no remaining
  unique code; STOP_WORK says #636 is closed but it is open on GitHub.

## Dependency audit (2026-11-28 ~02:50Z, `npm audit` at b890a766)

15 low-severity advisories, all in the dev-only Hardhat/ethers v5/elliptic chain used by the non-shipped
`packages/confidential-contracts` test harness (GHSA-848j-6mx2-7j84 elliptic). No runtime/shipped dependency affected.
The only fix is a semver-major Hardhat 3 migration of that research package: out of beta scope, not taken. Recorded as
deferred (owner decision), not a release blocker for the static web client.
