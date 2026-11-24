# Bounded neutral deployment diagnostic recovery — 2026-11-24

## Source and decision

The selected three-file utility correction passed its focused local qualification and independent source review. Final combined hosted acceptance and promotion remain with the coordinator.

- Worker: `/root/historical_review`; independent reviewer: `/root/ownership_review`; coordinator: `/root`.
- Branch: `integration/neutral-deployment-diagnostic-20261124`.
- Base: `7852931fecc8bdd2ab17e3e70813f36e502c50b0`, tree `bc51e09031d4d52a47b01596ed24ef5a8297a945`.
- Claim committed before source edits: `cafa0ebd6c8e872d2041ac77eb9213d1af280cce`.
- Qualified source: `e65214c2f13bd7724aec42032e6cfcb40e87aba5`, tree `088fa581964a891a793bdeaef879a42bf1c20725`.
- Selected #619 head: `3107b816144b4a6fe43f197fbdc323b5d8d80628`. The earlier #570 production change is `ccf93d2283130a487d7d171c9c983e2a86a6a157`; #619's corrected existing hardening case comes from `138b648a9655f58a876d39b362b041e6830e134e` and `fc91f371572e4029a58947d50668cd3e8bf9e2a5`.

Only `apps/web/src/lib/deployment.ts`, `deployment.test.ts` and `hardening.test.ts` were recovered. All three file modes and blobs exactly match the selected #619 postimages. No whole #619/#570 parent was merged. The broader privacy/export work remains outside this unit. The completed cookie branch remains at `bb81db3e68bc6725e6d966593a7f20bda88cd31d`.

## Behavior and preservation

The utility now returns one fixed reason for an actual `ChainAdapterError` and one fixed RPC reason for other verification rejections. It no longer copies supplied diagnostic text into the returned reason. The existing adapter dependency supplies the actual error class; no dependency, lockfile, workflow, network operation or contract changes are needed.

Successful verification, optional secondary-provider forwarding, absent-RPC handling, checking state and payment-disabled formatting retain their prior behavior. The original deployment test file is preserved as an exact prefix with one existing donor regression appended. All 16 named hardening cases remain; only the required import and the existing deployment case change. Every other baseline entry outside the three selected files and additive ownership claim is unchanged.

Current source references import these utility functions only from the two test files. The live application uses the separate manifest readback implementation. This recovery repairs the retained helper contract and adds no production caller; it does not claim an active Pages diagnostic issue or application-wide privacy/export completion.

## Executed qualification

All commands ran on the qualified source above, in the isolated checkout, using Node 24.22.3. No runtime test was repeated for final documentation.

| Check | Command | Observed result |
| --- | --- | --- |
| Focused existing web suites | From `apps/web`: `../../node_modules/.bin/vitest run src/lib/deployment.test.ts src/lib/hardening.test.ts src/lib/manifest.test.ts src/lib/defaultServices.test.ts --maxWorkers=1` | 4 files, 45 tests passed; 0 failures, 0 skips; exit 0 |
| Full web typecheck | `npm run typecheck -w @ghostpay/web` | Passed; exit 0 |
| Full web typed lint | `npm run lint -w @ghostpay/web` | Passed; exit 0 |

The commands used `NODE_OPTIONS=--max-old-space-size=2048`, `CI=1` and a task-specific npm cache. No Node module-resolution flag changed. The inherited npm environment emits its existing unknown `http-proxy` configuration warning; both commands retain exit 0. Raw logs preserve the output.

The checkout reused existing web dependency links; all 68 `@ghostpay` workspace links resolve inside this isolated checkout. Only `packages/ux-vault` build outputs needed refreshing, copied after verifying identical current package source. That web dependency installation still contains **cookie 0.4.2**. This unit's web-source checks are not an exact whole-lock installation or a qualification of the cookie 0.7.2 override. The completed cookie recovery's private installation, branch, raw receipts and separate independent review remain preserved.

No new cases, stress checks, reproduction work, full application suite, bundle build, native/browser execution or analyzer run was added. Fresh combined hosted acceptance remains required.

## Evidence and integration handoff

The adjacent [QUALIFICATION.json](deployment-diagnostic-recovery-20261124/QUALIFICATION.json) records exact source/donor blobs, commands, times, exit codes, dependency limits and evidence hashes. [run-logs.tar.gz](deployment-diagnostic-recovery-20261124/run-logs.tar.gz) contains the eight source-pinned raw logs, environment/preservation records and runner/patch records; SHA-256 `8263be6b725860d69fd6beafaee74d0452d013f5f050bc60971b04ebb07eb29c`.

The independent source review approved `e65214c2f13bd7724aec42032e6cfcb40e87aba5` / `088fa581964a891a793bdeaef879a42bf1c20725` with no source blocker and confirmed the current caller boundary. Its final documentation/qualification addendum and the eventual combined merge review are separate coordinator records. Product/test source remains frozen at the qualified commit; subsequent changes on this task branch are only this handoff, its evidence and an additive completion entry.
