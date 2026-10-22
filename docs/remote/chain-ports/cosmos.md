# Cosmos SDK chains port (research and spec, not built)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-cosmos` (`@ghostpay/chain-cosmos`, does not exist yet).
**Network access:** only `raw.githubusercontent.com` and `registry.npmjs.org`. docs.cosmos.network, chain registries, LCD/RPC endpoints, explorers and testnet faucets are blocked and were not fetched; dependent claims are **unverified**.

## 1. Feasibility verdict

**Feasible; effort M; the cheapest non-EVM port cryptographically, the most expensive per chain.** Default Cosmos SDK accounts use secp256k1, so scheme-1 maths apply with only the address encoding changed. Cost is a per-chain config matrix (bech32 prefix, denoms, gas prices, CosmWasm availability), not new crypto. Chains using `eth_secp256k1` with keccak addresses (EVM-style Cosmos chains) are covered by the EVM adapter work and out of scope here.

## 2. Scheme

- secp256k1 dual-key with the ADR-0001 derivation (`s_h = keccak256(S)`, `P = K_spend + h·G`, `p = k_spend + h`), reusing noble. `core-crypto` exports only the EVM address, so `chain-cosmos` re-derives `P` and must match scheme 1's `P` exactly (tested). Key-reuse hazard: the same scalar controls the EVM address from the same `P`; prefer a distinct scheme id/domain tag via ADR.
- Address: `ripemd160(sha256(compressed_pubkey))` (read in `cosmos/cosmos-sdk` `crypto/keys/secp256k1/secp256k1.go`, `Address()`), then bech32 with the chain's human-readable prefix (prefix is per chain; list **unverified** here). Signing: the SDK's signing modes (amino JSON, direct protobuf `SIGN_MODE_DIRECT`) and ECDSA details are **unverified**; take from `@cosmjs/proto-signing` / `@cosmjs/crypto` 0.39.0 at build time. Any scalar signs with a custom signer.
- Meta-address: chain-bound (include the bech32 prefix) so an invoice for one Cosmos chain cannot be paid on another (`MULTICHAIN_SPEC` section 6).

## 3. Announcement and scanning

- Without a contract: carry `R` and tag in the tx **memo**. `MaxMemoCharacters` default is 256 (read in `x/auth/README.md`), enough for base64 `R` (44 chars) plus tag; chains can change it (**unverified** per chain). Memo text is not indexed for search, so a scanner would have to read every block's transactions: heavy.
- With CosmWasm (only on chains that enable it, **unverified** which): a stateless announcer contract emits an event per announcement; CometBFT/`tx_search` event queries over indexed attributes make this efficient (event indexing behaviour and node configuration **unverified**; many public nodes limit or disable search). Recommended where available; router contract CPIs/calls the announcer.
- Finality: CometBFT blocks are final once committed (general knowledge, **unverified**); scanner reads committed blocks only.

## 4. Gas, accounts and sponsorship

