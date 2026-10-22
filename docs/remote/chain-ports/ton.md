# TON port (research and spec, not built)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-ton` (`@ghostpay/chain-ton`, does not exist yet). Base spec `docs/MULTICHAIN_SPEC.md`; interface `packages/chain-adapters/src/adapter.ts`.
**Network access:** only `raw.githubusercontent.com` and `registry.npmjs.org` (session constraint). toncenter, tonapi, ton.org docs, explorers, testnet faucets are blocked and were not fetched; dependent claims are marked **unverified**.

## 1. Feasibility verdict

**Feasible, medium effort (M), spec only.** TON wallets are ed25519 smart contracts, so the ed25519 stealth maths from `solana.md` section 2 apply, but the address is **not** the public key: it is the hash of the wallet contract's initial state, which embeds the public key. That is actually friendlier than Solana (no "address = pubkey" constraint, and the fee/announce logic can live in a router contract). No TON stealth standard was found through the allowed hosts (not found, not claimed nonexistent).

## 2. Scheme

- Reuse the Solana scheme B exactly (Edwards ECDH with cofactor clearing, SHA-512 domain-separated wide reduction, `P = K_spend + h·B`, `p = k_spend + h`); only the domain tags change (`GhostPay/ton/v1/...`). Do not copy code between packages: if both ports proceed, extract an `ed25519-stealth` core by ADR, otherwise `chain-ton` stays a spec.
- Address: `addr = hash(StateInit{ code = wallet v5 code, data = (seqno 0, wallet_id, P, extensions empty) })` plus workchain. Wallet v5 contract source (read: `ton-blockchain/wallet-contract-v5/contracts/wallet_v5.fc`) stores `seqno, wallet_id, public_key (256 bits), extensions` in contract data and verifies external messages with `check_signature(slice_hash(signed_slice), signature, public_key)`. Any ed25519 key `P` works, so a raw-scalar signature (same signer as Solana section 2.4) is accepted; no seed is required by the chain.
- The payer must use the **same wallet code and `wallet_id`** the seller will use; the wallet version and `wallet_id` therefore become part of the meta-address (or a fixed GhostPay profile). Which contract versions standard libraries emit, and `wallet_id` default values, are **unverified**.
- Deployment: an address that received funds is "uninitialised" until the first outgoing message carries the `StateInit`. The first sweep deploys and spends in one external message signed by the stealth key.
- Torsion/small-order/canonical-encoding checks are identical to Solana 2.3. TON's `check_signature` verification rule (strict versus cofactored) is **unverified**; use the same dual-verifier test.
- Key import into wallet apps is impossible for the same reason as Solana (apps hold seeds).

## 3. Announcement and scanning

- TON has no `getLogs`. Options: (a) an **announcer contract** that emits an external-out message or log cell per announcement; scan by walking the contract's transaction list from a stored logical time cursor; (b) comment/payload on the payment message itself. (a) is recommended: one scan target, parity with EVM.
- The scanning APIs (HTTP API v2/v3, lite-server) are on blocked hosts: method names, pagination, limits and rate limits **unverified**. Per-announcement cost is one ECDH (`k_view·R`) plus view-tag check, as on Solana.
- Finality: masterchain/shardchain finality semantics, bounce behaviour and message delivery guarantees are **unverified**. Design rule: payments to uninitialised stealth addresses must be sent **non-bounceable**, otherwise a failed delivery returns funds to the payer; confirm in a testnet test.

## 4. Adapter fit

`ChainFamily` is `'evm' | 'bitcoin' | 'solana'`; TON needs a new `'ton'` member (proposal only, by ADR). Mismatches: `CompressedPoint` is a 33-byte secp256k1 brand; `Address` is `0x` hex; `build()` returns an EVM `PaymentTx` (TON needs an internal message with value, body and flags); `ScanRange.fromBlock` does not map onto logical time cursors; chain ids propose `"ton-mainnet"`, `"ton-testnet"`. Side interface in its own package, as `btc-silent-payments/src/adapter-types.ts` does.

## 5. Fee capability

| Line | PoC | With router contract |
|---|---|---|
| `checkout` | `not_deployed` | `enforced` on routed payments only: a GhostPay router contract (FunC/Tolk/Tact, immutable fee address, audited) receives value, sends a fee message and a net message in one transaction. Direct sends to the stealth address bypass it (ADR-0013). |
| `gasSponsorship` | `not_deployed` | Wallet v5 README states signed actions can be delivered by internal messages "can be used for gasless transactions" (read), so a relayer-paid sweep is architecturally possible; policy-enforced by the relayer, not by chain. Details **unverified**. |
| `flatSecurity` | `not_deployed` | none |

Jettons (TEP-74 tokens) are not covered in v1: transferring a jetton needs per-owner jetton-wallet contracts, forward-TON amounts and notification handling; treat as a separate sub-spec. All of that is **unverified** here.

## 6. Effort

M overall: shared ed25519 core S (if extracted), TON address/StateInit builder and raw-scalar external-message signer S-M, announcer plus router contracts M, scanner against a recorded API S-M, audit M.

## 7. Risks

1. Wallet-version coupling: the address depends on exact code and data layout; a mismatch makes funds unreachable by the seller's software.
2. Uninitialised accounts, bounce flag mistakes, storage fees on dormant accounts (storage fee rules **unverified**).
3. Verifier-rule drift as in Solana; custom signer risk.
4. Third-party API dependence for scanning; contract language ecosystem churn.
5. No wallet or hardware import of the stealth key.

## 8. PoC acceptance (testnet only; needs network access outside this session)

- [ ] Offline: stealth derive/scan round trip, hostile-`R` handling, torsion rejection, dual-verifier signature tests (as `solana.md` section 13).
- [ ] Offline: computed wallet v5 `StateInit` address for a fixed key equals the address produced by `@ton/ton` (16.3.0 at retrieval) for the same code/data, tested against two independent builders.
- [ ] Testnet: non-bounceable transfer to a derived address; announcer transaction found by the scanner; first outgoing message (deploy plus sweep) signed with the raw scalar is accepted and the balance moves.
- [ ] No mainnet keys or endpoints anywhere; no contract deployed by the PoC beyond testnet fixtures.

## 9. Package ownership

New package `packages/chain-ton` (`@ghostpay/chain-ton`), owner: chain-port work stream. No edits to existing packages. Dependencies if built: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@ton/core` (0.63.1 at retrieval) for cells/StateInit; `@ton/ton` and `@ton/crypto` only as devDependencies for cross-checks. Contracts (if any) in a separate future `packages/chain-ton-contracts` with its own audit.

## Sources (retrieved 2026-10-21)
- Wallet v5 README and contract: https://raw.githubusercontent.com/ton-blockchain/wallet-contract-v5/main/README.md , https://raw.githubusercontent.com/ton-blockchain/wallet-contract-v5/main/contracts/wallet_v5.fc
- Version lookups: https://registry.npmjs.org/@ton/ton/latest (16.3.0), https://registry.npmjs.org/@ton/core/latest (0.63.1), https://registry.npmjs.org/@ton/crypto/latest (3.3.0)
- Repo: `docs/MULTICHAIN_SPEC.md`, `packages/chain-adapters/src/adapter.ts`, `docs/remote/chain-ports/solana.md`
- Blocked (not fetched): docs.ton.org, ton.org, toncenter, tonapi, explorers, faucets.

## Unverified
Wallet versions and default `wallet_id`; StateInit/address encoding details; bounce and uninitialised-account behaviour; storage fees; scanning API methods and limits; finality timing; `check_signature` strictness; jetton flows; gasless internal-message flow specifics; testnet tooling.
