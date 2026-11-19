# Historical pool input guard recovery — 2026-11-18

Status: **REPAIRED — VALIDATION PENDING**. Independent review and exact published-head
hosted checks remain coordinator-owned. No publication or merge is asserted by this handoff.

## Source identity and ownership

- Repository: `djshellshoxxx/GhostPay`.
- Branch: `repair/ghostpay-history-pool-values-20261118-local`.
- Refreshed main/base: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.
- Ownership claim: `8fc4c47f`; test-first source: `b4a8527c`.
- Reviewed implementation candidate: `b22d71475e84519af7fdad9a5571452e088bc4ae`.
- Complete implementation tree: `0a1f38c3f4a6e79a371916c4ba716e6156b9f7e1`.
- Historical inputs: `ea1f0b244f0adf4794e55cda6dc7dbd1e5f4039c` and
  `768b1f4cc86638e747cb1553297d012973c4cbb0` from `claude/lucid-meitner-apalzc`.
- All 44 open PR file lists were checked; none changes `src/inputs.ts`,
  `src/helpers.test.ts` or `test/witness.test.ts` in this package. No current
  pool-circuits ownership claim was found in the active integration registries.

This is selective recovery of existing validation requirements. It does not enable
the experimental pool in the Pages application or add a deployment path.

## Confirmed defect and repair

The current `GhostPayShieldedPool` refuses zero deposits, withdrawals and ragequits
with `InvalidValue`. The TypeScript input builders accepted zero existing/withdrawn
or ragequit values and could prepare inputs for proofs that the contract cannot use.
The historical branch contained three corresponding nonzero guards that were absent
from main. This repair restores those guards with existing `OUT_OF_RANGE` errors and
fixed messages. Positive values, partial withdrawals and full withdrawals remain valid.
In particular, a full withdrawal still permits a zero-value change commitment.

Tests cover the three zero boundaries, both positive limits (`1` and `2^128-1`),
and the existing 200-case range property with zero withdrawal rejection added.

The old patch cannot be ported blindly: two witness fixtures used zero-valued helper
inputs. The intentional raw-circuit zero-withdrawal test now starts from a valid
positive helper input, overrides the raw witness value to zero, and retains all nine
public-output assertions. The separate `existingValue >= 2^128` negative fixture uses
a valid positive setup before applying its existing forged-value mutation. Circuit
constraints, cryptographic functions, proof formats, verification keys, verifier
contracts, Solidity sources, dependency pins and CI gates are unchanged. D-11 now
states the distinction between strict application helpers and raw circuit behavior.

## Executed checks

Commands below ran from `packages/pool-circuits` unless a root command is noted.
The existing exact-version packages were reused in an isolated dependency directory;
this is not a claim that a fresh whole-repository `npm ci` completed.

| Check | Actual result |
| --- | --- |
| Test-first `node ../../node_modules/vitest/vitest.mjs run src/helpers.test.ts --coverage=false --maxWorkers=1` at `b4a8527c` | **4 failed, 15 passed** with unchanged production input builders; zero boundaries and property counterexample `[0n, 0n]` reproduce the mismatch. |
| Same helper command on corrected source | **19 passed** on Node 24.22.3 / Vitest 5.0.5. |
| Same helper command with Node 22.23.5 | **19 passed** on the implementation commit. |
| `node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1` | **23 passed, 59 skipped**; existing artifact-dependent suites cannot run without wasm/zkeys. Available source coverage: statements **100% (129/129)**, branches **100% (73/73)**, functions **100% (22/22)**, lines **100% (114/114)**. Existing thresholds unchanged. |
| `node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | Passed with TypeScript 5.9.3. |
| `node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src test` | Passed with ESLint 10.15.0. |
| `node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json` | Passed. |
| Root `bash scripts/scan-secrets.sh` | Passed: no committed env files or key material. |
| Root `bash scripts/check-actions-pinned.sh` | Passed: all 111 action references pinned. |

No skips were added or changed. Full witness/proof execution, including the preserved
raw zero-withdrawal assertion, remains unverified locally because the build artifacts
are absent; skipped cases are not passes. The pinned Circom 2.2.3 compiler was unavailable
on PATH, and no new ceremony or verifier generation was attempted. Exact-head hosted
qualification, the independent review and unchanged repository requirements must pass
before merging. Main must be refreshed and the combined tree revalidated if it moves.

## Historical supersession found during this review

Other portions of historical `016fa252` must not be reapplied as a whole commit:

- `maxQueue` validation already exists on main with stronger immutable capacity
  capture plus invalid-input and post-construction-mutation tests in `workerB.test.ts`.
- Split-token `tx.origin` scanning already exists in `scripts/check-tx-origin.mjs`,
  including strings/comment-marker regressions and malformed-input rejection.

Both were incorporated through `7abb31233917c068ee0de1f93a4159b7f84874ba`.
Their absent historical patch IDs do not imply absent behavior. The AST browser-scan
portion remains a separate candidate requiring its own review and scope.
