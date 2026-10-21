# Reuse research: permit2 (Permit2 + EIP-3009 gasless pulls)

Scope: research only. No clone, no install, no code copied into repo. Licence and SHA marked verified only where a source was read.

## Repo state (GhostPay)

- No `packages/permit2` yet. Specs only: `docs/CONTRACTS_SPEC.md:55` and `packages/contracts/README.md:127` say EIP-3009 "documented future function, not built". `docs/DEVELOPER_SPECIFICATION.md:98` says prototype token-authorized relayer for ERC-2612 or EIP-3009 first.
- Existing related package: `packages/payer-sponsor` (permit relay mode, viem 2.57.7, `@ghostpay/relayer-guard`).

## Candidates

| # | Repo | Licence (verified from file) | Commit SHA (source) | Last commit | Stars | Maintained? | Reuse-worthy files | Deps |
|---|------|------------------------------|---------------------|-------------|-------|-------------|--------------------|------|
| 1 | https://github.com/Uniswap/permit2 | MIT. `LICENSE` raw (`https://raw.githubusercontent.com/Uniswap/permit2/main/LICENSE`): "MIT License, Copyright (c) 2022 Uniswap Labs" | `cc56ad0f3439c502c246fc5cfcc3db92bb8b7219` ("fix: Typos (#186)"), from github.com/Uniswap/permit2/commits/main page. Page-cached; date shown Sep 29 2023. UNVERIFIED as current HEAD | Sep 29 2023 (per page) | 948 | Stale-looking: no commit in ~3 yrs per page. Deployed contracts are stable, so low need for changes | `src/SignatureTransfer.sol` (SPDX MIT, `pragma solidity 0.8.17`; externals `permitTransferFrom` single+batch, `permitWitnessTransferFrom` single+batch, `invalidateUnorderedNonces`). Also `src/AllowanceTransfer.sol`, `src/interfaces/*`, `src/libraries/*` (not read) | forge: forge-std, solmate, openzeppelin-contracts, forge-gas-snapshot (`.gitmodules`). npm `@uniswap/permit2` 1.0.0, MIT, no deps. Needs viaIR (per README via search summary; not re-verified) |
| 2 | https://github.com/Uniswap/permit2-sdk | MIT (LICENSE and package.json "MIT") | not obtained (page gave only submodule pointer `0ded3a9`) | not shown | 49 | ARCHIVED by owner Apr 25 2024, read-only. Moved to `Uniswap/sdks` monorepo | `src/` helper TS/Solidity (not read in full). Use as reference for EIP-712 typed-data shape of permit transfers only | npm `@uniswap/permit2-sdk` 1.2.0, MIT, deps `ethers ^5.3.1`, `tiny-invariant ^1.3.1`. Prefer viem; do not add ethers |
| 3 | https://github.com/circlefin/stablecoin-evm | Apache-2.0. `LICENSE` blob page: "Apache License, Version 2.0". SPDX Apache-2.0 in `contracts/v2/EIP3009.sol` | `fc85788bc7c23cefe3df1a757133048bfddadeaa` ("chore: add bridged USDC standard (#674)"), from commits/master page, dated Aug 12 2026. Page-cached, unverified as HEAD | Aug 12 2026 | 808 | Yes, active | `contracts/v2/EIP3009.sol`: abstract `EIP3009` with `_transferWithAuthorization`, `_receiveWithAuthorization` (bytes overload requires `to == msg.sender`, message "FiatTokenV2: caller must be the payee"), `_cancelAuthorization`, `authorizationState`. Public wrappers live in inheriting contracts. Pragma `0.6.12` (old, do not paste into 0.8 code) | Hardhat/Foundry, yarn. Heavy; the module itself has no runtime deps |

Only 3 candidates assessed. Web search surfaced no other permissive EIP-3009 repo that was verified; none invented.

Access note: GitHub API (`api.github.com`) and `gh api` returned 403 "GitHub access to this repository is not enabled for this session". `raw.githubusercontent.com` worked for Uniswap files only. Circle raw `LICENSE` (main/master) returned 404, so Circle licence came from the GitHub blob page. Stars and dates come from github.com HTML, not API.

