# Developer Guide

[Home](Home.md) · [User Guide](User-Guide.md)

## Architecture and status
The GhostPay repository contains **implemented code**, not just plans. Source here is pinned to draft [PR #98](https://github.com/djshellshoxxx/GhostPay/pull/98) at `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7`, **not merged into main**. A static React/Vite web app uses shared TypeScript crypto, invoice, chain, QR and persistence modules. Foundry contracts and an optional Node relayer supply distinct execution/trust boundaries; a Node CLI exposes offline-first document/operator operations. Features existing only in future specs are not enabled.

## Prerequisites, local build, CLI and tests
Use Node.js >=22, npm and Git. Foundry is needed for Solidity, Playwright Chromium for browser tests, and approved local services for integration. At repo root:

```sh
npm ci --ignore-scripts
npm run build:libs
npm run typecheck
npm run lint
npm test
npm run build --workspace @ghostpay/web
npm run build:cli
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js --help
npm run test:e2e --workspace @ghostpay/web
npm run ci:scan-secrets
npm run ci:check-actions
node --test scripts/tests/verify-release.test.mjs
```

For contracts: `cd packages/contracts && forge build && forge fmt --check && forge test`. For CLI commands, flags, explicit online consent and exit codes see [CLI README](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/packages/cli/README.md). Commands are documented, **not asserted to have been run by this docs update**.

## Module map and public contracts
| Path | Purpose |
| --- | --- |
| `apps/web` | Seller/invoice/pay/scan, reconciliation, receipt and key UI |
| `apps/relayer`, `packages/relayer-guard` | Optional sponsored-sweep service and abuse controls |
| `packages/core-crypto`, `packages/secret-box` | Stealth key math, secret lifetime guardrails |
| `packages/invoice-schema` | Signed invoices, protected envelopes and shared codecs |
| `packages/chain-adapters` | Chain/asset allowlists, deployment manifests, verified reads |
| `packages/qr-exchange` | QR/text exchange, bounds and format validation |
| `packages/cli` | Headless invoice/receipt/merchant tools and read-only inspection |
| `packages/contracts` | Foundry payment, sweep and experimental policy contracts |
| `packages/merchant-*` | Billing/hooks/ledger/multisig planning and operators |

Read package READMEs, `DEVIATIONS.md`, type signatures, tests, [ADRs](https://github.com/djshellshoxxx/GhostPay/tree/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/adr), and [specifications](https://github.com/djshellshoxxx/GhostPay/tree/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/specs) before changing interfaces. Invoice binding, EIP-712 signing, fee economics and cryptographic formats require approved protocol changes, regression vectors and independent review.

## Contribution, security, CI and debugging
Before modifying code read [SECURITY.md](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/SECURITY.md), the [threat model](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/threat-model/THREAT_MODEL.md), active PRs, CI and source-pinned handoffs. Use a separate owned branch, test-first regression for reproduced bugs, and a draft PR with exact base/head, executed tests and blockers. Never overwrite other agent branches or weaken security gates.

CI includes TS/ESLint/tests, Foundry/Slither, relayer integration, lean/full Chromium emulation, CLI on Linux/macOS/Windows and hosting checks. Passing checks apply to the **specific commit** only. Debug payment verification by separating signature/signer pin, invoice chain/asset/recipient/amount, broadcast status, actual receipt and finality; never log keys. See [release verification](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/operators/release-and-verify.md) and [hosting guide](https://github.com/djshellshoxxx/GhostPay/blob/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/docs/operators/hosting.md).

See the [source-pinned verification and release gate matrix](Verification-and-Release-Gates.md) for requirement-to-test traceability, hosted evidence and unqualified acceptance gates.

## Release and engineering work still open
The [#98 exact-head CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/42734552608) passed, but [parent #84 SonarCloud D](https://github.com/djshellshoxxx/GhostPay/runs/128302927200) lacks a resolved finding inventory and exact-head pass. Independent review, B0 local payment-to-recovery acceptance, testnet deployment trust manifests and reproducible release provenance remain required. [PR #100](https://github.com/djshellshoxxx/GhostPay/pull/100) separately changes auto-integration approval and is not silently included. PR #99's 18 proposals are **future-only**. No merge, public hosting, real-money activation or release without owner authorization.
