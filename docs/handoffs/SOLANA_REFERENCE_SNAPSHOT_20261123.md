# Solana Pay reference snapshot — engineering cycle 20261123T1041Z

## Exact source and task ownership

- Inspected live main at `8ddb344973e80b8e1eda6821e970ee6a2b808b29` on 2026-11-23 UTC. Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, and `SECURITY.md`.
- One ChatGPT GitHub-connected coordinator performed discovery, source audit, reproduction, implementation, and self-check sequentially. **No independent native worker or verifier ran.**
- Isolated task branch: `automation/20261123T1041Z/bug/solana-reference-snapshot`, based on exact main above. Claim commit `ed4af00b69e4dca280ed9c6bc36d0aa0cfd317f3`; regression-first commit `50bd00541a7278179e159e42ddf594a88877b889`; production fix `f19c001eec15ebb1640da6bf9b3bff6b7be86251`; typed-fixture follow-up `4e1dc67aae64e3fcbd1eac22fdd7891e5346dcd7`.
- Owned files: `packages/payment-uri/src/solana.ts`, new `packages/payment-uri/src/solana.reference-snapshot.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, and this handoff. No other production file changed.
- The large active consolidation [PR #504](https://github.com/djshellshoxxx/GhostPay/pull/504), exact observed head `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`, includes many payment-uri edits but not `src/solana.ts`. Broad #278 and #372 touch shared payment-uri tests, not the selected source/new test. No exhaustive complete-branch semantic audit is claimed. Recheck claims before integration.
- Integration-lock branch `automation/ghostpay-integration-lock` observed at `082e754f44944ebb4be283f89176b966bf8f7b4f`, `integration-lock.json` generation 12, **status released**. The C1 coordinator claims anticipated generation 13; this cycle did not acquire or transfer any lock, and does not authorize main merges.

## Finding, reproduction and correction

`buildSolanaPay` on the main baseline first evaluated `new Set(refs).size !== refs.length` to detect duplicate references, then iterated `refs` again when building the query. A getter-backed reference array returning distinct valid Solana addresses during the Set check and a duplicated address during serialization bypassed the intended uniqueness rule. The generated URI cannot round-trip through `parseSolanaPay`, which rejects repeated reference keys with identical addresses.

A standalone Node 22.16.0 **source-body-equivalent**, dependency-stubbed harness reproduced the defect: two reads of mutable entry 1 produced serialized references `[SYSTEM, SYSTEM]` after checking `[SYSTEM, WRAPPED_SOL]`. The production correction now parses each reference exactly once in one pass, deduplicates the validated canonical references, bounds their count to eight, and serializes those same validated strings. Existing address validation, URI grammar, noncustodial behavior and return/error API are preserved.

New regression-first Vitest file has five cases: getter read-once and builder/parser round-trip, duplicate rejection, normal ordered references, maximum reference limit and sparse array rejection. The committed test suite is **not yet executed locally**.

Command actually executed: `node /tmp/solana_ref_repro.cjs` (Node v22.16.0); baseline defect reproduced and **5/5** corrected directed assertions passed. This script is a scratch-only, source-body-equivalent harness, **not** the repository test run. `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed locally with `Could not resolve host: github.com`; the source and branch were fetched/committed through the authorized GitHub connector. Local full dependency install, package Vitest/coverage, ESLint, TypeScript build and browser tests were **not** executed. Do not represent this as independent verification, a full security audit, or release qualification.

## Consolidation-side audit signal, separate from owned change

The integrated C1 PR #504 exact head `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` [Core CI 45151780276](https://github.com/djshellshoxxx/GhostPay/actions/runs/45151780276) failed: web test `Sweep.test.tsx` B-R6 false skipped-dry-run warning and browser full/lean both failed contextual-help focus and 900px RPC-row alignment. Individual TypeScript typecheck/lint and contracts checks passed; aggregate `typescript` failed owing to upstream job failures. Read-only coordinator message [#504 comment 7098299604](https://github.com/djshellshoxxx/GhostPay/pull/504#issuecomment-7098299604) documents exact jobs and blockers. No C1-owned files were modified. A separate CodeQL check also reports failure despite successful individual Analyze language jobs; investigate rather than waive.

## Remaining gates and next cycle

1. Verify exact final source/ref and open draft PR; inspect new hosted CI for `@ghostpay/payment-uri` and all required scopes, including new regression, ts-typecheck, ts-lint, static build, full/lean browser and Pages validation. Repair actual failures on an isolated child branch, not by rewriting shared history.
2. Obtain genuinely independent verifier review of exact candidate and test quality, especially malformed references, sparse arrays, getters/proxies, output round-trip and backwards compatibility.
3. Reconcile #504's active integrator and re-evaluate main and all touched-file owners. The branch must remain isolated until valid atomic integration-lock ownership, qualified CI and independent acceptance exist.
4. Continue separately on #504 failed C1 integration jobs; do not hide or delete failing tests. Preserve the earlier ten Mythril reports as unresolved without independent finding-by-finding clearance.

No main/shared merge, release, deployment, tags, contract changes, fee policy decisions, paid coding agents, force-push, production configuration, or real-funds actions occurred. GitHub Pages browser-only scope and noncustodial key handling remain unchanged.
