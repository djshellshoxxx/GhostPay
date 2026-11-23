# GhostPay Settings RPC responsive layout — 2026-11-21 handoff

## Source and ownership
- PR: https://github.com/djshellshoxxx/GhostPay/pull/387 (draft)
- Branch: `chatgpt/ghostpay-rpc-layout-reflow-20261121-r1`
- Exact base `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Test-first commit: `c101c1635a799ea39bc22764794c4c4290e996bd`.
- Production JSX: `c8c46038127860888538395a029d3e881935ed3b`.
- Production CSS / checked candidate: `5d614417b2fbe14483b33a0a229e79728af10eac`.
- Integration ownership: separate coordinator holds generation-11 integration lock. No lock takeover, merge, deployment, real-funds action, or release.

## Problem and implementation
Settings RPC rows used the shared `.row` rule's 4-column `2fr 1fr 1fr auto` layout for two URL inputs, an RPC Test button and its status. At >=40rem this compresses both URL inputs. Scope is the RPC reflow portion of issue #364.
- `Settings.tsx`: render primary then secondary URL fields, followed by the Test/status pair.
- `app.css`: new `.rpc-row` stacks on narrow screens and displays two equal minmax(0,1fr) fields from 40rem up; Test and status remain on the following row.
- `settings-rpc-reflow.spec.ts`: Playwright tests assert >=260px for both fields at 900px, side-by-side without overlap, and accessible URL/test-control bounds plus no scroll at 320px.
- No new dependencies, endpoint changes, wallet behavior, custody changes, external assets, or deployments.

## Verification facts and limits
- GitHub `compare main...branch` reported 4 commits ahead/0 behind, merge base equal to the pinned main, and only 4 changed files (test, CSS, Settings JSX, coordination claim) before this handoff.
- Actual repository E2E workflow in `.github/workflows/ci.yml` runs `npm run test:e2e --workspace @ghostpay/web`, which should include the new file.
- Old test-only PR-head actions: CI `44898345890`, Pages `44898345899`, Beta acceptance `44898345908`. These were queued during inspection, so an observed RED is not claimed.
- Source+test head actions: CI `44898392822` (pending), Pages `44898392883` (queued), Beta acceptance `44898392856` (queued), Hosting `44898392868` (queued) at last inspection. No hosted pass or failure is yet claimed.
- Local Git checkout failed with `Could not resolve host: github.com`. Local container Chromium smoke attempt timed out. No local Vitest, actual browser E2E, typecheck, lint, build or security-gate success is claimed.
- Do not infer release readiness from this scope; PR #387 is one bounded UI repair.

## Next worker actions
1. Obtain exact-head hosted CI, Pages, Beta acceptance and browser job results, including Playwright layout assertions. Record any RED-to-GREEN evidence; repair failures without reducing actual layout guarantees.
2. Inspect 320px, 900px, 200%-text layouts using the built app, preserving input visual/keyboard order, Help disclosure and Test/status behavior.
3. Run focused E2E, lint, typecheck, build and applicable security checks on repository checkout. Request fresh independent review and recheck overlap with other active PR heads.
4. Do not merge to `main` until the integration owner explicitly releases/reconciles the generation-11 lock and all required checks/reviews pass. Issue #364's branding, help diagrams and broad UI overhaul remain out of scope.
