# @ghostpay/solana-stealth

This package is a **proof of concept** of dual-key ed25519 stealth payments for Solana, covering SOL and SPL tokens. It has **not been audited**. The design and threat model are in [ADR-0017](../../docs/adr/ADR-0017-solana-stealth.md).

## What it does

| Module | Contents |
|---|---|
| `keys`, `meta-address` | Generates spend/view keys (random or from a seed). Encodes meta-addresses as `st:sol:` strings with a checksum and a cluster byte |
| `stealth` | Sender-side address derivation, recipient-side `checkAnnouncement`, and `deriveSpendKey` |
| `announcement` | The memo format: `gpst1:` + base58(R ‖ viewTag) |
| `instructions`, `tx` | Builds the System, ATA, Token and Memo instructions. Builds payment and sweep transactions with `@solana/kit`. Supports a sponsored fee payer. Signs with the scalar key (`signWithStealthKey`) and verifies signatures supplied from outside |
| `rpc`, `scan` | A minimal JSON-RPC client with strict parsing and lossless u64 handling. Pages announcements and detects payments by checking that the stealth address was credited |
| `adapter` | `createSolanaAdapter`, which has the `ChainAdapter` shape. Its contract copy is pinned by `adapter-types.test.ts` |

The package never sends transactions.

## Commands

```sh
npm run build -w @ghostpay/solana-stealth
npm test -w @ghostpay/solana-stealth
npm run vectors -w @ghostpay/solana-stealth   # regenerate + independent Python cross-check (needs build)
```

## Known limits

- Token-2022 extensions are not supported.
- No mints are allowlisted.
- No announcer program exists yet.
- `solana-test-validator` was not available, so all chain tests use a mock RPC.
