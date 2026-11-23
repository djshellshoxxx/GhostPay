# GhostPay — runtime query encoder input boundary, 2026-11-21 UTC

## Exact ownership and source
- Role: single sequential assistant coordinator / test author / implementer; no delegated agents, native independent verifier or separate reviewer.
- Isolated branch: `automation/20261121T0638Z/bug/payment-uri-runtime-types`.
- Base: draft PR #360 `automation/20261121T0440Z/bug/payment-uri-utf16-failclosed` at `2844ec6c22fe179987585679a934e10033ff3384`. This retains the previously committed unpaired-surrogate fix, which passed its own exact-head GitHub CI (run 44867503788).
- Current main at cycle discovery: `eb59d93cffed7848c4aac37d0e9650b87239c6da`; main moved since the prior cycle and was not the base of this stacked change.
- Claim commit: `23981a06aa21bd476dd9e45648f2a9702357be27`.
- Failing-regression intent: `0d6dc7f7b6f3afd454b1049d1f27962b2f03e71a`, followed by TypeScript cast correction `4fe8d078495f2639a4aea5e9929c3dd8d62f2099`.
- Production fix: `0f823488003c2980c830cc6a41d16bbadb1f1109`.
- Owned source: `packages/payment-uri/src/query.ts`, new `packages/payment-uri/src/query-runtime-types.test.ts`, additive branch-local `docs/ai/ACTIVE_WORK.md`, this handoff.

## Finding: exported percent encoder coerces nonstring values
Original `pctEncode` assumes its TypeScript string signature is enforced at JavaScript runtime. Neither JavaScript RegExp.test nor TextEncoder.encode verifies that assumption. Node 22 reproduces `undefined → ''`, `null → 'null'`, `42 → '42'`, and `['note'] → 'note'`. The exported encoder can therefore turn a runtime-invalid memo or payment-request value into a different accepted text value without a typed error. This is **API input fidelity / low-priority correctness**, not a confirmed wallet exploit, privacy breach, funds loss or reachable browser flow.

Fix: fail immediately with existing `PaymentUriError('INVALID_INPUT')` when `typeof s !== 'string'`, *before* UTF-16 scalar validation or TextEncoder. Preserve prior PR #360's `INVALID_ENCODING` result for unpaired surrogates and valid UTF-8 output. No signature, crypto, payment routing, fee, storage, network, provider, contract, dependency, workflow or deployment change.

## Test and audit evidence
- Before the source change, executed `node` JavaScript primitive coercion reproduction, confirming all four examples above.
- After change, executed **18/18 pass** in a Node 22 source-equivalent harness for nonstring primitives, objects/boxed strings, `buildQuery` propagation, valid UTF-8 roundtrip, exact emoji URI encoding and surrogate refusal. This harness is **not** repository Vitest or an exact-source suite; it does not qualify the PR.
- Four repository Vitest cases committed in `query-runtime-types.test.ts`. **Not executed locally**: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`. Do not claim `tsc`, ESLint, full build, browser E2E, Mythril or security jobs as executed for this change.
- Parent #360 exact head `2844ec6c`: CI #44867503788 completed success, with web/other unit jobs, typecheck/lint and both e2e jobs successful; Pages #44867503716 and Beta #44867503717 completed success. **These qualify only the parent head, not this new branch.**
- Independent review: **not performed**. Source inspection and the source-equivalent checks are self-checks.
- Branch ancestry: this is a narrow dependency of #360; do not merge into main directly or cherry-pick over its unpaired-surrogate change. Main and integration heads must be re-fetched before acceptance.

## Integration governance
- Read metadata branch `automation/ghostpay-integration-lock`, `integration-lock.json`: generation **11**, status **held**, owner `994a0d214fb9-root-r3`, base `2876b7db580e47a880d5951ce9e62941bcf76fdf`. The recorded lease has passed its timestamp, but no owner reconciliation or atomic takeover occurred. **Do not use this cycle to merge or alter shared ledgers.**
- Other active broad feature/privacy work, including #307 and #293, is left untouched. `docs/automation/` was absent on the inspected default branch; existing `docs/ai/` and `docs/handoffs/` are used without establishing conflicting shared ledgers.
- No release, Pages deployment, main/protected integration, contract update, real-funds action, force push, gate weakening or paid agent execution.

## Next independent cycle
1. Fetch exact public head, compare with #360 and fresh main; confirm the new branch has no unreviewed conflicting edits.
2. Inspect exact-head CI job results; execute committed Vitest, TypeScript, lint, build and applicable browser regression checks. Do not equate this equivalent Node check with actual repository tests.
3. Obtain genuinely independent source/security review of `query.ts` and both test suites.
4. Coordinate with PR #360 owner and lock holder. Integrate only after lock ownership, final source/target CI, protection/reviews and deployment-trigger gates are verified; otherwise keep the stacked draft intact.
