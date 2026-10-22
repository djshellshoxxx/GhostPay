# XRP Ledger port (research and spec, not built)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-xrp` (`@ghostpay/chain-xrp`, does not exist yet).
**Network access:** only `raw.githubusercontent.com` and `registry.npmjs.org`. xrpl.org, public rippled/Clio servers, explorers and testnet/devnet faucets are blocked and were not fetched; dependent claims are **unverified**.

## 1. Feasibility verdict

**Feasible for native XRP only; effort M; fee not enforceable.** XRPL accounts can use secp256k1, so the existing scheme-1 maths (ADR-0001) gives a stealth *public key* directly; the XRPL address is a hash of that key. Hard problems are not cryptographic: new accounts need a reserve, issued tokens need trustlines, and there is no shared announcer account to scan.

## 2. Scheme

- `ripple-keypairs` 3.1.0 supports both `ecdsa-secp256k1` and `ed25519` (read in `packages/ripple-keypairs/src/index.ts`) and computes the account id as `ripemd160(sha256(publicKeyBytes))` (`computePublicKeyHash`, read). So an account is a hash160 of a 33-byte compressed secp256k1 key (ed25519 keys carry a prefix byte; exact form **unverified**).
- Recommended: secp256k1 dual-key, same derivation as scheme 1 (`S = r·K_view`, `s_h = keccak256(S)`, `P = K_spend + h·G`) so the maths reuse noble; only the last step differs (hash160 of `P` plus XRPL base58 encoding instead of keccak address). `packages/core-crypto` exports only the EVM address, not the point, so `chain-xrp` re-implements the same ADR-0001 derivation with noble and must produce the identical `P`; test that identity. **Key-reuse hazard:** the stealth private key is the same scalar that controls the EVM address derived from the same `P`; disclose, and prefer a distinct scheme id/domain tag via ADR to avoid cross-chain key reuse.
- Spending: XRPL signs a hash of the serialized transaction with ECDSA; any scalar works with a custom signer or a library that accepts a raw private key. Exact signing-hash and canonical low-S rules: **unverified** (xrpl.org blocked), take from `xrpl` 5.3.0 source at build time.
- ed25519 option (as Solana) exists but adds the raw-scalar signer and torsion handling for no benefit here.

## 3. Account activation, reserves, tokens

- A destination account that does not exist must be funded with at least the base reserve or the payment fails; reserve amounts have changed by validator vote over time and current values are **unverified**. The payer funds it; the seller recovers it only by deleting the account (extra fee, conditions **unverified**).
- Issued tokens (IOUs) need a trustline set up by the *recipient* account (a `TrustSet` signed by the stealth key, requiring XRP for fees and an owner reserve): they cannot be paid to a never-seen stealth address. v1 = native XRP only.
- Destination tags, `RequireDest`, deposit authorization: fresh accounts have none; no action.

## 4. Announcement and scanning

- `Memos` is a standard transaction field (read in `xrpl.js` `models/common/index.ts`: `MemoData`, `MemoType`, `MemoFormat`). Put `R`, view tag and a type marker in the **same Payment** that funds the stealth account: atomic, no announcer needed. Memo size limit: **unverified**.
- Downside: no shared account to query. `account_tx` indexes by account, and the recipient does not know the stealth address until a match. A scanner must read **every** validated ledger's transactions and filter by memo type (own Clio/rippled node recommended). Per-announcement cost is one secp256k1 ECDH plus view-tag; volume of XRPL payments with memos is **unverified**.
- Alternative: a second tiny payment to a fixed announcer account (`account_tx` becomes the index), costing the payer a second transaction and fee; or the atomic `Batch` transaction type (XLS-56, header says status Final, "Package platform fees within the transaction itself" among use cases; read in `XRPLF/XRPL-Standards` `XLS-0056-batch`). Whether `Batch` is enabled on mainnet and supported by payer wallets is **unverified**.
- Finality: rippled's validated ledgers are final by consensus (general knowledge); closing interval and amendments **unverified**. Scanner reads `validated` only.

## 5. Adapter fit

