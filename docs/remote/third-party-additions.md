# Third-party additions (remote-extensions-1)

Rows to be merged into THIRD_PARTY.md by the owner of that file.

| Package | Version | License | Used by | Purpose | Notes |
|---|---|---|---|---|---|
| `@scure/btc-signer` | 2.4.1 | MIT | btc-silent-payments | PSBT/transaction building, BIP-341 sighash, finalize/extract for silent-payment spends | exact pin; deps `@noble/curves` 2.4.0 and `@noble/hashes` 2.4.0 (same as the repo pins, hoisted, no duplicate), nested `@scure/base` 2.4.0 |
| `micro-packed` | 0.11.1 | MIT | via `@scure/btc-signer` | binary (de)serialization | transitive; nests `@scure/base` 2.4.0 |
| `@scure/base` (nested, 2.4.0) | 2.4.0 | MIT | via `@scure/btc-signer`, `micro-packed` | base encodings | second major beside the hoisted 1.2.6 (viem / btc-silent-payments); not shared across package boundaries. ADR-0004 "no other crypto library": btc-signer is built on noble only |
