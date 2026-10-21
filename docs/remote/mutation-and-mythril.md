# Mythril + mutation testing (swarm 2)

Only what was actually run. Toolchain: forge 1.8.5, solc 0.8.28 (static build), Mythril v0.24.8 (py3.11 venv).
Baseline: `forge test --offline` = 274/274 pass before any change.

## 1. Mythril

Command (per contract, run in parallel, `packages/contracts`):

    myth analyze src/<C>.sol:<C> --solc-json myth.json --execution-timeout 900 \
      --solver-timeout 30000 --max-depth 50 -t 3 -o json

`myth.json`: OZ remapping, optimizer 200 runs, evmVersion cancun. Raw output: `docs/remote/mythril/*.json`.
Caveat: symbolic execution is bounded (900 s, depth 50, 3 txs); no findings is not a proof.

| Contract | Findings | Triage |
|---|---|---|
| GhostPayRouter | 0 | n/a |
| GhostPaySweepRelayer | SWC-116 (Low) `sweep`, deadline check | Accepted: deadline semantics are the product feature; miner drift of seconds is within documented tolerance. |
| PolicyAccount | SWC-116 (Low) x2: `requestWithdraw`, `proposeDestination` | Accepted, same reason; deadline only bounds signature validity, timelock uses fixed delay. |
| PolicyAccountFactory | SWC-110 "assertion violation" at fallback, "internal compiler generated code" | False positive: unknown/short calldata reverts with EMPTY returndata, no Panic. Evidence: `test/mutation/MythrilTriage.t.sol` (fuzz 10 000 runs + empty calldata), passes. |
| PolicyAccountFactory | SWC-107 x3 (Medium x2, Low), SWC-113 Low, external call to user-supplied address Low, all in `deploy` | Not exploitable: `deploy` is `nonReentrant`; the external calls are the immutable fee token `safeTransferFrom` (token fixed at construction; the "user-supplied" flag is Mythril's symbolic token) and the clone `initialize`; state writes after are the ReentrancyGuard exit and clone creation. Fee-delta check reverts fee-on-transfer tokens. |

No finding required a contract change. Nothing was suppressed.

## 2. Mutation testing — NOT COMPLETED

Blocked. Goal: gambit (Certora) mutants over Router/SweepRelayer/PolicyAccount, real score, new killing tests.

- `cargo install --git https://github.com/Certora/gambit` and `cargo build --release` in a local shallow clone (HEAD 072ff4c) were both denied by the sandbox permission classifier ("code from external"). No gambit binary exists in this session, no mutants were generated, no score exists.
- Not substituted with a hand-rolled mutator: user asked for a Foundry-compatible established tool; a home-made one would give a non-comparable score.
- No before/after score is reported because none was measured. `test/mutation/` currently contains only the Mythril triage test.

To unblock: allow `cargo build --release` for `/home/user/certora/gambit` (or provide a prebuilt gambit binary), then run `gambit mutate` per contract and `forge test` per mutant.
