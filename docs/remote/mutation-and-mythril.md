# Mythril + mutation testing (swarm 2)

Only what was actually run. Toolchain: forge 1.8.5, solc 0.8.28 (static build), Mythril v0.24.8
(py3.11 venv), gambit 0.2.1 (Certora, built from source at commit 072ff4c). Baseline
(`forge test`, merged with `remote-extensions-1`): all existing tests pass before any change here.

## 1. Mythril (all 5 contracts)

    myth analyze src/<C>.sol:<C> --solc-json myth.json --execution-timeout 900 \
      --solver-timeout 30000 --max-depth 50 -t 3 -o json

`myth.json`: OZ remapping, optimizer 200 runs, evmVersion cancun. Raw output: `mythril/*.json`.
Caveat: symbolic execution is bounded (900 s, depth 50, 3 txs); no finding is not a proof.

| Contract | Findings | Triage |
|---|---|---|
| GhostPayRouter | 0 | n/a |
| GhostPayPolicyRouter | 0 | n/a |
| GhostPaySweepRelayer | SWC-116 (Low) `sweep` deadline check | Accepted: deadline semantics are the product feature; seconds of validator drift are within tolerance. |
| PolicyAccount | SWC-116 (Low) x2: `requestWithdraw`, `proposeDestination` | Accepted, same reason. |
| PolicyAccountFactory | SWC-110 "assertion violation", fallback, "internal compiler generated code" | False positive: unknown/short calldata reverts with EMPTY returndata, no Panic. Evidence: `test/mutation/MythrilTriage.t.sol` (fuzz 10 000 runs + empty calldata). |
| PolicyAccountFactory | SWC-107 x3 (Medium x2, Low), SWC-113 Low, external call to user-supplied address Low, all in `deploy` | Not exploitable: `deploy` is `nonReentrant`; the external calls are the immutable fee token `safeTransferFrom` (Mythril treats the token symbolically) and the fresh clone's `initialize`; writes after are the ReentrancyGuard exit. Fee-delta check reverts fee-on-transfer tokens. |

No finding required a contract change. Nothing was suppressed.

## 2. Mutation testing (gambit)

    gambit mutate --filename src/<C>.sol --solc /root/tc/solc \
      --solc_remappings "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/"
    python3 test/mutation/run_mutants.py <gambit_outdir> <results.json> --workers 4

`run_mutants.py` (in this repo) copies the project per worker, swaps in each mutant and runs
`forge test --fail-fast --offline` with `FOUNDRY_PROFILE=dev` (fuzz 256 runs, invariant 64 runs;
**weaker than the CI profile**, chosen so 550 mutants finish in about an hour on 4 cores).
KILLED = suite fails (or times out); SURVIVED = suite passes; INVALID = mutant does not compile
(excluded from the score). gambit's default operators were used, unmodified.

| Contract | Mutants | Invalid | Killed before | Score before | Killed after | Score after |
|---|---|---|---|---|---|---|
| GhostPayRouter | 84 | 2 | 80 | 80/82 = 97.6% | 81 | 81/82 = 98.8% |
| GhostPaySweepRelayer | 115 | 0 | 112 | 112/115 = 97.4% | 114 | 114/115 = 99.1% |
| GhostPayPolicyRouter | 93 | 2 | 90 | 90/91 = 98.9% | 90 | 90/91 = 98.9% |
| PolicyAccount | 258 | 0 | 253 | 253/258 = 98.1% | 257 | 257/258 = 99.6% |
| **Total** | 550 | 4 | 535 | **535/546 = 98.0%** | 542 | **542/546 = 99.3%** |

"After" re-ran only the 11 survivors against the new tests (kills are monotonic: added tests cannot
un-kill a mutant). Per-mutant results incl. diffs: `mutation/*.before.json`,
`mutation/*.survivors-after.json`. PolicyAccountFactory was not mutated (outside the requested set).

### Killed by new tests (`packages/contracts/test/mutation/`)

| Mutant | Test |
|---|---|
| Router: `ANNOUNCER.announce` deleted in `payERC20WithPermit` | `RouterPermitAnnounceKillerTest.test_payERC20WithPermit_announcesToAnnouncer` |
| Sweep: `word & bit` -> `word / bit` | `SweepNonceKillerTest.test_sweep_lowerNonceUsableAfterHigherNonceInSameWord` |
| Sweep: `if (s.fee != 0)` -> `if (true)` | `SweepNonceKillerTest.test_sweep_zeroFeeEmitsNoTransferToFeeTo` |
| PolicyAccount: `delete pendingDestination` / `delete pendingProposalId` removed (+ `~` variant) in `cancelDestination` | `PolicyAccountMutationKillerTest.test_cancelDestination_clearsAllPendingFields` |
| PolicyAccount: `word & bit` -> `word / bit` | `PolicyAccountMutationKillerTest.test_nonce_lowerFreshNonceAcceptedAfterHigherInSameWord` |

### Surviving mutants (4) — judged equivalent, not killable

My reading of the code, not formally proven:

- **Router #12, PolicyRouter #15**: `if (block.timestamp > deadline) revert Expired();` -> `if (false)` in
  `payERC20WithPermit`. The same check is the first statement of `_validate`, reached via
  `_payERC20` after the (try/catch) permit, so the outcome is identical; the early check only saves
  gas / skips the permit call.
- **Sweep #85, PolicyAccount #207**: `word | bit` -> `word + bit`. The line above reverts when
  `word & bit != 0`, so the bit is always clear and `|` equals `+`.

Limits: mutation score measures only what gambit's operators generate. FOUNDRY_PROFILE=dev was used
for every run. No independent audit is implied.

## Gas snapshot

Six non-fuzz entries for the new tests were appended to `packages/contracts/.gas-snapshot`; no
existing entry was modified. `forge snapshot --check` (forge 1.8.5) still reports missing entries
for pre-existing fuzz tests and for my fuzz test (`MythrilTriageTest.testFuzz_...`), consistent
with the committed file listing no fuzz tests at all; I did not add fuzz lines.
