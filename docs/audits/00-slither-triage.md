# Slither triage (v0.11.6, commit of this file)

Command: `slither . --filter-paths "lib|test|script" --exclude-informational --exclude-low` in `packages/contracts`.

| Detector | Location | Verdict | Rationale |
|---|---|---|---|
| arbitrary-send-erc20 | `GhostPaySweepRelayer._execute` (two `safeTransferFrom(s.owner, ...)`) | By design, not a vulnerability | `from` is `s.owner`, authenticated by an EIP-712 signature over destination, fee, feeTo, amount, nonce, deadline, chain and contract. Tests: tamper and replay suites in `GhostPaySweepRelayer.t.sol`. |
| incorrect-equality | `PolicyAccount._consume` (`bucket == s.bucket + 1`) | By design | Compares window bucket indices (integers), not balances or time-of-day; both outcomes are handled explicitly. |

Both are now suppressed with inline `slither-disable-next-line` comments carrying the rationale; CI runs Slither with no detector exclusions and fails on any Medium or High finding. Verified locally: exit 0 without exclusions.
