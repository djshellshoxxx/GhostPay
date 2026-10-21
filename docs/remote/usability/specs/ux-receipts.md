# Spec: payment receipts (ux-receipts)

## R1 Data model
`PaymentRecord` (private, local): createdAt (ISO instant with ms), chain (CAIP-2), asset {symbol, decimals}, amountBase (positive integer string, <=78 digits), memo? (1..140 chars, no control/bidi/zero-width), txHash (lowercase 32-byte hex), sender, recipient (alnum 20..128), recipientKind (stealth|public). No key fields exist; unknown fields -> UNKNOWN_FIELD, key-like names (key/seed/mnemonic/secret/viewing/spending/private/scan) -> FORBIDDEN_FIELD.
`Receipt` (shareable): v=1, type=ghostpay.receipt, optional revealed fields, `redacted` list, digest {alg SHA-256, hex}.
Acceptance: invalid values for every field rejected (receipt.test.ts "rejects bad ..."); error messages never echo values.

## R2 Canonical JSON + digest
Sorted keys, no whitespace, safe integers only; floats/undefined/bigint/non-plain/deep nesting rejected. Digest = SHA-256 (WebCrypto) of canonical body without `digest`.
Acceptance: known SHA-256 vectors; key order independence (fast-check); digest equals recomputation.

## R3 Selective disclosure
Policy: time exact|day|hidden; chain, amount (asset travels with it), memo, txHash booleans; sender/recipient `full|hidden|{head,tail}` (1..16 each, head+tail <= half the length). Presets minimal/standard/full. Withheld values are absent, never masked. A revealed memo that looks secret (64-hex, xprv, stealth meta-address, "viewing key", seed words, 12+ word mnemonic shape) -> SECRET_LIKE_MEMO.
Acceptance: minimal/standard/full exact outputs; property: withheld values never appear in serialized output.

## R4 Rendering
`renderText` (labels injectable for i18n, control/bidi chars replaced, always includes digest and an "unsigned" disclaimer); `renderJson` canonical or pretty.
Acceptance: exact text for standard preset; both JSON forms re-verify.

## R5 Verification
`verifyReceipt(input, {verifier?, nowMs?, maxSkewMs?})` -> verdict `invalid | self_consistent_unverified | chain_confirmed | chain_problem`, chain status, matched/mismatched fields, caveats. Self-consistency = strict parse + digest recompute + not-future date. `ChainVerifier.lookup({chain, txHash})` is injected; thrown errors/unknown results -> `unavailable`. `chain_confirmed` needs tx found+confirmed and >=1 compared field (amount, asset, sender, recipient; truncated addresses by head/tail) matching with none mismatching.
Acceptance: tamper detected; forged-but-consistent receipt passes self-check but fails against chain facts; not_checkable when chain/txHash withheld.

## R6 Privacy warnings
`analyzeDisclosure(record, policy)` returns coded warnings (info/caution/high): memo_secret_like, memo_free_text, txhash_links_onchain, txhash_without_chain, sender_full_address, stealth_recipient_full, recipient_full_address, truncated_address_matchable, exact_time_with_txhash, not_chain_checkable, digest_not_signature, sharing_irreversible.
