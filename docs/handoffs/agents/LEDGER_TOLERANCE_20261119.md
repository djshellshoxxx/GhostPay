# Merchant ledger tolerance recovery — 2026-11-19

## Result and scope

A positive-due invoice now requires a counted payment before tolerance can make
its status `paid`. A zero-due invoice retains its existing settled status. The
overpayment and expiry ordering is unchanged.

This selectively recovers **D-2** from draft PR
[#220](https://github.com/djshellshoxxx/GhostPay/pull/220), specifically commit
`6db114920589a38dbbb5d52f45bb7a52be98d9b6`. The recovery branch is
`chatgpt/ghostpay-ledger-tolerance-20261119`, based on coordinator commit
`3db3c3597666ceb77862481ee8ed4a38a6d2ff81`. The runtime file is byte-identical to
that historical fix. Its regression is retained, with one additional assertion
that an invoice owing zero remains `paid` under the same large tolerance.

Only `packages/merchant-ledger/src/reconcile.ts` and `ledger.test.ts` change in
the package. There are no dependency, protocol, payment-authority, analyzer or
release-gate changes. Other PR files and separately owned feature streams were
left untouched.

## Independent reproduction

The direct probe transpiles the current `reconcile.ts`, `decimal.ts` and
`errors.ts` into a temporary module and calls the public reconciliation function.
It does not import historical test helpers or a cached workspace build. The raw
records include SHA-256 hashes of all three source inputs and the TypeScript
version used.

| Input | Before | After |
|---|---|---|
| Due 50, no payments, absolute tolerance 100 | `paid`, paid amount 0 | `unmatched`, paid amount 0 |
| Due 0, no payments, absolute tolerance 100 | `paid` | `paid` |

Raw probe evidence: [before](evidence/ledger-tolerance-20261119/ledger-tolerance-independent-red.json),
[after](evidence/ledger-tolerance-20261119/ledger-tolerance-independent-green.json),
and the [probe script](evidence/ledger-tolerance-20261119/probe-ledger-tolerance.mjs).
The recovered regression also checks a 10,000-basis-point tolerance with no
payments, and confirms that a real positive payment can still use the configured
tolerance. The change does not choose a new tolerance policy.

## Verification

| Check | Result | Raw evidence |
|---|---|---|
| Historical regression on the unfixed runtime, plus zero-due control | 1 failed, 27 passed | [Baseline log](evidence/ledger-tolerance-20261119/ledger-tolerance-red.log) |
| Complete merchant-ledger package after the fix | 28 passed, 0 failed or skipped | [Final log](evidence/ledger-tolerance-20261119/ledger-tolerance-green.log) |
| Coverage | 100% statements, 99.32% branches, 100% functions, 100% lines | Same final log; thresholds unchanged |
| Package typecheck | Passed, exit 0 | [Typecheck log](evidence/ledger-tolerance-20261119/ledger-tolerance-typecheck.log) |
| Package source ESLint | Passed, exit 0 | [Lint log](evidence/ledger-tolerance-20261119/ledger-tolerance-lint.log) |

Node 24.22.3, TypeScript 5.9.3 and Vitest 5.1.0 are the existing workspace
versions. The checks used one worker and a 768-MiB Node old-space cap under the
shared qualification mutex with `flock --close`. No test budget, timeout,
assertion or coverage threshold was reduced. Empty static-check logs represent
successful commands, not skipped checks. Full CLI and repository-wide
qualification are outside this package result.

The coordinator independently reviewed the exact two-file change and confirmed
that positive due requires positive counted value, zero-due settlement is
preserved, and the original expiry/overpayment order remains intact. Review:
**PASS**.

[Machine-readable provenance and hashes](LEDGER_TOLERANCE_20261119.json) cover
the source files and all eleven archived raw evidence files. The archived bytes
were compared with their original scratch files before committing; logs are
explicitly tracked despite the repository's general log ignore rule.
