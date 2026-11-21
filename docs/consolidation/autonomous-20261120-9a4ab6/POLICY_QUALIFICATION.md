# Independent qualification of the existing policy review correction

Date: 20 November 2026 (Pacific). Worker: `/root/policy_qualification`.

## Decision and exact scope

The existing correction in [PR #345](https://github.com/djshellshoxxx/GhostPay/pull/345)
passed **50 original tests in three complete selected files**, including its new
pending-edit component test. The independent source review found no blocking
issue within this bounded correction. **The PR is not fully qualified:** the
original typed lint could not complete locally, full-web gates were not repeated,
and the latest observed hosted workflows remain queued.

| Input | Exact source |
| --- | --- |
| Existing authoritative PR #345 | `9a10d335d048b197e90d257a5322ff5d5260572d` |
| Qualified source tree | `25d6ea641c0bfdf65d42974cb3fdc1457fb4d9aa` |
| Main base used by that feature | `aec179910c39081d820396409ff3139ff2264132` |
| Original correction commit | `346c9c3e6db53e4d20f66e0b3a8b3e45a07c6d8a` |
| Original regression commit | `23873ac1d1c76a913aa3cc95258426324e374ce1` |
| This worker's claim-only test head | `d0e6f3c9711b7e0f896362a7ffd953e2f2ee1f95` |
| Existing overlapping #278 | `417f7c71daf8645e1432f2ec8f070110879b80bd` |

Worker branch: `qualify/ghostpay-policy-evidence-20261120-9a4ab6`. The worker read
AGENTS.md, WORKFLOW.md, HANDOFF.md, the current registry, donor handoff and current
PR metadata, then committed its additive claim before preparing evidence. Product
files, existing tests, dependencies, configuration, assertions, timeouts, coverage
thresholds and skips remain unchanged. No baseline reproduction was executed.

The coordinator's frozen 111-PR inventory has six broad owners of `PolicyPay.tsx`
(#211, #246, #251, #262, #264 and #278), no owner of the then-new regression path,
and no owner of this evidence prefix. That snapshot predates #345. Fresh metadata
confirmed #345 and #278 at the heads above; source inspection confirms #278 lacks
the `reviewRevision` guard. The worker does not take over any implementation.
Existing #345 remains the feature PR; its known overlaps still need review during
integration. The 411-branch donor census is separate historical input, not a new
mechanical census or semantic review performed by this worker.

## Independent source review

Only two application paths differ from the feature's main base: `PolicyPay.tsx`
and the new `PolicyPay.pendingEdit.test.tsx`. The correction captures a synchronous
review revision in the existing review guard. Meta-address, token and amount
changes, a fresh review, and component cleanup invalidate the earlier revision.
The session-version and deployment-owner checks still run after the revision
check. The reviewed transaction snapshot and existing send helper are unchanged.

The reviewer traced the guard through `sendPolicyPayment`, `submitTx`, wallet
authority checks and account/chain rechecks. The final authority check, attempt
journal write and provider invocation have no intervening await. The existing
calldata/deployment, asset/amount, deadline, allowance, duplicate-attempt and
one-use-review checks remain. The source proof pins these unchanged controls.

Post-handoff handling remains distinct: a form change cannot retract a request
already given to a wallet. Returned hashes are retained before follow-up RPC work;
post-broadcast failures retain their typed outcome. If an approval has already
mined before a later check refuses the payment, the existing helper removes the
unqualified “Nothing was sent” clause and discloses the mined approval and remaining
allowance. Existing send and component tests exercising these paths were included
in the 50-case selection. The new direct regression covers an amount edit; the
other invalidation sites were source-reviewed, not each given a new test here.

The new test uses **Vitest with jsdom, React Testing Library and MockWallet**. It
is a component/DOM test, not a Chromium, Firefox, mobile, browser-extension or
live-wallet acceptance run. Its existing services reject network access unless
explicitly replaced; this test supplies the existing fake-chain implementation
and public local policy profile. No live transaction or new deployment is used.

Policy accounts remain gated by `VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1` in the full
application. `AppLean.tsx` imports only the core shell; it has no policy route or
policy import. The unchanged `PINNED_POLICY_DEPLOYMENTS` map is empty, and the
verification helper requires a trusted testnet profile. This qualification does
not enable policy accounts, add pins, or qualify the supported lean release.

## Executed outcomes

All commands ran sequentially from the isolated repository, with Node `v24.22.3`
and npm `11.19.1`, on the claim-only successor of the exact feature source. The
recorded uncommitted tracked diff is empty for every command. No test source was
changed between executions.

| Check | Actual result |
| --- | --- |
| Original builds for chain-adapters, payment-uri, qr-exchange, policy-scheme and tron-adapter, including their original core-crypto/invoice-schema prerequisites | Exit 0; 12.895 seconds; 256 MiB heap. |
| Three complete focused policy test files | Exit 0; **50/50 tests, 3/3 files, zero skips**; Vitest 13.49 seconds, wrapper 14.489 seconds; one concurrent worker, 384 MiB heap. |
| Original typed ESLint configuration, scoped to the two feature files, 512 MiB heap | Exit 134; explicit V8 heap exhaustion before any lint finding. |
| Sole scoped lint resource retry, same command/configuration/files, 768 MiB heap | Exit 137; process killed before any lint finding. The precise cause of this termination is unconfirmed. |
| Whole-web typecheck/lint/coverage/build and native-browser acceptance | Not executed by this worker; existing coordinator resource-blocked broad gates were not repeated. |

The focused command disables coverage for that selection only; it is not a full
web coverage pass. The original web thresholds remain 90/85/90/90, and the new
component test's existing 30-second limit remains. The two lint failures are
retained; they do not establish a clean lint result or a source diagnostic. A
single retry was used after explicit heap exhaustion, with about 2 GiB host memory
available and no other scheduled heavy job. No further resource retry was made.

Passing command:

```sh
NODE_OPTIONS=--max-old-space-size=384 npm exec -w @ghostpay/web -- vitest run src/features/policy/PolicyPay.pendingEdit.test.tsx src/features/policy/send.test.ts src/features/policy/PolicyView.guard.test.tsx --maxWorkers=1 --coverage.enabled=false
```

The original scoped lint command is:

```sh
npm exec -w @ghostpay/web -- eslint --config ../../eslint.config.js src/features/policy/PolicyPay.tsx src/features/policy/PolicyPay.pendingEdit.test.tsx
```

## Dependency and evidence integrity

`POLICY_DEPENDENCIES.json` records matching full lockfile and all **78** selected
manifest/configuration inputs, **678** external lock records, four separately
linked dependency trees, **68** workspace links resolving into this worktree and
zero missing nonoptional installed paths. This is reuse of a matching existing
installation, not a fresh npm installation. External package files are hardlinked
inside separate directories with caches excluded; no donor cache was modified.

Compiled outputs were copied for 26 packages only after their tracked
TypeScript/JSON/JavaScript production/build inputs matched. Five other available
compiled package trees were rejected because their inputs differed. Their relevant
libraries, plus the previously unbuilt policy-scheme, were built from this exact
source with the original scripts. Seven distinct packages were rebuilt, including
core-crypto even though its earlier copied inputs matched. The proof records both
the copy phase and final hashes of the rebuilt outputs; it does not claim an
independent rebuild of every copied library.

The four command artifacts preserve exact command arguments, source head,
environment override, UTC timestamps, duration, exit status and full original
output in lossless JSON wrappers. Byte counts and SHA-256 hashes round-trip.
`POLICY_SOURCE.json` pins 20 source/configuration hashes, the changed-path scope,
unchanged control blobs, frozen ownership and exact #278 comparison. Terminal
blank lines remain encoded inside the outputs rather than weakened or removed.

## Hosted state and handoff

The GitHub refresh at **2026-11-21 00:20:55–00:20:56 UTC** confirmed #345 remains
open and draft at the same head. CI, Pages, Beta acceptance and Hosting kit runs
were queued; the separate Snyk status was successful. These observations and URLs
are preserved in `POLICY_REMOTE.json`. A successful separate status does not
qualify queued workflows, and source equality with a future synthetic merge has
not been asserted here.

The existing #345 owner should obtain original whole-web typecheck, typed lint,
coverage, build and required hosted results on its final source, investigate any
actual findings without weakening gates, then reconcile the broad overlapping
stacks and current main/integration under the authorized lease owner. Relevant
original package commands remain:

```sh
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm test -w @ghostpay/web
npm run build -w @ghostpay/web
```

These are remaining gates, not commands executed successfully here. Native-browser,
real wallet/provider, deployment, release and financial recovery guarantees remain
outside this scoped result. No shared ref, integration lease, PR, deployment or
release was changed by this worker. Root owns publication of this evidence.
