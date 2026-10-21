# Self security review: `@ghostpay/btc-payjoin`

**AI-assisted self review by the author of the code. Not an independent audit.** Date 2026-10-21. Scope: `packages/btc-payjoin` (BIP-78 policy core, memory and v1 HTTP transports, optional v2 adapter shell). Testnet/signet/regtest only. Evidence tags: **[T]** observed by running code in this session, **[P]** primary source fetched 2026-10-21, **[U]** unverified.

## 1. What was run

| Check | Result |
|---|---|
| `tsc --noEmit`, `tsc -p tsconfig.build.json`, `eslint` (repo config, includes `Math.random` ban) | clean [T] |
| `vitest run --coverage` | 155 tests passed in 10 files; statements 97.36 %, branches 92.58 %, functions 98.34 %, lines 99.51 % (thresholds 95/90/95/95 unchanged) [T] |
| Regtest e2e against **Bitcoin Knots v29.2.knots20251110** (`BITCOIND_BIN`) | 4/4 passed: v1 over real loopback HTTP (P2WPKH to P2WPKH, `testmempoolaccept` allowed, `sendrawtransaction`, mined, two input owners, receiver output grew); fallback Original also valid and exclusive with the payjoin; async memory-transport payjoins P2SH-P2WPKH to P2TR and P2TR to P2TR accepted with `minfeerate` set [T] |
| BIP-78 appendix vector | the BIP's proposal passes `verifyProposal` (payment output 1, fee output 0, cap 182), also under `pjos=0`; fails `fee_over_cap` with cap 1 and `output_decreased` without a fee-output index [T] |
| Property test (60 random cases: amounts, feerates, fee caps, `minfeerate`, script types, substitution) | honest proposals verify, value conserved, sender contribution within cap [T] |
| Fuzz (random strings, bytes, bit-flips of a valid PSBT, one-output mutations) | only `PayjoinError` is ever thrown [T] |
| Tarball integrity | Knots and Elements tarballs matched the release `SHA256SUMS` published on the same host; PGP signatures not verified [T] |

Not run: any public network or third-party wallet; `payjoin-cli`; a BIP-77 directory/relay; a hardware wallet; Slither/Echidna (no contracts in this package).

## 2. Threat model summary

Hostile receiver tries to take sender funds (output redirection, fee inflation, input theft). Hostile sender tries to learn receiver UTXOs (probing) or replay the receiver's exposed inputs. Network attacker tampers with the endpoint. Passive analyst applies chain heuristics (not defended beyond PayJoin's own properties; limits N1..N8 in the README).

Sender safety argument (checked by tests): all sender inputs are present and signed only by the sender; every non-payment sender output is present, in order, and not decreased except the declared fee output within `min(maxadditionalfeecontribution, actual fee increase, F0 * maxSenderInputVsize / V0 * added)`; absolute fee does not drop; therefore the sender's outflow is at most `payment + original fee + capped contribution`. Sender amounts and scripts come from the sender's own Original, never from the proposal.

## 3. Findings

Severity is for the proposed testnet PoC and for a hypothetical hosted use.

