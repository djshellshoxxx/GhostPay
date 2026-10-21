# Spec: wallet-connect: WalletConnect-style session and request model (opt-in)
Impact 4/5 | Effort L | Score 1 | Build wave 1 | Depends on: mode-guard

> Build note (swarm 7): all three connect specs are implemented as pure logic in `packages/ux-connect` (`@ghostpay/ux-connect`), not in the separate package names the first draft listed. Anything touching a network, relay, USB/BLE or a real wallet is UNVERIFIED; see [audit-ux-connect.md](../audit-ux-connect.md) and [wiring/ux-connect.md](../wiring/ux-connect.md).

## Problem
No mobile wallet path: only EIP-6963 and window.ethereum (wallet.ts:45; DEVIATIONS item 7; troubleshooting row "WalletConnect is not built").

## Exists today (verified in repo) vs missing
- apps/web/src/lib/wallet.ts:45-72 discoverWallets; 140-190 connectWallet/sendViaWallet/signTypedData share Eip1193Provider.
- Missing: session/request model (now in `packages/ux-connect/src/wcsession.ts`), and the transport/SDK adapter (NOT built, no dependency added, UNVERIFIED).

## Design
This package is the policy layer an SDK adapter must call; it contains no sockets.
- Allowlist: `allowedMethods = [eth_chainId, eth_accounts, eth_sendTransaction, eth_signTypedData_v4, wallet_switchEthereumChain]`, events `chainChanged`, `accountsChanged`. Exact, case-sensitive; everything else (eth_sign, personal_sign, wallet_addEthereumChain, ...) is rejected with 4200 before serialisation.
- Namespaces: `buildProposal(chainId)` -> one `eip155` namespace, one chain, allowlisted methods. `settleSession(...)` validates the wallet's settlement: topic is 64 hex, chains must be a non-empty subset of requested, extra methods are stripped, `eth_chainId` and `eth_sendTransaction` must be granted, accounts must be CAIP-10 on settled chains (lowercased), lifetime in (0, 7 days].
- Origin binding: `Session.origin` is this app's origin at creation; `buildRequest` refuses any other `origin`. The wallet's metadata origin is pinned as `peerOrigin` (https only, no credentials; localhost http only when allowed) and `acceptResponse` refuses a changed peer URL.
- Request validation (`validateParams`): tx must be `[tx]` with `from` in session accounts for the chain, `to` present (no contract creation), only known keys, QUANTITY-format numbers, optional `chainId` equal to request chain; typed data must be `[address, JSON string <= 64 KB]` with `domain.chainId` equal to the request chain; switch chain only to a chain already in the session; read methods take no params.
- Requests: ids positive and unique, TTL default 5 min capped at session expiry, immutable pending table, `sweepExpired`.
- Responses (`acceptResponse`): topic must match, id must be pending (replay refused), expired entries are reported and cleared, error responses map to `rejected` (message cut to 200 chars), results are shape-checked per method (chain id equals request chain, accounts inside session, 32-byte tx hash, valid 65-byte signature, `null` for switch).
- Pairing URI: `parsePairingUri` strict grammar (`wc:<64hex>@2?relay-protocol=irn&symKey=<64hex>[&expiryTimestamp=N]`, duplicate or unknown parameters rejected), `redactPairingUri` for logs.
- Opt-in gate: `relayGate(settings)` returns `ok` only if opted in, disclosure version acknowledged, user-supplied `wss://` relay URL and 32-hex project id are set. No default relay or project id exists in the package.

## Privacy and security impact
The relay (third party) sees pairing metadata, IP and encrypted traffic timing. Default OFF, loud disclosure, self-host option, project id user-supplied. Session data lives in memory; persisting `symKey` or sessions is not provided by this package. Wallet answers are untrusted: the app must still verify the submission on chain with its own RPC.

## Requirements
1. **WALLE-1** MUST Only the listed methods are requested, forwarded or accepted.
2. **WALLE-2** MUST Responses on a wrong chain, unknown account or malformed hash/signature are errors (adapter output feeds the existing wallet.ts checks unchanged; wiring item).
3. **WALLE-3** MUST Off by default; no connection until `relayGate === 'ok'`.
4. **WALLE-4** MUST No project id or relay URL hard-coded.
5. **WALLE-5** MUST Any SDK dependency added only after bundle-scan allowlist review (not done here).
6. **WALLE-6** SHOULD Deep-link button for mobile browsers (UI, not here).
7. **WALLE-7** MUST Sessions are origin-bound and expire; requests never outlive the session.
8. **WALLE-8** MUST Pairing URIs are parsed strictly; the symmetric key is never logged.

## Acceptance tests (implemented in `src/wcsession.test.ts`)
1. **T-1** request with method eth_sign (and 5 other unknown or non-string values) -> `{code:4200}`.
2. **T-2** valid eth_sendTransaction -> pending; response with hash returns lowercase hash and clears pending; replay refused.
3. **T-3** eth_chainId answer `0x89` for eip155:1 -> error `chain-mismatch`.
4. **T-4** `relayGate` returns not-opted-in / disclosure-required / relay-not-configured / bad-relay-url / bad-project-id before ok (host asserts no socket is opened unless ok; wiring e2e).
5. **T-5** origin mismatch refused; peer origin change refused; expired session and expired request handled.
6. **T-6** 11 malformed pairing URIs rejected; fast-check: arbitrary strings never throw.
7. **T-7** tx with `from` outside session, creation tx, unknown key, wrong chainId all rejected.
Live relay/mock-relay end-to-end (connectWallet through an adapter) is UNVERIFIED and listed in the wiring doc.
