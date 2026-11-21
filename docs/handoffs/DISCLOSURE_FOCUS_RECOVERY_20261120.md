# Wallet disclosure focus recovery on the current privacy stack

## Current continuation: tests above canonical PR #354

Concurrent [PR #354](https://github.com/djshellshoxxx/GhostPay/pull/354) independently
recovered the same focus behavior while this work was being published as #355.
PR #354 is canonical for the runtime, seven cancellation variants and two browser
driver repairs. This continuation preserves its four application/test files exactly
and adds only our three distinct mounted quick-hide cases in
`apps/web/src/components/WalletDisclosure.quickHide.test.tsx`.

The local successor is an ordinary merge with ordered parents:

1. Published #355: `f11792f7b9202512f0bf980a03f057e8a15836ae`.
2. Canonical #354: `8ce7f1db452167311876bd0707778c2e9c64f3df`.

Both complete ownership histories are preserved additively. Relative to #354,
the only new test path is the quick-hide file; the other differences are this
handoff and the additive ownership record. The earlier runtime-recovery sections
below remain historical evidence for their named sources and no longer describe
the current PR's application-code scope. The coordinator will retarget #355 above
#354 and publish the normal descendant without rewriting either history.

### Controlled continuation verification

The three new cases use the actual mounted provider, privacy boundary, quick-hide
control and wallet fixtures. One preserves the successful-hide focus-ordering
control; the other two exercise quick hide after focus was left on body or the
document element. PR #354's existing cancellation tests remain unchanged.

| Stage | Immutable tree and runtime | Executed result |
| --- | --- | --- |
| RED | Tree `ca7f19f7aaee1854a860544236bc58c2c7cf8a8f`; only runtime temporarily restored to original #352 blob `fe26789ff37a6802f23ee94d02631575ce1d01f7` | New file: 2 failed, 1 passed, zero skips; 2.74 seconds |
| GREEN | Tree `bc9bfe8c6aa2ecdeb9e06a6be324480aad56f423`; exact canonical #354 runtime restored | Canonical 13 plus new 3 cases: 16 passed, zero failures or skips; 3.86 seconds |

These are source trees retained before the documentation update, not claims that
the still-open merge already had a committed HEAD. Only documentation changes
follow this passing product/test tree. The final successor keeps exact canonical
source identities, all mode `100644`:

- `WalletDisclosure.tsx`: `094b9d4cce058b060c13821c7723449bafe0a743`.
- `WalletDisclosure.test.tsx`: `96144da7ab938bea7aa6649e28b251d08bf9f264`.
- New `WalletDisclosure.quickHide.test.tsx`: `30e770013630c1bb83f8d8cf37948e9af2993249`.

RED used the earlier command with only the new quick-hide path. GREEN used:

```bash
NODE_OPTIONS=--max-old-space-size=384 \
  ../../node_modules/.bin/vitest run --maxWorkers=1 \
  src/components/WalletDisclosure.test.tsx \
  src/components/WalletDisclosure.quickHide.test.tsx
```

The current #352/#354 lockfile and all library inputs are identical, so the matching
installation and 19 rebuilt libraries described below remain valid. No additional
install or package rebuild was needed. Original assertions, timeouts, configurations
and coverage thresholds remain unchanged. The complete web and browser/hosted
gates still need qualification on the new combined successor.

RED log SHA-256: `91111fc5d5a32d91440a1f47f38c6d447bb994c4dadc711648312bbe30657bd8`.
GREEN log SHA-256: `17084d895ee177d0d4ce833f6ca5f38087f59254e33df025b3014dfedb12b4c0`.

`/root` independently approved the new test file and confirmed zero difference for
all four canonical #354 application/test files. The review verified real mounted
privacy/disclosure behavior, unchanged zero-send/provider assertions, exclusion
of hidden/inert focus targets, and listener/root-tabindex cleanup. This static
review is separate from the worker's RED/GREEN execution. No heavy process remains;
source paths are released to the coordinator for normal descendant publication.

## Result and scope

Recovered the completed, previously unrepresented focus repair from
`fix/ghostpay-browser-acceptance-20261120-r3` onto the exact current PR #352 source.
The two component files are byte-for-byte and mode-for-mode equal to the released
donor. Newer journal, locale, network-inventory and acceptance-driver changes from
PRs #348 and #352 remain intact. No broad donor merge was performed.

When disclosure closes after its initiating control loses focus, becomes disabled,
or cannot receive focus, cleanup now returns focus to the existing privacy control.
Document roots are not accepted as useful restoration targets. A replacement
dialog still owns focus, valid available openers still receive focus, and no
disclosure approval, provider call, payment, storage or masking behavior changes.

## Source identities

| Role | Exact identity |
| --- | --- |
| Base PR #352 | `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94` |
| Released donor head | `2affd298c364c284d4d74f703fd4a612cc0f16d9` |
| Original runtime-only fix | `883b05b11e8973044434cce25adf98795164dbd9` |
| Tests-only RED source | `ba46dfaf986505c6d2306bdffcbd5903487344cd` |
| RED tree | `fc94896f3c2e4e56e6f6aa42ed3816e60a4b930c` |
| Recovered GREEN source | `118b3dc2fe8abf5851078911f6d44880bbd7eefa` |
| GREEN tree | `4ad6c88b26add9cdc2a9499e81e2a2538497171b` |
| Runtime blob, mode 100644 | `00a70efc5f273da55d4ce4a76141a0b92fd5601a` |
| Test blob, mode 100644 | `dc6748580947f2f2e9ac6be8798c4cb9d667705e` |

The runtime was recovered with `git cherry-pick -x`, preserving original author
and provenance. The final donor regression file preserves original contributions
`44d1558bedb71f095594fd5a269190ed61a4dc29`,
`8eedfb0d9b9659c4a6f37f2ee9e0d4cb58d12414`,
`270c1a5484f7b7c97f100b30a9287088fd0ec59a`, and query-compatibility correction
`76fbabcba18bef0cec696d9a5188794eb7537a4e`.

The donor's [completed handoff](https://github.com/djshellshoxxx/GhostPay/blob/2affd298c364c284d4d74f703fd4a612cc0f16d9/docs/consolidation/browser-qualification-r3-20261120/REPORT.md)
and ownership record release the source paths to the coordinator. That handoff's
historical test and typecheck results remain evidence for its original source;
they are not counted as executed checks of this new composition.

## Executed verification

The complete unchanged `WalletDisclosure.test.tsx` ran with original Vitest
configuration, assertions and timeouts, using this command from `apps/web`:

```bash
NODE_OPTIONS=--max-old-space-size=384 \
  ../../node_modules/.bin/vitest run --maxWorkers=1 \
  src/components/WalletDisclosure.test.tsx
```

| Source | Actual outcome |
| --- | --- |
| Tests-only RED | 3 failed, 7 passed, zero skips; exit 1; 3.72 seconds |
| Recovered GREEN | 10 passed, zero failures or skips; exit 0; 3.01 seconds |

RED failures are exactly the lost-focus body, documentElement, and disabled
initiating-control cases. Existing positive disclosure, cancellation and normal
focus controls remained passing. GREEN repairs all three using the original
runtime change. These counts overlap and must not be summed as distinct coverage.

`/root` independently reviewed the exact source/test diff against #352, the full
provider and the `SensitiveContent` fallback, reporting no blocking issue.
That review is static; the worker's RED/GREEN execution is separate evidence.

The original secret scanner and source-range whitespace checks pass. Exact donor
file equality and unchanged #352 manifests, lockfile, TypeScript/Vitest settings,
ESLint configuration and workflow bytes were verified. Before this documentation
checkpoint the full base-relative diff contains only the two component files and
the additive ownership claim.

## Dependency provenance

The earlier #350 installation did not match #352, so it was not used to claim
verification. A fresh selected installation from the unchanged #352 lockfile
completed successfully, installing 307 packages:

```bash
NODE_OPTIONS=--max-old-space-size=768 \
  npm ci --workspace @ghostpay/web --include-workspace-root \
  --ignore-scripts --no-audit --no-fund --prefer-offline --maxsockets=2
```

All 19 declared web dependency libraries were rebuilt from the current worktree
before RED/GREEN. The temporary builder traversed the same declared internal
dependency closure as `scripts/build-workspaces.mjs`, then executed the original
`npm run build --workspace NAME` commands for package workspaces only. It did not
claim an application build. The dependency listing also exits successfully.

Local Node is 24.22.3, npm 11.19.1 and locked Vitest 5.1.0. The existing hosted
Node configuration remains unchanged. Lockfile SHA-256:
`1b22ab3e9f780d27a01b1beaa8c31b223b3649106e454e78fc50ac8d6900f517`.

Raw execution logs and their command/source index are retained for coordinator
publication. RED log SHA-256:
`d7d53d95cd8e97622fb8110d448d206ef1a98af4bbda83d0899571c278815856`.
GREEN log SHA-256:
`db51a4d857e09464375ac8f197a386afa366b2b3e79396291986db434c639a3a`.

## Remaining gates and handoff

This is a focused DOM regression pass and independently reviewed source recovery.
Full web coverage/nocov, full TypeScript, lint, application build, real browser
acceptance and exact-successor hosted CI remain unexecuted on this combined head.
No existing assertion, timeout, coverage threshold or release gate was weakened.
No local browser, live RPC, wallet transaction, workflow dispatch, deployment or
release action was performed. No remote branch or PR was changed by the worker.

The branch is `fix/ghostpay-disclosure-focus-recovery-20261120`. It belongs above
PR #352's privacy stack; main and #307 lack this component. The coordinator owns
head rechecks, isolated draft publication and combined-source qualification.
The separate integration lock remains outside this worker's scope. Worker
source paths are released after this checkpoint; no heavy process remains.
