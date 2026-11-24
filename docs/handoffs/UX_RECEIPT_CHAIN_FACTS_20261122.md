# BUG-ONLY handoff — malformed chain verifier facts must not confirm receipts

Date: 2026-11-22. Target: static Pages existing receipt verification (no contract, wallet, network or fund interactions).

## Exact repository provenance
- Live base `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `automation/20261122-r5/bug/ux-receipts-invalid-chain-facts`.
- Source path: `packages/ux-receipts/src/verify.ts`.
- Baseline source Git blob: `93f0c03f8dac4f9663f55751eeecf9d63313ed7b`.
- Repaired source Git blob: `0aa67457fa0ac641f8490bd9fcf317efa4e22268`.
- Ownership claim commit: `684b29d28b3bc739e8534e6b516a8ab1282560e6`.
- **Failing regression was committed before the production fix**: `c37b19cf3fe90658128d05e407c0aef5986b9e1f` (new `packages/ux-receipts/src/verify.invalid-facts.test.ts`).
- Minimal production repair commit: `7aae441114ba3317ebc2c026d69bafc873190db2`. One local object/confirmation-type guard in the existing `checkChain` flow; no new dependencies or interface changes.

## Defect and root cause
The injected `ChainVerifier.lookup` promises a typed `ChainLookupResult` at compile time, but malformed callback/runtime data can violate that interface. On baseline a resolved `{status: 'found', facts: {confirmed:'yes', amountBase:'1500000'}}` with a matching receipt amount reaches `!f.confirmed`, treats the string as truthy, and reports `chain.status='confirmed'`, which `verifyReceipt` promotes to `verdict='chain_confirmed'`. A resolved `{status:'found',facts:null}` or no `facts` throws while accessing `f.amountBase`, rather than degrading to unavailable as the verifier contract states. This is false confidence in receipt corroboration, not proof of an actual exploit or real-world fund loss.

The repair checks `facts` is a non-array object with `confirmed` strictly boolean before evaluating its fields. If not, `checkChain` returns `unavailable`, and `verifyReceipt` remains `self_consistent_unverified` with `chain_unavailable`. Valid `confirmed:true/false` and amount mismatches preserve existing behavior.

## Reproduction and tests — actual vs. pending
- Directly source-equivalent Node.js v22.16.0 control-flow reproduction of the relevant amount-only path, using the pinned source algorithm and no network. Baseline: 4 of 7 checks failed (string and numeric confirmation falsely `confirmed`, null/missing facts threw TypeError), nonzero test exit 1. Good baseline adjacent behavior: valid `true` -> `confirmed`; valid `false` -> `unconfirmed`; amount mismatch -> `mismatch`.
- Repeating the exact same cases with the one-guard repaired algorithm: 7/7 passing, exit 0. This reproduction was manually transcribed into a minimal JS harness; **it was not a checkout of the complete Git blob, a native Vitest run or a hosted CI result**. The new repository Vitest file adds six malformed cases and three neighboring outcome assertions.
- Native repository Vitest, typecheck, lint, workspace build, coverage, browser E2E: **not run locally** because checkout/dependencies are unavailable. Exact PR-head hosted GitHub Actions and applicable tests must qualify separately. Browser qualification is required only to the extent applicable to this pure receipt verifier; do not infer it from a Node harness.
- Independent reviewer: **none**. This author’s source review is not an independent approval.

## PR ownership, coordination, integration gates
Read main `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, PR heads, and Actions. Inspected 207 open PR changed-file inventories through #448; no PR modifies `verify.ts` or the new isolated test, but stale/concurrent heads must be checked again before integration. Broad PRs can modify `receipt.test.ts`, so that preexisting test file was deliberately not edited. The branch keeps an additive `docs/ai/ACTIVE_WORK.md` claim and this isolated handoff.

PR #390 (`b655bc273a6704c9c140287b8adcdf4085b91882`) was independently rechecked: all five hosted workflow groups successful and 37 of 39 check-runs successful (2 deployment jobs skipped); GitHub recorded **zero submitted reviews**. It was open and not marked draft at the checked instant, despite stale draft language in its body; its owner-controlled branch was not changed.

Main integration generation-11 lock remains held by coordinator `994a0d214fb9-root-r3`. Do not adopt an expired lease, edit the lock, promote this candidate, merge to main, deploy or release without legitimate ownership transfer, exact-head all-required CI GREEN, applicable native browser checks, independent review, resolved conflicts and author/ownership reconciliation. Keep the PR draft until then.
