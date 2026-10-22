# @ghostpay/external-pools-railgun

`EP-2`: Railgun adapter for [`@ghostpay/external-pools`](../external-pools/README.md). Entry is `approve(proxy, amount)` + `RailgunSmartWallet.shield` from the stealth address `S1`; exit is an unshield through a broadcaster, or a self-broadcast unshield (operator-free). `private`, `UNLICENSED`, ESM, testnet only.

Status: **proof of concept, not wired into any app, and the SDK glue is not built.** The adapter is written against a `RailgunWalletPort` whose shapes follow the `@railgun-community/wallet` **11.2.0** typings; the package does **not** depend on that SDK (it pulls a large GraphQL-mesh/ethers tree and needs an engine, LevelDB storage, quick-sync, a Waku broadcaster client and PPOI nodes). Everything the port returns is treated as untrusted and re-checked.

## What is verified, and how

| Fact | Source | How |
|---|---|---|
| ABI (`shield`, `transact`, `shieldFee`, `unshieldFee`, `Shield` event) | `Railgun-Privacy/contract` master `36bcf5ed7cf94bfafb6e1a303e1832c769c16780` (2026-08-15), compiled with solc 0.8.28, OZ 4.9.6 outside the repo | [RAN] selectors in `reference/abi-reference.json`, compared by `abi.test.ts` |
| Shield against the real contract code | same commit, deployed on a local anvil | [RAN] `anvil.integration.test.ts`: fee read from the contract, SDK-output check accepts a real-shaped call, the contract executes it, `recordEntry` reads the net value from the real `Shield` log (treasury received the fee) |
| Fee semantics: inclusive, `credited = value - floor(value * bps / 10000)`; `Shield.commitments[i].value` is the net value; unshield recipient is `address(uint160(npk))` | `RailgunLogic.getFee/transferTokenIn/transferTokenOut` | [P] source + [RAN] shield on anvil; unshield decoding tested with fixtures only |
| Sepolia proxy `0xeCFC...3fea`, relay adapt `0x7e3d...214D`, WETH `0xfFf9...6B14`, deployment block 5784866 | `Railgun-Community/shared-models` `network-config.ts` | [P] copied; EIP-55 checksum validated by the manifest parser. **Liveness not checked.** |
| Base Sepolia is not a Railgun network in shared-models (`NetworkName` has Ethereum, BNB Chain, Polygon, Arbitrum, Sepolia, Amoy, Hardhat) | same file | [P] |
| `@railgun-community/wallet` latest is **11.2.0** (spec said 10.9.0); engine `^9.8.0`, shared-models `^8.2.0`; MIT; `postinstall.js` only patches `cipher-base` for React Native projects and is a no-op otherwise | `npm pack` of the tarball, read without running scripts | [P] |
| SDK function names `startRailgunEngine`, `createRailgunWallet`, `getShieldPrivateKeySignatureMessage`, `populateShield`, `generateUnshieldProof`, `populateProvedUnshield` | 11.2.0 `.d.ts` | [P] |

## What is checked at run time (the point of the adapter)

- **EP-RG-2** The shield transaction the SDK returns must target the pinned proxy, carry no value, decode as `shield(...)` with exactly one ERC-20 request for the requested token and amount and an in-range `npk`; the approval is exactly the amount to the same proxy.
- **EP-RG-4** `shieldFee()` / `unshieldFee()` are read from the proxy and capped (default 100 bps); the emergency exit ignores the cap so a governance fee change cannot trap funds.
- **EP-RG-5** Broadcaster fee must be in the note's token and within `maxBroadcasterFeeBps` (default 100) and the user's limit; the unshield calldata is decoded: exactly one unshield, bound to the chain, token = note token, destination = the chosen address, value within the note, amounts equal to the quote.
- **EP-RG-6** Self-broadcast needs the N3 acknowledgement and builds the unshield for a gas-funded address; `prepareEmergencyExit` needs no broadcaster, PPOI call or fetch.
- **EP-RG-7** `ppoiStatus` from the port is carried in the quote; `blocked` is not hidden and not submitted.

Only ERC-20 tokens are supported (native coin would need a wrap step: not implemented).

## Tests

2026-10-21, `npm test`: 20 tests pass, 1 skipped (anvil, 21 with `RG_CONTRACTS_OUT` and `REQUIRE_ANVIL=1`); coverage 98.92 / 94.89 / 97.82 / 100 (99.28 / 95.40 / 100 / 100 with the anvil test), thresholds 95/90/95/95 unchanged.

```bash
export PATH=/home/user/tools:$PATH
RG_CONTRACTS_OUT=<forge out dir of Railgun-Privacy/contract 36bcf5e + a tiny TestToken> REQUIRE_ANVIL=1 npm test
```

## Not verified

See [DEVIATIONS.md](DEVIATIONS.md): any live Railgun testnet interaction, the SDK glue, PPOI, broadcasters, the shield-key derivation convention, Sepolia code hashes.
