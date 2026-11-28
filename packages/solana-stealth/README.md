# @ghostpay/solana-stealth

This package is a **proof of concept** of dual-key ed25519 stealth payments for Solana, covering SOL and SPL tokens. It has **not been audited**. The design and threat model are in [ADR-0017](../../docs/adr/ADR-0017-solana-stealth.md).

**Interoperable with `@ghostpay/chain-solana`.** Both packages use the ADR-0017 formats: `st:sol:` meta-addresses
(with a cluster byte and checksum) and `gpst1:` + base58 memos, and the same derivation. Shared vectors
(`test-vectors/meta-address-sol-tron-v1.json`, `test-vectors/solana-stealth.json`) are checked from both sides by
`packages/chain-solana/src/interop.test.ts`. This package is the one imported by the web app (`apps/web`); the CLI
imports `@ghostpay/chain-solana`. The older `gpsol:` meta-address is rejected by `@ghostpay/chain-solana`
with `LEGACY_META_ADDRESS`; the old base64url memo is rejected as `INVALID_ANNOUNCEMENT`. Testnet and proof of concept only.

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
- The package's own tests use a mock RPC. A real `solana-test-validator` run exists separately in `scripts/integration/solana-local.e2e.mjs` (invoked by `.github/workflows/integration.yml`).
