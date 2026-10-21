# Contracts assurance: Echidna

Scope: Echidna property fuzzing only. Mythril and mutation testing are NOT covered here; they live in
`docs/remote/mutation-and-mythril.md` on branch `remote-extensions-2`. Nothing about them was run or verified by this work.

## What was run

- Echidna 2.3.1 (GitHub release binary, x86_64-linux), crytic-compile 0.4.2, forge 1.8.5, solc 0.8.28 (local static binary).
- Slither was NOT installed, so Echidna ran without Slither-derived constants/hints (less guided fuzzing).
- Config: `packages/contracts/echidna.yaml` (property mode, testLimit 300000, seqLen 20, shrinkLimit 2000, 4 workers, seed 20261021).
- Harnesses: `packages/contracts/test/echidna/Echidna{Router,Sweep,Policy}.sol`. One run per harness:
  `echidna test/echidna/EchidnaX.sol --contract EchidnaX --config echidna.yaml --corpus-dir corpus-x --format text`
- Run in an isolated copy of the 4 contracts + tests (another agent's WIP `src/GhostPayPolicyRouter.sol` broke the shared build with stack-too-deep; unrelated to these contracts).
- Each property is evaluated after every call, so each saw the full call count.

## Results (real output)

| Harness | Total calls | Unique instr | Properties |
|---|---|---|---|
| EchidnaRouter | 300,057 | 7,786 | router_never_holds_tokens, fee_plus_net_eq_gross (ERC-20 incl. buffer path), native_fee_plus_net_eq_gross, fee_recipient_only_gets_bps: all passing |
| EchidnaSweep | 300,030 | 7,250 | sweep_nonce_single_use, used_nonces_marked, relayer_never_holds_tokens, token_conservation: all passing |
| EchidnaPolicy | 300,032 | 10,850 | funds_only_to_destination, destination_only_changes_via_timelock, timelocks_never_shortened, policy_immutable, rolling_window_cap: all passing |

No property violation was found. No harness bug needed a property weakened (fixes were: payable constructors for `balanceContract`, stack-too-deep refactor).

## Reachability canaries

Each harness has `echidna_canary_*` properties that are EXPECTED TO FAIL (e.g. "fewer than 5 successful sweeps").
All canaries failed as expected, proving success paths were reached: ERC-20/native/buffer pay with non-zero fee, sweep success and
blocked replay, withdraw request/execute (token and native)/cancel, and destination change via the 2x-delay path.
The Echidna exit output therefore shows "failed" lines by design.

## What the properties cover

- Router: after any call sequence the router holds no ERC-20 or ETH (tokens donated directly are excluded via a ghost); per-call and aggregate fee+net==gross; fee-on-transfer token never leaves residue; plain ETH rejected.
- Sweep: nonce (set spans bitmap words and uint256 extremes) succeeds at most once; replay and same-nonce/different-params re-sign never succeed; relayer holds nothing; token supply conserved among owner/destinations/fee sinks.
- PolicyAccount: funds only move to the current destination (all balances conserved across the 3-address destination pool); execute never before request+delay; destination change never before proposal+2*delay; pending effective time and stored executeAfter never change; owner/delay/limitsRoot/policyHash unchanged; no payout beyond limit in any (now-window, now] interval; wrong-key signatures and re-initialize never succeed; executed/cancelled requests cannot re-execute.

## Limitations (unverified)

- 300k calls per harness is modest; no multi-seed or long-run campaign. Slither not used.
- Time/prank: owner signing uses hevm.sign; sender is always the harness (relayer/payer), fixed key, small address/nonce pools.
- Router stealth set is 4 code-less EOAs; hostile receivers/reentrant tokens are not in the Echidna harness (covered by existing Foundry tests only).
- Policy harness uses one two-leaf merkle tree and a fixed 1 day delay/window; PolicyAccountFactory is not fuzzed.
- Corpus dirs are not committed.
