# GhostPay R36C — cache-first no-cache response correctness (source-pinned)

**Date:** 2026-11-22 UTC. **Main:** `eb59d93cffed7848c4aac37d0e9650b87239c6da` (unchanged at start). **Branch:** `automation/20261122-r36-consolidation/bug/no-cache-response`. **Scope:** existing browser-only `ux-notify` service-worker policy helper, no real network/custody/contracts.

## Finding and minimal repair

`packages/ux-notify/src/cache-policy.ts`, main blob `c642dad57f8784a6d3259d25fb3e0115aa808108`, allows an otherwise allowlisted hashed asset response with `Cache-Control: no-cache` to be stored for cache-first reuse. A cache-first read has no revalidation step, so serving such a cached response would violate the response's required revalidation directive. This is a **source-level freshness defect**, not proof that the current production service worker invokes this planner or has exposed secrets. The existing `no-store` / `private` blocklist and all other filtering remain unchanged.

One predicate extension now also rejects `no-cache`, including a field-name form and mixed case, with a brief reason comment. No change to origin/path allowlists, static asset selection, request caching, service-worker deployment, interfaces or dependencies. New fixed source blob `9170969f4a31a4da87d346f3cbe61d5b72a500ae`.

## Ownership, exact commits, evidence

- Active ownership claim `c18c19eaf7221107104703a435a556069268b8c9` (branch-local additive `docs/ai/ACTIVE_WORK.md`).
- Test-first commit `2ae98539bb1ece99e40ef14448259b4a7e6f239f` adds `packages/ux-notify/src/cache-policy.no-cache.test.ts`.
- Minimal repair `fc81d8e36af2ae7d0c5eac1ea99974c1968d3525` changes only `packages/ux-notify/src/cache-policy.ts` and preserves existing public, private, no-store, content-type and status behavior.
- Executed **Node 22 source-equivalent replay** of the exact old/new regex and neighboring `shouldStoreResponse` logic: old predicate accepted all five tested `no-cache` variants; new predicate rejected all five; four neighboring expectations passed. This was **not** a full imported repository module or Vitest execution.
- The committed Vitest suite is **unexecuted locally** because the working-container `git ls-remote` could not resolve github.com. Source-equivalent replay is not CI, static build or browser acceptance.
- Inspect exact PR-head GitHub Actions workflows after publication; require all applicable suites, browser checks, code-owner independent review and ownership verification before any merge.
- Changed-filename inspection of major overlapping #372/#278/#264/#262/#371/#307/#302/#246, #433/#439 and recent #453–#455 found no direct `cache-policy.ts` or new-test path collision. This is NOT a full 214-PR path-by-path audit. Preserve others' ownership.
- The shared integration lock is `held` at generation 11, owner `994a0d214fb9-root-r3`; its date fields have expired, but authorized handoff was not established. Do not overwrite shared integration, force push, deploy, release or submit real funds.

## Related v1.0/v1.1 integration handoff

#372 remains draft recovery/privacy composition; its contract Mythril, Tor and Firefox/WebKit qualification plus confidentiality issue #414 remain separate blockers. #449→#450→#452 is a separate, unmerged receipt-safety stack; #427→#440→#441→#443 is separate unmerged wallet journal safety. Do not duplicate them. F10 M4 was initially observed on `feature/f10-durable-cas-m4-20261122` at **test-first head `262f3e910bda7a4a8ced81a02b38bcc800dea94b`** (two commits ahead of M3 `7079eedfc67180c9a0012c7154758e41fe6208c9`) with only `vault.test.ts` and an ownership claim. **Subsequent live verification supersedes that observation:** draft [PR #456](https://github.com/djshellshoxxx/GhostPay/pull/456) reached `e0041646ef7a4f5a69d2c74ed65279592f1bf79d` and **does include** new `vault.ts` encrypted snapshot/CAS implementation, tests and handoff stacked on M3. Its hosted workflows were pending at this checkpoint, and F10 still lacks host key-derivation/lock wiring, invoice issuance/export, backup migration, UI/i18n/a11y and browser recovery qualification. **Do not import the early test-only head or call F10 complete.**
