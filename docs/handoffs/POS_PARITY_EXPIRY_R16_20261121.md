# R16 — POS static parity expiry-boundary CI repair (2026-11-21 UTC)

## Source pins and precise failure
- Repository `djshellshoxxx/GhostPay`; exact baseline main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Existing owned parent PR [#406](https://github.com/djshellshoxxx/GhostPay/pull/406), source head `506604288e31c195c852fa2e8896e131da34bc3b`. Child branch `fix/ghostpay-pos-parity-expiry-r16-20261121` starts at that immutable head; original PR is left unchanged.
- GitHub Actions [CI 44907818620](https://github.com/djshellshoxxx/GhostPay/actions/runs/44907818620), failed job `136868286519` (`ts-check`): `node --test examples/merchant-checkout/money.test.mjs examples/pos-terminal/parity.test.mjs` returns `'paid' !== 'expired'` at `parity.test.mjs:59`. All other CI jobs (including the package unit tests, typecheck, lint, and Chromium E2E) passed on that original exact head; the aggregate CI was therefore **failed**, not passed.
- Parent parity fixture `start`: `now=100`, `ttlSeconds=60`, hence `expiresAt=160`; its 130-second `expired` expectation was invalid. Distinct `packages/merchant-hooks/src/pos.runtime.test.ts` fixture uses `ttlSeconds=30` and correctly expects 130-second expiry. Both production reducers `packages/merchant-hooks/src/pos.ts` and `examples/pos-terminal/pos-logic.js` enforce expiry at `now >= expiresAt`.

## Implementation and scope
- Claim commit `ef60716df04548fbd722b836ad22e293a6a8c9b1`: additive `docs/ai/ACTIVE_WORK.md` claim on isolated child branch.
- Fix commit `470c524fd0ad2126536a2f755f7a18f1c8ed98aa`: corrected `examples/pos-terminal/parity.test.mjs` to assert the 60-second session stays paid at 130s and 159s, expires exactly at 160s, and a tick at 160s is accepted. Preserves both reducer comparisons, invalid-input tests, cancellations, and noncustodial static behavior.
- No changes to runtime production code, wallet custody, keys, signing, RPC, contracts, deployment, or dependencies.

## Branch census and collision protection
- Before creating this R16 child, complete live GitHub branch pagination returned `100/100/100/100/78/0`, exactly **478** branch names and matching `git/matching-refs/heads/` SHA references, with no mismatches. Main unchanged from the R9/R15 baseline. New R16 branch makes 479 subsequent live branches, subject to concurrent changes.
- Relative to the R15 475-name snapshot, three identifiable additions were compared against exact main: #408 docs-only ledger at `4aea5f7ed3dec4b328bd01594bf61cca35c72ab9` (14 ahead/0 behind); #409 cache-control repair at `8d55b4e39be48a0410c16d4a4c0acaa57da55b9b` (4 ahead/0 behind); #410 QR warning repair at `0bd06cbbdfc3b449fd56237b385d0b3d084f317d` (93 ahead/54 behind; broad diverged integration base). The R9 fully source-pinned 447-branch comparisons plus R12–R15 deltas remain the authoritative historical evidence; **this run did not recompute all 478 comparisons** and makes no claim that every prior head was unchanged.
- #406 exact-head CI failed solely in static parity test; #407 and #409 exact heads had five completed, passing workflows; #402 lint and #410 TypeScript/browser checks failed. All remain draft and require independent review. Avoid new duplicate recovery implementations.

## Qualification and next worker
- Local repo clone failed DNS (`Could not resolve host: github.com`). This worker inspected original production/test source and hosted failure logs; **no local repo tests, Vitest, lint, typecheck, E2E or new-head CI passed yet**. A child PR and exact-head hosted qualification are required.
- Integrate this child into #406 only after exact-head CI, independent review, current head verification and respecting the held generation-11 shared integration lock. Then rerun CI on #406 and consider main integration only after release of the lock and policy requirements. No force-push, deployment, release or real-funds operations.
- Continue the 24 divergent ancestry-capped branches from R13 by per-commit semantic review; do not treat graph overlap as proof of safe merging.