- A bank send to an unseen address creates the account; no reserve (general knowledge, **unverified** per chain). The stealth address needs fee-denom balance to sweep.
- `x/feegrant` (README read) lets an account grant fee allowances so grantees can transact without holding fee tokens. A relayer can therefore grant the stealth address an allowance after the scanner reveals it, giving native gas sponsorship without a token buffer. Allowance types and expiry details **unverified** beyond the README. It is policy-enforced by the relayer (the grant is the relayer's choice and cost).
- `MsgMultiSend` (documented in `x/bank/README.md`) allows several outputs atomically, but the payer builds it; useful for a voluntary fee output only.
- Tokens: native denoms and IBC denoms (`ibc/...`) are bank balances and work like native; CW20 needs a contract call. Per-denom allowlist as ADR-0011.

## 5. Adapter fit

New `'cosmos'` family (proposal, ADR). `chainId` strings here are Cosmos chain ids (for example `"cosmoshub-4"`), not the `"btc-mainnet"` style; define a namespacing rule (`"cosmos:<chain-id>"`) in the ADR. Mismatches: `CompressedPoint` brand (33-byte secp256k1 fits the bytes but the type is the EVM scheme's), `Address` (`0x`), `build()` (needs `TxBody`, `AuthInfo`, account number and sequence, fee), `ScanRange` heights (fits). Side interface in its own package.

## 6. Fee capability

| Line | Status | Why |
|---|---|---|
| `checkout` | `not_enforceable` for plain bank sends; `enforced` on routed payments if a CosmWasm router exists on that chain | A CosmWasm router can receive funds, send `fee` to the fee address and `net` to the stealth address, then announce, atomically. Direct sends bypass it (ADR-0013). Many Cosmos chains have no CosmWasm: capability is **per chain**, so `FeeCapability` must be per chain config. |
| `gasSponsorship` | `not_enforceable` (relayer policy) | `x/feegrant` makes sponsorship possible, but pricing it is the relayer's own policy. |
| `flatSecurity` | `not_deployed` | none |

## 7. Effort

M: secp256k1 reuse and bech32 address S; tx builder/signer with `@cosmjs` cross-checks S-M; memo scanner S, CosmWasm announcer plus router (per chain deployment, audit) M; per-chain config matrix and testing M.

## 8. Risks

1. Per-chain divergence (prefixes, memo limits, gas pricing, search/indexing availability, CosmWasm permissions: some chains gate contract upload by governance).
2. Memo-only scanning is impractical at scale.
3. Same-key reuse with EVM `P`.
4. Fee grants give the relayer a spam target and a cost center.
5. Chain upgrades and IBC denom changes alter token identity.

## 9. PoC acceptance (public testnet or local node only; needs network access outside this session)

- [ ] Offline: `P` equals the scheme-1 `P` for shared vectors; address matches `@cosmjs/crypto` 0.39.0 hashing for the same key, cross-checked by a second independent implementation of bech32 and ripemd160(sha256).
- [ ] Offline: hostile memo payloads never throw; chain-prefix mismatch is rejected.
- [ ] Testnet or local single-node chain: bank send with memo to a derived address; memo scanner finds it; sweep signed with the derived scalar (using a feegrant-sponsored fee) is accepted.
- [ ] No mainnet keys or endpoints anywhere; no contract deployed by the PoC.

## 10. Package ownership

New package `packages/chain-cosmos` (`@ghostpay/chain-cosmos`), owner: chain-port work stream; no edits to existing packages. If built: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@scure/base` 1.2.6 (bech32); `@cosmjs/crypto` and `@cosmjs/proto-signing` (0.39.0 at retrieval) only as devDependencies for cross-checks. CosmWasm contracts, if ever built, go in a separate package with their own audit.

## Sources (retrieved 2026-10-21)
- secp256k1 address derivation: https://raw.githubusercontent.com/cosmos/cosmos-sdk/main/crypto/keys/secp256k1/secp256k1.go
- x/auth (MaxMemoCharacters): https://raw.githubusercontent.com/cosmos/cosmos-sdk/main/x/auth/README.md
- x/bank (MsgMultiSend): https://raw.githubusercontent.com/cosmos/cosmos-sdk/main/x/bank/README.md
- x/feegrant: https://raw.githubusercontent.com/cosmos/cosmos-sdk/main/x/feegrant/README.md
- cw-plus README (CosmWasm contract collection, context only): https://raw.githubusercontent.com/CosmWasm/cw-plus/main/README.md
- Version lookups: https://registry.npmjs.org/@cosmjs/crypto/latest (0.39.0), https://registry.npmjs.org/@cosmjs/proto-signing/latest (0.39.0)
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/adr/ADR-LOG.md`, `packages/core-crypto/src/stealth.ts`, `packages/chain-adapters/src/adapter.ts`
- Blocked (not fetched): docs.cosmos.network, chain-registry sites, LCD/RPC endpoints, explorers, faucets.

## Unverified
Bech32 prefixes and denoms per chain; signing modes and gas models; which chains enable CosmWasm and event search; memo limits on each chain; account creation costs; feegrant allowance specifics; CometBFT finality statement; IBC denom behaviour.
