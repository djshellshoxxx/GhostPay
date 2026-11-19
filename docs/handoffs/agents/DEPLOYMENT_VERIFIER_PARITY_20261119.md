# Deployment verifier policy implementation parity — 2026-11-19

## Requirement and source

Historical feature requirement `F-DEP-02` identified divergent deployment readback
checks. At base `264cf86b59bc5663136af9cb16f8b5ad67620aea`,
`verifyDeployment()` checked the router, sweep relayer and optional policy factory,
but never read the policy implementation code. The other verifier,
`verifyManifestOnChain()`, already compared both policy hashes. A signed policy
implementation hash therefore could be ignored by web/CLI readback acceptance.

This task owns only `packages/chain-adapters/src/verify.ts`, its focused tests,
the active-work claim and this evidence. It does not change either verifier's
provider selection, manifest format, contract ABI, authority, or deployments.

## Change

When a policy section is present, `verifyDeployment()` now obtains the policy
implementation bytecode through its existing `codeHash()` helper and compares
its Keccak hash to the signed manifest's implementation hash. Missing or malformed
code uses the existing fail-closed error. A different hash returns
`DEPLOYMENT_UNVERIFIED`. If a secondary provider was supplied, the existing
read helper requires both providers to agree on the new read as well.

The valid policy test fixture now includes real implementation bytes and the
matching hash. Three adverse regressions cover missing code, a different hash
while the factory still matches, and a secondary provider reporting different
implementation bytes. Existing successful policy and non-policy cases remain.

## Qualification

- Node 22.23.4; Vitest 5.1.0. Dependencies and package build artifacts were copied
  independently from the completed `GhostPay-ci` install with the same lockfile;
  this is not a claim of a fresh install.
- Before the runtime change, the focused verifier suite produced **21 passed,
  3 failed**, with all three new cases incorrectly resolving instead of rejecting.
  See `evidence/deployment-verifier-20261119/verify-red.txt`.
- After the change, `verify.test.ts`, `deploymentsVerify.test.ts` and
  `deployments.test.ts` produced **51 passed, 0 failed, 0 skipped** with one
  worker and a 768 MiB Node heap cap. See `verify-green.txt`.
- Full package TypeScript passed at a 512 MiB heap cap. The earlier 768 MiB
  attempt was killed with SIGKILL and no compiler diagnostics; its receipt is
  retained. Typed lint found two unnecessary fixture assertions; an equivalent
  explicit `it.each` case type replaced them. Final two-file ESLint then passed,
  and the final verifier suite passed **24/24**, with no skips. The full package
  typecheck preceded that type-only cleanup; runtime source was unchanged.
- `git diff --check` and the repository secret-material scan passed. Exact hashes,
  commands, failed attempts and limits are in `qualification.json`.
- The coordinator independently reviewed the source and adverse cases and found
  no blocker. Author and reviewer are distinct. Hosted combined-source checks
  remain the coordinator's integration gate.

No external RPC, wallet, deployment, signing key or release was used by these
synthetic verifier tests. The change proves parity of the existing readback
checks; it does not qualify any real deployed policy contracts.
