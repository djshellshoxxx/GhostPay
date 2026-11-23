# GhostPay Pages-only handoff: payment URI UTF-16 encoding fidelity

Cycle: 2026-11-21 04:40 UTC, one coordinator, sequential audit / test / implementation; no native subagent or independent verifier.

## Frozen source, scope and ownership

- Repository: `djshellshoxxx/GhostPay`.
- Exact base `main`: `aec179910c39081d820396409ff3139ff2264132`.
- Isolated task branch: `automation/20261121T0440Z/bug/payment-uri-utf16-failclosed`.
- Ownership claimed first in `docs/ai/ACTIVE_WORK.md` at `33674ede01835f54afc4650c30bda08bcff3a704`.
- Regression authored first at `16081d59ac4087a88ddf14ec3340d16d63b34e78`.
- Source correction at `e16588ae244d786e8fd892221e9bde93c19b175d`.
- Owned application files: `packages/payment-uri/src/query.ts` and new `packages/payment-uri/src/query-surrogate.test.ts` only.
- Broad integration PR #307 changes nearby decimal helpers but its inspected `query.ts` matches main. Active PR #313 owns `decimal.ts`, not these paths. Do not overwrite those branches.

## Reproduction and correction

The exported `pctEncode` forwards UTF-16 directly into `TextEncoder`. An unpaired high or low surrogate is silently converted to U+FFFD; `buildQuery` inherits the same substitution. This violates a strict payment-string fidelity boundary. JavaScript's Unicode-regex flag permits a precise guard: `/[\\uD800-\\uDFFF]/u` matches unpaired surrogate code units without matching valid UTF-16 pairs representing scalar values.

The new test-first Vitest file covers isolated/embedded high and low surrogates, malformed values through `buildQuery`, adjacent valid pair plus invalid surrogate, and successful exact Unicode percent-encode/decode round trips. The correction emits the existing `PaymentUriError('INVALID_ENCODING')` before the encoder can change input. Ordinary valid UTF-8 wire encoding remains unchanged. This exported-helper defect is defensive; payment builders already use `checkText` on display fields, and no direct Pages funds loss or XSS was demonstrated.

## Executed evidence and limits

- Local `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD`: **failed**, DNS resolution of github.com unavailable. No checkout is available.
- Local Node 22.16.0 isolated-equivalent check (not repository Vitest): **9/9 passed**. The baseline `TextEncoder` replaces isolated U+D800 with `EF BF BD`; the proposed Unicode-regex predicate rejects six malformed samples and accepts/round-trips three valid controls. This check verifies JavaScript semantics, not the final TypeScript module or workspace build.
- Repository Vitest, full package unit/coverage, TypeScript, lint, browser, static Pages artifact, CI security scopes and exact-head hosted checks: **not executed at the time of this handoff**. Do not count authored tests as passes.
- No external wallets, transactions, contracts, secrets, paid APIs or new dependencies.
- No independent reviewer; a same-operator self-review is not an independent approval.

## Isolation, lock and release guard

The separate repository lock `automation/ghostpay-integration-lock` was read as `status=held`, owner `994a0d214fb9-root-r3`, generation 11. Its expiry is not grounds for takeover. No shared integration/main branch update, lock write, force push, release, tag or deployment is authorized from this branch.

Reviewed `.github/workflows/pages.yml` and `release.yml`: normal pull requests validate without publishing; Pages deployment requires an explicit `workflow_dispatch` on main with `deploy=true`, and release requires a signed `v*` tag. No workflow or production setting was changed.

## Next invocation

1. Re-read fresh main, lock, #307 and this branch's exact head, plus any new overlapping PRs.
2. Inspect exact-head hosted CI, run `npm ci --ignore-scripts` then the unchanged package unit, lint, TypeScript and applicable browser/Pages checks in a runnable workspace.
3. Obtain genuinely independent review of the Unicode-regex behavior and test quality, including valid astral pairs, before treating the finding resolved.
4. Reconcile the minimal two-source-file change into the shared integration candidate only with a valid durable coordinator lock, current-head checks, required review and no deployment side effect. Keep the isolated draft PR until qualified.

This is a source-pinned engineering checkpoint, not a release, main merge, completed audit or full product qualification.
