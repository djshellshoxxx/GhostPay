# Audit: ux-connect

Scope: `packages/ux-connect` (hex, compat, hwsigner, wcsession), written 2026-10-21. Self-audit by the author, not independent. Results: typecheck, lint and tests green; 129 tests; coverage statements 99.62, branches 99.32, functions 100, lines 100 (thresholds 95/90/95/95).

## Threat model
Assets: user funds, payer privacy, signing intent. Adversaries: a malicious or buggy wallet (lying answers), a hostile dapp-side input (pairing links, imported matrix JSON), a hostile relay, a cross-origin page reusing a session, address-poisoning via truncated display, stale approvals.
Out of scope: transport security of the real SDK, relay behaviour, device firmware, UI rendering.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High | A contract wallet using the permit path would produce a signature app-side verification rejects, or worse, a user assumes success | classify/choosePath; property test "contract never permit" | Fixed in design; `invalid` code also forces approve |
| 2 | High | Proposal ids (safeTxHash/userOpHash) mistaken for tx hashes could be accepted as payment proof | `isVerifiable` only for `txHash` | Mitigated; host must enforce (wiring) |
| 3 | High | Wallet answers on a different chain / with foreign account / malformed hash | `checkResult` tests T-3 etc. | Mitigated; on-chain verification by host RPC still required |
| 4 | High | Key material returned as "signature" | `validateSignature` rejects 32-byte values and non 65-byte input | Mitigated |
| 5 | Medium | Late signature accepted after user abandoned flow | `advance` deadline logic, tests | Mitigated |
| 6 | Medium | Cross-origin session reuse | `buildRequest` origin check, `acceptResponse` peer origin check | Mitigated |
| 7 | Medium | Unknown methods (eth_sign blind signing) | exact allowlist; proto-name strings tested | Mitigated |
| 8 | Medium | Address truncation / poisoning in review text | full lowercase addresses shown | Mitigated; EIP-55 checksum NOT verified (needs keccak, no new crypto lib) |
| 9 | Medium | Review text for calldata beyond transfer/approve is blind | `blind` flag, `blind-signing` warning | Residual by design |
| 10 | Medium | `settleSession` strips unrequested methods but trusts wallet accounts format only | account CAIP-10 check | Residual; wallet could claim any address, the host must compare to the `from` the user expects |
| 11 | Low | Relay URL regex allows any wss host; no private-IP filtering | `relayGate` | Residual; user-chosen host by design |
| 12 | Low | `delegated-eoa` (7702) treated as EOA-like; a delegated account might reject ecrecover permits | classify | Residual, flagged `delegated-account` |
| 13 | Low | Typed-data chainId check only in domain; message-level chain fields not inspected | validateParams | Residual |
| 14 | Info | Pairing `symKey` returned in the parse result; caller must not log/persist | `redactPairingUri` | Documented |

No secrets, network, timers or globals are used; clock is a parameter. Only `URL` (ES built-in) is used for origin parsing.

## Fixes made during build
Lint-driven tightening of unknown-typed array handling; early-return on late signatures; invalid code forced to the safe path.

## UNVERIFIED (could not be checked here)
- Any real Safe, ERC-4337 or EIP-7702 wallet behaviour, and the EIP-5792 `canBatch` hint.
- The shape and honesty of `eth_getCode` from the user RPC.
- Hardware devices: status words (0x6985, 0x5515, 0x6a80, 0x6e00, 0x6d00, 0x6511), message text matching, what each device actually displays versus `display.lines`, blind-signing prompts.
- WalletConnect: error codes 5100-5102, pairing URI grammar and `relay-protocol=irn`, session lifetime limits, namespace settlement shape, any SDK or relay. No dependency was added and no adapter exists.
- The wiring in apps/web (none done), bundle-scan, CSP and the network-spy test for opt-in.
- Independent security review required before wallet-connect SDK adoption and before any hw-signer Phase 2.
