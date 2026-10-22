# Cardano port (research and spec, not built)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-cardano` (`@ghostpay/chain-cardano`, does not exist yet).
**Network access:** only `raw.githubusercontent.com` and `registry.npmjs.org`. cardano.org docs, Blockfrost/Koios/db-sync endpoints, explorers, faucets and testnet (preprod/preview) tooling are blocked and were not fetched; dependent claims are **unverified**.

## 1. Feasibility verdict

**Feasible; effort M; checkout fee not enforceable without a script step.** Cardano payment credentials are hashes of ed25519 keys, and the ledger's HD key format already stores an *extended* ed25519 secret (a raw scalar plus a 32-byte signing IV), so a derived stealth scalar fits natively. There is no ratified Cardano stealth standard found through the allowed hosts (not found, not claimed nonexistent).

## 2. Scheme

- Ed25519 dual-key, Monero-style, exactly as `solana.md` section 2.3 with tags `GhostPay/cardano/v1/...`: `P = K_spend + h·B`, `p = k_spend + h`.
- Address: an **enterprise address** (CIP-19 type 6, bits `0110....`, payload = `PaymentKeyHash`, no stake part; CIP-19 read) with `PaymentKeyHash = blake2b-224(P)` (CIP-19: key hashes are `blake2b-224` of Ed25519 verification keys). Enterprise form avoids binding the stealth address to a stake key; cost: the received ADA does not stake from that address.
- Signing: CIP-3 (read) describes the ledger key format as ED25519-BIP32: an extended secret of 64 bytes = 32-byte tweaked scalar + 32-byte IV used for signing. So the stealth key is stored as `(p, iv)` with `iv = H512(domain ‖ p)[0..32]`. `@emurgo/cardano-serialization-lib-nodejs` 17.0.0 exposes `PrivateKey.from_extended_bytes` and `from_normal_bytes` (read in its `.d.ts`). Whether the library accepts an arbitrary (non-tweaked, mod-L) scalar without normalising or rejecting it is **unverified**; if not, `chain-cardano` signs itself with the shared raw-scalar signer (same as Solana 2.4). No wallet imports the key; sweeps are done by GhostPay software.
- Torsion, small-order and canonical-encoding checks as on Solana; node verification rule (strict vs cofactored) **unverified**: dual-verifier tests.

## 3. Announcement and scanning

- Put `(R, view tag, version)` in transaction **metadata** under a label. The label registry is CIP-10 (read): new labels are registered by PR; PoC uses an unregistered label and production needs a registered one (decision). CIP-20 (read) sets the 674 message label and 64-byte-per-string limits; the same 64-byte metadata chunk limit applies to byte strings (**unverified**); `R` is 32 bytes.
- Scanning: query transactions by metadata label through an indexer (Blockfrost, Koios or self-hosted db-sync/Ogmios). API names, pagination and limits **unverified**. Fetching all announcements by label and scanning client-side leaks nothing about the viewing key; address-specific queries leak. Cost per announcement: one ECDH plus view tag.
- Finality is probabilistic (Ouroboros); choose a confirmation depth in config. Depth and rollback bounds **unverified**.

## 4. UTxO and fee model consequences

- Each output must carry the protocol's minimum ADA (depends on output size; value **unverified**). Tokens (stablecoins as native assets) need larger minimums. The payer funds it; the seller reclaims it at sweep. Show separately from any fee.
- A payment to a fresh stealth address is just an output; no account creation, no reserve, no deployment.
- Sweeping spends the stealth UTxOs; the fee payer can be a seller input in the same transaction (stealth key signs only its inputs), linking stealth and main wallet on chain in that transaction.

## 5. Adapter fit

New `'cardano'` family (proposal, ADR). Mismatches: `CompressedPoint` (33-byte secp256k1), `Address` (`0x`), `build()` (EVM `PaymentTx`; Cardano needs inputs, outputs, TTL and fee computed from protocol parameters), `ScanRange` blocks vs slots/metadata cursors, multi-asset amounts. Chain ids propose `"cardano-mainnet"`, `"cardano-preprod"`, `"cardano-preview"`. Side interface in its own package.

