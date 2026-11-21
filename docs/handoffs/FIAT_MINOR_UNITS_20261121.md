# Fiat minor-unit correctness — source-pinned engineering handoff (2026-11-21 UTC)

## Scope and source
- One assistant executed sequential discovery, source/standard comparison, test-first changes, production repair and self-check. No subordinate agents, independent verifier or Caveman runtime execution were available.
- Branch: `automation/20261121T1033Z/bug/fiat-minor-units`; exact starting main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Ownership recorded first: `a370ae6b61cefc041b3c0aa72cd68e8277e68da9` in `docs/ai/ACTIVE_WORK.md`.
- Regression test-first commit: `caded568cd923249c7bb108c9b11e0800a529c27`, changing `apps/web/src/lib/format.test.ts`.
- Production commit: `8d29dd631de66d3b8e72f5d9cd125fe8fffbc6e4`, changing `apps/web/src/lib/format.ts`; blob `a8c2bae11554a45559107208179c40e0891219a9`.
- A separate metadata integration lock was read at generation 11, held by owner `994a0d214fb9-root-r3`; expiry alone does not authorize takeover. No protected/shared branch updates or main merge.

## Confirmed correctness defect
`format.ts` recognized only eight 0-decimal currencies, defaulting all others to 2. It did not support any ISO 4217 3- or 4-decimal exceptions. `invoiceCreate.ts` uses `fiatDecimals` to parse line item unit prices into signed integer minor units and `formatFiat` uses it to display values. In affected currencies the saved signed amount and rendered amount therefore used the wrong unit multiplier (e.g. KWD `12.345` was rejected despite its 3-unit precision; XPF `12345` would be represented as `XPF 123.45` for the same integer amount). This is an invoice fiat-value correctness problem, not a claim about token settlement, on-chain loss or exploitable contract behavior.

The current SIX Group ISO 4217 List One dated 2026-09-17 was cross-checked against published reproductions:
- https://tools.tnaado.ca/international/iso-4217-currency-code-lookup/
- https://mt-mx-parser.zagtrader.com/currencies

## Changes and acceptance
- Extended 0-minor-unit list to BIF, CLP, DJF, GNF, ISK, JPY, KMF, KRW, PYG, RWF, UGX, UYI, VND, VUV, XAF, XOF and XPF.
- Added 3-decimal BHD, IQD, JOD, KWD, LYD, OMR and TND; 4-decimal CLF and UYW.
- Preserved existing 2-decimal default for USD, CAD, EUR and unknown codes; no new currency allowlist, currency policy, dependency or external service.
- Four new Vitest scenarios cover every exception, parsing precision, formatting, sign placement, rejection of excess precision and unchanged defaults. The test commit predates the production correction.

## Actual verification and limitations
- Container clone via `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`. Full repository checkout, Vitest, TypeScript, ESLint, build and browser E2E **were not run locally**.
- An isolated Node 22 source-equivalent deterministic harness performed 30 currency exponent assertions and four formatting assertions; all matched expected candidate behavior. It independently counted 18 mismatched original exponents. This is **not** an execution of the repository's actual code or tests.
- The deployed GitHub Pages workflow on main is `pull_request` validation-only; publishing requires an explicit manual `workflow_dispatch` on `main` with `deploy=true`. The release workflow is tag-triggered. No dispatch, tag or deployment was performed.
- CI for the final candidate must be rechecked at its **exact head** after the handoff commit and PR creation. No independent review or security clearance is claimed.

## Dependency and consolidation disposition
- Deliberately based on current `main` rather than broad unfinished #307/#372 or payment-URI #360/#370/#379 to avoid overlapping their owned paths.
- A full semantic branch census is not claimed. The active remote branch and PR inventory was sampled, including recent #372, #373, #378, #379. The scope check found no open PR explicitly claiming fiat currency minor units; this is not proof of universal non-overlap.
- Leave a draft PR unmerged until exact-head CI, branch/review gates, fresh ownership and durable integration lock, plus proof that any main merge does not trigger publication.
- Subsequent coordinator: fetch the current main and this branch head; run `npm ci --ignore-scripts`, focused `vitest` for `apps/web/src/lib/format.test.ts`, TypeScript, lint, build, full/lean browser acceptance and security gates as policy requires. Independently review ISO code coverage and signed-invoice creation effects. Preserve this source-pinned report, tests and existing handoffs.

No real funds, secrets, contracts, production settings, releases, main merges or paid coding agents were used.
