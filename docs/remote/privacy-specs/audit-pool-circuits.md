# Adversarial self-review: `packages/pool-circuits`

Date 2026-10-21, branch `claude/remote-extensions-10`. **AI-assisted self-review by the authoring
agent. Not an independent audit.** Scope: `circuits/*.circom`, `scripts/ceremony-dev.sh`,
generated `verifiers/*.sol`, `src/*.ts`. Evidence tags: **[T]** test in this package that ran and
passed this session; **[M]** local circuit-mutation run (section 6); **[R]** reasoning only; **[U]**
unverified.

---

## 0. TRUSTED SETUP: READ THIS FIRST

> ### THE KEYS IN THIS PACKAGE ARE FORGEABLE BY ANYONE.
>
> `scripts/ceremony-dev.sh` (default mode) performs **no secret contribution at all**. Phase 1 is
> `powersoftau new` (tau = 1) followed by a beacon with the fixed public value
> `0102…1f20`; phase 2 is `groth16 setup` (delta = 1) followed by the same public beacon. Every
> toxic-waste scalar (tau, alpha, beta, delta) is a deterministic function of that published value.
> Anyone who reads the script can compute them and produce a valid proof for **any** public signals:
> any nullifier hash, any `withdrawnValue`, any state root the pool knows. **A pool using
> `WithdrawVerifier.sol` from this package can be drained completely by anyone.**
>
> - Severity on a value-bearing chain: **Critical**. On local anvil / testnets with test tokens:
>   accepted by design so builds are reproducible and the weakness cannot be mistaken for security.
> - `POOL_CEREMONY_CONTRIBUTE=1` adds two OS-random contributions on one machine by one operator.
>   That is **still insecure** (single party, no published transcript others verified, toxic waste
>   in process memory/swap). Do not treat it as a "testnet ceremony".
> - Before any deployment holding value: phase 1 from a public ceremony (e.g. Perpetual Powers of
>   Tau, verified by hash), a **public multi-party phase 2 per circuit** with independent
>   contributors, a beacon from a future block hash, `snarkjs zkey verify` by third parties, and an
>   independent circuit audit. None of that exists. Spec section 4.5 / N8 / Q4.
> - Pool contracts must keep the `WrongChain` constructor guard (SP-GEN-1) and a `MAX_DEPOSIT` cap;
>   the forgeable verifier is the reason those guards matter.

---

## 1. Findings table

| Id | Severity | Title | Status |
|---|---|---|---|
| PC-01 | Critical (by design, testnet) | Dev ceremony keys are forgeable | **Accepted / documented** (section 0) |
| PC-02 | Medium (fixed) | 0xbow `LessEqThan(6)` on unranged `actualDepth` accepts `P-31..P-1` | Fixed: `Num2Bits(6)` first [T][M] |
| PC-03 | Low (fixed) | `actualDepth` did not bound the path; leaf index not canonical | Fixed: siblings above depth = 0; empty sibling ⇒ bit 0 [T][M] |
| PC-04 | Medium (mitigated) | ASP fields free when `aspEnabled = 0` | Fixed in-circuit: `ASPRoot = ASPTreeDepth = 0`, all ASP siblings 0 [T][M] |
| PC-05 | Info | `aspEnabled` boolean check is redundant except for `label = 0` | Kept; dedicated test kills the mutant [T][M] |
| PC-06 | Info | Non-canonical public signals (`x + P`) | Rejected by snarkjs 0.7.6 JS verify, by `toVerifierCalldata` and by Solidity `checkField` [T]; version-dependent in JS, keep snarkjs pinned |
| PC-07 | Info | Groth16 proof malleability (re-randomisation) | No impact if replay key = nullifier hash [T] |
| PC-08 | Info | Context binding is only as good as the contract's recomputation | Contract requirement (SP-CON-3) [R] |
| PC-09 | Low | Ragequit circuit proves no membership | Contract must check leaf existence + depositor [R] |
| PC-10 | Info | `stateTreeDepth` is an upper bound, not the tree's depth | Harmless; documented [T] |
| PC-11 | Info | Domain separation relies on Poseidon width and on labels being contract-assigned | Argued below [R] |
| PC-12 | Low | circomspect not run | Open (DEVIATIONS D-8) |
| PC-13 | Info | Withdraw of 0 accepted by circuit | Contract rejects (spec rule order) [T] |
| PC-14 | Info | Licence (GPL-3.0 material in UNLICENSED repo) | OWNER DECISION |
| PC-15 | Low | Malformed G2 point (e.g. unswapped `pB`) makes the pairing precompile fail and burn almost all forwarded gas (foundry: ~1.04e9 gas in test) before `verifyProof` returns false | Only the submitter pays; relayers must simulate first (spec SP-REL-2) [T] |

