# GhostPay R14 — POS runtime clock and bigint validation (2026-11-21 UTC)

## Source-pinned ownership and reproduction
- Source main: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (unchanged during this run).
- Prior consolidated branch census: R9 #378 (447 exact heads compared to same main), R12 #401 (468 heads with 22 deltas), R13 #403 (470 heads, 59 truncated ancestry triage).
- New read-only exhaustive GitHub pagination: `100/100/100/100/73/0`, terminal empty; `git/matching-refs/heads` returned **473** matching source SHA heads. Relative to R13's 470 names/heads: 470 unchanged, 3 added, 0 moved or deleted. Each new branch was compared to immutable main:
  - `audit/ghostpay-r13-capped-lineage-20261121` `bb668e18b1bad2e92811c22ca57cb019b1b4b281`, ahead11, behind0, 34 paths; existing docs/ledger PR #403.
  - `automation/20261121/bug/large-amount-noise-bound-r1` `699c8db24451a5ff6c034b1f247c48e6cc0bdd45`, ahead9, behind0, 5 paths; existing issue repair PR #404.
  - `automation/20261121T1238Z/bug/unix-timestamp-runtime-guard` `11117b9fff062d859c9db123ff62641cc0479192`, ahead12, behind0, 5 paths; existing stacked repair PR #405.
- This isolated task branch `automation/20261121/bug/pos-runtime-guard-r14` was created **after** that 473-head census, thus subsequent live inventory should include at least one additional name. No duplicate donor or consolidation PR was opened for those three branches.
- Existing R13 59 capped comparisons still require semantic inspection (30 graph-ancestors of #372, 5 descendants owned by stacked PRs, 24 divergent); ancestry is not a merge-safety judgment.
- Exact issue source: [#400](https://github.com/djshellshoxxx/GhostPay/issues/400) `packages/merchant-hooks/src/pos.ts` original blob `976b988020f73bb26d1191036fdab65c1b65d55b`, static mirror `examples/pos-terminal/pos-logic.js` original blob `5a7356b179858c13a70862354c17023e99887ee1`. Before fix, `NaN` now creates an awaiting session with `expiresAt=NaN`; a numeric positive due amount passes a bigint comparison and numeric payment can cause a mixed bigint/number runtime TypeError. Existing issue gives isolated reproduction; not demonstrated as a wallet or real-funds exploit.
- Ownership: `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and `docs/ai/ACTIVE_WORK.md` read. Checked changed-path inventories of PR #307, #372, #371, #278, #262, #264, #398, #401, #403, #395, #404, #405, #265 — none touches the four core owned source/mirror/test paths. #398 changes existing `hooks.test.ts`, which this patch does not edit.

## Implementation
Tests were committed first:
- `fdd6847c9bbfe6d053756c3c34a05b4a1652bd02`: new `packages/merchant-hooks/src/pos.runtime.test.ts`, malformed now, unsafe expiry, invalid bigint types, strict expiry boundary and terminal absorption.
- `64492b3343331cc81d9df0503a3cb8d3cf4250a3`: static POS parity regression additions in `examples/pos-terminal/parity.test.mjs`.
- `3ea654c97e70f14a4cf88089596090a9228da1af`, corrected comment in `a8627676e1880c6f409f1f256d44facb90e81dd1`: type-safe implementation in `pos.ts`.
- `6879a71baff116e3d5da0aee68b6bacfde9c9629`: matching static/bundler-free `pos-logic.js` runtime validation.
- `6603b7e42283fa2596baae83cafd7c81f661daa1`: corrected intentionally malformed TypeScript test fixtures under `exactOptionalPropertyTypes`.
- Other changed file: additive task ownership entry `docs/ai/ACTIVE_WORK.md`. No wallets, transfers, key material, contracts, hosted services, dependencies or build workflows changed.

Input policy: start requires nonnegative safe-integer Unix seconds, safe-integer expiration `now+ttlSeconds`, bigint positive due; awaiting operations reject invalid clocks or absent/nonfinite expiry; payment amounts must be bigint; zero/negative bigint payments remain ignored. Existing valid TTL 30..900, payment sum, expiry equality, wrong invoice/currency, terminal absorption and event ordering remain unchanged. Static page and library use parallel rules and tests.

## Verification and gates
- GitHub compare at test+repair checkpoint: 7 commits ahead, 0 behind current main and only five changed paths. The documentation handoff adds one sixth path.
- The runner's Node is 22.16.0 and npm is 10.9.2, but `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed DNS resolution (Could not resolve host: github.com). **Repository Vitest, TypeScript typecheck, ESLint, build and static parity script were not executed locally. No RED/GREEN repository test results are claimed.**
- Required hosted commands: `npm run test -w @ghostpay/merchant-hooks`, `npm run typecheck -w @ghostpay/merchant-hooks`, `npm run lint -w @ghostpay/merchant-hooks`, `npm run build -w @ghostpay/merchant-hooks`, `node examples/pos-terminal/parity.test.mjs`, and relevant workspace CI/browser/integration checks.
- Security limits: user-facing static browser-only noncustodial Pages scope unchanged. This is a library/static demo input-validation fix; do not claim direct browser exploitation or fund-loss impact.
- Integration lock `automation/ghostpay-integration-lock:integration-lock.json` remains HELD generation 11 by `994a0d214fb9-root-r3`. No override, main merge, force push, deployment, release, or real-funds operation. Independent review and full exact-head CI required before merging.

## Next handoff
1. Confirm latest main and PR ownership; run exact-head CI/test/parity and repair any failures.
2. Get independent security/correctness review for runtime error contracts and consistent static parity.
3. If qualified and lock released through owner-approved coordination, integrate the isolated PR into main; otherwise leave draft.
4. Continue semantic review of 24 divergent capped branches from #403 without importing broad ancestor/descendant branches redundantly.
5. Route R14 census evidence to canonical ledger #380; do not create another parallel authoritative ledger.

## Review correction — preserve cancellation under malformed clock/expiry

After self-review, moved the `cancel` case ahead of validation of injected clock and stored expiry in the awaiting state. This preserves the original ability to terminate a sale without relying on a valid clock; it cannot authorize a payment. Positive payment and tick events still fail closed on malformed timing. Fixed source `c1ef374c6cfd6d4c449559f86cfaa688bce00f75`, static mirror `b9a436574483118278b5e3d1011cc851f2945a21`, runtime regression `176370b1e55977987c24f9b8649518ec49c37528`, static parity regression `f26ceaac8f48930ffe605dea153db04eb91dfa69`. Pre-handoff head `f26ceaac8f48930ffe605dea153db04eb91dfa69`. The test updates explicitly assert cancel succeeds even when now is nonfinite or the stored expiry is corrupted. New exact-head qualification is required; prior queued CI runs cannot qualify this corrected source.
