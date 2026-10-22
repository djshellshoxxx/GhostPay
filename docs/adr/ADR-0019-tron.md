# ADR-0019: TRON stealth payments (TRX + TRC-20) on secp256k1 scheme 1

Status: Proposed (proof of concept). Date: 2026-10-21. Package: `packages/tron-adapter`. Docs: `docs/chains/tron.md`.

**Not audited.** Target: Nile testnet. Mainnet is refused unconditionally by the adapter.

## 1. Context

TRON carries the largest share of USDT. It uses secp256k1 and keccak256 for accounts, so the repo's ERC-5564 scheme-1 derivation applies without new cryptography; only the address encoding (0x41 + base58check) and the transaction format (protobuf, sha256 txID, r||s||recId signatures) differ.

## 2. Decision

- Reuse `@ghostpay/core-crypto` (`deriveStealthPayment`, `checkAnnouncement`, `deriveStealthSecret`) for the stealth key; convert the 20-byte result to a TRON address. No new curve code.
- Meta-address `st:trx:0x<spend33><view33>`, decoded by translating to `st:eth:0x...` so point validation is shared.
- Announcement in the payment transaction's own `raw_data.data` memo: `"GPT1" || R(33) || viewTag(1)`. No contract deployment. Scanner confirms TRC-20 credit from the receipt's `Transfer` log (a successful call to a fake token does not prove value moved) and recomputes txID from `raw_data_hex` (a hostile node cannot attribute a tx to bytes it did not contain).
- Transactions are built locally and re-decodable (`decodeRawTx`) so the wallet preview is derived from the bytes being signed, never from a node-built transaction.
- `ChainAdapter` shape copied (member names pinned by `adapter-types.test.ts` against `packages/chain-adapters/src/adapter.ts`), same pattern as ADR-0017 and btc-silent-payments, to avoid a circular dependency. Family literal `'tron'`.

## 3. Cryptographic reuse and its limits

Inherits ADR-0001 hash and the 1-byte view tag leak. TRON addresses are public so the usual stealth caveats hold: it hides recipient linkage, not payer, amount, token or timing. The memo reveals `R`, as ERC-5564 does.

## 4. Protobuf: hand-rolled vs tronweb

Chosen: ~100 lines of protobuf (varint, length-delimited) for `Transaction.raw`, `Any`, `TransferContract`, `TriggerSmartContract`. Reasons: (1) tronweb pulls a large dependency tree (HTTP client, ethers, big-number libs) into a payment-signing path, against this repo's pinned minimal-dependency policy; (2) it expects node-built transactions by default (`triggersmartcontract`), which is the trust model we reject; (3) the schema subset is tiny and stable; (4) we pin it with an independent Python decoder (`scripts/crosscheck_vectors.py`). Not verified: tronweb maintenance status was not checked (no network to registry docs). Risk accepted: a field-number mistake would produce txs the node rejects (fail closed, no fund loss), plus the cross-check agrees with the schema as remembered from `Tron.proto`, which itself is UNVERIFIED against the official file. Before any Nile broadcast, diff against the official `Tron.proto` and compare one tx against a node-built one.

## 5. Optional TRON announcer contract (specified, not built)

Memo scanning forces light clients to read whole blocks. A TVM contract (Solidity, TRON-compiled) could instead emit `Announcement(uint256 schemeId, address indexed stealth, address indexed caller, bytes ephemeralPubKey, bytes metadata)` as in ERC-5564 and let scanners query events by contract. Requirements if built: stateless, no owner, no upgrade; `announce()` callable by anyone (spam is a cost, not a safety issue, because the scanner verifies the address); GhostPay router semantics as in `CONTRACTS_SPEC` only if an audited version exists; deployment needs a funded account and is out of PoC scope (needs real wallet/TRX). Fee-on-transfer and the `checkout` fee stay `not_deployed` until then.

## 6. Resource model consequence

Stealth addresses start with no energy/bandwidth, so sweeps need TRX or delegation (docs/chains/tron.md, "Energy and bandwidth"). This is a privacy/UX cost and the main open product problem for TRON.

## 7. Integration and open items

- `ChainFamily` in `packages/chain-adapters/src/adapter.ts` must gain `'tron'` and registry wiring is not done here (file not owned by this work).
- UNVERIFIED and to check against official docs: Nile/Shasta endpoints, `getchainparameters` key names, `getblockbylimitnext` end bound, `broadcasthex`, memo size/fee limits, USDT energy figures, account-activation behaviour, Nile USDT contract.
- Mainnet needs a new ADR, an audit, a verified token list and a relayer/sponsor design for resources.
- `package-lock.json` changes from adding the workspace are left to the coordinator; `ADR-LOG.md` entry for ADR-0019 not added (shared file).