## 2. Under-constrained signals

Every signal assigned with `<--` would be suspicious; **there are none in this package's own
templates** (`grep '<--' circuits/` is empty) [R]. circomlib's `Num2Bits`, `IsZero`, `IsEqual` use
`<--` internally with the standard compensating constraints.

| Signal | Constrained by | Evidence |
|---|---|---|
| `existingValue`, `label`, `existingNullifier`, `existingSecret` | `Poseidon3(value,label,Poseidon2(n,s))` must be the LeanIMT leaf under `stateRoot` | wrong-secret / wrong-nullifier / wrong-label / wrong-value tests [T]; mutant 4, 15 [M] |
| `newNullifier`, `newSecret` | only through `newCommitmentHash` (output) and `!= existingNullifier` | free by design (user's change note) |
| `stateSiblings[i]`, `stateIndex` | root equality; `Num2Bits(32)`; siblings above depth = 0; empty sibling ⇒ bit 0 | [T] [M 2, 3] |
| `stateTreeDepth` | `Num2Bits(6)` + `<= 32`; above-depth siblings 0 | [T] [M 0, 1] |
| `ASPSiblings`, `ASPIndex`, `ASPTreeDepth` | when enabled: root equality; when disabled: all forced to 0 | [T] [M 6, 8, 2] |
| `aspEnabled` | boolean | [T] [M 5] |
| `withdrawnValue`, `existingValue`, `remainingValue` | `Num2Bits(128)` each | [T] [M 9, 10, 11] |
| `context` | public input (bound by Groth16 IC term) + `context * context` | tamper tests [T] |

Witness generation also enforces each `===`, so negative tests exercise the constraint system as
compiled; the mutation run (section 6) shows each listed constraint is the *only* thing stopping
its test witness.

## 3. Field overflow / wrap-around

- `remainingValue = existingValue - withdrawnValue` is computed mod `P`. If `withdrawnValue >
  existingValue` it wraps to `P - k` (~254 bits) and `Num2Bits(128)` fails. Tests: `withdrawnValue
  = existingValue + 1`, `= 2^128`, `= P - 1` [T]; mutants 9 and 11 [M].
- `existingValue` gets its own `Num2Bits(128)` (D-3): without it, soundness of the remainder check
  rests on "no note with value ≥ 2^128 was ever inserted", which the contract guarantees only for
  deposits (`MAX_VALUE`) and inductively for change notes. The extra check removes that dependency.
  Test builds a tree containing a `2^128` note and shows rejection, plus a `2^128 - 1` control [T][M 10].
- 128 + 128 bits ≪ 254 bits: no wrap in `existingValue - withdrawnValue` given both range checks [R].
- `LessEqThan(6)` / `LessThan(n)` in circomlib assume `n`-bit inputs; 0xbow called it on an unranged
  signal (PC-02). Fixed with `Num2Bits(6)`; tests with depth `33`, `64`, `P - 1` [T].
- Public-input aliasing (`x` vs `x + P`): the circuit sees the same element. On-chain the snarkjs
  verifier `checkField` rejects `>= P` (foundry test `test_withdrawRejectsNonCanonicalSignal`);
  snarkjs 0.7.6 JS verify also rejects every aliased signal [T] (PC-06). Pools must key nullifiers by the canonical value
  (guaranteed once `checkField` passed) and must compute `context` with `% P`.

## 4. Nullifier / commitment domain separation

| Value | Hash | Width |
|---|---|---|
| nullifier hash | `Poseidon([nullifier])` | t = 2 |
| precommitment | `Poseidon([nullifier, secret])` | t = 3 |
| commitment (state leaf) | `Poseidon([value, label, precommitment])` | t = 4 |
| LeanIMT node | `Poseidon([l, r])` | t = 3 |
| ASP leaf | raw `label` | — |

- circomlib Poseidon uses distinct round constants and MDS per width; finding `Poseidon_t2(a) =
  Poseidon_t4(b)` or `Poseidon_t3(...) = Poseidon_t4(...)` is a cross-instance collision, assumed
  infeasible [R].
- Precommitment and tree nodes share width t = 3 but never share a role: a state leaf is always
  recomputed inside the circuit as a t = 4 output, so an internal node (t = 3 output) cannot be
  passed off as a leaf ("short path" / second-preimage-on-level attack) without a t3/t4 collision [R].
- ASP leaves are raw labels. A prover could try to claim an **internal ASP node** as its label.
  That requires a state-tree commitment whose label equals a Poseidon output; labels are assigned
  by the contract as `keccak256(SCOPE, nonce) % P` and preserved through change notes (circuit
  forces the same label), so the attacker cannot choose one. This is an **assumption on the
  contract** (spec 6.1, 0xbow design) [R]. If a future contract let users choose labels, this
  breaks and ASP leaves must be hashed.
- Withdraw and ragequit reveal the same `Poseidon([nullifier])` for a note [T: "double spend"
  test], so a single spent-set in the contract covers both (SP-CON-4).
- Two withdrawals of one note with different change notes / values / contexts reveal the same
  nullifier hash [T].
- Change note uses a fresh nullifier (`IsEqual(...) === 0`) [T][M 12]; otherwise the change note
  could never be spent (its nullifier hash would already be spent). Nothing stops a user reusing a
  nullifier from an *unrelated* old note; that only harms the user [R].

## 5. Public-input binding to recipient / relayer / fee

- The circuit does not see `recipient`, `relayer`, `relayerFee`, `feeTo`, `deadline`,
  `aspPublisher` or `announce`. It binds `context`, which the **contract** must recompute as
  `uint256(keccak256(abi.encode(withdrawal, SCOPE))) % P` and compare before `verifyProof`.
  If the contract skips or mis-encodes that, a front-runner can swap the recipient (PC-08).
- snarkjs Groth16 setup adds an IC term per public input, so changing any public signal
  invalidates the proof; tests tamper each of the 9 withdraw and 4 ragequit signals and a random
  `context` [T: JS; foundry tests on-chain + 1000-run fuzz on context].
- `context * context` is defence in depth (0xbow pattern); not needed for soundness with snarkjs.
- `SCOPE` (pool address, chain id, asset) inside `context` prevents replaying a proof against
  another pool or chain [R; contract-side].
- Malleability (PC-07): `(rA, r⁻¹B, C)` verifies with the same signals [T]. Pools must never key
  replay protection on proof bytes. Front-running a re-randomised proof gains nothing because the
  payout targets are inside `context`.
- Ragequit binds `value`, `label` publicly; the contract must pay only `depositorOf(label)` and only
  for a commitment that is a known leaf (PC-09).

## 6. Local circuit-mutation run [M]

16 hand-written mutants (each deletes or neuters one constraint/assignment), recompiled with circom
2.2.3 and run against `test/witness.test.ts` (`-t "withdraw circuit"`), driver script kept in the
session scratchpad (not committed). **16 / 16 killed.**

| # | Mutation | Killed by |
|---|---|---|
| 0 | drop `depthCheck.out === 1` | depth = 33 |
| 1 | `depthBits.in <== 0` | depth = P − 1 |
| 2 | drop siblings-above-depth rule | aspEnabled = 0 with non-zero ASP sibling |
| 3 | drop empty-sibling ⇒ bit 0 | index bit set where sibling empty |
| 4 | drop `stateRoot === …` | wrong root / secret / nullifier / label … |
| 5 | drop `aspEnabled` boolean | aspEnabled = 2 with label 0 (initially **survived**; test added) |
| 6 | drop conditional ASP root check | wrong ASP sibling / root, label not in set |
| 7 | drop `(1-aspEnabled)*ASPRoot` | aspEnabled = 0 with non-zero ASPRoot |
| 8 | drop `(1-aspEnabled)*ASPTreeDepth` | aspEnabled = 0 with non-zero depth |
| 9–11 | neuter each `Num2Bits(128)` | P − 1 withdrawal; 2^128 note; wrap |
| 12 | drop nullifier inequality | equal nullifiers |
| 13–15 | wrong label/value in change or existing hasher | valid-witness output checks |

Note on mutant 2: "sibling above depth" in the *state* tree is also caught by the root check (a
non-zero sibling changes the root), so the depth rule is load-bearing mainly for the disabled-ASP
path and for making `stateTreeDepth` meaningful.

## 7. Other checks

- Public-signal order (SP-CIR-5): asserted from witness vectors and from `fullProve` output [T].
- poseidon-lite 0.3.0 == circomlib Poseidon: 1000 random ragequit witnesses + all withdraw cases [T].
- `src/LeanImt` == `@zk-kit/lean-imt` 2.2.5 roots and siblings for sizes 1..40 [T].
- Reproducibility: a second full `scripts/build.sh` run in a clean scratch copy produced a byte-identical `SHA256SUMS` (r1cs, wasm, zkey, vkeys, verifiers) [T]. This is exactly why the keys are forgeable (section 0).
- Gas: `WithdrawVerifier.verifyProof` with 9 signals measured at 249 167 gas including the external call (foundry `test_gas`), vs ~236k EIP-1108 estimate.
- Generated verifier: G2 coordinate order (unswapped `pB` rejected), non-canonical signals
  rejected, cross-circuit (withdraw proof vs ragequit verifier) rejected [T: foundry].
- `--sanity_check` compile, no `--constraint_assert_dissabled` [R: scripts/build.sh].
- circom binary sha256 pinned and checked in `build.sh` / `install-circom.sh` [T: hash matched
  the GitHub release asset].

## 8. Unverified / not done

- circomspect (PC-12), any formal tool (Picus, ecne) — not run.
- No independent review; 0xbow audit reports not located (spec Q9).
- No public ceremony; Hermez ptau not obtainable from the sandbox.
- Browser proving time not measured.
- `contract.*` values in `test-vectors/shielded-pool.json` computed with viem from the spec, not yet
  checked against Solidity.

---

## Independent AI review (opus)

Date 2026-10-21. **Second-pass review by a separate AI agent (Claude Opus), not a professional audit and not a
substitute for one.** Scope: `circuits/*.circom`, `circuits/main/*`, `INTERFACE.md`, `src/*.ts`, `scripts/ceremony-dev.sh`,
vkeys, cross-checked against `packages/pool-contracts` (`ProofLib`, pool) and spec `shielded-pool.md`.

**Headline: with the committed dev-ceremony keys the pool is forgeable by design, and this is now demonstrated, not just
argued.** Forging needs only the phase-2 `delta`: `groth16 setup` starts at delta = 1 and the only phase-2 step is
`zkey beacon` with the public hash in `ceremony-dev.sh`, so `delta = Fr.fromRng(rngFromBeaconParams(BEACON, 10))`
(snarkjs' own `misc.js`; checked `delta * G2 == vk_delta_2` for both vkeys; snarkjs fixes `gamma = G2`). With
`A = alpha1`, `B = beta2`, `C = -(1/delta) * vk_x` the Groth16 equation holds for **any** public signals. No knowledge of
tau/alpha/beta is required, so supplying a real phase-1 file via `POOL_PTAU` does **not** help while phase 2 stays
beacon-only. Evidence [T, this review]:
- `test/forgery.test.ts`: derives delta from the beacon, forges a withdraw proof (withdrawnValue = 2^128 - 1, arbitrary
  nullifier/root/context) and a ragequit proof; `snarkjs.groth16.verify` returns true for both.
- `packages/pool-contracts/test/ForgedProof.t.sol`: same forgery computed on-chain with ecAdd/ecMul; drains a pool holding
  three honest deposits through `withdraw` (no deposit by the thief) and through `ragequit` (thief deposits 1 unit, then
  claims the whole balance for its own label).

Other checks, no new soundness defect found [R unless noted]:
- Under-constrained signals: none in the package's templates (no `<--`). Every private input reaches either a hash bound
  to `stateRoot`/an output, or is deliberately free (`newNullifier`, `newSecret`). LeanIMT path: `Num2Bits(6)` before
  `LessEqThan(6)`, siblings above depth forced 0, empty sibling forces bit 0; with `aspEnabled = 0` the ASP depth = 0
  forces all ASP siblings and `ASPIndex` to 0. Agree with section 2.
- Field overflow: `withdrawnValue`, `existingValue`, remainder each `Num2Bits(128)`; 128-bit operands cannot wrap a
  254-bit field. Contract `MAX_VALUE = 2^128 - 1` matches.
- Public-signal order: outputs (`newCommitmentHash`, `existingNullifierHash`) then inputs in declaration order;
  `INTERFACE.md`, `ProofLib` indices 0..8 / 0..3, `IWithdrawVerifier uint256[9]`, `IRagequitVerifier uint256[4]` and
  vkey `nPublic` 9 / 4 all agree.
- Domain separation: agree with section 4. Note the soundness of "ASP leaf = raw label" and "state leaf is a t=4 output"
  both depend on the contract assigning labels; any future user-chosen label breaks the ASP argument.
- Ragequit circuit leaves `value` unbounded; safe only because the contract requires the commitment to be a leaf
  (commitment binds value). With forgeable keys this is exactly the cheapest drain path (above).
- `src/inputs.ts` / `leanImt.ts` pre-checks mirror the circuit constraints; `toVerifierCalldata` rejects `>= P`.

Not done: circomspect / Picus / ecne, independent mutation run, review of circomlib internals.
