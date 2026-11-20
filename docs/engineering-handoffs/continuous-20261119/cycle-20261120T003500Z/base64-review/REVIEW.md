# Independent base64url qualification — cycle 20261120T0034Z

## Scope and identity

Independent native worker: `/root/base64_review`. This worker did not author the original PR #289 implementation or its integration into #278. The review used an isolated worktree, with no changes to another worker's source or GitHub branch.

- Original candidate: [PR #289](https://github.com/djshellshoxxx/GhostPay/pull/289), `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64`.
- Original baseline: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Current canonical candidate: [PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278), `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- Isolated verification branch: `automation/20261120T0034Z/base64/independent-verification`.
- Ownership-only commit: `9bb17d9a`; its invoice package is identical to canonical d74.
- Canonical invoice-package Git tree: `dcd6fb655436753f0b45fbaa034c184063a14a83`.
- Live #289 and #278 heads were refreshed after execution and remained the exact heads above.

Policies read: `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and `docs/ai/ACTIVE_WORK.md` from canonical d74. The generic HANDOFF is a template and was not treated as an actual qualification record.

## Review outcome and deduplication

No additional production defect was found in the base64url change. The guard at `packages/invoice-schema/src/base64url.ts:53` rejects all non-primitive-string values before reading properties, performing coercion, or allocating output. The existing decoding loop and encoder are unchanged. `Base64UrlError` in `src/errors.ts:54` retains fixed class, code `BASE64URL`, and message `invalid base64url encoding`; it never embeds the rejected value.

The production blob is byte-identical between #289 and #278: `5466ee0b99925dedd23e753636ae7ab3f6f48234`. The original baseline blob is `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb`.

The original #289 test blob is `8d32596d0fa34f6ebc40f3ccae11f1d9d620e8e5`. Canonical #278 uses `8d959c2b144182d0d0f576214dc7b761b7166c47`; its only difference is removing the unused `_index: number` parameter from the crafted `charCodeAt` fixture. This preserves the fixture's behavior and all assertions. The exact original PR's lint failure is therefore already repaired in the canonical candidate. No duplicate fix or change to the original PR branch was made.

This is a low-severity API-boundary correctness repair. This review establishes no payment exploit, funds-loss path, cryptographic-format change, or full-product security approval.

## Actual local execution

Environment: native Node `22.23.4`; repository Vitest and coverage provider `5.1.0`; TypeScript `5.9.3`; ESLint `10.15.0`; fast-check `4.10.2`; noble curves, hashes, and ciphers each `2.4.0`. These versions were read from the coordinator's isolated, pinned dependency installation; `dependency-versions.json` records them. Local execution uses the current canonical toolchain, not the original PR's Vitest 5.0.5 toolchain.

Commands below ran in `packages/invoice-schema` through the exact executables recorded in the companion JSON receipts. Complete outputs are retained as `*.log.gz`; each receipt hashes the decompressed log bytes. No timeouts, coverage thresholds, assertions, exclusions, pool settings, or source configuration were changed.

| Execution | Result |
|---|---|
| Original committed #289 `base64url.test.ts` against original baseline decoder, via `vitest run src/base64url.test.ts` | Expected RED: 1 failed, 4 passed; native TypeError for undefined violates Base64UrlError contract. |
| Same original committed test against fixed decoder | 5/5 passed, including the 300-run arbitrary-byte property test and all eight runtime-invalid inputs. |
| Independent reviewer probe against baseline | Expected RED: 21 failed, 4 passed. |
| Same independent probe against fixed decoder | 25/25 passed. |
| Restored canonical package: `vitest run --coverage` | 14 files, 804 tests passed, no skipped tests; exit 0. |
| `tsc -p tsconfig.json --noEmit` | Passed, exit 0. |
| `eslint --config ../../eslint.config.js src` | Passed, exit 0. |
| `tsc -p tsconfig.build.json` | Passed, exit 0. |

Full canonical coverage: statements **98.07%** (864/881), branches **97.6%** (612/627), functions **100%** (117/117), lines **99.29%** (707/712). Existing package thresholds remain 95/90/95/95. Full coverage ran from 00:40:11Z to 00:43:58Z; the final package build completed at 00:44:08Z on 2026-11-20 UTC (2026-11-19 in Vancouver).

The independent probe separately exercises 22 invalid runtime values: undefined, null, several numeric values including NaN/Infinity, both booleans, ordinary and typed arrays, array-like objects, a boxed string, bigint, symbol, function, null-prototype object, Date, throwing proxy, and revoked proxy. It verifies the fixed class/code/message for each. A separate case proves that property getters and coercion hooks are never touched. Controls compare 513 deterministic byte-string encodings and decodings with both the unmodified baseline implementation and Node's base64url encoder, and preserve 12 malformed-text rejections. The 25-case probe source is retained as `reviewer-probe.ts.txt` for review; it is not added to product source.

Baseline source substitution and temporary reviewer files existed only in the isolated verification worktree. Both production and committed test files were restored byte-for-byte before full coverage/type/lint/build. `git diff --exit-code d74af79ebabdc8cead843361c3497b46d8c421f9 -- packages/invoice-schema` passed after all execution. No production or test change is part of this verification handoff.

## Exact upstream hosted evidence

The GitHub workflow query for original #289 head `856b2d60...` returns [CI run 44631965189](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965189), with overall conclusion **failure**. Logs identify the actual CI checkout as synthetic merge `137411e42312a758d95638e6b65174c334e61763`, merging that exact source head into baseline `c977b5d6...`. The fetched commit and job logs identify these parents; full synthetic-merge-tree equality was not independently hashed by this worker.

- [Invoice unit shard job 135940701405](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965189/job/135940701405) ran the actual repository package under **Vitest 5.0.5**, with **13 files / 729 tests passed**, including all five original base64url tests. Coverage: 98.09% statements, 97.74% branches, 100% functions, 99.26% lines; base64url itself had 100% in all four measures.
- [Lint job 135940701265](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965189/job/135940701265) failed at `base64url.test.ts:36:33`: `'_index' is defined but never used` (`@typescript-eslint/no-unused-vars`). This is a concrete source/test lint defect, not an infrastructure failure. Canonical #278 already fixes it without weakening rules.
- Core CI typecheck/build, unit shards, full and lean e2e, and contract jobs report success; the aggregate TypeScript job fails due to lint.
- The four other associated workflow runs report success: [Pages 44631965076](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965076), [Hosting kit 44631965578](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965578), [Beta acceptance 44631965114](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965114), and [CLI qualification 44631965553](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965553). This worker did not execute CLI-product development.

`hosted-upstream-evidence.json` preserves normalized workflow/job results and the invoice/lint log excerpts. Hosted tests are clearly distinguished from this worker's fresh native execution.

## Acceptance and remaining gates

Independent base64url source, regression, malformed-input, valid-byte, and canonical invoice-package verification is complete with no introduced blocker found. The original #289 head remains unqualified for merging because its exact-head lint check fails. Its production behavior and test-only lint repair are already present in canonical #278; prefer that canonical candidate instead of reintegrating a duplicate implementation.

This scoped review does not qualify the entire #278 application, newer changes, hosted browser jobs on a later head, strict Mythril findings, external security approval, integration-lock ownership, required GitHub reviewer policy, or release/deployment conditions. The coordinator must reconcile those separately before any integration. This worker made no GitHub mutation, lock acquisition, merge, deployment, release, paid API call, or real-funds operation.
