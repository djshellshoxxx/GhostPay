# Reuse research: aa-sponsor (ERC-4337 UserOp, bundler client, verifying paymaster)

Research date: 2026-10-21. Read-only. No clone, no install, no code copied. SHAs from github.com HTML/commit pages (api.github.com returned 403 through the proxy). "Unverified" = not confirmed from a primary page.

## Existing in repo (check first)

- `packages/payer-sponsor/src/erc4337/{userop,paymaster,account}.ts` (664 lines incl. test) already implement v0.7 `PackedUserOperation`, `getUserOpHashV07`, `executeBatch`, paymaster data and signed hash, `initCode`, counterfactual address, `verifyEntryPoint`. Own code, `UNLICENSED`.
- `packages/payer-sponsor/DEVIATIONS.md`: no real public bundler run ([U]); e2e uses `handleOps` from an EOA. ERC-7677 adapter not implemented.
- Deps: `viem` 2.57.7 only. No permissionless.js, no bundler client.
- Conclusion: the core AA module exists. Reuse gap = bundler RPC client, ERC-7677 paymaster adapter, and real-bundler e2e.

## Candidate repos

| # | Repo | Licence (verified) | Latest commit (verified) | Stars | Maintained | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|
| 1 | https://github.com/eth-infinitism/account-abstraction | Repo LICENSE = GNU GPL v3 (https://raw.githubusercontent.com/eth-infinitism/account-abstraction/develop/LICENSE). Per-file: `contracts/core/EntryPoint.sol` = `SPDX-License-Identifier: GPL-3.0`. `contracts/core/BasePaymaster.sol` = `MIT`. `contracts/samples/VerifyingPaymaster.sol` = unverified (404 on develop) | `1c6b669d0eea734e09a87e095ba15e076151718a`, Dec 16 2025 ("Add audit for release v0.9 (#612)") | ~1.9k | Yes (438 commits on develop) | Reference only for EntryPoint (GPL). `BasePaymaster.sol` MIT = copyable with notice, only if the file header confirms (fetched header: MIT). Verifying paymaster sample: unverified, check header before any copy | Solidity ^0.8.28 |
| 2 | https://github.com/pimlicolabs/permissionless.js | MIT. LICENSE raw first lines: `MIT License` / `Copyright (c) 2023 Pimlico` (https://raw.githubusercontent.com/pimlicolabs/permissionless.js/main/LICENSE) | `473d64a`, Oct 15 2026 (merge of #565) ; full SHA not captured | ~257 | Yes (commits Oct 2026) | Bundler client, paymaster client and UserOp helpers (TS, viem-based). Files under `packages/permissionless/src/` not fetched (404 on guessed path), so exact file list unverified | viem (peer) |
| 3 | https://github.com/zerodevapp/kernel | Page says MIT (https://github.com/zerodevapp/kernel). LICENSE file not fetched (404 on main, master). Third-party index (Ecosyste.ms, stale early 2024) also says MIT. **Unverified from repo LICENSE** | `c960b42`, Oct 3 2026 (merge of #152 "feat/permission-hook-module-type"); default branch unconfirmed (page showed `dev`) | ~258 | Yes | Smart account (Kernel) only. Not a sponsor/bundler module; low fit for sweeps from a fresh payer | Solidity; Foundry |
| 4 | https://github.com/safe-global/safe-modules (`modules/4337`) | LGPL-3.0 (LICENSE raw: `GNU LESSER GENERAL PUBLIC LICENSE`, https://raw.githubusercontent.com/safe-global/safe-modules/main/modules/4337/LICENSE). Repo page: LGPL-3.0 | Not captured | ~198 | Unverified | Reference only (LGPL: no copy into proprietary code without LGPL compliance) | Safe contracts |

Not in table: ZeroDev SDK and Pimlico `erc20-paymaster` (listed GPL-3.0 by third-party index only; not verified, excluded).

## Recommendation

**Decision: adapt (permissionless.js, MIT) + reference-only (eth-infinitism, safe-modules) + keep existing `erc4337/` code.**

- Keep `packages/payer-sponsor/src/erc4337/*` as the core. Do not replace it.
- Copy-with-notice candidates from permissionless.js: bundler JSON-RPC wrappers (`eth_sendUserOperation`, `eth_estimateUserOperationGas`, `eth_getUserOperationReceipt`) and ERC-7677 request shape. Copy only after reading the exact file and keeping its MIT notice in the file header. Exact file paths: unverified, locate via https://github.com/pimlicolabs/permissionless.js/tree/main/packages/permissionless/src.
- Do NOT copy EntryPoint or any GPL file. Use the already-fetched EntryPoint v0.7 artifact via `scripts/fetch-entrypoint.sh` (already in payer-hiding-contracts).
- Do NOT copy safe-modules (LGPL) or ZeroDev kernel (licence unverified).

## Integration plan (adapt path)

- Target path: `packages/payer-sponsor/src/erc4337/bundler.ts` (new) and `src/erc4337/erc7677.ts` (new, implements `pm_getPaymasterStubData` / `pm_getPaymasterData` for DEVIATIONS item 7).
- API shape: `createBundlerClient({ url, entryPoint, chainId })` returning `sendUserOperation(op) -> hash`, `estimateGas(op)`, `waitForReceipt(hash)`. Input/output: existing `PackedUserOperation`. Reject mainnet chain ids through the existing `assertTestnet`.
- Tests: `src/erc4337/bundler.test.ts` with a mocked JSON-RPC transport (vitest), plus a real-bundler e2e gated by env var (`REQUIRE_BUNDLER=1`), against a testnet bundler only. Keep the anvil e2e as is. Add a licence-header check test for files adapted from MIT sources.

## Risks

- Supply chain: permissionless.js has frequent Oct 2026 commits and is a fast-moving pre-1.0 package. Pin an exact version. Do not add the dependency; copy only the required functions after review, or pin and audit.
- Abandonment: none observed. Kernel and permissionless active Oct 2026. eth-infinitism v0.9 release Dec 2025.
- Licence traps: EntryPoint and eth-infinitism repo LICENSE = GPL-3.0 (per-file headers vary, so check each file's SPDX line). safe-modules LGPL-3.0. ZeroDev kernel MIT unverified from LICENSE file. Any copied file must keep its original header and notice; `@ghostpay/payer-sponsor` is `UNLICENSED`, so copying an MIT file is OK with attribution, but GPL/LGPL code must stay reference-only.
- Unverified items: VerifyingPaymaster sample licence and path; permissionless.js file list; full commit SHAs for permissionless and kernel; safe-modules latest SHA; GitHub API unreachable (403), so star counts and dates come from HTML pages.
