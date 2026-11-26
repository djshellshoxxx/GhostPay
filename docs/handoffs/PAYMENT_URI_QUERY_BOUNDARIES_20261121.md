# GhostPay — query decoding and builder key-boundary repair (2026-11-21)

## Exact source and ownership
- Coordinator: single assistant, sequential source audit, test-first implementation, self-check and integration triage. **No independent worker or reviewer.**
- Branch: `automation/20261121T0842Z/bug/payment-uri-query-boundaries`, stacked on PR #370 exact head `3d57d9881033f60786fecb3a71562af445441a3e` (itself stacked on PR #360).
- Latest separately inspected main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Main is **not** the branch base.
- Claim commit `12d3083d26fb6f97cd415fabce341a2dd45fd74b`; test-first commit `6dd751ff6e8e3054043ba43954ed2b69fb872362`; production commit `8d0036907ed6ad9cb9b8987b411c51bab249e7d4`, `query.ts` blob `069cc8ba0dba247e4e65cc28c637781ab03d49af`. This handoff document is the final checkpoint commit's content.
- Owned paths: `packages/payment-uri/src/query.ts`, new `packages/payment-uri/src/query-boundaries.test.ts`, additive branch-local `docs/ai/ACTIVE_WORK.md`, and this handoff.

## Finding and bounded repair
Three exported query helpers failed closed inconsistently at JavaScript runtime even though TypeScript signatures use strings. `pctDecode(42)` and `parseQuery(42, opts)` previously threw raw TypeError rather than the package's typed `PaymentUriError('INVALID_INPUT')`. The exported `buildQuery` also interpolated keys without validating the parser's existing `KEY` grammar, so `buildQuery([['memo&recipient','x']])` produced ambiguous, parser-invalid syntax. The corrected helpers reject nonstring decoder/parser input and malformed/injecting builder keys with the already-defined typed errors, while retaining all accepted parser keys and valid string encodings. No evidence of an exploitable Pages flow or funds loss was established.

Tests were committed before source changes. They cover nonstring primitives/objects, query builder malformed and injection-like keys, existing valid EIP-681 ABI keys, Unicode values, repeatable query parameters, empty percent-decoding, and invalid UTF-8. The previous `pctEncode` runtime type guard and malformed-surrogate protection remain intact.

## Actual verification and limitations
- Reproduced baseline raw TypeError for `pctDecode` and `parseQuery` with Node 22; reproduced array/object coercion and query-key interpolation behavior by source inspection.
- Executed a **source-equivalent** Node 22 harness on the corrected functions: **28/28 passed**, zero failed; this is a manually reconstructed equivalent from the inspected source, **not** repository Vitest or a formal security audit.
- Git checkout in this environment still fails: `fatal: unable to access 'https://github.com/djshellshoxxx/GhostPay.git/': Could not resolve host: github.com`. Consequently root npm tests, project TypeScript, ESLint, build, browser E2E, contract analysis and Mythril were **not run locally**. The four committed Vitest cases are pending hosted exact-head execution.
- Parent PR #370 exact head `3d57d988` has five successful hosted workflows (Core CI run [44876705707](https://github.com/djshellshoxxx/GhostPay/actions/runs/44876705707), Pages, Beta, Hosting, CLI); 35 check runs are completed, with 3 publishing-only steps conditionally skipped. These **do not qualify this new commit**.
- Independent verification/GitHub approval: **not performed**. The self-check cannot be counted as independent.
- Static Pages workflow inspected: PR validation builds and tests but does not publish; publishing requires an explicit `workflow_dispatch` on main with `deploy=true`. Actual repository branch protection is inaccessible to this GitHub integration (403), so no protected merge is authorized.

## Lock, dependency and continuation
- Integration-lock metadata branch `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, file `integration-lock.json`: **generation 11 held**, owner `994a0d214fb9-root-r3`, with an expired timestamp. No takeover without owner reconciliation. Do not merge this branch into main or shared integration while lock is held. The lock was not modified.
- Active recovery/privacy work PRs #372/#373, integration #307, parent query branches #360/#370, and bug review #312 remain separately owned. This isolated correction is dependent on #370 then #360; do not merge directly into main or silently rebase others' work.
- No contracts, crypto, custody, key storage, fees, relayers, services, production settings, dependencies, deployment workflows, main/ref protections or real-funds behavior changed. Other versions remain paused.
- Next: verify exact-head CI and logs; repair any failure on this owned branch, obtain independent source review and source/target protection checks, coordinate parent integration only with valid lock ownership. If any gate remains unresolved, retain as draft and preserve failures.
