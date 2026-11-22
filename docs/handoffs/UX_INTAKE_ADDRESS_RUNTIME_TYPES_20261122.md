# GP-BUG: non-string raw address runtime inputs cause TypeError

Date: 2026-11-22 UTC (automated BUG-ONLY isolated work)  
Repository: `djshellshoxxx/GhostPay`  
Exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`  
Branch: `automation/20261122-r7/bug/ux-intake-address-runtime-types`

## Scope and ownership

Only `packages/ux-intake/src/address.ts`, new `packages/ux-intake/src/address.runtime.test.ts`, additive branch-local `docs/ai/ACTIVE_WORK.md`, and this new source-pinned handoff were changed. No feature, dependency, contract, wallet, network, CI workflow, deployment or release action was touched.

The live inventory on this run listed **211 open PRs** (REST pages: 100, 100, 11). Changed-file inventories were checked for broad overlapping-donor PRs #278, #264, #262, #372, #307, #302, #246; related #424; and recent #452–#445. None claimed either targeted path. #424 changes `packages/ux-intake/src/deeplink.ts`, not `address.ts`. The sampled file-path checks are **not** represented as a 211-PR full changed-file audit. Recheck any new worker claims, heads and broad PRs before promotion.

## Confirmed existing bug and source-matched reproduction

`packages/ux-intake/src/result.ts` documents its exported Result as *non-throwing for untrusted parser input*. However, `validateAddress(s: string)` calls `parseBech32(s)` for values that do not match EVM format, and this immediately calls `s.toLowerCase()`. Untyped JavaScript/plugin/JSON callers can pass `null`, `undefined`, numbers, arrays, objects, bigint, symbols or booleans; all were directly observed to **throw TypeError** instead of returning the documented existing `{ ok: false, code: 'bad-address' }` form.

The exact GitHub `main` source files were copied and confirmed with `git hash-object`: `address.ts` blob `f7754728d475b1c791de771727d5647c64797b43` and `result.ts` blob `74a6a294caef828e72f5b48e2a1a86491b23f677`. Node v22.16.0 `--experimental-strip-types` ran a module-resolution-only `./result.js` -> `./result.ts` import shim; no program semantics were changed. Baseline observed `TypeError` for null, undefined, 42, [], {}, 2n and a Symbol; the unchanged EVM literal succeeded and the zero-address string returned `bad-address`.

## Test-first repair and exact provenance

1. Branch ownership/claim commit: `49df854d975b7679420a062126b78a9d834102b8`.
2. **Regression committed first**, before production edit: `183f9c4e29bf8eff3b7fdbb85f87fcbb747552ba` — dedicated Vitest cases cover eight runtime nonstrings plus neighboring valid and invalid strings.
3. Minimal one-guard production fix: `89c28e0774d4a9d6e26eab03d7522ea3158fc282`: return existing typed `bad-address` for `typeof s !== 'string'`, leaving the EVM/Bech32 paths intact.

Production Git blob after fix: `a26dce85aa5a87b83a388e8fde09912dff88e551`, independently reproduced by `git hash-object` of the local canonical patched source. Regression blob: `893f18ad1eacb780d2a52eaa575a7c7428de02eb`. No existing test was overwritten.

## Verification results and boundaries

- **RED:** actual baseline source via Node produced TypeError for seven nonstring classes, violating the typed Result contract.
- **GREEN:** fixed source via Node passed 14 direct assertions: eight malformed runtime values, EVM canonical success and mixed-case flag checks, zero EVM rejection, invalid text rejection, invalid Bech32 rejection; another five neighboring source-matched fixture assertions passed using the repository's published EVM, Bech32 and Bech32m fixtures (including uppercase Bech32).
- **19/19 source-equivalent Node assertions passed**, **not repository Vitest**. Local repository checkout, full Vitest, lint, typecheck, build, and native browser tests were not run; availability of a complete local repository/dependency environment was not established. The new Vitest regression must be verified through hosted GitHub CI on the final exact PR head.
- There is no genuine independent separate verifier in this run. No independent review is claimed.

## Related PR #390 and integration gates

PR #390 unchanged at exact `b655bc273a6704c9c140287b8adcdf4085b91882`: CI (run 44898786362), Hosting kit (44898786427), Pages (44898786411), Beta acceptance (44898786416), CLI operator qualification (44898786403) all concluded success on that head. The GitHub review list is empty. PR #390 is **open and not marked draft** in the latest GitHub metadata despite being described as draft in previous handoffs. PR #422 has a separate owner and overlapping display-text changes; neither owner path was modified.

A separate coordinator holds the externally tracked **generation-11 integration lock**, per the pinned #390 handoff; this worker neither owns nor transfers it. **Do not merge** the new draft PR or #390 without all required exact-head CI GREEN, relevant native browser checks, true independent approval, dependency/conflict reconciliation and legitimately acquired integration ownership. Do not deploy or release.

## Next verification

Check the newly published draft PR and its exact head for CI/Pages/Hosting kit/Beta/CLI, evaluate any failures at the specific head, get an independent reviewer and recheck ownership/lock. If full head gates are not satisfied, keep it draft and record the outstanding work rather than merging.
