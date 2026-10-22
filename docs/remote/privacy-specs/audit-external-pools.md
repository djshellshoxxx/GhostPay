# Self security review: `external-pools`, `external-pools-privacypools`, `external-pools-railgun`

Date 2026-10-21, branch `claude/remote-extensions-10`. **AI-assisted self review, not an independent audit.** Scope: the three
TypeScript packages only. The third-party contracts, circuits, SDKs, relayers and list providers they talk to are **out of
scope and not audited by GhostPay** (limit N6). Evidence tags: [RAN] executed this session, [READ] read only, [UNV] not verified.

## 1. What was run

| Check | Result |
|---|---|
| `tsc --noEmit` strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) in the three packages | clean [RAN] |
| `eslint` with the repo config in the three packages | clean [RAN] |
| `vitest run --coverage`, thresholds 95/90/95/95 (never lowered, no file excluded) | external-pools 94 tests, 99.12 / 96.66 / 99.30 / 100; privacypools 73 pass + 4 skip, 98.11 / 91.46 / 98.85 / 99.77; railgun 20 pass + 1 skip, 98.92 / 94.89 / 97.82 / 100 [RAN] |
| Same with the optional environment (real circuits, upstream contract builds, anvil, `REQUIRE_ANVIL=1`) | external-pools 94, privacypools **77 pass / 0 skip**, railgun **21 pass / 0 skip** (railgun 99.28 / 95.40 / 100 / 100) [RAN] |
| EP-GEN-4 against real runtime code on a local node (`anvil_setCode`): pinned hash accepted, other code and empty code refused | passed [RAN] |
| **Privacy Pools on anvil with the real upstream contracts** (`0xbow-io/privacy-pools-core` `d494b63`, solc 0.8.28, Poseidon libraries linked, UUPS `Entrypoint` proxy) **and the real circuits and Groth16 verifiers**: deposit from S1 (vetting fee read from `assetConfig`), ASP root posted, relayed withdrawal (real proof, relayer stand-in) to D, deposit outside the ASP set cannot withdraw and can `ragequit` from S1, a different sender cannot `ragequit`, self-relay from a fresh address, recovery of `exited`/`ragequit` states from logs, ~60 s | passed [RAN] |
| Real SDK crypto offline: derivation equals direct SDK calls, domain separation, commitment equals SDK, `Poseidon(1)` vector, context equals SDK; real ragequit and withdrawal proofs verify with snarkjs and bind their public signals, tampered signals fail | passed [RAN] (artifacts from `PP_ARTIFACT_DIR`) |
| Circuit artifact digests: six files downloaded from upstream `main` and hashed (`sha256sum`) equal the SDK README values pinned in the manifest | passed [RAN] |
| ABI subsets compared with selectors/event layouts that solc produced from the upstream sources (Privacy Pools interfaces, Railgun `RailgunSmartWallet`) | passed [RAN] |
| **Railgun v2 `RailgunSmartWallet` on anvil, entry only**: fee read from the contract, SDK-output check, real `shield`, net value from the real `Shield` log, treasury fee received | passed [RAN] |
| Railgun unshield with proofs, PPOI, broadcasters, any Sepolia/Base Sepolia contact, the Privacy Pools reference relayer package, the official ASP service | **not run** [UNV] |

## 2. Defects found by running against the real contracts (all fixed, kept as tests)

| ID | Sev | Defect | Found by |
|---|---|---|---|
| EXT-D1 | H (would have broken every exit) | `readStateLeaves` assumed `LeafInserted._index` is zero-based; the pool emits the tree size **after** insertion (first leaf = 1), so every exit failed with "gap in state tree leaves". | anvil test |
| EXT-D2 | M | Recovery used the SDK `Commitment.nullifierHash`, which is the **precommitment**, to detect spent notes; `Withdrawn._spentNullifier` is `Poseidon(nullifier)`. Spent notes would have been recovered as `confirmed`. Fixed with `poseidon1`, verified against a real proof's public signal and the anvil recovery test. | reading SDK `getCommitment`, circuit source, e2e test |
| EXT-D3 | L | Withdrawal public signals used the SDK's 32-padded sibling count as tree depth; now the real lean-IMT depth. Both verify; only the real depth has the meaning the signal claims. | reading circuit `LeanIMTInclusionProof` |
| EXT-D4 | L | `getBlockNumber` of a viem client is cached for 4 s, which made confirmations read as 0 in tests; noted for the web wiring (use `cacheTime: 0` when counting confirmations). | anvil test |

