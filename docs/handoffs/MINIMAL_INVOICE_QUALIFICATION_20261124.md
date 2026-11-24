# PR #585 privacy-minimal invoice qualification recovery

## Provenance and scope

- Repository: `djshellshoxxx/GhostPay`.
- Parent PR: [#585](https://github.com/djshellshoxxx/GhostPay/pull/585), `feature/287-minimal-invoice-sharing`.
- Exact parent: `b82be893d3d360064222fafcce8cef2033cd23a5`.
- Main/base observed: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
- Continuation: `codex/recover-minimal-invoice-qualification-20261124`, worker `/root/resume_payment_safety`.
- Verified implementation commit: `fef8a101e2df4b451ffdab06fb1afa779e5b6168`; the follow-up commit adds only this handoff.
- Parent head rechecked unchanged before handoff. Root coordinates publication and independent review; this worker changed no shared or remote branch.

The existing stale-result test passed Playwright's `exact` option to Testing Library's `queryByRole`, whose `ByRoleOptions` does not accept it. Replace `{ name: 'Link', exact: true }` with `{ name: /^Link$/ }`: the accessible name still has to match exactly. All existing assertions for stale generated links and absent downloads remain. Product code, signatures, invoice formats, dependencies, build scripts and workflow gates are unchanged.

## Hosted failure evidence

The following parent jobs stop at `CreateInvoice.ordering.test.tsx:78:58`, diagnostic `TS2769`, with `exact` rejected as a property of `ByRoleOptions`:

- [Pages run 45338185213, build job 138255156301](https://github.com/djshellshoxxx/GhostPay/actions/runs/45338185213/job/138255156301).
- [Pages Anvil job 138255155849](https://github.com/djshellshoxxx/GhostPay/actions/runs/45338185213/job/138255155849).
- [Hosting kit run 45338185328, job 138255157612](https://github.com/djshellshoxxx/GhostPay/actions/runs/45338185328/job/138255157612).
- [Beta acceptance run 45338185216, job 138255153454](https://github.com/djshellshoxxx/GhostPay/actions/runs/45338185216/job/138255153454).

Local full web typecheck reproduced the same isolated diagnostic before the change and passed after it.

## Validation

Commands run from `apps/web` unless stated otherwise:

| Check | Command and outcome |
| --- | --- |
| Existing unit regressions | `../../node_modules/.bin/vitest run --maxWorkers=1 src/views/CreateInvoice.ordering.test.tsx src/lib/invoiceCreate.minimal.test.ts src/lib/merchantTemplate.test.ts src/components/MerchantTemplateIssuer.test.tsx` — **22 passed in 4 files**. |
| Web typecheck | `../../node_modules/.bin/tsc -p tsconfig.json --noEmit` — **passed** after the fix. |
| Typed lint | `../../node_modules/.bin/eslint --config ../../eslint.config.js src/views/CreateInvoice.ordering.test.tsx` — **passed**. |
| Full-profile browser journey | `../../node_modules/.bin/playwright test --project=desktop e2e/invoice-minimization.spec.ts` — **1 passed**, including original build/typecheck/CSP/bundle scan startup. |
| Lean-profile browser journey | The same command with `GHOSTPAY_LOCAL_BUILD_PROFILE=lean` — **1 passed**, including original build/typecheck/CSP/bundle scan startup. |
| Secret scan | Repository-root `bash scripts/scan-secrets.sh` — **passed**. |
| Patch whitespace | Repository-root `git diff --check` — **passed**. |

Native browser qualification uses Chrome for Testing Headless Shell `156.0.8078.4` through the existing `GHOSTPAY_CHROMIUM` option and the repository's unmodified Playwright config. Each normal Playwright web-server startup performs the original web typecheck, Vite build, CSP processing and bundle scan with its synthetic manifest.

The existing `invoice-minimization.spec.ts` journey checks signed normal and minimal links, exact downloaded bytes, removal of stale output on mode change, absent descriptions/memo, preserved payment/fiat fields, pinned-signature verification, QR contents, reopening both formats and printable-bill minimization. No assertion is removed or weakened.

## Local setup limits

Dependency manifests and lockfile match the earlier canonical installation used for #545. Its `node_modules` was copied into this isolated checkout. Library `dist` reuse was restricted to packages with identical complete Git trees; changed `scan-source` and `ux-fees` packages were rebuilt from this parent. No generated package output is committed.

An initial `/usr/bin/chromium` invocation was blocked at launch by its singleton socket restriction. A later port-4183 override reached the browser but failed the fixture helper's hardcoded `http://localhost:4173` origin check. The temporary override was removed; final qualification uses the original port/config and the working Headless Shell. These local setup failures are not claimed as product regressions.

## Integration and remaining work

This is a bounded test-compilation repair, not a claim that every parent acceptance gate is green. Required hosted Pages, Beta and Hosting jobs still need to run on the published child. Keep #585's original branch, history and invoice implementation intact. Do not merge or deploy from this handoff alone.
