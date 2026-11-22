# GhostPay — sparse friendly-policy record validation (2026-11-22 UTC)

## Scope and ancestry
- Task: fail closed on missing indexed values in browser-client policy previews and conversion, without contract or runtime service changes.
- Branch: `automation/20261122T2038Z/bug/policy-sparse-records`.
- Existing parent PR: #437, exact baseline `9e72c9820ed457f18c2635e17da629216eedbbdf`. Main observed `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Parent production `policy.ts` Git blob `42515d886b244598a563788513344cdfb90521d0`; repaired blob `42df64daa4dfdbe2ca3214ae70f7caa1fa554070`.
- Commit order: ownership `77a809614864802410413a7912e20821f83f4f99`, tests-first `23e17299d473b2e55ac05f47ff89852296b32fd9`, minimal production repair `338c2f271b3411fc9d021c0df1a26898091b13cf`.
- Owned paths: `packages/ux-privacy/src/policy.ts`, new `packages/ux-privacy/src/policy.sparse-records.test.ts`, append-only `docs/ai/ACTIVE_WORK.md`, this handoff. Existing `policy.test.ts` and #437 remain untouched. No shared ledger was changed.

## Reproduction and root cause
The current `validateFriendlyPolicy` uses `Array.prototype.forEach` for `spendLimits`, `allowlist`, `guardians`, which skips array holes. A runtime sparse array with a valid first row and a missing second row incorrectly passes validation:
- A missing spend-limit row leaves `ok:true`; `describePolicy` later visits it with `for...of`, causing an untyped error, while `toSchemePolicyInput` can carry a hole forward.
- A sparse allowlist containing the withdrawal destination can pass despite having an unvalidated missing entry.
- A guardian list with sparse entries can accept an approval threshold that counts an absent guardian; guardians remain explicitly NOT_ENFORCED by the actual contract, so do not present the threshold as live chain protection.
This is a runtime input-shape consistency defect, not evidence that sparse arrays arrive from normal canonical JSON or that an exploit against deployed funds exists.

## Test-first fix
New Vitest test file `policy.sparse-records.test.ts` covers:
1. Missing spend-limit row rejected with `INVALID_LIMITS` and downstream description/conversion denied.
2. Sparse allowlist rejected with `INVALID_ADDRESS`.
3. Sparse guardian row rejected with `INVALID_GUARDIANS` and description denied.
4. Entirely sparse guardian list rejected.
5. Valid dense and empty arrays still accepted, including #437's empty-guardian-threshold rejection.

Production code replaces only the three `forEach` loops with `for...of .entries()`; this visits holes as `undefined`, reusing existing error paths and changing relevant loop exits from `return` to `continue`. Existing warnings, limit bounds, token validation and on-chain contract assumptions are unchanged.

## Verification: executed vs outstanding
- Executed: local Node v22.16.0, `node /tmp/ghostpay-sparse-array-replay.cjs`, 14/14 source-equivalent iterator assertions passed, including baseline skips and fixed rejection/dense/empty controls. **This is a limited reproducer, NOT the repository module or committed Vitest.**
- Verified via authenticated GitHub: parent #437 CI `44980936442`, Pages `44980936446`, Beta `44980936400`, Hosting `44980936411` and CLI `44980936478` all succeeded at the parent head only; do not transfer those results to this child.
- Exact-child repository Vitest, lint, typecheck, static build, browser acceptance and independent verifier review: **not run yet**. Native clone is blocked by `Could not resolve host: github.com`. No red hosted test-only run was available at check; source-evidenced baseline bypass is recorded instead.
- `.github/workflows/pages.yml` was inspected on current main: PR events validate artifacts and do not publish; deployment needs a separate main-only `workflow_dispatch` with `deploy=true`. No deployment or production settings modification authorized.
- Parent #437 and large recovery PRs #278/#372 retain separate owners; recheck all overlapping exact-head changes before merge.
- Durable integration metadata `automation/ghostpay-integration-lock` SHA `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`: `held`, generation 11, other owner `994a0d214fb9-root-r3`; expired clock alone does not authorize takeover. No integration/main merge or metadata update.

## Next cycle
1. Check exact PR head and every required hosted CI / Pages / browser job. Repair any actual failures on a new owned child only as appropriate.
2. Request genuinely independent source-and-test verification and inspect parent/child combined diff; self-audit is not independent approval.
3. Reconcile parent #437, root integration lock, source/target SHAs, review and deployment gates before any main merge.
4. Continue resolving remaining Mythril findings and fund-recovery external clearance in their own security-owned workstreams; none was addressed here.

No contract edits, release, deployment, real-funds activity, new dependency, force-push, lock theft or suppression of security findings occurred.
