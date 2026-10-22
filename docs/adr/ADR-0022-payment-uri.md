# ADR-0022: Strict payment URI builders and parsers

Status: proposed (pre-audit)

## Context
Computer-to-phone exchange (QR, paste, deep link) carries amounts and recipients in several formats: EIP-681 and ERC-3770 for EVM, BIP-21/321 with BIP-352 `sp=` for Bitcoin, Solana Pay, TRON (no adopted standard) and GhostPay invoice links. Existing parsing is ad hoc, one chain at a time. Payment URIs are attacker-controlled: duplicate or injected parameters, float amounts, lookalike or checksum-bad addresses and bidi text in labels are the usual attacks.

## Decision
New pure package `@ghostpay/payment-uri` (no DOM):
1. One strict query layer (bounded length, ASCII only, strict `%XX`, fatal UTF-8, no raw `+`, no empty values, duplicates rejected unless the spec makes the key repeatable) shared by all formats.
2. Amounts parsed as decimal strings into `bigint` (never floats); per-format bounds (21M BTC, uint256, u64).
3. Addresses validated per family (EIP-55, base58check, bech32/bech32m with version/length rules, BIP-352 v0). EIP-681 chain id is checked against an optional expected chain.
4. Text fields (`label`, `message`, `memo`) rejected on control, bidi, default-ignorable, private-use, tag characters and non-NFC, size-capped, returned as plain text.
5. Each recipient is returned as canonical form, 4-char grouped display and a domain-separated SHA-256 digest for the UI and for lookalike checks.
6. TRON gets a minimal, explicitly nonstandard `tron:` form.
7. Implement directly on `@noble/hashes` 2.4.0 and `@scure/base` 1.2.6 (already in the repo).

## Alternatives
`bitcoinjs/bip21` 3.0.0 (MIT, but depends on `query-string` and tolerates duplicates/unknown keys; last published 2025-06) and `@solana/pay` 1.0.26 (MIT, but ships `install.cjs`, pulls `@solana/kit` plugins and parses amounts with `Number`): rejected as dependencies; the latter's `parseURL` was read as a reference only. A shared looser parser plus per-chain checks: rejected, since strictness has to be uniform.

## Consequences
Some real-world URIs are rejected (non-checksummed mixed case, repeated BIP-321 instructions, unknown parameters); the UI must show the typed error. Two spec examples are themselves invalid under strict checks (see DEVIATIONS.md). The `tron:` form is interoperable only with GhostPay. Lookalike detection stays in `@ghostpay/address-safety`. Web integration is open. Not audited.