## 3. Findings (open or accepted)

Severity: H = funds or key loss plausible, M = privacy or integrity weakness with a realistic path, L = hardening, I = note.

| ID | Sev | Component | Finding | Evidence | Remediation | Status |
|---|---|---|---|---|---|---|
| EXT-01 | M | railgun | The adapter cannot verify from calldata that a shield's note public key belongs to the user's wallet; a hostile or buggy SDK could build a valid-looking shield to someone else's key. Amount, token and target are checked, `npk` only for range. | [READ] `checkShieldTx`; test "SDK output" | Detective control added: a note is `confirmed` only after `RailgunWalletPort.ownsShield` reports it from the wallet's own engine (tests: foreign note stays `pending`). Prevention needs the SDK pinned exactly and its tarball reviewed; the glue should also compare `npk` with a value the engine derives. | Mitigated in part (funds already sent are not recoverable by this check) |
| EXT-02 | M | privacypools, railgun | Third-party code is trusted for what it cannot check: circuit soundness and trusted setup, contract admin powers (`Entrypoint` is an upgradeable UUPS proxy whose owner can remove pools, change fees and wind a pool down; Railgun governance can change fees and upgrade), ASP/PPOI list behaviour, relayer/broadcaster logging. | [P] `Entrypoint.sol`, `RailgunLogic.sol` | Mitigation is the operator-free exit (ragequit / self-broadcast), pinned code hashes, fee caps. No code fix. | Accepted, documented (N5, N6) |
| EXT-03 | M | privacypools | Ragequit is possible only from the depositor address S1. If the app deletes the S1 key ("rotate and forget") the note can still be withdrawn through a relayer but cannot be recovered when the ASP excludes it or the relayer disappears. The vault refuses `purgeSigner` while a note is live; nothing stops other code from deleting the key. | [RAN] vault test; [READ] | Wiring doc: hygiene code must call `vault.purgeSigner`. | Open (swarm 4) |
| EXT-04 | M | all | Note secrets (nullifier, secret, mnemonic entropy) become plain `bigint`/strings/`Uint8Array` in memory when a note is decoded; only the root seed and vault key are in `SecretBox`. Not wipeable; may reach swap or heap dumps. Same class as PS-01 in the pool review. | [READ] `decodeNoteData` | Decode only inside the exit/ragequit call; consider storing only derivation indexes (the adapter can re-derive secrets from the seed: `index` is already in the note). | Open |
| EXT-05 | M | privacypools | Selecting the cheapest relayer asks **every** manifest relayer for `/relayer/details` with the asset and the client's network address; a hostile relayer list entry learns the user's IP and asset without any deposit being linked. | [RAN] test "lowest fee wins" | One relayer per profile, or a random pick; network transport from `network-privacy.md`. | Open (design choice documented in wiring) |
| EXT-06 | L | vault | Index records (`idx:notes`, `idx:signers`) are read-modify-write with no lock; two tabs adding notes at the same time can lose an index entry (the record itself is kept; `recoverNotes` rebuilds the index). | [READ] `addToIndex` | Single-writer lock (Web Locks API) in the app storage adapter. | Open |
| EXT-07 | L | vault | Offline guessing of a weak passphrase breaks every note; minimum is 10 characters, scrypt 2^17 by default. Wrong passphrase and tampering are indistinguishable by design. | [RAN] vault tests | Strength meter in the UI; separate passphrase from the keystore. | Open |
| EXT-08 | L | privacypools | With a proof cache the adapter skips the on-chain root comparison (needed for offline proofs). A stale cache gives a proof the chain rejects (ASP root must equal `latestRoot`, state root must be in the 64-root history); funds stay safe, a relayer may still spend gas. | [RAN] test; [READ] | Refresh the cache after each scan; the relayer simulates before sending. | Accepted |
| EXT-09 | L | planner | `acknowledged` is a boolean the UI sets; the code cannot tell what text was shown. | [READ] `planRoute` | UI renders `plan.warnings` verbatim next to the checkbox. | Open (swarm 4) |
| EXT-10 | L | registry | `mock-pool` can be registered on any allowlisted chain, including Sepolia. It has no privacy at all and is labelled `test-double`, but nothing in code forbids shipping it. | [READ] | Register it only in dev builds (wiring doc). | Open (swarm 4) |
| EXT-11 | L | railgun | `prepareEmergencyExit` sends to the depositor S1, a public re-link; a chosen destination needs the N3-gated `prepareSelfUnshield`. The emergency path ignores the fee cap on purpose so a governance fee change cannot trap funds. | [RAN] tests | Documented. | Accepted |
| EXT-12 | L | manifest | `status: 'verified'` is only as good as the operator's code-hash reading; the shipped entries are `unverified`, so pool routes are disabled by default. A wrongly verified entry is caught only if the code hash differs at run time. | [RAN] tests | Operator procedure in the wiring doc; verification from two independent nodes. | Open |
| EXT-13 | I | privacypools | **GPL-3.0 in the closure**: `snarkjs` 0.7.5 and seven iden3 packages; `maci-crypto` has no `license` field. The repo is `UNLICENSED`. | licence scan of the installed tree (8 GPL-3.0 packages) | OWNER DECISION, not resolved. | Open (owner) |
| EXT-14 | I | all | No third-party-side behaviour was exercised live: no public Privacy Pools deployment exists in the sources read, Railgun Sepolia liveness is unknown, Base Sepolia is not a Railgun network. | section 1 | Pin and run on Sepolia once addresses exist. | Open |
| EXT-15 | I | all | Spec facts that were wrong or outdated and are corrected in code and READMEs: relayer quote lifetime (60 s, not 20 s), quote body `extraGas`, extra fee-commitment fields, `LeafInserted` index base, SDK `nullifierHash` meaning, Railgun wallet version (11.2.0), existence of upstream audit reports. | [P] sources | none | Done |

