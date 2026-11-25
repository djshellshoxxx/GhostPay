# GP-BUG-R11 — Truncated EVM receipt address case comparison (2026-11-21)

## Scope and exact source state

- Repo: `djshellshoxxx/GhostPay`; target: static Pages v1 beta existing `@ghostpay/ux-receipts` helper.
- Baseline `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (2026-11-21 GitHub branch API).
- Task branch: `automation/20261121/bug/receipt-evm-truncated-tail-r11`.
- Pull request (DRAFT): https://github.com/djshellshoxxx/GhostPay/pull/426 .
- Task ownership claim, committed before test/source modification: `a2172ddc1aa0e3c5a2b0f2ffb662e59642872797`.
- RED first regression commit: `336952def3223e683d8c87ec6c5ab8c48da7882b`.
- Minimal runtime repair commit: `6c6e8895b95993732e561d3ff3792d45f72d4ef1`.
- `packages/ux-receipts/src/address.ts` original blob `455ecae74f2339f0fd88fe8160aadbaab21719d0`; fixed blob `a259aa6ca0dfbfbb2f87a0f94f6c9c449cbbff9e`.
- New `packages/ux-receipts/src/address.case.test.ts` blob `4f75bd89dfcd1f734059a9de92d782f25dd2365a`.
- Nonfunctional write: append-only isolated ownership claim in `docs/ai/ACTIVE_WORK.md`. No preexisting tests, manifests, workflows or deployment files changed.

## Observed failure and root cause

Existing `redactAddress(actual, { head: 6, tail: 4 })` returns `0xAbCd...EF01` for a valid mixed-case, 42-character EVM address. `matchesAddress(revealed, actual)` should return `true` because the redaction is produced by the same package from the same address, but returned `false`. The helper lowercased `actual` and the 0x-prefixed `head` but passed the extracted 4-character `tail` through `norm(tail)`. Because the suffix has no 0x prefix, this helper failed to lowercase it. The issue also applies to `head = 1` and uppercase `0X` prefixes, and can produce incorrect receipt-to-transaction/address comparison results. No actual fund impact is demonstrated.

## Failing test before fix

The test-first commit added isolated Vitest scenarios for mixed-case EVM standard, short-head, uppercase 0X and long-suffix receipt truncation round trips; changed-address rejection; non-0x case-sensitive truncation; original full-address behavior. The existing `core.test.ts` is owned by broad consolidation PRs and was not modified.

Exact baseline `address.ts` text was copied locally byte-for-byte; `git hash-object src/address.ts` returned `455ecae74f2339f0fd88fe8160aadbaab21719d0`, matching GitHub's blob. TypeScript 5.8.3 compiled it with the actual upstream `ReceiptError` type (also blob-hash-matched) and the exact `isAddress` predicate copied from upstream `validate.ts`. Node v22.16.0 showed four failing redaction round-trip expectations (standard, head=1, uppercase prefix, longer suffix), while existing lower-case matching and non-EVM controls succeeded. This is source-equivalent reproduction, not repository Vitest.

## Minimal correction and local source-equivalent verification

After the RED commit, the next commit adds one local `suffix` variable in `matchesAddress`: when normalized `actual` starts with `0x`, compare the redacted tail case-insensitively; for non-0x strings keep the existing exact suffix comparison. The full-address path and original head comparison are unchanged.

Local proof:
- `tsc --target es2022 --module nodenext --moduleResolution nodenext --outDir dist src/*.ts`: completed successfully in an isolated proof folder with upstream `address.ts`, upstream `errors.ts`, a type-only `AddressForm` stub and the verbatim upstream `isAddress` predicate.
- `node check.mjs`: before correction, 4 mismatches and exit 1; after correction, 0 mismatches and exit 0. Baseline and repaired helper were compiled from byte-matched upstream/fixed Git blob source.
- `node neighbor.mjs`: **3,180 passing assertions** across multiple EVM cases and 1–16 character head/tail combinations, changed-recipient negatives, non-EVM case-sensitive controls and inherited full-address expectations.
- Repaired local `git hash-object src/address.ts`: `a259aa6ca0dfbfbb2f87a0f94f6c9c449cbbff9e`, exactly equal to the GitHub connector's post-commit blob.
- **Not run locally:** repository Vitest, full workspace typecheck, lint, build, native browser tests and deployment. GitHub DNS resolution fails for repository checkout; the standalone TypeScript proof is NOT a repository test run. Any hosted CI results must be checked at final PR head, not at an ancestor.

## Ownership and integration constraints

Main's `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md` read at this cycle; active registry has no claim for `packages/ux-receipts/src/address.ts`. GitHub open-PR inventory observed >= 180 PRs, with direct changed-filename checks on the broad #238/#262/#264/#278/#372 and targeted #307/#371/#246/#260/#259/#250/#249/#248/#244/#240/#239/#343/#380/#408/#419/#422/#423/#424/#425. No inspected PR touches the production file or isolated regression file. The broad PRs *do* own `packages/ux-receipts/src/core.test.ts`, hence no edits there. Remaining open PRs and all heads should be checked again before integration; this is not a claim that all open PRs were exhaustively enumerated.

PR #390 at head `b655bc273a6704c9c140287b8adcdf4085b91882`: 39 check runs, 36 success, three skipped, no pending/failing; five associated workflows completed successfully, Snyk commit status success. Zero independent submitted reviews. PR is open and no longer draft. Its production file has separate overlapping PRs #419/#422, needing coordination. No branch from that workstream was modified.

Durable `automation/ghostpay-integration-lock/integration-lock.json` on the `automation/ghostpay-integration-lock` ref is `held` by external `994a0d214fb9-root-r3` at generation 11, blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`. The recorded expiry does not authorize this worker to acquire or clear the lock. No merge, branch deletion, force push, contract/fund interaction, real-world traffic attack, release or deployment occurred.

## Handoff gates / next bounded cycle

1. Confirm PR #426's final exact head and all mandatory hosted checks: unit, lint, typecheck, builds, browser full/lean where applicable and security. Repair genuine failures **on this branch only** if still owned and source-pinned.
2. Obtain separate independent reviewer/source and, when applicable, native browser verification. This run has no genuinely separate reviewer; self-review is not independent approval.
3. Reconcile live overlapping PR/file ownership and held integration lock, including PR #390/#419/#422 dependencies. Leave #426 draft until all required gates clear; never infer authorization from expiry alone.
4. After recording qualification, continue with another unowned, independently reproduced existing-functionality bug in a different Pages function or package.
