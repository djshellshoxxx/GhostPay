# @ghostpay/solana-stealth

This package is a **proof of concept** of dual-key ed25519 stealth payments for Solana, covering SOL and SPL tokens. It has **not been audited**. The design and threat model are in [ADR-0017](../../docs/adr/ADR-0017-solana-stealth.md).

**Shares the ADR-0017 formats with `@ghostpay/chain-solana`.** The web app (`apps/web`) imports this package;
the CLI imports `@ghostpay/chain-solana`. Both use `st:sol:` meta-addresses with a cluster byte, the same stealth
payment derivation, and `gpst1:` + base58 memos ([ADR-0017](../../docs/adr/ADR-0017-solana-stealth.md), sections 3
and 5). The [cross-implementation tests](../chain-solana/src/interop.test.ts) check both packages against the
[shared vectors](../../test-vectors/meta-address-sol-tron-v1.json) and this package's
[ADR-0017 vectors](../../test-vectors/solana-stealth.json).

The CLI decoder additionally refuses equal spend and view public keys (`KEY_REUSE`); this decoder accepts them.
The retired CLI `gpsol:` meta-address and base64url memo forms remain rejected. Package-specific binary
announcements and signing nonce construction are documented in [chain-solana's deviations](../chain-solana/DEVIATIONS.md).
Format compatibility does not extend the CLI adapter's scope: it accepts only `sol-devnet` and `sol-testnet`,
with no RPC client, transaction builder or on-chain program. Both packages remain unaudited proofs of concept.

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
