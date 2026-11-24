# Countdown PR #574 — independent completion qualification

## Source and scope

Reviewed on 2026-11-24 UTC by `/root/completion_review`, independently of the
original patch author, for coordinator `/root` in workspace `74aa08c7aedc`.

- Original PR: https://github.com/djshellshoxxx/GhostPay/pull/574
- Original branch: `fix/countdown-394-main`.
- Reviewed source: `43889d6a36ae869187c1b860fce72e0252f55028`.
- Source tree: `5a814cdfff1a3f0c8621c34cdf2b8e8db9ecc8e7`.
- Base main: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.
- Isolated qualification branch: `qualify/countdown-574-20261124`.

No implementation or test changes were necessary. This branch adds only the
qualification claim and this handoff. The original branch, main, workflows and
all other workers' changes remain untouched.

## Independent source review

No blocking finding in the scoped change. The guard in
`apps/web/src/lib/format.ts` rejects non-number and nonfinite durations before
arithmetic, producing the existing `invalid time` marker. It does not coerce
objects or call their conversion hooks. The finite-value arithmetic is unchanged:
negative values clamp to zero, positive fractions round upward, and hour/minute
rollovers preserve their previous representation.

Reviewed the complete formatter, both formatter tests, `DelayScheduler`, the
waiting transition in `Pay.tsx`, relevant Pay unit cases and the final-payment
expiry browser case. The change controls presentation only. Payment expiry is
still checked independently before requesting a new wallet transaction.

## Local native verification

Ran against the original source with only the documentation claim added:

```sh
NODE_OPTIONS=--max-old-space-size=384 npm run build --workspace @ghostpay/chain-adapters
cd apps/web
NODE_OPTIONS=--max-old-space-size=384 ../../node_modules/.bin/vitest run src/lib/format.countdown.test.ts src/lib/format.test.ts src/lib/jitter.test.ts --maxWorkers=1 --no-file-parallelism
```

The minimal prerequisite build compiled `core-crypto`, `invoice-schema` and
`chain-adapters` successfully. The native repository Vitest run passed **26/26
tests across three files**, with no skips. Installed versions matched repository
requirements: Vitest 5.0.5, Vite 8.3.5, TypeScript 5.9.3 and React 19.3.1. Workspace
package links resolved to this isolated checkout, rather than another worker's
source. The initial run before compiling local workspace dependencies failed at
configuration loading; it executed no tests and is not counted as a pass.

## Hosted acceptance independently checked

Inspected the original job logs, not only the workflow summary. Both browser
jobs explicitly record the original PR head above and checkout merge
`881d314cdd420cf5886d225a8e989ade40274f80`. Their recorded tree is byte-identical
to the reviewed source tree above.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Full Chromium | 82 tests passed; `invoice expiry is refused at the final pay guard: nothing reaches the wallet` passed in 1.4 seconds | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334162042/job/138269050407 |
| Lean Chromium | 70 tests passed; the same expiry case passed in 1.3 seconds | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334162042/job/138269050448 |
| Web unit suite | 2,832 passed, one skipped; separate noncoverage pass 3/3. Formatter 11/11, countdown 4/4, jitter 11/11 and Pay 66/66 passed | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334162042/job/138269050749 |
| CI substantive jobs | All 22 completed successfully, including typecheck, build, lint, unit, full/lean browser and security checks | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334162042 |
| Pages | Workflow succeeded | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334161915 |
| Beta acceptance | Workflow succeeded | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334161916 |
| Hosting kit | Workflow succeeded | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334161902 |
| CLI operator qualification | Workflow succeeded | https://github.com/djshellshoxxx/GhostPay/actions/runs/45334161930 |

The expiry browser case prepares a valid synthetic invoice, advances browser
time past expiry before the send click, requires the expired/no-send message,
and checks zero wallet transactions and an empty wallet journal. Reopening the
expired invoice must disable Continue and still produce zero wallet requests.

The `contracts` and `typescript` aggregate jobs were still queued at inspection,
although their substantive prerequisites had succeeded. Do not describe the
whole CI workflow as completed until its current status confirms that outcome.
No local duplicate browser build was needed after verifying the source-identical
hosted acceptance, preserving resources for the separate QR repair worker.

## Completion and integration

Implementation, scoped independent source review, local regression verification
and applicable hosted browser acceptance are complete for this countdown change.
This is an AI-assisted source review, not an external security audit or a
submitted GitHub review. The coordinator must recheck current heads, ownership,
the normal integration lease and aggregate CI before any integration. Existing
broader release gates remain in force. No publication, deployment, real-wallet
interaction, real funds or remote write was performed by this worker.
