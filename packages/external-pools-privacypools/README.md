# @ghostpay/external-pools-privacypools

`EP-1`: Privacy Pools (0xbow) adapter for [`@ghostpay/external-pools`](../external-pools/README.md). Entry is a plain `Entrypoint.deposit` from the stealth address `S1`; exit is a relayed withdrawal with a **locally verified Groth16 proof**; the operator-free exit is `ragequit` from `S1`. `private`, `UNLICENSED`, ESM, testnet only.

Status: **proof of concept, not wired into any app.** Verified against the upstream contracts and circuits on a **local anvil** only (below). **No public Sepolia or Base Sepolia deployment address was found**, so the shipped manifest entry is `unverified` and the adapter reports lifecycle `unknown` there.

## What was verified against primary sources (2026-10-21)

| Fact | Source | How |
|---|---|---|
| SDK `@0xbow/privacy-pools-core-sdk` 1.5.0, Apache-2.0 | npm registry; tarball unpacked without scripts | [P] |
| ABI subset (functions, events, `RelayData`) | `0xbow-io/privacy-pools-core` `packages/contracts/src/interfaces/*.sol` at `main` | [P] compiled with solc 0.8.28; `reference/abi-reference.json` holds the selectors; `abi.test.ts` compares |
| Full contracts build and behave | commit `d494b63e79f33bb2b0c8ece6cdacdca465c3b884` (2026-09-23), built outside the repo with `forge` | [RAN] `anvil.integration.test.ts` |
| Circuit artifact SHA-256 digests | SDK README table; the six files downloaded from `main` and hashed with `sha256sum` | [RAN] all six equal the README values; pinned in the manifest |
| Relayer API (`/relayer/details`, `/quote`, `/request`) shapes | `packages/relayer/src/{types.ts,schemes,interfaces,handlers}` at `main` | [P] read; strict parsers follow them |
| `Withdrawal.data = abi.encode(RelayData{recipient, feeRecipient, relayFeeBPS})` | `Entrypoint.relay` | [P] |
| Audit reports exist in the upstream repo (Oxorio circuits 2025-02-21, contracts 2025-03-18, entrypoint upgrade 2025-05-20; Auditware contracts) | `audit/` directory of the cloned repo | [P] listing and headers only; findings not reviewed, scope commits are older than `d494b63` |

Corrections to the spec found while building (each also in code comments):

- `LeafInserted._index` is the tree size **after** insertion (first leaf = 1), not a zero-based index (found by the anvil test).
- The SDK's `Commitment.nullifierHash` field is the **precommitment**, not the circuit's nullifier hash `Poseidon(nullifier)`. `Withdrawn._spentNullifier` is the latter; the adapter computes it with `poseidon1` (checked against a real proof's public signal) so recovery marks spent notes correctly.
- The relayer's quote is valid for 60 s in code (README says 20 s); the quote body needs `extraGas`; the fee commitment also carries `asset`, `amount`, `extraGas`.
- Solidity proof encoding swaps the G2 coordinates of `pB` (`formatProof`, mirrors the SDK).
- `Entrypoint` is an upgradeable UUPS proxy with an `OWNER_ROLE` that can remove pools, change fees and wind a pool down; ragequit needs neither the owner nor the ASP.

## Design

- Everything external is injected: `ChainReader`, `ExitTransport` (the only `fetch`), `PrivacyPoolsCrypto`, `AspSource`.
- `createSdkCrypto(artifacts)` implements `PrivacyPoolsCrypto` with the real SDK, loaded by dynamic `import()` only; it hashes every artifact it hands to the SDK and the adapter compares those digests with the manifest before any proof.
- Keys: 16 bytes of HKDF-SHA256(rootSeed, info `ghostpay/ext-pools/privacy-pools/v1`) become a BIP-39 mnemonic (`@scure/bip39`) inside the SDK glue; never the seed itself.
- The adapter re-derives and checks the on-chain commitment at `recordEntry`, takes the credited value from the pool log, and rejects a relayer that substitutes recipient, fee receiver, fee, amount or asset (the `withdrawalData` is decoded and re-encoded locally).

## Tests

2026-10-21, Node 22, `npm test`: 73 tests pass and 4 skip (real circuits/contracts) with thresholds 95/90/95/95 met (98.11 / 91.46 / 98.85 / 99.77). With the environment below, all 77 pass:

```bash
export PATH=/home/user/tools:$PATH
PP_ARTIFACT_DIR=<dir with the 6 official artifacts> \
PP_CONTRACTS_OUT=<forge out dir of privacy-pools-core d494b63, solc 0.8.28, GPL verifiers stay outside this repo> \
REQUIRE_ANVIL=1 npm test
```

Real-run coverage (all tests, 77 passing) is the same table: the glue that needs artifacts is also covered by a mocked-SDK test, so no file is excluded. The anvil test deploys the upstream contracts, deposits from S1, relays a real proof through an in-test relayer stand-in, ragequits an unapproved deposit (and shows a non-depositor cannot), self-relays from a fresh address, and recovers the states from chain data.

## Unverified

See [DEVIATIONS.md](DEVIATIONS.md): live relayer, ASP endpoint, any public deployment, Base Sepolia, audit coverage of the pinned commit, `Entrypoint` ERC-20 flows on a real token (unit-tested with fakes only).