## Recommendation

Per-part decision:

- **Permit2 contracts: `adapt`.** Do not vendor the whole repo. Use the canonical deployed Permit2 contract (address to be confirmed against Uniswap docs before use; not verified here). Copy only the interface `ISignatureTransfer` and its struct/typehash definitions (MIT, keep the copyright and licence header) into GhostPay Solidity. Pin the SHA if vendoring.
- **Permit2 TS signing: `reference-only` for permit2-sdk.** Archived, depends on ethers v5. Write the EIP-712 typed-data (`PermitTransferFrom`, `PermitWitnessTransferFrom`) builder with viem `signTypedData`, using the struct layout from `src/SignatureTransfer.sol` as the spec.
- **EIP-3009: `reference-only` for Circle.** Apache-2.0 allows copying, but the code is an abstract mixin for FiatTokenV2 on Solidity 0.6.12. Adapt the semantics, do not paste. Circle's `receiveWithAuthorization` pattern (caller must equal payee) is the one to mirror for front-run protection. Call the token's own `receiveWithAuthorization` from GhostPay contracts; no need to ship Circle code.

Overall: **adapt**. Nothing needs a runtime npm dependency on an archived SDK.

## Integration plan (GhostPay)

Target paths (proposed):
- `packages/contracts/src/permit2/IPermit2SignatureTransfer.sol` (adapted interface, MIT header kept)
- `packages/contracts/src/payer/Eip3009Puller.sol` (calls `receiveWithAuthorization`, enforces `to == address(this)`)
- `packages/payer-sponsor/src/permit2-typed-data.ts` (viem EIP-712 builders, no ethers)
- `packages/payer-sponsor/test-vectors/permit2.json` (vectors generated from Permit2 Foundry tests, not copied)

API shape:
- `buildPermitTransferFromTypedData({chainId, permit2, token, amount, nonce, deadline, spender})` returns viem typed-data.
- `buildReceiveWithAuthorizationTypedData({chainId, token, from, to, value, validAfter, validBefore, nonce})` for EIP-3009, domain from token `name`/`version`.
- Contract: `pullWithPermit2(permit, sig)` and `pullWithEip3009(auth, v, r, s)`, both reject `to != address(this)`.

Tests:
- Foundry fork test against a testnet USDC v2.2 and canonical Permit2. Check: valid pull, replayed nonce reverts, expired deadline reverts, wrong `to` reverts.
- Vitest in payer-sponsor: typed-data hash matches Foundry-computed hash for the same vectors.

## Risks

- **Supply chain:** Permit2 repo quiet since 2023 per page; SHA from cached page is unverified. Re-check HEAD with `gh` once repo access is granted. `permit2-sdk` is archived; avoid depending on it.
- **Abandonment:** Circle active; Uniswap permit2 contracts are immutable deployments, so low risk for contracts, but no upstream fixes.
- **Licence traps:** MIT (Permit2) and Apache-2.0 (Circle) are permissive and copyable with notice. Keep the Apache NOTICE/licence header if copying any Circle text. GhostPay packages are `UNLICENSED`, which is fine for consuming MIT/Apache code.
- **Privacy:** Per `docs/DEVELOPER_SPECIFICATION.md:98,360`, token authorization and sweep are public and link source to destination. Permit2 and 3009 do not add unlinkability.
- **Compiler mismatch:** Circle EIP3009 is 0.6.12; Permit2 is 0.8.17 with viaIR. Do not mix without compile tests.
- **Token coverage:** EIP-3009 only for tokens that implement it (USDC v2.2+). USDT has neither permit nor 3009 (`docs/CONTRACTS_SPEC.md:55`).

## Unverified items

- Permit2 HEAD SHA and date (page-cached).
- Circle HEAD SHA (page-cached, but dated 2026 so likely current).
- Canonical Permit2 deployment address: not checked in this session.
- Stars and commit dates scraped from HTML, not API.
