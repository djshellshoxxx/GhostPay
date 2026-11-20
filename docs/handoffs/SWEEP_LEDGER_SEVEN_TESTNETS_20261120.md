# GP-BUG-06 / CC-01 — seven-testnet destination-reuse ledger checkpoint

Date: 2026-11-20 UTC. Cycle: `20261120T2234Z`. Status: **implemented on isolated draft branch, NOT independently verified or merged**.

## Source and ownership

- Repository: `djshellshoxxx/GhostPay`; integration donor: existing draft PR [#307](https://github.com/djshellshoxxx/GhostPay/pull/307), exact base `2876b7db580e47a880d5951ce9e62941bcf76fdf`.
- Main observed `8c75581f0217dbc4ba6d052e54351594274e7b6e` (PR #321 merge). No main changes from this cycle.
- Task branch: `automation/20261120T2234Z/bug/sweep-ledger-seven-testnets`, stacked on #307. One sequential ChatGPT coordinator; no native subordinate workers or independent verifier available. Do not treat the self-audit as separate approval.
- Ownership registration: `docs/ai/ACTIVE_WORK.md`, commit `ac0e48334a141c8addf86bc416facc40b9650416`.
- Test-first regression: `packages/hygiene/src/ledger.browser-chains.test.ts`, commit `0284eead8822306c625981d5095e983f8364cb93`.
- Product change: `packages/hygiene/src/ledger.ts`, commit `26d2ba95a045bb60d9344cb3e4a84224c2b74b50`.
- The source/defect trace is [GP-BUG-06 / CC-01](https://github.com/djshellshoxxx/GhostPay/blob/audit/bugcheck-core-latest-20261120/docs/notes/bugcheck-2026-11-19/details/chain-contracts.md). That prior audit ran seven-network mock checks: two pass and five fail. The original run is **prior evidence**, not a test executed by this cycle.

## Defect, implementation, constraints

`DestLedger` used `assertTestnetChain` from the hygiene PoC, which intentionally allows only Anvil (31337), Ethereum Sepolia (11155111) and Base Sepolia (84532). PR #307's browser sweep reuses this ledger on five additional enabled EVM testnets (OP Sepolia 11155420, Arbitrum Sepolia 421614, Polygon Amoy 80002, BNB Testnet 97, Avalanche Fuji 43113). Its record/lookup wrappers swallow an unsupported-chain exception, so session-only reuse warnings can silently disappear.

This change adds a **ledger-specific** chain guard deriving accepted testnets from `@ghostpay/chain-adapters`' authoritative `findChain` metadata (`enabled && testnet`), also retaining local Anvil. It replaces all four existing `DestLedger` guard calls (read, can-use, acknowledged-reuse, strict restore). The smaller `assertTestnetChain` API for other hygiene helpers remains unchanged. Mainnets/unknown/noninteger chains continue to fail closed. No RPC, transaction construction, custody, signing, contract, fee, networking, plaintext storage or provider changes are made.

Committed tests pin all seven chain IDs, record/reuse warning, encrypted-ledger-row round-trip, Anvil, mainnet/invalid rejection, cross-chain isolation, and the narrower experimental helper guard. The existing `ledger.test.ts` and package coverage remain untouched.

## Testing and independent-review status

- **Executed this cycle:** GitHub source and branch/ownership inspection, audit comparison and source edits by the connected GitHub API. These are **not** executed Vitest/TypeScript/ESLint/browser suites.
- **Not executed locally:** repository Vitest/coverage, typecheck, lint, full/lean browser, Pages acceptance. Runtime `git ls-remote` failed `Could not resolve host: github.com`; do not retry through unapproved routes. Do not claim source-equivalent demonstrations as repo test passes.
- **Fresh verifier:** none available. No peer approval.
- **Required:** on exact final head, `npm run test -w @ghostpay/hygiene -- src/ledger.browser-chains.test.ts`, full hygiene suite, `npm run typecheck -w @ghostpay/hygiene`, `npm run lint -w @ghostpay/hygiene`, all applicable Pages/core CI, browser sweep advisory regressions, then independent source/test review.
- Audit checkpoint: GP-BUG-06 P2, confirmed by prior source-pinned review, **implemented, unverified, unmerged**. Do not close it until independent verification and integration.

## Coordination / release

- Work on #307's integrated source, not an isolated main-only implementation lacking the advisory. Do not overwrite or fast-forward its coordinator-owned branch. Obtain owner adoption/cherry-pick or separately integrate only after a new reconciliation of source heads, test results and the durable atomic lock.
- Existing PR [#339](https://github.com/djshellshoxxx/GhostPay/pull/339) edits `packages/hygiene/src/verify.ts`, not these paths; inspect its source before any combined merge. #307 also carries other privacy, invoice, print and wallet changes that must be preserved.
- Integration lock at `automation/ghostpay-integration-lock/integration-lock.json` observed **released, generation 9**, owned historically by the PR #321 coordinator. This cycle did not acquire, modify or release it.
- The Pages workflow shows pull requests are validation-only; publication requires explicit main workflow dispatch with `deploy=true`. No deployment was requested or performed.
- STRICT contract/Mythril and external security clearance remain open independent gates. Do not treat this scoped hygiene fix as contract clearance.
- No main/integration merge, source branch deletion, release, tag, production configuration, paid agent, real-funds operation or forced update occurred.

## Next exact steps

1. Fetch this PR and #307 fresh (including exact SHAs) and obtain hosted test results at this head.
2. If any Vitest/typecheck/lint/Pages job fails, fix on a new isolated branch or exclusively owned continuation, retaining the failure logs.
3. Have an independent verifier test all seven supported chain IDs and confirm `assertTestnetChain` still guards the PoC-only operations; inspect import/build size and chain-adapters dependency impact.
4. Coordinate adoption into a current #307 successor, re-run combined gates, recheck atomic integration ownership and downstream deployment triggers; merge only if all gates permit.

Canonical workflow: `AGENTS.md`, `docs/ai/WORKFLOW.md`; existing long-form ledgers and audit history are preserved, not replaced by this handoff.
