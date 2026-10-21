# Spec: hw-signer: Hardware-wallet payer path and signing request model
Impact 2/5 | Effort L | Score 0.5 | Build wave 0 | Depends on: none

> Build note (swarm 7): all three connect specs are implemented as pure logic in `packages/ux-connect` (`@ghostpay/ux-connect`), not in the separate package names the first draft listed. Anything touching a network, relay, USB/BLE or a real wallet is UNVERIFIED; see [audit-ux-connect.md](../audit-ux-connect.md) and [wiring/ux-connect.md](../wiring/ux-connect.md).

## Problem
Hardware users already work through a browser wallet (injected provider), but there is no guidance, no review text matching what the device shows, and no uniform error handling for device failures (locked, wrong app, blind signing off, disconnected). Stealth one-time keys cannot live on a device, so sweeps stay software-signed (modules-needed.md rank 12).

## Exists today (verified in repo) vs missing
- docs/remote/modules-needed.md rank 12 (Missing).
- apps/web/src/lib/wallet.ts Eip1193Provider interface.
- apps/web/src/lib/sweep.ts direct sweep signs with a derived key in memory.
- Missing: the typed request/response model (now in `packages/ux-connect/src/hwsigner.ts`; not wired).

## Design (Phase 1 only; Phase 2 is out of scope and gated)
- `Signer` interface: `{address; signTransaction(TxSignRequest): Promise<string>; signTypedData(TypedDataSignRequest): Promise<string>}`; only signature strings cross it (HWSIG-2). No in-memory implementation is in this package (the key code lives in existing packages).
- Typed requests: `TxSignRequest` (EIP-1559 fields, bigint amounts) and `TypedDataSignRequest` (EIP-712 JSON string or object). `validateTxRequest`, `parseTypedData` (domain.chainId must equal request chainId).
- Display verification text: `describeTx`, `describeTypedData`, `describeRequest` return `{title, lines, warnings, blind, text}`. Addresses are shown in full lowercase (never truncated; device may show EIP-55 case, compare case-insensitively). ERC-20 `transfer`/`approve` calldata is decoded (recipient, amount, unlimited approval >= 2^255). Any other calldata, or nested non-Permit typed data, sets `blind: true`. The model returns what the user must compare on the device; it cannot read the device screen.
- Sessions: `createSignSession({id, request, nowMs, timeoutMs})` builds and stores the display up front (HWSIG-4); timeout 10 s to 600 s, default 120 s; clock injected. `advance(session, event, nowMs, expectedAddress?)` handles `signature | error | tick`. Terminal states are sticky; a signature arriving after the deadline is discarded and flagged `lateSignatureDiscarded`.
- Signature check: exactly 65 bytes, r and s in range, low-s, v in {0,1,27,28}. A 32-byte value (possible key material) is rejected.
- Error taxonomy `HwErrorCode`: user-rejected, device-locked, app-not-open, blind-signing-disabled, device-disconnected, timeout, unsupported-method, chain-mismatch, wrong-account, malformed-signature, unknown. `classifyHwError(raw)` maps EIP-1193 codes (4001, 4200, 4900/4901), status words (0x6985, 0x5515, 0x6a80, 0x6e00/0x6d00/0x6511) and message text. Each entry has `retryable` and a user message.
- `describeSigningRisk(warning)` gives one plain sentence per warning.
- Phase 2 (exporting derived one-time keys to an offline signer) is NOT specified or built; HWSIG-3.

## Privacy and security impact
Phase 1 has no data flows. The module never logs or stores requests. Phase 2 would export key material and requires a security review ticket before any design work.

## Requirements
1. **HWSIG-1** MUST Introducing the model changes no sweep behaviour (nothing in apps/web is edited by this package).
2. **HWSIG-2** MUST No private key crosses the interface; only validated 65-byte signatures are accepted.
3. **HWSIG-3** MUST Phase 2 gated by an explicit security review ticket (not built).
4. **HWSIG-4** MUST A review text exists before a sign session can start; sessions cannot be created for requests that fail validation.
5. **HWSIG-5** MUST Late signatures (after deadline) are discarded.
6. **HWSIG-6** MUST Blind-signing requests are labelled so the UI can require extra confirmation.
7. **HWSIG-7** SHOULD Wrong-account signatures are rejected when an expected address is known.

## Acceptance tests (implemented in `src/hwsigner.test.ts`)
1. **T-1** Plain 1.5 ETH transfer renders `Amount: 1.5 ETH`, full lowercase recipient, no warnings, not blind.
2. **T-2** Signer that reports 4001 -> failed with message "You declined on the device. Nothing was signed."
3. **T-3** ERC-20 transfer calldata decodes to recipient and `2.5 USDC` at 6 decimals; property test: shown recipient equals encoded recipient.
4. **T-4** Approval of 2^256-1 flags `unlimited-approval`; unknown calldata flags `blind-signing`; dirty/short transfer calldata is blind, not decoded.
5. **T-5** Typed data with mismatched domain chainId, bad JSON, > 64 KB, array root, missing primaryType: rejected.
6. **T-6** Session at 120 s default; late signature after deadline -> `expired`, `lateSignatureDiscarded`, no signature stored.
7. **T-7** 32-byte secret returned as "signature" -> failed `malformed-signature`.
8. **T-8** 18 raw error shapes classify to the expected codes.
UNVERIFIED: real device status words, real display formats (see audit).
