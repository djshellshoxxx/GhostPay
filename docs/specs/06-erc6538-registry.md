# 06 ERC-6538 registry integration

> **Implementation status (2026-11-11, commit 364b1f18):** `packages/chain-adapters/src/registry.ts` exports `buildRegisterKeysCall`, `buildRegisterKeysTx`, `buildLookupCall` and `lookupMetaAddress`, not the names in section 2. There is no on-behalf or increment-nonce builder (only ABI entries in `packages/chain-adapters/src/abi/erc6538Registry.ts`) and no ENS resolution in `registry.ts` or `apps/web/src`; lookup is by address only.

Priority P1 | Effort S (ABI, 1 d) + M (UI, 3 d) | Owner: chain-adapters + web | Deps: 01 (code check), 09 (per-chain table)
Sources: research 1.1/1.2 item 4, DOC-3, DOC-4; gap-analysis item 4; CONTRACTS_SPEC preamble; ERC-6538 (Final, canonical `0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`).

## 1. Scope

**2026-11-16 continuation:** The public chain-adapters package now exports `buildRegistryNonceCall`,
`buildIncrementNonceTx` and `buildRegisterKeysOnBehalfTx` from `registryDelegation.ts`. The delegated builder accepts
an already-authorized signature and validates address, scheme-1 meta-address and bounded opaque signature bytes.
`buildRegistryDelegationRequest` now builds the canonical EIP-712 domain, scheme-1 message and digest from an explicit
chain ID and nonce. `signRegistryDelegation` freezes the validated request, obtains a bounded EOA/ERC-1271 signature
through an injected signing callback, and returns calldata only after an injected verifier explicitly succeeds.
The verifier must check the selected chain ID and current nonce against the request and authenticate the registrant,
then simulate against the verified registry. Simulation alone cannot validate the request's chain ID and nonce fields,
because those fields are implicit in the registry rather than supplied in calldata. The caller must repeat deployment,
chain and nonce checks and simulation before an independently confirmed broadcast. This is point-in-time verification,
not a nonce reservation. No helper sends transactions, obtains private keys or establishes deployment provenance.
The native CC0 reference-registry tests exercise EOA and ERC-1271 acceptance, wrong domain/keys/account, opaque empty
and variable-length signatures, replay, wrong magic/reverts, nonce invalidation and fresh authorization. The contract
wallet is a test-only fixture, not a proposed production authority model. On-behalf registration remains outside UI v1.
The 2026-11-11 status above is historical. `resolveRegistryRegistrant` and the registry view now resolve ENS names
through the selected, validated Ethereum or Sepolia RPC using the canonical ENS Universal Resolver and pure pinned
viem name/ABI utilities. The browser does not import viem PublicClient, default chain endpoints or CCIP transports. Resolution
starts only on a lookup click, disables CCIP Read and gateway requests, validates the returned address, and displays
the normalized name plus registrant. Other chains do not silently fall back to Ethereum. Offchain names require an
explicit wallet address. This is RPC-supplied naming data, not independently verified merchant identity. Per-chain
runtime provenance, real ENS deployment acceptance and cross-chain/offchain name support remain unqualified.
Let a seller publish, read and remove a stealth meta-address in the registry, and let payers look up a registrant by address or ENS name.

## 2. Interfaces
```ts
// chain-adapters/src/registry.ts
export const REGISTRY_ADDRESS = '0x6538e6bf4b0ebd30a8ea093027ac2422ce5d6538';
export function buildRegisterKeys(schemeId: 1n, stealthMeta: Hex): TxRequest;      // registerKeys(uint256,bytes)
export function buildRegisterKeysOnBehalf(...): TxRequest;                        // EIP-712 + ERC-1271 path; not exposed in UI v1
export async function lookupMeta(client, registrant: Address, schemeId: 1n): Promise<Hex|null>; // stealthMetaAddressOf
export function buildIncrementNonce(): TxRequest;                                  // invalidate on-behalf sigs
```
Meta-address format registered = ERC-5564 scheme-1 bytes (66 bytes, two 33-byte keys; ADR-0010 decoder rules). Scheme 0x47500002 is **never** registered (ADR-0014; non-standard).
UI (Seller Keys): "Publish meta-address" with mandatory confirmation: "This permanently ties your wallet address X to this meta-address on chain Y; anyone can read it. Un-register by calling registerKeys with empty/new value." Unpublish button (ERC-6538 compromise guidance: promptly un-register). Per-chain: runtime `eth_getCode` codehash check before enabling; BNB and Avalanche stay disabled until verified (**UNVERIFIED**). Publishing wallet must be a throwaway or the user warned about association. Payer lookup: result is validated like any meta-address (two distinct keys, valid points) and shown with registrant address; invoices still prefer signed invoice data over registry.

## 3. Threats
Identity linkage (public mapping; confirmation text); registry poisoning for third-party lookups (only trust registrant==expected address); lookup returns malformed bytes (validate, ignore); on-behalf signature replay (nonce + chainId domain; UI v1 excludes it); lack of audit of reference contracts (DOC-4 ADR "use as deployed", record in ADR-LOG as ADR-0016).

## 4. Tests
Compile CC0 reference registry locally in Foundry/anvil; builders produce calldata that registers and reads back; wrong-length/identical-key meta rejected; code-hash gate blocks unknown chain; Playwright confirmation flow and egress assertion (only user RPC contacted).

## 5. Acceptance
- [ ] Round-trip register/lookup/unregister on anvil. - [ ] Confirmation cannot be bypassed. - [ ] ADR-0016 added. - [ ] Per-chain availability table matches spec 09.
