# QR conflict idle-expiry repair

## Result

The shared QR assembler now preserves the idle deadline when it rejects a CRC-valid conflicting chunk. The defect was reproduced against unchanged production source before the repair. The original QR package coverage suite, typecheck, dependency-ordered build and lint pass; a separate native reviewer approved the exact source and regression delta.

This is a focused continuation of PR #278. It is ready for the existing coordinator to consider through an isolated stacked draft, not a release qualification or a replacement consolidation branch.

## Defect and repair

`Assembler.add()` previously assigned `#lastActivity` before detecting a different body for an already held chunk index. It then threw `CHUNK_CONFLICT`, but had already changed the expiry clock. The class documentation and package README promise that a conflicting chunk leaves state unchanged.

The regression encodes a genuine two-part payload and independently parses a forged fragment with a correctly recomputed CRC:

| Injected time | Operation | Required outcome |
| --- | --- | --- |
| 0 ms | Accept the first genuine part | Start an incomplete transfer with a 100 ms idle limit |
| 90 ms | Submit a different body for that same index | Throw `CHUNK_CONFLICT`; retain session, missing parts and original deadline |
| 101 ms | Submit the remaining genuine part | Throw `SESSION_EXPIRED` and clear the transfer |

Before the repair, the final operation succeeded instead of expiring. The repair moves the activity assignment immediately after the conflict check. Accepted chunks and identical duplicates still refresh activity. The strict `>` expiry comparison, completed-transfer behavior, integrity checks and reset semantics remain unchanged.

Six new cases cover the demonstrated conflict, rejected session/total/checksum/malformed inputs, and accepted-duplicate refresh at the exact deadline. The conflict case also checks successful fresh reassembly after expiry.

### Impact boundary

This is a standalone assembler API contract defect. The current `CameraImporter` already catches `CHUNK_CONFLICT`, synchronously resets and discards its assembler, removes displayed progress, and stops processing the current pasted batch. Camera, paste and image input share that path. Therefore no retained-transfer expiry effect, transfer corruption or exploit is demonstrated in the current browser importer. Its production code and existing regression are unchanged.

## Source identities

| Stage | Commit / tree |
| --- | --- |
| Published candidate base | `d74af79ebabdc8cead843361c3497b46d8c421f9` |
| Base tree | `e76c03d9dba595ff1171577139c1628c4ad45f5b` |
| Regression-only source used for RED | `25dc42d29f9f91ff5519bc1cce4bdfe53de5bbab` |
| Frozen reviewed implementation used for GREEN | `5d87d845537c4042dfa5eda5f45565e18973b2dc` |
| Implementation tree | `d047dffc5d3c3ed70a7a25b05836f4b4232dc6fe` |

| File | Git blob |
| --- | --- |
| Baseline `packages/qr-exchange/src/assembler.ts` | `8e8d12e447265e682597edf2887e5a2f6afd55db` |
| Repaired `packages/qr-exchange/src/assembler.ts` | `144dd8ec67e8aaeffc5c3d90f6a06234d770abcd` |
| Regression `packages/qr-exchange/src/assembler.test.ts` in both RED and GREEN | `ee613b41e23d1d77ebe9caf3151ecef014bd22cd` |
| Unchanged `apps/web/src/components/CameraImporter.tsx` | `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` |
| Unchanged `apps/web/src/components/CameraImporter.multipart.test.tsx` | `58833ea84270b29d5b21eb5fb10ccb5a9928187b` |

Evidence-only commits after the implementation do not change the tested product/test blobs. Publication used the connected GitHub Git Data API because this checkout has no HTTPS push credentials. The [publication map](PUBLICATION_MAP.json) preserves local-to-published commit correspondence; every published tree and ordered parent was fetched back and verified. The published regression source is `6b683651e9795f7ece9477d5361738705ecbda44`, and the published implementation is `118ae827a5244156226c48e7d4cc3eb3524810ff`.

## Verification

Environment: Node **22.23.4**, npm **10.9.11**; dependencies installed from the unchanged lockfile with `npm ci --ignore-scripts`. Lockfile SHA-256: `1b22ab3e9f780d27a01b1beaa8c31b223b3649106e454e78fc50ac8d6900f517`.

All commands below ran from the repository root. Each linked JSON receipt records its exact command, source head/tree, selected input hashes before and after, timestamps, exit status and raw-log SHA-256. Tracked worktrees were clean and the recorded source inputs remained unchanged during each run. Raw logs retain their original output whitespace so their bytes match the receipts; the source diff check applies to the implementation delta, not whitespace emitted in those logs.

| Check | Exact command | Actual result | Receipt / raw log |
| --- | --- | --- | --- |
| Baseline regression | `npm exec --workspace @ghostpay/qr-exchange -- vitest run src/assembler.test.ts` | Expected exit 1: 1 failed, 12 passed. Failure is the missing expiry at 101 ms. | [receipt](evidence/red-assembler.json) / [log](evidence/red-assembler.log) |
| Original full package coverage | `npm run test --workspace @ghostpay/qr-exchange` | Exit 0: 239 tests in 7 files, all passed | [receipt](evidence/green-coverage.json) / [log](evidence/green-coverage.log) |
| Build with local dependencies | `npm run build -- --workspace @ghostpay/qr-exchange` | Exit 0: core-crypto, invoice-schema and qr-exchange built | [receipt](evidence/green-build.json) / [log](evidence/green-build.log) |
| Package typecheck | `npm run typecheck --workspace @ghostpay/qr-exchange` | Exit 0 | [receipt](evidence/green-typecheck.json) / [log](evidence/green-typecheck.log) |
| Original package lint | `npm run lint --workspace @ghostpay/qr-exchange` | Exit 0 | [receipt](evidence/green-lint.json) / [log](evidence/green-lint.log) |

Coverage: **97.57% statements, 95.17% branches, 100% functions, 99.08% lines**. Assembler coverage: 100% statements/functions/lines and 97.95% branches. The original package thresholds and configuration were retained. Counts overlap and must not be added together.

[Independent review](REVIEW.md) approved the frozen implementation and meaningful regression controls. This was a source review, not another test execution or external security signoff.

No full application suite, browser journey, contract analyzer or deployment was executed for this isolated change. Those gates remain the integration coordinator's responsibility on the eventual combined source. The earlier candidate's passing jobs do not qualify this new head.

## Ownership and integration

Worker: ChatGPT root in workspace `c374725a11b7`. Task branch: `fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7`. Owned changes are the two assembler files, the additive `docs/ai/ACTIVE_WORK.md` claim and this evidence directory.

At the last prepublication observation, canonical PR #278 remained at `d74af79e`. Its generation-5 shared integration lease belonged to the separate continuous coordinator. That coordinator's preflight-observation and merchant-ledger work remains untouched. Separate PR #292 owns the Pages artifact gate, CodeQL fixture clarifications and Sweep verification; this patch does not overlap its production or test files.

Publish this task as a draft targeting `release/ghostpay-beta-qualification-20261119`, preserve candidate ancestry, and leave integration to that coordinator. Before integration, recheck the current head and both assembler blobs, retain the failure-then-pass evidence and run the required checks against the combined source. Do not infer main/release readiness from the focused results here.

No dependency, workflow, contract, fee, guard threshold, deployment or shared candidate change is included. No API-funded agent or scheduled automation was invoked. Existing PR-triggered workflows are separate from this native execution.