| ID | Sev | Finding and evidence | Remediation | Status |
|---|---|---|---|---|
| PJ-01 | High (for non-interactive hosting) | `SeenInputs` has only an in-memory implementation. After a restart the anti-probing and anti-reentrancy checks (BIP-78 receiver checklist, BPJ-RCV-3) start empty. `receiver/seen.ts` | Persistent implementation (IndexedDB or DB) in the host; documented in `wiring/btc-payjoin.md` 2 | Open (interface and tests only) |
| PJ-02 | High (feature completeness) | BIP-77 v2 is **not built**: no concrete `FfiBackend`; the adapter is tested with a fake backend only. `ffi/index.ts`, DEVIATIONS 8 | Write the backend against `payjoin@0.25.0` with a local `payjoin-mailroom` (not obtainable here); keep `payjoin-v2` disabled in the UI | Open |
| PJ-03 | Medium | BIP-77 0.2.0 is Draft and self-contradictory: fragment order (lexicographic vs reverse), `OH` length (35 vs the example's 34), `EX` byte order unstated. Resolved by reading rust-payjoin `uri/v2.rs` and `time.rs` (master, commit not pinned) [P]; not interop-tested | Re-check at build time, test against `payjoin-cli` output | Mitigated (parser tolerant), open for interop |
| PJ-04 | Medium | The sender cannot verify a receiver input's claimed `witness_utxo` amount without chain access. A lying receiver can make the true fee lower than computed (propagation/RBF DoS) or the `minfeerate` check meaningless. `non_witness_utxo` hash is verified when present (defence in depth; `@scure/btc-signer` also checks on parse) | Optional `prevoutLookup` (node/Esplora) in `verifyProposal`; require `non_witness_utxo` for legacy inputs | Open, accepted for PoC; fallback bounds the impact |
| PJ-05 | Medium | Taproot path validated only on Knots 29.2. Elements 23.2.4 (`-chain=regtest`) rejects even a plain single-input Taproot spend (`Invalid Schnorr signature`), so it cannot be used as a bitcoind substitute for P2TR. The silent-payment contribution path (untweaked output key) is tested with noble only, not on a node [T] | Run the SP contribution on regtest once `signSilentPaymentInput` exists | Open |
| PJ-06 | Medium | Concurrency protection (in-flight outpoint lock, one live Original) is per process. Two processes sharing one seen store can both accept the same outpoints before either writes. | Atomic `addIfAbsent` in the production store | Open |
| PJ-07 | Low | Deviation from BPJ-SND-2: fallback is offered immediately on explicit failure, not only after `EX` (DEVIATIONS 9). Receiver cannot complete a payjoin without sender signatures, so no double-spend exposure arises; either party can always broadcast the Original anyway (N5) | none | Accepted |
| PJ-08 | Low | Receiver DoS: parked HTTP requests were unbounded in the first draft. **Found in review, fixed**: `maxPending` (default 16), 503 `unavailable` beyond it, slot released on settle/timeout (test added). `nodeListen` relies on Node's default header/request timeouts and has no per-IP rate limit | Reverse proxy limits; per-IP limiter from `relayer-guard` if hosted | Fixed (cap), residual open |
| PJ-09 | Low | UTXO probing and the unnecessary-input heuristic are only partly mitigated (reuse exposed UTXO first, prefer same script type, one Original per address when interactive). Inherent to BIP-78 | none beyond documentation (N3) | Accepted |
| PJ-10 | Low | `verifyKeyPathInput` (signature check before releasing the proposal) covers P2WPKH and P2TR key-path only; other receiver script types are released as the wallet signed them | Extend to P2SH-P2WPKH and P2PKH if the wallet may contribute them | Open |
| PJ-11 | Low | Original builder has no coin selection and spends every UTXO given; change below 546 sat becomes fee | Selection in the wallet layer | Accepted |
| PJ-12 | Low | Originals with mixed input sequences are rejected (no valid proposal can exist under BIP-78's one-sequence rule); some wallets may fail to interoperate | none | Accepted |
| PJ-13 | Info | PSBT v2 (BIP-370) is not explicitly rejected; behaviour is whatever `@scure/btc-signer.fromPSBT` does | Reject explicitly if a PSBT version accessor exists | Open [U] |
| PJ-14 | Info | Hardware wallets: BIP-78 documents a double-payment risk (the signer signs two conflicting transactions); signers here are software keys only | UI warning | Accepted |
| PJ-15 | Info | Memory transport has no encryption or padding; it must never be used as a privacy boundary | none | Accepted (documented) |
| PJ-16 | Info | Third-party: `payjoin@0.25.0` declares no license (OWNER DECISION before adoption); it is an optional peer, not installed in the repo. Legal posture of operating a directory or relay is deferred by the owner; the package runs none and charges no fee | Owner | Noted once |

Defects found and fixed while building (for the record): the unbounded parked-request queue (PJ-08); `Math.random` use for input positioning replaced by a `crypto.getRandomValues` helper (repo ban, ADR-0004); `silent payment` addresses now refused everywhere with `uri_conflict` (BPJ-SP-1) after a requirement check; a v2 `OH` length assumption taken from the BIP text was wrong against its own example (PJ-03).

## 4. Requirement coverage (spec section 9)

Implemented and tested: BPJ-GEN-1..4 (mainnet refusal at every entry point; no logging, spy test; remote text never surfaced; injected `fetch`/`now`/random), URI-1..4, RCV-1..8 and 10..12, RCV-9 (signature check; SP contribution tested with an inlined signer), SND-1..6, SP-1/-2 (docs in README), V2-3 and FFI-1/-2 (adapter policy; every transport PSBT is re-verified by the TS core because sessions never trust a transport).
Not implemented: V2-1 beyond reading sources (no wire crypto), V2-2 session-key zeroization (the library owns keys), V2-4 padding/jitter (library), V2-5 n/a, FFI-3 integrity hash is recorded in `third-party-additions.md` but the package is not installed.

## 5. Independence caveat

All tests were written by the author of the code. The strongest independent evidence is the real-node acceptance on regtest (Bitcoin Knots consensus and policy) and the BIP-78 vector. It does not replace an independent review before any use with real funds, which is out of scope for this testnet-only PoC.
