# 11 BIP-352 wallet hardening, label handling, payer UX

Priority P2 | Effort M (5-7 d) | Owner: btc-silent-payments + web (flagged) | Deps: ADR on ChainAdapter union types (gap item 15)
Sources: research s3 (BIP-352 text retrieved 2026-10-21), DOC-10..DOC-14; MULTICHAIN s3; package DEVIATIONS.

## 1. Checklist-to-code mapping (each with official test vector coverage)
| Pitfall | Rule | Where |
|---|---|---|
| Eligible inputs | Only P2TR, P2WPKH, P2SH-P2WPKH, P2PKH feed shared secret; multisig/conditional excluded | receiver scan + sender selection |
| Taproot parity | negate privkey with odd-Y public point | `sender.ts` |
| Label 0 | reserved for change, never handed out; `createLabeledAddress(m)` throws for m=0 | `labels.ts` |
| Labels != identity | UI copy: labels are linkable by anyone with scan key; per-invoice separation via invoice metadata, not labels | web copy |
| k++ rule | a cryptographic match filtered by wallet policy still increments k; cap `Kmax=2323` per group | `receiver.ts` |
| Version | `sp1q` v0; unknown version -> reject, never parse as v0; forward-compat rule UNVERIFIED | `address.ts` |
| ANYONECANPAY / collaborative | sender code refuses; docs warn | `sender.ts` |
| Dust | wallet-policy threshold (default 1000 sats, configurable); scanner reports all matches, wallet hides | `spend.ts`, UI |
| Spend | key path PSBT; `testmempoolaccept` on user node before broadcast (gap: unverified on network); hardware wallets unsupported in v1 | `spend.ts` |
## 2. Payer UX (DOC-11)
Invoice page for `chain: bitcoin-mainnet`: shows `sp1...`, `sp=` BIP-321 URI, QR, wallet capability text: "Your wallet must support BIP-352 and spend from single-key inputs; multisig-only wallets cannot pay." Wallet list not hard-coded (ecosystem claims UNVERIFIED, DOC-14): link to user-maintained list. Failure messaging for unsupported scheme. Amount unit tests sats vs wei.
## 3. Dust/sweep policy (DOC-12)
Fee estimate before sweep; refuse if fee > 50% of value unless forced; batch outputs of same label into one tx; document fee-estimation source (user node preferred).
## 4. Tests
All official BIP-352 send/receive vectors; negative vectors (label 0, bad version, off-curve keys, Kmax exceed, excluded input types); property: scan(send(x)) finds x; differential vs Bitshala silent-pay (reference only, not shipped); chain-mismatch rejection across adapters; reorg handling of scan persistence.
## 5. Acceptance
- [ ] Every table row has a failing-before/passing-after test. - [ ] Web integration behind `VITE_FLAG_BITCOIN`, off by default. - [ ] Fee honestly shown as "none enforceable" (MULTICHAIN s4). - [ ] Bitshala install done or limitation recorded.