New `'xrp'` family needed (proposal, ADR). Same mismatches as other non-EVM ports: `CompressedPoint`/`Address` types, `build()` returning an EVM `PaymentTx` (XRPL needs an unsigned `Payment` JSON with `Fee`, `Sequence`, `LastLedgerSequence`), `ScanRange` in ledger indexes (fits better than most), chain ids `"xrpl-mainnet"`, `"xrpl-testnet"`, `"xrpl-devnet"`. Side interface in its own package.

## 6. Fee capability

| Line | Status | Why |
|---|---|---|
| `checkout` | `not_enforceable` | No general smart contracts on XRPL mainnet (general knowledge, **unverified**); the payer wallet builds the Payment, nothing forces a second output. A `Batch` carrying a fee payment is built by the same payer, so a voluntary tip at most. Hooks exist on Xahau, a different ledger, not covered. |
| `gasSponsorship` | `not_enforceable` | Fees are paid by the transaction's account; XRPL has no native fee delegation (**unverified**). |
| `flatSecurity` | `not_deployed` | none |

A hosted scanning/indexing service (the Bitcoin revenue line in `MULTICHAIN_SPEC` section 4) is the realistic revenue path.

## 7. Effort

M: secp256k1 reuse and XRPL address codec S; unsigned Payment builder and local signer S-M; ledger scanner with memo filter M; reserve/activation handling and UX S; no contracts, no audit of programs but crypto review needed.

## 8. Risks

1. Scan cost (every ledger) pushes users to trusted indexers; viewing-key privacy trade-offs as in Feature 5.
2. Reserve lock-up per payment makes small payments uneconomic; tokens unsupported.
3. Same key as EVM `P` unless domain-separated.
4. No fee revenue on the payment path.
5. Wallet support for custom memos varies (**unverified**).

## 9. PoC acceptance (testnet/devnet only; needs network access outside this session)

- [ ] Offline: ADR-0001 derivation reproduces the same `P` as `packages/core-crypto` for shared vectors; hash160 and base58 address match `ripple-keypairs` 3.1.0 `deriveAddress` for the same public key, cross-checked by a second independent implementation.
- [ ] Offline: hostile memo payloads never throw in the scanner.
- [ ] Testnet: fund a derived account with a Payment carrying the memo; scanner finds it in a validated ledger; sweep signed with the derived scalar is accepted.
- [ ] Activation test: payment below reserve to a fresh account fails with the expected result code; recorded.
- [ ] No mainnet keys or endpoints anywhere.

## 10. Package ownership

New package `packages/chain-xrp` (`@ghostpay/chain-xrp`), owner: chain-port work stream; no edits to existing packages. If built: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0 (ripemd160, sha256), `@scure/base` 1.2.6 for base58 variant if its alphabet support is confirmed (**unverified**; otherwise own small codec with tests); `xrpl` 5.3.0 and `ripple-keypairs` 3.1.0 as devDependencies for cross-checks only.

## Sources (retrieved 2026-10-21)
- ripple-keypairs source: https://raw.githubusercontent.com/XRPLF/xrpl.js/main/packages/ripple-keypairs/src/index.ts
- xrpl.js common models (Memo): https://raw.githubusercontent.com/XRPLF/xrpl.js/main/packages/xrpl/src/models/common/index.ts
- XLS-56 Batch: https://raw.githubusercontent.com/XRPLF/XRPL-Standards/master/XLS-0056-batch/README.md
- Version lookups: https://registry.npmjs.org/xrpl/latest (5.3.0), https://registry.npmjs.org/ripple-keypairs/latest (3.1.0)
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/adr/ADR-LOG.md` (ADR-0001), `packages/core-crypto/src/stealth.ts`, `packages/chain-adapters/src/adapter.ts`
- Blocked (not fetched): xrpl.org, public servers, explorers, faucets.

## Unverified
Current reserve amounts and account-deletion rules; signing-hash and low-S details; memo size limits; mainnet status of `Batch`; absence of native fee delegation; ledger close timing; volume of memo-bearing payments; base58 alphabet support in `@scure/base`; wallet support for memos.
