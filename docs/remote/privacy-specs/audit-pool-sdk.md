# Self security review: `pool-sdk`, `pool-prover`, `pool-relayer`

Date 2026-10-21, branch `claude/remote-extensions-10`. **AI-assisted self review, not an independent audit.** Scope: the three
TypeScript packages only (contracts and circuits have their own reviews). Method: read of every source file after writing it, the
tests below, one adversarial pass per component. Evidence tags: [RAN] executed this session, [READ] code read only, [UNV] not verified.

## 1. What was run

| Check | Result |
|---|---|
| `tsc --noEmit` (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) in the three packages | clean [RAN] |
| `eslint` with the repo config in the three packages | clean [RAN] |
| `vitest run --coverage` thresholds 95/90/95/95 (never lowered) | pool-sdk 47 tests, 98.7/95.9/99.1/99.8; pool-prover 8 tests, 98.6/95.3/100/100; pool-relayer 36 tests (e2e included), 98.0/96.5/97.7/100 [RAN] |
| SDK witness builder against the **real compiled circuits** (`circuit.witness.test.ts`: constraints satisfied, 9 public signals equal `expectedWithdrawSignals`, tree sizes 1..11, ASP on/off, ragequit, three violated statements rejected) | passed [RAN] |
| Relayer viem port against an in-test fake JSON-RPC node | passed [RAN] |
| Anvil e2e (`e2e.anvil.test.ts`) | 6 tests passed, 57 s (section 5) [RAN] |

## 2. Findings

Severity: H = funds or key loss plausible, M = privacy or integrity weakness with realistic path, L = hardening, I = note.

| ID | Sev | Component | Finding | Evidence | Remediation | Status |
|---|---|---|---|---|---|---|
| PS-01 | M | sdk | Note secrets (`nullifier`, `secret`) and witness inputs are plain `bigint`/strings on the JS heap; only the seed is behind `SecretBox`. They cannot be wiped and may reach swap, crash dumps or a heap snapshot. | [READ] `notes.ts`, `inputs.ts` | Keep derivation and proving inside one Worker and discard it after use (wiring doc). Cannot be fixed in JS. | Open, documented |
| PS-02 | M | sdk | SP-EXIT destination hygiene depends on the caller passing `forbiddenRecipients` (known `S1`, used `D_i`). Only the note's own depositor is checked internally. | [READ] `flows.ts`; test `guards` | Swarm 4 wires the hygiene ledger into `forbiddenRecipients`. | Open until wired |
| PS-03 | M | relayer | The relayer sees recipient, value, fee, proof and client address by design (N5). A hostile relayer can log all of it or censor. | design, `PRIVACY.md` | Self-submit option, multiple relayers, honest copy. No code fix. | Accepted, documented |
| PS-04 | M | relayer | `snarkjs` verification runs on the event loop thread; invalid-proof floods cost CPU. Mitigation: relay costs 5 limiter tokens, 16 KiB body cap, loss budget only covers mined reverts (not rejected proofs). | [READ] `service.ts`; not load-tested | Move verification to a worker thread; separate limiter for rejected proofs. | Open |
| PS-05 | L | relayer | Fee check accepts up to `slackBps` (10 %) below the current quote; a gas-price spike between quote and relay is absorbed by the operator. Loss bounded by the loss budget logic only when the tx reverts, not when it is under-reimbursed. | [READ] `quote.ts` | Lower `slackBps`; add a profit floor check at send time. | Open |
| PS-06 | L | relayer | `receipt_timeout` returns `pending` and counts as a breaker failure; a slow chain can open the breaker and stop service (availability only). | [READ] `service.ts` | Tune window or classify as neutral on chains with long block times. | Open |
| PS-07 | L | relayer | One send lane per chain, no persisted nonce state; a process crash between send and receipt loses the result, not funds. | [READ] | none needed for PoC | Accepted |
| PS-08 | L | relayer | Hot key comes from `POOL_RELAYER_KEY`, removed from `process.env` after parsing but held in memory for the process lifetime. Balance floor probe exists. | [READ] `main.ts` (entry point not executed) | Use a key with testnet funds only. | Accepted |
| PS-09 | L | sdk | `crowd` counts deposits by value only; a Sybil can inflate it by depositing many small-value notes of the same value from fresh addresses (N1). | [READ] `crowd.ts` | The number is advisory; UI must show it as a raw count with N1 text, never as strength. | Accepted, documented |
| PS-10 | L | sdk | Seed backup passphrase minimum is 8 characters; scrypt N=2^15 default. Offline guessing of a weak passphrase breaks all notes. | [READ] `store.ts` | Require a stronger passphrase in the UI (length meter), consider N=2^17. | Open |
| PS-11 | L | sdk | `syncPool` trusts the RPC for logs. A lying RPC cannot forge a tree the pool accepts (`assertRootMatches` uses `isKnownRoot`) but can hide deposits (stuck, not stolen) or learn queried addresses (N5). | [RAN] reorg and root tests; [READ] | Use several RPCs (network-privacy spec). | Accepted |
| PS-12 | I | prover | Artifacts are accepted only with a SHA-256 match and a ceremony label, but the hashes are supplied by the caller; if the same origin serves hashes and files, the check proves integrity of transport only. | [READ] `prover.ts` | Compile the hashes into the app bundle (release hash). | Open (wiring) |
| PS-13 | I | prover | Public signals above `P`: snarkjs JS reduces `x + P` to `x` (see circuits DEVIATIONS D-12). The relayer and SDK parsers reject any value `>= P` before verification (`wire.ts` `field`). | [RAN] `wire.test.ts` | none | Mitigated |
| PS-14 | I | all | `snarkjs` is GPL-3.0; the repo is `UNLICENSED`. OWNER DECISION, not resolved. | third-party table | Owner decides licence. | Open (owner) |
| PS-15 | I | relayer | HTTP front end copies the structure of `apps/relayer/src/server.ts` (audited separately); it was not fuzzed. | [READ] | Run the `apps/relayer` abuse tests against it. | Open |

