# R43 — historical donor source review and uncapped artifact disposition

Repository: `djshellshoxxx/GhostPay`; immutable comparison main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Review checked: 2026-11-22T16:09Z UTC. R43 census/provenance: [SEMANTIC_DISPOSITIONS.json](SEMANTIC_DISPOSITIONS.json).
This is source analysis, **not** a claim of running repository tests, merging code, approving PRs, or deploying a build.

## Finalized source-equivalent donor: sparse invoice validation

- Historical `codex/ghostpay-cloud-41868394956`, exact head `f34a80f710d191b025538bae43cc9b4c92fd2455`, one commit ahead of historical merge base, changed four paths.
- Its `packages/invoice-schema/src/schema.ts` change replaces `Array#map` with `Array.from` in `validateLineItems` so sparse holes are visited and rejected, rather than accidentally validating as an empty list. Its `schema.test.ts` covers hole positions; `sign.test.ts` verifies signed-invoice refusal.
- Checked current main source blob `b6fae850aedfc3e6d35a32eb3c8b0a4ea217f544`, which already uses `Array.from` in the same validator. Main `schema.test.ts` blob `d48560381e74c3649419ac08e3fb4ba5eed03986` already contains the named sparse-hole test. Main `sign.test.ts` blob **`d477fdb5d25c899e47f16a83c9b15d3d89bbe7f9`** is byte-identical to donor `sign.test.ts`.
- All donor executable paths inspected; no missing unique fix in this slice. Final disposition: **already included by source and regression semantics**, despite divergent commit histories. Preserve branch ref.
- Source: [immutable compare](https://github.com/djshellshoxxx/GhostPay/compare/eb59d93cffed7848c4aac37d0e9650b87239c6da...f34a80f710d191b025538bae43cc9b4c92fd2455).

## Finalized safer-main donor: claimed-router checkpoint

- Historical `fix/remediation-b16c7936-5ce634`, exact head `0b213bd9d43409aaa9671945761e51892aa5d69e`, one changed executable file `apps/web/src/lib/scanClient.ts`. Donor file blob `67c9949a62e3df16766ac655ced5eda98042cd55`.
- The donor adds the `pageMatches` argument to `persistable` and replays claimed-router announcements from the current page. Main already retains that behavior, with **a further `m.announcement.blockNumber > floor` condition** that avoids repeatedly pinning a checkpoint at the already-retried floor. Main file blob `043fb19af6e3ccf88224122185192829eed29c92`.
- Importing the donor would regress the scan's progress/liveness rule. No source transplant. Final disposition: **superseded by stronger main implementation**; donor retained.
- Source: [immutable compare](https://github.com/djshellshoxxx/GhostPay/compare/eb59d93cffed7848c4aac37d0e9650b87239c6da...0b213bd9d43409aaa9671945761e51892aa5d69e).

## Unresolved candidate: historical policy-payment attempt migration

- `fix/remediation-f95457fd-22ecf9`, exact head `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a`, changes `apps/web/src/features/policy/send.ts` and its test. Donor production blob `0cc9a6faf499a1ef56520190a2db57c7b4fe6636`.
- The donor adds a regression for a previous calldata-keyed attempt and a guard before sending. This could protect against replay after a journal-key migration.
- **Not qualified for import.** Its broad fallback flags *any different payment journal key* for the same account and chain as `legacy`. That predicate cannot distinguish a genuinely old calldata-only attempt from a current differently scoped legitimate payment, so it risks blocking valid sequential payments. Current main's `refuseIfAlreadyPaid` checks the exact payment scope only; main production blob `7058f958a66eafc4c6bc77156cb968e5bd23cc40`.
- Next implementer must first inspect the complete wallet-attempt journal schema, find a reliable version marker or migration discriminator, define tests for legacy duplicate, two legitimate different payments, unknown outcome, token approval after mined unknown payment, account/chain isolation, storage failure, and explicit user clear. Coordinate the BUG-only owner and active PRs before touching this file. Do **not** cherry-pick the broad fallback or imply a confirmed exploit.
- Source: [immutable donor compare](https://github.com/djshellshoxxx/GhostPay/compare/eb59d93cffed7848c4aac37d0e9650b87239c6da...6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a).

## Two additional fully inspected nonapplication branches

- `automation/ghostpay-integration-lock`: head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; recursive tree `29b1267b51bd8ed068335949c929cf4e6c8985a1`, **one blob** (`integration-lock.json`), `truncated:false`. It is coordination state only. The live lock is **held** by coordinator `994a0d214fb9-root-r3`, generation 11. Preserve the ref; no expiry-based takeover.
- `gh-pages`: orphan head `cc8d07943a11b77fbed825c1ede0c8234140ad1d`; GitHub compare against main gives 404 **no common ancestor**. Complete recursive tree `d32b2933efaddab9405a94aab7ce8800f9255e16` has **29 entries**, `truncated:false`: generated JS and worker bundles, CSS/font assets, static HTML/help pages, deployment notes, and `.nojekyll`. Historical static build artifact, not source to blindly merge into main or a release instruction. Preserve this separate publication history and do not redeploy.

## Additional triage retained as unresolved

- `codex/recovery-spec02-unqualified-20261116` contains four files under `docs/recovery/spec02-unqualified-2026-11-16/`, including `.ts.txt` and an `UNCONFIRMED` patch. This is staged, unqualified source-like patch content, **not** a verified documentation-only discard; remain unresolved.
- `qualify/ghostpay-hygiene-composition-20261120-9a4ab6` includes six `packages/hygiene/src` production/test paths among 23 changed files. Its evidence directory does not make this an audit-only branch; remain unresolved.
- `chatgpt/ghostpay-idle-lifecycle-20261119` and other large integration histories exceed GitHub's 300-file compare cap. R42 recorded uncapped structural trees for named donors; large diff counts are not proof of uniqueness or redundancy. Preserve unresolved dispositions.
- `automation/20261120T0035Z/worker/qr-kind-primitives` implements QR primitive input guards already proposed by the owner of [PR #290](https://github.com/djshellshoxxx/GhostPay/pull/290). Do not duplicate or overwrite the owned recovery candidate.

## Verification and limits

All classifications use immutable branch SHA comparisons, direct donor/current-main file reads and, for the two nonapplication branches, complete `truncated:false` recursive Git trees. This run performed **no local Vitest, Node, TypeScript, lint, build, browser, Tor, Mythril or real-funds tests**; the container could not resolve `github.com`. No code PR, protected-main merge, independent GitHub approval, security-gate waiver, deployment or release was performed. The held integration lease and separately owned payment/recovery code remain untouched.