## 6. Fee capability

| Line | Status | Why |
|---|---|---|
| `checkout` | `not_enforceable` for ordinary payments | The payer's wallet builds the transaction. No script runs on its inputs, so nothing can force a fee output. A voluntary fee output is possible. |
| `checkout` (optional phase 2) | `enforced` on routed payments only | Payer sends `gross` to a GhostPay validator script address with a datum (stealth key hash, `R`, tag, refund key and expiry); any party (seller, keeper) later spends it, and the validator only allows outputs `fee` to the fee address and `net` to the stealth address. Costs two transactions, script execution fees, collateral, datum handling, an audit and a refund path; effort L. Direct payments still bypass (ADR-0013). Plutus/Aiken details **unverified**. |
| `gasSponsorship` | `not_enforceable` | Fee payer is whoever funds inputs; a keeper-paid sweep is possible by transaction construction, policy only. |
| `flatSecurity` | `not_deployed` | none |

## 7. Effort

M for scheme, address, metadata, scanner and sweep; +L if the script router is added.

## 8. Risks

1. Custom ed25519 signer or an extended-key library that normalises scalars and breaks derived keys.
2. Indexer dependence and rollback handling; metadata label governance.
3. Minimum-ADA and token-bundle edge cases; dust-spam of announcements (cost per metadata transaction **unverified**).
4. Script router adds audit scope and funds-in-escrow risk.
5. No wallet or hardware import of the stealth key.

## 9. PoC acceptance (preprod/preview only; needs network access outside this session)

- [ ] Offline: derive/scan round trip, hostile `R`, torsion rejection, dual-verifier signature tests (as `solana.md` section 13).
- [ ] Offline: enterprise address `addr_test1...` for a fixed key matches `@emurgo/cardano-serialization-lib-nodejs` 17.0.0 and a second independent bech32/blake2b-224 implementation.
- [ ] Offline: signature from the derived `(p, iv)` extended key verifies with noble and is accepted by the library's verifier.
- [ ] Testnet: payment output plus metadata to a derived address; scanner finds it by label; sweep transaction signed with the derived key is accepted by the node.
- [ ] No mainnet keys or endpoints anywhere; no script deployed in the PoC.

## 10. Package ownership

New package `packages/chain-cardano` (`@ghostpay/chain-cardano`), owner: chain-port work stream; no edits to existing packages. If built: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0 (blake2b), `@scure/base` 1.2.6 (bech32); `@emurgo/cardano-serialization-lib-nodejs` 17.0.0 only as a devDependency for cross-checks (runtime use would add a WASM dependency outside ADR-0004). A script router, if ever built, belongs to a separate package with its own audit.

## Sources (retrieved 2026-10-21)
- CIP-3 key derivation (extended Ed25519): https://raw.githubusercontent.com/cardano-foundation/CIPs/master/CIP-0003/README.md
- CIP-19 addresses: https://raw.githubusercontent.com/cardano-foundation/CIPs/master/CIP-0019/README.md
- CIP-10 metadata label registry: https://raw.githubusercontent.com/cardano-foundation/CIPs/master/CIP-0010/README.md
- CIP-20 message metadata (label 674, 64-byte strings): https://raw.githubusercontent.com/cardano-foundation/CIPs/master/CIP-0020/README.md
- Cardano serialization lib 17.0.0 tarball (`PrivateKey.from_extended_bytes`): https://registry.npmjs.org/@emurgo/cardano-serialization-lib-nodejs/-/cardano-serialization-lib-nodejs-17.0.0.tgz
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/adr/ADR-LOG.md`, `packages/chain-adapters/src/adapter.ts`, `docs/remote/chain-ports/solana.md`
- Blocked (not fetched): cardano.org docs, Blockfrost, Koios, explorers, faucets.

## Unverified
Minimum-ADA values; metadata byte-string limits; confirmation depth; indexer APIs; whether library signing accepts arbitrary scalars; node signature-verification rule; script (Plutus/Aiken) costs and mechanics; metadata-spam economics; testnet faucets.
