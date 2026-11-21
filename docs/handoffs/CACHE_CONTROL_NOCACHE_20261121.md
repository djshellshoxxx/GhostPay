# GP-BUG — reject no-cache responses under the cache-first storage planner

Date: 2026-11-21
Scope: one existing behavior in `@ghostpay/ux-notify`, BUGS ONLY
Base `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`
Isolated branch: `automation/20261121/bug/cache-control-no-cache-r3`
Owned source: `packages/ux-notify/src/cache-policy.ts`
New test: `packages/ux-notify/src/cache-policy.nocache.test.ts`
Shared coordination: additive branch-local entry in `docs/ai/ACTIVE_WORK.md`

## Observed bug and root cause

For a cacheable static hashed asset, `classifyRequest` produces a `cache-first` decision. A fetched response with `Cache-Control: no-cache` requires revalidation before reuse, but the existing `shouldStoreResponse` predicate rejected only `no-store` and `private`. It allowed `no-cache` to enter a cache-first bucket, which would subsequently be reused without a revalidation path.

Source-pinned initial production Git blob: `c642dad57f8784a6d3259d25fb3e0115aa808108`.
Node 22.16.0 source-equivalent reproduction (no repository checkout) of the original predicate:
- `no-cache` => cacheable `true` (incorrect for cache-first)
- `public, no-cache` => `true` (incorrect)
- `max-age=3600, NO-CACHE` => `true` (incorrect)
- `no-store` => `false` (unchanged)
- `public, max-age=31536000, immutable` => `true` (unchanged)

No service worker, browser network traffic, wallet, RPC, funds or deployment was exercised. This package is a pure cache-policy planner; a deployed service-worker exploit is not claimed.

## Test-first repair

1. Initial ownership claim commit: `ebd55631b4cd81f6d9cce7ce2fdae1d698ded11b`.
2. **Failing regression committed before product repair:** `c6ba0d2ff2557a2d04ca0836c5fe2f1e86fd1ce9`. New 4-case Vitest test file checks three `no-cache` variants and prior immutable/no-store/private behavior.
3. **One-expression production repair:** `1f426392f5ac40cdb41338eb9bfeea9abe1a043d`, extending the existing directive test to include `no-cache`.
4. Fixed source blob: `2941713030f24096ac36fb764feed78f5c6b2a28`; new regression blob: `63671e33655a26bb97e008c797aa82fdacdfbff2`.

The production change leaves request allowlisting, status/type/content-type checks, other response directives, storage decisions and the default cache configuration untouched.

## Verification and outstanding gates

- Before fix: source-equivalent Node reproduction of three incorrect `true` decisions, based on source blob above.
- After fix: 14 Node 22 source-equivalent assertions **passed** (three targeted cases and 11 neighboring cases including clean, no-store, private, non-200, opaque/cors, Set-Cookie, uncacheable, nonstorable content-type and Vary `*`).
- **Not executed locally:** actual repository Vitest, lint, typecheck, workspace build, coverage and browser suites. The local environment's `git ls-remote` failed with `Could not resolve host: github.com`. Node reproduction is not a substitute for those tests.
- **Pending as of handoff creation:** exact draft PR head GitHub-hosted CI (including ux-notify tests), applicable browser/native checks and review by a genuinely independent verifier. Check the latest head SHA and checks after each change; no review is manufactured.
- No merge while another coordinator holds the generation-11 integration lease. The lock status is taken from the current PR coordination handoffs, not a confirmed lease acquisition in this run. Recheck held/released metadata and ownership before any integration.
- Broad open PRs #238/#264/#278/#372, plus #243/#307/#365/#380/#395/#403, were checked for changed source/test paths. None changed these exact two paths; the registry path overlaps by design and this task only prepended its own entry. Reinspect all fresh heads and other open work before promotion.
- No deployment, release, main mutation, contract/funds interaction, additional dependency, feature or unrelated refactor.

Next independent verifier: execute `npm --workspace @ghostpay/ux-notify test`, its lint/typecheck/build commands, validate the three regression assertions on the exact head and compare HTTP freshness behavior. Report independent findings rather than self-approve. The owner/coordinator must close all CI, browser, review, dependency and integration-lock gates before merge.
