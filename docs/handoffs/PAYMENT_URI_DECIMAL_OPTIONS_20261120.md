# QA-03 — Payment URI decimal precision typed error contract

One bounded GhostPay engineering cycle `20261120T0641Z`; this is a sequential second task, not an independently delegated worker. Base main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Branch `automation/20261120T0641Z/bug/payment-uri-decimal-options`.

## Previously reproduced finding

[PR #309](https://github.com/djshellshoxxx/GhostPay/pull/309) source-pinned CORE-QA-02 / QA-03: `parseDecimal('1', 0.5, 1000n)`, `NaN`, `Infinity` reach native `BigInt(...)` conversion and throw untyped `RangeError`. The public helper's stable `PaymentUriError('INVALID_AMOUNT')` contract is violated. Real payment callers use fixed integer precisions; this is an API robustness defect rather than a confirmed wallet loss issue.

## Repaired scope

Owner claim `3b9ccc177a05e2cf0c4a3e178442694861f9f7c0` before any edits. Maintained Vitest regression/source tests committed before production at `8098c48941faf7a2ba1a5dd2fd49eacf6a0364ef` and test-bound refinement `bc6dc98db9ca6dab88eab4162d78af8e486e8359`. Product commit `c65df042dedcda77565f2bbb0c0802867e0b5488` changes only `packages/payment-uri/src/decimal.ts` from blob `8d8ceb070d29d511a1080861f878bbc6d367798f` to `f5665dace3449a172abadcbd64eeec04f6a7bf74`.

Production code enforces the finite integer precision 0–77 shared with existing `toAtomic` and `formatAtomic`, before exponent conversion. Invalid fractional, nonfinite, negative, overdomain and nonnumeric runtime precision values receive fixed-message typed `INVALID_AMOUNT`. There is no new dependency, format change, RPC/wallet behavior or financial policy choice.

Seven maintained regression groups cover unsupported options and supported zero, two, eight, eighteen, and seventy-seven-place decimal roundtrips. This isolated task does not modify the separately owned QA-02 URI builder-length work in draft PR #311.

## Execution, evidence, blockers

Git CLI `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` was attempted and failed because `github.com` DNS resolution is unavailable from the execution container. Authenticated GitHub connector source writes/readback succeeded. **No repository Vitest, full coverage, typecheck, lint, web build or browser execution is claimed locally.** The previous QA's 199 passing payment URI cases are historical, not a pass on this fixed head. A true independent reviewer/worker was unavailable; this implementation has only same-actor source inspection.

Next cycle: inspect exact-head GitHub Actions and run `npm run test --workspace @ghostpay/payment-uri`, `npm run typecheck --workspace @ghostpay/payment-uri`, `npm run lint --workspace @ghostpay/payment-uri` on the final published source. Obtain independent review, cross-check the updated base/active PRs and durable lock, resolve any actual failures, and preserve nondeployment/security gates. Do not mark QA-03 resolved or merge until qualified.

Current lock read during the cycle was **released, generation 7**; the metadata ref was not mutated. Main was unchanged by either task branch. QA-01 backup controls, QC-01 reconciliation test, Mythril/external beta decisions remain separate and unresolved.
