# GhostPay Agent Handoff

## Assignment
Feature: Ops-monitor W3 release artifact fetch byte cap.
Workstream: M / deployment and release tooling.
Agent role: focused implementation and verification.

## Repository state
Branch: codex/ghostpay-ops-response-cap-20261116.
Base SHA: 2de9b0c5764cb1fb80a648e18d269b4d91210dcc.
Open PR: none created by this worker.
Worktree: /workspace/scratch/35ee9eab1408/GhostPay-ops-w3.
Dirty files: see commit after completion.

## Completed
- Preserved existing streaming response cap.
- Cancel a body with an oversized valid Content-Length before reading it.
- Cancel a body that crosses the streamed cap without awaiting its cancellation hook.
- Added regressions for exact-limit UTF-8 split across chunks, oversized body cancellation, malformed/missing Content-Length, and oversized declared Content-Length.
- Updated W3 deviation record.

## Remaining
- Full package lint terminated with exit 137; focused ESLint passed.
- No real HTTP server or live mirror acceptance was run.
- W3 signature-source trust still depends on SHA256SUMS from the signed release, not the mirror.

## Dependencies
- Root package dependencies and @ghostpay/chain-adapters build.
- No hosted service, Pages code or external release configuration changes.

## Verification
- npm ci --workspace=@ghostpay/ops-monitor --include-workspace-root=false --ignore-scripts --no-fund --no-audit --prefer-offline --install-strategy=shallow --maxsockets=1: passed, 211 packages.
- npm run build --workspace=@ghostpay/chain-adapters: passed.
- npx vitest run --coverage.enabled=false src/fetcher.regression.test.ts from ops-monitor: passed, 13/13.
- npm run test --workspace=@ghostpay/ops-monitor: passed, 113/113; 98.01% statements, 93.59% branches, 97.72% functions, 99.78% lines.
- npm run typecheck --workspace=@ghostpay/ops-monitor: passed.
- npm run build --workspace=@ghostpay/ops-monitor: passed.
- npx eslint --config ../../eslint.config.js src/fetcher.regression.test.ts src/fetcher.ts: passed.
- npm run lint --workspace=@ghostpay/ops-monitor: terminated with exit 137.
- One earlier one-file coverage invocation failed only because it applied package-wide 95%/90% thresholds to a single file; the focused no-coverage run and complete package coverage run pass.

## Next actions
1. Review current branch head and diff against base.
2. Commit implementation and this handoff locally.
3. Send exact commit SHA and verification summary to coordinator for integration review.

## Acceptance criteria
- [x] Hard cap enforced during streaming.
- [x] Oversized declared body refused without read.
- [x] Rejected body cancellation does not block on remote cancellation.
- [x] Exact limit and split multibyte bytes preserved.
- [x] Missing/malformed Content-Length still falls back to streamed cap.
- [x] Tests, typecheck and build pass.
- [ ] Full package lint and external live-mirror acceptance.
