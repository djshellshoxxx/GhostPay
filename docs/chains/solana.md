# Solana

Package: `packages/solana-stealth` (ADR-0017). Status: proof of concept, **not audited**. Researched on 2026-10-21.

| Cluster | chainId | Adapter |
|---|---|---|
| localnet | `sol-localnet` | enabled |
| devnet | `sol-devnet` | enabled |
| testnet | `sol-testnet` | enabled |
| mainnet-beta | `sol-mainnet` | refused unless `allowMainnet: true` (see CHECKLIST.md) |

## Program ids (verified)

Source: the official generated clients from the `solana-program` GitHub org on npm, read from their constants on 2026-10-21. The packages checked were `@solana-program/system@0.16.0`, `@solana-program/token@0.18.0`, `@solana-program/token-2022@0.20.0` and `@solana-program/memo@0.16.0`. Values are pinned in `src/programs.ts` and `test-vectors/solana-stealth.json`.

| Program | Id |
|---|---|
| System | `11111111111111111111111111111111` |
| SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (plain transfers only; extensions unsupported) |
| Associated Token Account | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| Memo (used to send) | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` (`LEGACY_MEMO_PROGRAM_ADDRESS_V3`) |
| Memo v1 (scan only) | `Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo` |
| Memo new (scan only) | `Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH`. Cluster deployment **unverified**, so it is never used to send |

Instruction layouts were checked against the same packages:

| Instruction | Layout |
|---|---|
| System Transfer | u32 2, u64 |
| ATA CreateIdempotent | `[1]` |
| TransferChecked | `[12]`, u64, u8 |
| CloseAccount | `[9]` |

## Tokens

None are allowlisted. USDC (Circle) and USDT (Tether) mint addresses could not be fetched from the issuer pages in this sandbox (developers.circle.com is blocked by the proxy). They are therefore **not** in code. The mint, its decimals and its token program are caller inputs. The values must be copied from the issuers' own pages before any token is allowlisted.

Rent-exempt minimums and ATA rent are read from RPC (`getMinimumBalanceForRentExemption`) and are never hard-coded.

## Tooling

- `@solana/kit@8.4.0` is used for compiling messages and encoding the wire format. Version 8.5.0 was skipped because it is less than two weeks old.
- `solana-test-validator` is not available in the sandbox (release.anza.xyz returns 403). All chain tests use a mock RPC.
- This package never calls `sendTransaction`.

## Privacy limits

See ADR-0017 section 7. The main limits:

- ATA creation is public.
- ATA rent moves on chain.
- The fee payer links transactions.
- Payer and amount are public.
