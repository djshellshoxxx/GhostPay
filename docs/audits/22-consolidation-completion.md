# Consolidation completion and final verification

Date: 2026-10-22. Canonical development branch: **main**. Migration and main promotion are complete; product and release boundaries remain explicit.

## Identity and provenance

- Validated candidate: `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` (2,923 files).
- Main merge: `5795857d9e366cc9a4304c6afa9b03365e7c1844` via PR #20.
- [CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/39768643775) and [Integration](https://github.com/djshellshoxxx/GhostPay/actions/runs/39768643774) both completed successfully, uncancelled, before promotion.
- Exact comparison found zero candidate/worktree differences and zero promoted runtime-tree differences. Every authored remote source tip is an ancestor of main. Generated gh-pages output is excluded from product source.
- [Path inventory](06-migration-inventory.json), [source ledger](07-consolidation-ledger.md), independent reviews 13/16/19, and retained historical `.source` harnesses record imported, adapted, superseded and intentionally excluded material. Historical tool outputs are not reused as current security evidence.
- PRs #1, #2, #17, #18, #19 and #20 merged. Stacked PRs #3, #4, #5, #7, #8, #11, #12, #13, #14, #15 and #16 were closed as superseded after their source heads became main ancestors. Source refs remain provenance; ongoing work belongs on main.

## Verification

| Area | Result |
| --- | --- |
| Full workspace quality | Clean hosted typecheck, lint, dependency-ordered build and production dependency audit passed |
| Web | 630 passed; one live-Bitcoin test skipped in ordinary CI and independently exercised on a real regtest node |
| Web coverage | 92.29% statements / 87.24% branches / 91.45% functions / 95.46% lines; original thresholds retained |
| Browser | 17/17 passed, including signed-manifest payment, mutated-calldata refusal, scanning, passphrase invoices and vault reload/unlock |
| Imported packages | All 29 suites: 2,253 tests / 128 files; configured coverage gates passed |
| Invoice / core / BTC / chain adapters | 626 / 55 / 353 / 332 tests passed; required Anvil cases exercised |
| Relayer / guard | 248 / 146 tests passed with coverage; 128-client overload, rate limiting, responsiveness and refill recovery checked |
| Main / pool / payer contracts | 411 / 86 / 108 tests passed with configured fuzz/invariants; formatting, NatSpec, snapshot, size/layout and Slither gates passed as applicable |
| Confidential contracts | Hosted full suite: 46 passing, including explicit Anvil cases and stress cases |
| Platform integration | EVM passed; Bitcoin 8 steps passed; Solana 10 steps passed |
| Additional local EVM rehearsal | 12 steps / 14 transactions, including sponsored sweeps and replay rejection |
| Bitcoin local checks | PayJoin 4/4; web scan/review/sign/broadcast/rescan 1/1; Core 28.1 confirmed 49,999,802-sat destination after 198-sat fee |
| Operator scripts | 13 tests passed; generator, source-verification shell-injection regressions and Esplora shim; included in CI |
| Source and documentation checks | All authored source tips reachable; exact runtime tree preserved; relative-link checker passed |

The slower duplicate local web coverage run was stopped after the exact-candidate hosted coverage gate passed; it is not counted as separate passing evidence. Optional upstream research-pool integrations retain explicit contract/circuit fixture gates. Standalone real Bitcoin and required Anvil checks are recorded separately rather than treating skips as passes.

## Security findings and boundaries

Audits 09, 17, 20 and [21](21-receipt-integration-review.md) record exploit conditions, fixes and regressions. The final independent review found and closed a stale cross-invoice payment risk: delayed wallet/preparation work could attach an earlier recipient transaction to a newer invoice with equal chain/token/amount. Flow revisions, context/build identity guards and private prepared-payment provenance now reject that mismatch; 86 related tests independently passed. Signed seller receipts bind to invoice digest, signer, chain, asset and exact net amount, and remain explicitly seller attestations rather than independent payment proof.

Other reviewed fixes include canonical payment evidence, provider disagreement/reorg handling, bounded scans, encrypted vault/session authorization, camera ownership, relayer reservations and breaker recovery, structured manifest signatures, bundled trust roots and chain readback, exact contract balance accounting, PayJoin prevout verification and duplicate Solana memo handling. No production dependency vulnerability was reported by the audit gate. These checks are extensive automated and AI-assisted review, not an independent professional audit or a guarantee of security.

[Remaining product and release gates](08-completion-gates.md) include durable seller reconciliation, broader localization/device workflows, experimental scheme-2/chain activation, real deployments and funded wallet/device tests, release-key custody, trusted setup and professional audit. Development-ceremony pool artifacts must never secure valuable funds. Mythril/mutation historical reports are not claimed as current successful runs.
