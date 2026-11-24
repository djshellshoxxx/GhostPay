# Team G: isolated milestone escrow supporting model

- Repository: `djshellshoxxx/GhostPay`.
- Branch: `codex/unified-escrow-support`.
- Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
- Ownership claim: `085f5b30`.
- Reviewed implementation: `307f9008` (`test(escrow): add isolated authority and conservation reference model`).
- Workers: original `escrow_support` draft, resumed by `escrow_finish`; Caveman workflow.
- Independent reviewer: `final_review2`, source review and independent 19/19 test execution at `307f9008`.

## Completed scope

The standalone model in `scripts/experimental/milestone-escrow` enumerates all stage/action
pairs and requires explicit release and dispute authority choices. It models exact-value
funding, fixed submission time, exclusive dispute/inclusive release deadlines, mutual refund,
mutual or fixed-arbiter resolution, one-way terminal states, unsigned 256-bit accounting,
atomic rejection, signature-oracle failure, domain/payload/nonce binding and canonical replay.

Its 19 tests include all 42 state/action pairs and bounded exploration of 15,444 attempted
transitions and 396 reachable states across four variants. Separate adversarial examples expose
indefinite mutual-consent lock and the ability of a compromised fixed arbiter to favor either
party. No liveness, fairness, signature implementation or custody claim is made.

The README records the transition inventory, conservation argument, explicit policy trade-offs,
assumptions, research/reuse provenance and next decisions. Specification 17 now links to this
support while retaining its design-blocked status. The historical reuse survey is annotated:
its administrator-only pause and shared milestone identifiers conflict with the design brief
and are not accepted implementation guidance. No external escrow code or new dependency was added.

## Validation

Node `v24.22.1`; commands executed against source `307f9008`:

```sh
node --test --experimental-test-coverage scripts/experimental/milestone-escrow/model.test.mjs
node --check scripts/experimental/milestone-escrow/model.mjs
node --check scripts/experimental/milestone-escrow/model.test.mjs
git diff --check HEAD^ HEAD
```

All 19 tests passed, zero failures/skips; Node reports 100% line, branch and function coverage
for `model.mjs`. Both syntax checks and the diff check passed. Independent reviewer repeated
the same 19-test coverage run and found no blocking defect within the stated design boundary.

Separate temporary-copy mutations were detected: removing nonce equality failed 2 tests;
changing release `>=` to `>` failed 10; accepting non-`INVALID` verifier results failed 1;
swapping payout destinations failed 10; removing the resolved-release time lock failed 1.
The committed model was never mutated for those runs. The final unmodified suite passed again.
The initial exploration test used too few timing schedules for its >500-attempt guard; adding
distinct inclusion delays exercised the intended timing dimension. No authority rule or
assertion was relaxed to obtain a passing result.

`rg` found no `milestone-escrow` or `GhostPayMilestoneModel` reference under `apps`, `packages`,
`.github` or root `package.json`. Existing ESLint configuration explicitly ignores all `.mjs`
files; its ignored-file result is not counted as lint coverage. No TypeScript, browser, Foundry,
Anvil, EIP-712/ERC-1271 contract, token callback or hosted CI acceptance is claimed for this model.
No test or tool process remains running.

## Remaining blockers and next actions

Specification 17 remains unimplemented as a product. Accept a separate custody/dispute ADR,
including release mode, resolution authority, deadlock/lost-key behavior, token/fee/deposit
rules and initialization before any contract or fund path. No policy was silently selected.
Then specify real signatures/state commitments, implement and independently audit a separate
contract refinement, qualify token callbacks and chain/reorg handling, and implement bounded
encrypted manifests, mandatory backup verification and explicit buyer/seller workflows.

Guardian recovery remains governed by the separate unaccepted ADR-0028 decision. This work
neither replaces that existing 19-test model nor changes production `PolicyAccount` authority.
No main merge, deployment, release, signing, external audit or production acceptance occurred.

## Integration

Cherry-pick `307f9008`, followed by this handoff commit; preserve claim `085f5b30` in the
coordinator's ownership history if useful. No source dependency exists on the parallel registry,
Bitcoin, relayer or locale changes. Re-run the standalone command after integration and link
this source-scoped evidence from the authoritative master completion ledger.