No finding was rated H among the open items. That is a statement about these TypeScript packages only.

## 4. Properties checked by tests (spec ids)

EP-GEN-1 chain guard on every entry point of all three adapters, before any chain or wallet call; EP-GEN-2 source scan (no global
network APIs) and a transport that throws in the Railgun tests; EP-GEN-3/4 manifest validation, checksum, tamper tests, real code
hash on anvil; EP-GEN-5 refusal of non-`active` pools; EP-GEN-6 emergency exit with relayer, ASP, indexer and PPOI absent
(mock, Privacy Pools fake chain and real anvil; Railgun with fakes); EP-GEN-7 explicit route; EP-GEN-8 accounting (property
tests); EP-VAULT-1 canary scan of errors and storage, EP-VAULT-2 recovery with the same note ids (mock, Privacy Pools real chain),
EP-VAULT-3 `KEY_REQUIRED_FOR_NOTE`, EP-VAULT-4 incomplete scope blocks planning, EP-VAULT-5 offline proof from cache, EP-VAULT-6
hour rounding; EP-PP-1..10 (EP-PP-3 allowance reset tested with encoders, not a real token; EP-PP-9 relayer selection);
EP-RG-2, 4, 5, 6, 7 with fakes and, for entry, the real contract; EP-SUP-3/4 exact-pin tests; EP-LINT-1; EP-UX-3 banned-word scan of
the route texts; EP-INT-1 snapshot of the `none` plan.

## 5. Not verified, not built

Railgun SDK glue and everything that needs it (engine, proofs, PPOI, broadcasters); Sepolia and Base Sepolia behaviour; the
official ASP endpoint and the reference relayer package; the audits' coverage of the commit used; EP-SUP-1 licence generator,
EP-SUP-2 web bundle test, EP-SUP-5 provenance; EP-3 and EP-4; `scripts/measure-pool-crowd.ts`; runbook screenshots. No Solidity
is authored here (no `forge fmt`, Slither or Echidna run applies).

## 6. Owner decisions

1. Licence of the repo versus GPL-3.0 `snarkjs` (EXT-13), shared with the pool packages.
2. Whether Privacy Pools and Railgun routes may ever be enabled beyond testnet; legal review is outside this lane and does not block the PoC (spec section 14).
3. Whether to fund the Railgun glue (effort M) or drop the route.
