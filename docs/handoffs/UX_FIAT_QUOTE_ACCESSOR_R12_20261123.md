# GhostPay BUG-ONLY R12 — untrusted fiat quote getter exception boundary

**Date:** 2026-11-23 UTC. **Target:** static Pages browser beta; no runtime deployment. **Current main baseline:** `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.

## Ownership and scope

Isolated task branch `automation/20261123/bug/ux-fiat-quote-accessor-r12`. Owned production file `packages/ux-fiat/src/view.ts`, dedicated new regression file `packages/ux-fiat/src/view.quote-accessor.test.ts`, this handoff and a prepended additive claim in `docs/ai/ACTIVE_WORK.md`. No edits or merges to any other worker's branch.

Before writing, inspected the actual changed filenames of **all 265 open PRs** from paginated REST pages 1–3, through PR #510. **Neither owned code/test path appeared**. Broader consolidation PR #504 does edit adjacent `packages/ux-fiat/src/format.ts`, `rate.ts`, and `decimal.ts`; preserve their ownership and monitor adjacent integration. Refresh complete ownership at integration.

## Observed failure and root cause

`computeFiatView()` promises a no-throw, offline-safe display state and validates injected untrusted `RateQuote` inputs. On live main source blob `74f791587a6eba3cce0e7a4be98d7085196ffc4b`, it calls `parseRate(i.quote, policy)` without an exception boundary. The parser directly accesses `asset`, `fiat`, `rate`, `timestampMs` and `source`, so a JavaScript getter or Proxy throwing while reading any of those fields escaped `computeFiatView()` rather than returning the existing `invalid` state. No network, credential, wallet or malicious real-user exploitation is asserted.

Regression-first steps and exact GitHub commits:

- Ownership claim first: `92c72923968fc31fa399f36fc40f8f95eef346fc`.
- New dedicated Vitest regression **before production fix**: `7f7b92d61cd785c5f463af4a7a7ab8c105e5549a`. Covers five throwing accessor fields, Proxy trap, valid quote, ordinary invalid rate, absent quote, stale quote and future quote.
- Minimal production fix next: `8e1d4e8815bc1400e0f79795c6afb6792705c50c`, final `view.ts` blob `89d4b7f4ab59c83f216edaad83db54a912cae554`. Wrap only the existing untrusted `parseRate` call in try/catch and return `invalid` with fixed `bad-rate-format` / `quote could not be read` diagnostic when a property getter or Proxy throws. Successful and ordinary parser-error paths untouched.

## Actual execution evidence (not repository Vitest)

- Node.js `v22.16.0` and TypeScript `5.8.3` compiled an isolated reproduction with the complete, hash-matched production `view.ts` body but **dependency doubles for rate, format, conversion and shared types**. Prior to fix the five property-getter cases threw and a valid quote returned `ok`, 250050 minor units.
- On corrected production source the isolated `view.ts` SHA from `git hash-object` is exactly `89d4b7f4ab59c83f216edaad83db54a912cae554` matching the GitHub source blob. Compilation succeeded; five previously failing getters, a throwing Proxy and a normal quote all passed (7/7 directed checks; zero failures).
- **Not run:** full repository Vitest (including committed regression file), full workspace lint/typecheck/build, and native browser tests. Native GitHub checkout could not resolve github.com in the execution container. Source-exact view plus dependency doubles is bounded evidence, not whole-package native verification. Hosted exact-head GitHub CI is required.

## PR #390 and integration locks

- PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: five workflow groups (`CI`, `Pages`, `Beta acceptance`, `Hosting kit`, `CLI operator qualification`) completed successfully; Snyk success. GitHub reviews `[]`; `mergeable=false` against current main. No observed CI/code defect requiring modification of its owner branch; branch untouched. PR is open and ready for review, not draft.
- Integration metadata branch `automation/ghostpay-integration-lock`, commit `082e754f44944ebb4be283f89176b966bf8f7b4f` contains `integration-lock.json`, generation **12**, status **released**; this worker did not acquire or self-transfer it.

## Outstanding explicit gates

Draft and unmerged until (a) all required exact-head hosted CI checks fully GREEN, (b) applicable native browser verification, (c) a genuine independent review submission by a separate verifier, (d) no file/owner/dependency collisions on refreshed PR inventories and (e) legitimate held/released integration lock authorization for merging. A released lock is not ownership. No contract, fund, RPC, payment, deployment, release, dependency, redesign or new-feature changes.