No finding was rated H. That is a statement about these TypeScript packages only; a circuit or contract bug can still drain a
pool (N8), and this review does not cover them.

## 3. Properties checked by tests (SP ids)

SP-GEN-1 chain guard (SDK, prover, relayer config and parsers); SP-GEN-3 option table honesty and SP-UI-3 banned wording; SP-SDK-1
deterministic derivation and recovery of deposits, change chains, zero-value change and ragequit; SP-SDK-2 seed only inside
callbacks, relayer client sends no secret fields, store holds no secrets; SP-SDK-3 Poseidon vectors checked at first use;
SP-SDK-4 `assertRootMatches`; SP-SDK-5 artifact hash and label check; SP-SDK-6 crowd gate; SP-SDK-7 recipient guard (partly, see
PS-02); SP-REL-1..3, SP-REL-5; SP-CON-3 tamper tests at the relayer (every `Withdrawal` field changes the context). SP-SDK-3's
">= 1000 random vectors against circuit witness" was **not** run (see section 4).

## 4. Not verified

- Browser: Worker entry, CSP, WASM loading, proving time, artifact download size.
- `main.ts` (process entry) was not executed; the HTTP server and service are tested in-process.
- No run against Sepolia or Base Sepolia, a real wallet, or a real RPC provider.
- Poseidon equality with circomlib is covered by three known-answer vectors and by witness equality over a few dozen tree
  inputs, not by 1 000 random vectors.
- `depositWithPermit`, `asp-cli`, `test-vectors/shielded-pool.json` cross-checks, mutation testing, fuzzing of the HTTP layer.
- No load or timing test of the relayer. No side-channel review of `snarkjs`.

## 5. End-to-end on local anvil [RAN]

`packages/pool-relayer/src/e2e.anvil.test.ts`, anvil from `/home/user/tools`, chain 31337, 2026-10-21. Contracts: forge output of
`packages/pool-contracts/out` as built by the contracts agent (pool ERC-20, registry, poseidon hashers, reference ERC-5564 announcer,
MockERC20) plus the **real generated verifiers** compiled with the local solc 0.8.28 from `packages/pool-circuits/verifiers`. Proofs:
real snarkjs Groth16 with the INSECURE-LOCAL dev-ceremony artifacts, SHA-256 checked by `pool-prover`. Relayer: real
`PoolRelayerService` + `PoolRelayerHttpServer` over HTTP, real viem chain port, local verification with the real vkey.

Flow and outcome (all assertions passed):

1. deposit 10 tokens (`planDeposit`), `syncPool` + `assertRootMatches` + `recoverNotes` find the note;
2. SP-EXIT partial withdrawal of 4 through the relayer: destination received `4 - fee`, `feeTo` received `fee`, nullifier spent on-chain;
3. re-sync: the 6-token change note is recovered from the seed (spent original + live change);
4. replay of the same relay request and a request with a changed recipient are refused;
5. second withdrawal of the change note with an association set (publisher root in the registry, `aspEnabled = 1`) succeeds;
6. SP-PAY: second deposit, withdrawal to a seller stealth address with `announce`; announcer `caller` is the pool, the seller's
   `checkAnnouncement` finds the payment, recipient balance equals `withdrawn - fee`;
7. SP-RQ: third deposit, `commitment` proof, `ragequit` from the depositor returns the full value.

Wall time for the whole file: 57 s (five Groth16 proofs, depth-32 withdraw circuit, Node 22, no browser). Gas figures were not recorded.
Not covered by this run: `depositWithPermit`, native-asset pool, denomination pools, fee-on-transfer or reentrant tokens (contract suites
cover those), non-zero `ASP_GRACE` timing, and any failure injected on the chain side (reorg, RPC loss).
