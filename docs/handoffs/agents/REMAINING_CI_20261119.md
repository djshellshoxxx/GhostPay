# Remaining CI and dependency qualification — 19 November 2026 UTC

## Scope and source

Worker `backlog_ci`, using Caveman investigate-first; branch
`chatgpt/ghostpay-remaining-ci-20261119`, based on integration PR #238
`198aa5baff22272453733a0f3dcfcac0e0994eec`.
The changes repair four confirmed qualification failures without changing application runtime,
workflow triggers, dependency versions, coverage thresholds or the seven separately owned feature areas.

1. Regenerate the workspace map from the existing manifests. It now records the already-integrated
   hygiene/metadata-hardening edges and the existing `validate:deployments` script.
2. Record the two #222 web dependencies (`hygiene`, `metadata-hardening`) explicitly as
   `PENDING_OWNER_REVIEW`, preserving the original `WEB_REVIEWED` list. Record relayer
   `metadata-hardening` in a separate pending list, preserving the original four reviewed entries.
   Exact closure equality still rejects any unlisted addition or obsolete pending entry.
   Pending/reviewed overlap and deferred-chain exclusions are still rejected.
3. Replace an async-without-await throwing `getLogs` mock with an equivalent rejected Promise.
   The original lint rule, unexpected-call rejection and every cancellation assertion remain.

The source imports explain the additions: `apps/web/src/lib/sweep.ts` uses `DestLedger` and
`fundingGuard`; `apps/web/src/lib/relayerClient.ts` pads requests; `apps/relayer/src/server.ts`
strips request padding. Neither added package is one of the explicitly excluded BTC/Solana/TRON
packages. This records source reachability; it does not approve either feature for release.
Eight web entries and one relayer entry remain pending owner review.

## Failing-first evidence and checks

Hosted [CI run 44342340615](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340615)
for #238 failed its rest-0 shard in exactly three tests: generated map freshness, web closure and
relayer closure. The same three failures reproduced locally (13 passed, 3 failed).
After correction the unchanged 16-test selection passes with no skips.
The hosted lint error at `payments.bulkCancellation.test.ts:21` also reproduces independently from
`git show HEAD:path` under Node 22.23.4 and ESLint 10.15.0. The corrected fixture passes scoped ESLint and complete chain-adapters typecheck, plus its six
existing tests under Vitest 5.1.0 without coverage, skips or relaxed assertions.

`node scripts/agent/package-map.mjs --check`, secret scan, action-pin check (113 references) and
`git diff --check` pass. Exact commands, input hashes, audit JSON and retained failing/green logs
are in [the qualification receipt](evidence/remaining-ci-20261119/qualification.json).
The metadata checks use Node 24.22.3; the fixture checks use Node 22.23.4.
Copied dependency directories came from an identical lockfile; no fresh-install claim is made.
An early test/lint launch before the copy completed failed because executables were not yet present;
those setup errors are retained as a limitation, not treated as source failures.
Independent review and final combined-source qualification belong to the coordinator.

## Refreshed dependency findings

Fresh lockfile-only npm 11.9.0 audit on #238 reports **17 low affected-package entries,
zero moderate/high/critical**. The same audit with `--audit-level=high` exits 0;
production-only audit reports zero and exits 0. Manifest and lockfile are unchanged.
These are dated registry results, not an external audit or a blanket release approval.

The formerly blocking [picomatch advisory GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
was withdrawn upstream on 18 November 2026; the npm registry now reflects that withdrawal.
The candidate already uses 4.0.7, still the latest upstream release. No suppression, speculative
upgrade, override or security-policy change was needed.

Two development-only advisory roots remain:

- `elliptic` 6.6.1, [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84):
  no published patched version. A supported Hardhat/fhEVM migration is separate compatibility work;
  forcing Hardhat 3 conflicts with the existing plugin peer requirements.
- `cookie` 0.4.2 via `@sentry/node` 5.30.0,
  [GHSA-pxg6-pf52-xh8x](https://github.com/advisories/GHSA-pxg6-pf52-xh8x):
  upstream patch exists, but this old development diagnostic consumer uses `cookie.parse`, while
  the advisory concerns `serialize`. The existing dependency handoff records the call-site review;
  no new reachable product defect was established here. Retain pending supported dependency migration.

The 17 count includes dependency ancestors, not 17 independent vulnerabilities.
See [the previous compatibility and reachability analysis](TEAM_J_DEPENDENCIES_UNIFIED.md).

## Existing PR reconciliation

| Work | Current evidence-backed disposition |
|---|---|
| #210 with #236 | Paired versions already integrated into #238. Root manifest equals #236; lock differs only by the three intended #222 workspace dependency declarations. #236 CI, Pages, beta, CLI and hosting runs now succeed. Preserve the pair; do not transplant only the root override. |
| #237 log retention | Independently reviewed one-line workflow fix, 29/29 GitHub checks plus Snyk success. Actual hosted artifact exists: `14436054417`, 5,430 bytes, digest `8079e29052fb13ff5f87554adf45a0976fc31c480dcdd6f35fc4111ce470c1b7`. Coordinator merged through GitHub at `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`; independent API read confirms merged. No deployment. |
| #207 grouped Actions upgrades | Both are major upgrades: setup-python 6.3.0→7.1.0; create-pull-request 7.0.11→8.1.3. Source review notes ESM migration/removal of `pip-install` (unused here) and Node 24 runner ≥2.327.1. PR application CI succeeds; strict Mythril remains failed. Not required to repair the observed CI regressions; preserve for distinct current-workflow compatibility qualification. |
| #87 grouped npm majors | Preserve for an explicit supported migration, not automatic adoption. Existing fhEVM/Hardhat peer compatibility and security evidence must be qualified together. |
| #51/#52/#82 paid automation | Historical, outside the static beta task. Do not activate API-funded schedules or agents. |
| Issue #38 | Comments report fixed historical docs (`bd45a32`) and CodeQL test mocks (`9f914f7`). Vault/recovery behavior belongs to the excluded owner; the branch-recovery process row belongs to consolidation. No new unowned runtime defect established by this issue's discussion. |

The [#237 source/check receipt](evidence/remaining-ci-20261119/pr237-qualification-review.json)
and [#238 failed-job diagnosis](evidence/remaining-ci-20261119/pr238-ci-diagnosis.json) retain source pins.
Other #238 failures remain allocated to their owners: payment-key export race, full/lean hostile-text
browser fixture and strict Mythril gate. This repair cannot relabel those failures as passed.

## External and owner gates remain explicit

The existing next-phase queue's B01–B06 requires selected serving origin/ADR-0029, release signing
trust root, authentic deployment and source verification, verified chain-matrix cells, signed manifest,
manual deployment and real-wallet/device acceptance. This task does not supply or fabricate those facts.
CodeQL/Sonar private alert inventory access, real Tor/proxy validation, physical cameras,
screen readers and native-language review remain separate evidence requirements.
Policy-account authority/ABI privacy (D03), guardian authority (D04), escrow authority (D05),
automatic checkout authority (D06), and unscheduled future privacy designs (D07) remain decision-gated.
Current user instructions excluding new features and custody redesign still apply.
