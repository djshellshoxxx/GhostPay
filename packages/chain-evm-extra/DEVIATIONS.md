# Deviations and unverified items

## Deviations from the research note
1. Announcer init code hash is NOT bundled. Only Solidity source is on raw GitHub (`ScopeLift/stealth-address-erc-contracts` `src/ERC5564Announcer.sol`, 200); `ethereum/ERCs` has no asset (404). Without a build artifact and the exact compiler settings, a hash would be a guess. `validateConstants` takes `announcerInitCodeHash` as an input. Likewise `verifyChain` takes the expected runtime code hash as an input; it is never hard-coded.
2. Manifest `evmTarget` uses `'unverified'` (not `'unknown'`); numeric unverified fields are `null` rather than defaults (the doc's "falls back to 1000" is deliberately not applied here).
3. `listSource.sha256` is `null` for all 25 entries (JSON was not hashed during research); `listSource.status` is `null` where the list does not set it. `slug` (shortName) was not collected and is omitted. `explorerHost` is only known for the 12 mainnets (testnets `null`).
4. Package has added `src/cli.ts` to the coverage excludes (thin entrypoint).
5. No `verification/*.json` schema or `verify:records` CI job; the report type is `VerifyReport` (not the doc's `VerificationRecord`: no evmProbe/getLogs measurement, no multi-RPC quorum).

## Unverified (all 25 entries)
Announcer presence, Arachnid deployer presence, EVM target (PUSH0/MCOPY/TSTORE), getLogs cap, finality depth, block time, list JSON hash. Additionally: zkSync Era EraVM deployer behaviour and `L2_CREATE2_FACTORY` value; Zora operating status; Sonic Blaze (57054) supersession; Scroll TSTORE/MCOPY; Chainlink feeds for MNT/S/CELO/BERA.

## Not done
Cross-package integration with `@ghostpay/chain-adapters` `CHAINS`; deployments; the eth_call opcode probe; the getLogs range search.
