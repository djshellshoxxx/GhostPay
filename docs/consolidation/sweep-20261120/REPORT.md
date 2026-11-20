# Sweep consent and signing lifetime consolidation — 2026-11-20

## Result and scope

This isolated continuation retains the useful Sweep contribution from PR #272 and four accepted successor corrections. It is stacked on the reviewed consolidation at `2876b7db580e47a880d5951ce9e62941bcf76fdf`; that published candidate was left unchanged while its complete web test gate ran.

The resulting Sweep requires an explicit balance lookup, ties quotes and signing to the current review, rejects a changed native balance before signing, and handles a session that disappears before authorization through normal error and control cleanup. Submitted and uncertain transactions retain their existing journal evidence and replacement protections.

This is the static browser/Pages path. The larger privacy branch's network authorization, idle-session implementation, native-fee review, and other features are not imported by this bounded port. No package version, contract, relayer-server, workflow, deployment or release setting changes.

## Sources and composition

| Source | Retained contribution |
| --- | --- |
| #272 `63ff40d57af879a3d82166450f63aadb7bf0d5ff` | Explicit balance consent from #231/#252; balance/quote scope, direct/relayed/replacement handoff checks; existing component/privacy/browser regressions |
| `6ed5c66b514e11eaca1817c6b83a863b2ebaf89e` | Caller review authority before key derivation, signatures, asynchronous continuations and handoff |
| `d14ac788da5254890e683f191a91ba619d1dd102` | Pass the review guard into both helpers; suppress failures from an obsolete operation or review |
| `ba6b6d44a16d151b53f104715754c4a9bfd9610b` | Capture the session inside the operation's `try`, preserving error reporting and `finally` cleanup |
| `a603603d5e84814451c6f77945871e9224467b32` | Bind native transfers and same-nonce replacements to the explicitly reviewed balance |
| `8ca38218ba87a5cee479ea5885b6a00bc0791f28` | Exact helper regression blob `b1e5c22e708da43efa3d61b85d9272ce136a2bdb`, including secret-safe assertions and actual transaction recovery |

Both #272 and the published base remain ancestors. The only merge conflict was additive `docs/ai/ACTIVE_WORK.md`; every nonempty line from both parents was retained. The component corrections were adapted to the existing session and transport APIs rather than copying the larger privacy implementation. The lock-before-authorization test uses the existing `clearSession(false)` API to represent a store change before the context projection updates.

The two helper patches have the same stable patch IDs as their accepted donors. The original fee tests now supply the native balance they intend to test; their original refusal assertions remain unchanged. The canonical ERC-20 transfer Boolean fixture already repaired in #307 is preserved. All four catalogs retain every base key, with the three affected Sweep messages matching #272.

## Executed regression evidence

Local tested source: `9e5e436bc09432f4644de1383ad74bc0b3bac4c8`; tree: `fa45263d31b3c92dc0c3f45e179697a18af33e56`.

Its published product equivalent is `cc192b1e230af1cf751357279ae10f04a0038b06`, with exactly the same tree. Publication preserves a test-before-runtime sequence; `EVIDENCE.json` maps each local checkpoint to its exact-tree public equivalent.

Before the successor runtime changes, tests-only checkpoint `bd1d4265731d46f621021417ef46e13699b3eda2` produced **15 expected helper failures and four passing controls**. The adapted session-unavailable case also failed as expected; 70 unrelated cases were filtered from that selected invocation. These are baseline demonstrations, not passing qualification.

After the retained corrections, seven complete files passed in separate serial invocations:

| File | Passed |
| --- | ---: |
| `sweep.reviewAuthority.test.ts` | 19 |
| `Sweep.quoteLifecycle.test.tsx` | 71 |
| `lib/sweep.test.ts` | 99 |
| `views/Sweep.test.tsx` | 55 |
| `Sweep.privacy.test.tsx` | 17 |
| `scanPrivacy.test.ts` | 32 |
| `securityKeys.test.ts` | 12 |
| **Distinct total** | **305** |

All seven invocations exited zero, with no skipped tests. They used Node 24.22.3, one Vitest worker and a 512-MiB heap. These focused invocations disable coverage; the repository's original full coverage thresholds remain unchanged. `EVIDENCE.json` records source blobs, commands, counts and log hashes.

The original full web TypeScript command subsequently passed in 19.223 seconds, and the original typed ESLint over `src` and `e2e` passed in 44.160 seconds. Both used a 1536-MiB heap and exited zero on the same unchanged product source. No compiler or lint setting was changed.

Dependencies and compiled package outputs were copied from the fully installed and built `2876b7db` qualification workspace only after verifying identical package source, manifests, lockfile and root build configuration. Workspace symlinks resolve inside the new worktree. This is verified reuse, not a claimed fresh install or library build.

## Independent review

`integration_review` inspected the exact tested head and found no blocking source issue. The review verified all 18 changed product paths and their `100644` modes, donor ancestry, accepted patch identity, ownership preservation, current-review checks, pre-signature refusal, native-balance consent, secret wiping and preservation of post-handoff evidence. It ran no tests and approved draft publication and qualification, not main promotion.

## Remaining qualification

Full web typecheck and typed lint passed as recorded above. Browser acceptance and applicable hosted checks must pass for the resulting published head before promotion. The base #307 must also be qualified and integrated before this stacked change targets main.

The #272 donor had 35 successful checks, three intentional skips, three cancelled duplicate CLI jobs and one failed hosting-kit job. That job failed during Ubuntu package installation with `apt-get` exit 100 before kit assertions ran. Its successful full/lean browser, Pages and CodeQL checks apply to the donor, not this new composition.

Local Chromium cannot create its required process-singleton socket, so no browser execution is claimed here. No browser restriction, coverage threshold, compiler inclusion, lint rule or security check was relaxed.

## Branch disposition

`BRANCH_CENSUS.json` preserves the captured local remote-tracking snapshot against main `aa3df1cb` and candidate `2876b7db`. It excludes the symbolic alias and identifies the lease branch as coordination metadata: 380 branch refs, 375 distinct heads; 185 main ancestors, 12 additional candidate ancestors, 65 documentation-only entries, 15 exact compared-code matches, 101 requiring semantic review, one metadata branch and one unrelated history.

This is a reproducible local-ref comparison, not a fresh live GitHub inventory or a claim that 101 features are missing. Historical arrays, QR-kind, artifact verification, transfer-filter and formatting variants already have stronger retained implementations. The broad payer/chain duplicate-journal lock is deliberately superseded because it blocks independent scopes. Larger candidates and idle/session completion remain separate coherent work; this port does not overwrite completed backup-operation ownership.
