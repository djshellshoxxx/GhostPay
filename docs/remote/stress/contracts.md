# Contracts stress test (Foundry)

Snapshot: HEAD `dea46be`, branch `claude/remote-extensions-1`, 2026-10-21. forge 1.8.5, solc 0.8.28 (`/tmp/claude-0/tools/solc/solc`), OZ 5.6.1. Host: 4 cores, load average 10 to 11 the whole time (other agents), so wall-clock numbers are inflated and only useful for comparing runs with each other.

All results below were produced by commands I ran. I made no source or test edits in the repo. The extra stress tests were run from a scratch copy of the package (`src/` and `test/` copied, `lib/` symlinked).

## 0. Toolchain note (config)

- `packages/contracts/foundry.toml:8` is committed with `solc = "/home/user/tools/solc"`, and that path does not exist in this container. `forge build` fails: `` `solc` "/home/user/tools/solc" does not exist ``. The `/usr/local/bin/solc` on PATH is a solc-select shim that tries to download a compiler, gets a proxy 403, and hangs for about 60s.
- Workaround (env only, no file change): `FOUNDRY_SOLC=/tmp/claude-0/tools/solc/solc`.
- Suggested fix: commit `solc_version = "0.8.28"` (as the README says CI does) and set the offline path only through env or a local override.

## 1. Fuzz suites at 100 000 runs

```
export PATH=/root/.local/bin:$PATH FOUNDRY_SOLC=/tmp/claude-0/tools/solc/solc FOUNDRY_OUT=out-stress FOUNDRY_CACHE_PATH=cache-stress
forge test --match-path <file> [--match-test testFuzz] --fuzz-runs 100000 --fuzz-seed 0x1   # timeout 3600 each, sequential, background
```

| Suite | Tests | Result | Wall (s) |
|---|---|---|---|
| test/GhostPayRouter.fuzz.t.sol | 11 | 11 pass | 126 |
| test/GhostPayPolicyRouter.fuzz.t.sol | 9 | 9 pass | 113 |
| test/PolicyAccount.fuzz.t.sol | 6 | 6 pass | 411 (`testFuzz_withdrawAmountsVsWindowCap` μ 1.53M gas/run is the slowest) |
| test/GhostPaySweepRelayer.t.sol `testFuzz*` | 4 | 4 pass | 134 |
| test/PolicyAccountFactory.t.sol `testFuzz*` | 5 | 5 pass | 78 |
| test/audit/Policy.audit.t.sol `testFuzz*` | 1 | 1 pass | 4 |

Total: 36 fuzz tests × 100 000 runs, 0 failures.

## 2. Invariants: runs=2048, depth=200

```
FOUNDRY_INVARIANT_RUNS=2048 FOUNDRY_INVARIANT_DEPTH=200 forge test --match-path <file> --fuzz-seed 0x1   # timeout 5400 each
```

| Suite | Invariants | Calls | Handler reverts | Result | Wall (s) |
|---|---|---|---|---|---|
| GhostPayRouter.invariant | 4 | 409 600 | 0 | pass | 451 |
| GhostPayPolicyRouter.invariant | 5 | 409 600 | 514 (all in `payWrongRecipient`) | pass | 1186 |
| GhostPaySweepRelayer.invariant | 3 | 409 600 | 0 | pass | 923 |
| PolicyAccount.invariant | 7 | 409 600 | 0 | pass | 1012 |

`fail_on_revert = false` (foundry.toml:28), so handler reverts do not fail a run. Selector call counts are evenly spread across every handler function. The full tables are in the scratch logs.

### F-1 (Low, test quality, confirmed): `payWrongRecipient` handler overflows

- **Where:** `test/GhostPayPolicyRouter.invariant.t.sol:142` computes `_ref(refSeed + 1 + outsiderSeed % 8)` with no bound, so it panics with 0x11 when `refSeed` is within 8 of `type(uint256).max`. The fuzzer picks that edge value often.
- **Effect:** the panic happens outside the `try`. That call is wasted, and the depth-200 sequence's state is still kept, so no false pass results. It accounts for the 514 reverts above and the 1 to 2 reverts per seed in dev runs.
- **Repro:**
  ```
  FOUNDRY_PROFILE=dev FOUNDRY_INVARIANT_FAIL_ON_REVERT=true forge test --fuzz-seed 0xd4 \
    --match-path test/GhostPayPolicyRouter.invariant.t.sol --mt invariant_routerHoldsNothing -vvv
  ```
  Output: `[FAIL: panic: arithmetic underflow or overflow (0x11)]`, shrunk to 1 call, `payWrongRecipient(2^256-1, 6.6e35, 851, …)`.
- **Suggested fix:** `unchecked { refSeed + 1 + … }`, or `bound(refSeed, 0, type(uint128).max)`. After that, consider turning on `fail_on_revert` for the handlers that wrap their calls in try/catch.

## 3. Flakiness

- **Fuzz/unit, dev profile (256 runs), `--no-match-path 'test/*invariant*'`, seeds 0xa1, 0xb2, 0xc3:** 373/373 pass each time, 6 to 10 s.
- **Fuzz/unit, default profile (10 000 runs), random seed:** 373/373 pass, 164 s.
- **Invariants, dev profile (64×50), seeds 0xd4, 0xe5, 0xf6:** 4/4 pass each time, 37 to 43 s.

No flaky test seen. The only seed-dependent behaviour is F-1, which never fails a run.

## 4. Adversarial / scale scenarios (new stress tests, scratch only)

Files:
- `/tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/st/pkg/test/stress/Stress.t.sol`
- `/tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/st/pkg/test/stress/RevertBomb.t.sol`

Run: `cd <scratch>/pkg && forge test --match-path 'test/stress/*' -vv`. Result: 22/22 pass, about 1 s.

Gas figures were measured in the test frame with `gasleft()` deltas, so they include call overhead.

### Scale

| Test | What | Result |
|---|---|---|
| `test_stress_manyRecipientsERC20` | 1000 `payERC20` calls to distinct stealth addresses | conservation exact, router balance 0, about 109.6k gas/payment |
| `test_stress_manyRecipientsNative` | 500 `payNative` to distinct stealth addresses | exact, router balance 0 |
| `test_stress_manyOwnersSweep` | 300 distinct owners swept by one submitter | exact dest/fee totals, about 230k gas/sweep including vm.sign |
| `test_stress_nonceBitmapSweep` | 600 sequential nonces (3 bitmap words), plus nonces `2^256-1`, `2^256-256`, `2^255`, each with a replay attempt | all consumed once, replays revert `NonceAlreadyUsed`, nonce 600 unused |
| `test_stress_manyWindowsWithdraw` | 200 full-cap withdrawals over 200 two-window gaps | exact, 44.7M gas total |
| `test_stress_deepProofTinyWindow` | depth-64 merkle proof, leaf limit=1 window=1s, 50 requests | the second spend in the same window reverts `WindowLimitExceeded`; spends 2 s apart all pass |

### Extreme amounts and decimals

| Test | Result |
|---|---|
| `test_stress_maxGrossBoundary` | `gross = type(uint256).max/25` passes; `+1` reverts (panic at `GhostPayRouter.sol:216`), as documented at `:25-26` |
| `test_stress_decimalsExtremes` | decimals 0, 1, 18, 24, 36, 255: `stealth + fee == gross` each time |
| Sweep `test_stress_extremeAmounts` | `amount = 2^256-1`, `fee = 2^256-2`: dest gets 1, feeTo gets the rest, delta check passes |
| `test_stress_unlimitedHugeAmount` | unlimited leaf, withdraw of the full `type(uint256).max` balance passes |

### Return-data bombs (gas, pad bytes returned by the hostile callee)

| Path | pad 0 / 32 | 100 KB | 1 MB | Interpretation |
|---|---|---|---|---|
| Router `payNative`, stealth returns pad | 101k | 100k | 2.07M | Delta matches callee-side memory expansion only (1 MB ≈ 2.0M). No caller copy (`GhostPayRouter.sol:246`, out size 0). |
| PolicyAccount native `executeWithdraw`, destination returns pad | 108k | 103k | 2.08M | Same; no caller copy (`PolicyAccount.sol:207`). |
| Router `payERC20`, token returns `true` + pad (two transferFroms) | 113k | 168k | 4.11M | Delta ≈ 2 × callee expansion. SafeERC20 reads only 32 bytes (`SafeERC20.sol:227`). |
| Sweep `sweep`, same bomb token | 143k | 183k | 4.13M | Same. |
| Router `payERC20WithPermit`, `permit` reverts with pad | 119k | 145k | 2.12M | `catch {}` does not copy revert data (callee-only cost). |
| Sweep `sweepWithPermit`, `permit` reverts with pad | 148k | 159k | 2.13M | Same. |
| Router `payERC20`, `transferFrom` reverts with pad | 55k | 115k | 4.15M | About 2× callee cost: SafeERC20 bubbles the revert with `returndatacopy(fmp,0,returndatasize())` (`SafeERC20.sol:233-234`). |

#### F-2 (Info, confirmed): revert-bomb copy in SafeERC20

- **What:** a token that reverts with a large payload makes the caller pay a second, caller-side memory expansion.
- **Who is exposed:** in every contract the token is chosen by the payer (router) or signed by the owner (sweep, PolicyAccount). The exception is the third-party sweep submitter, who pays gas for an owner-chosen token. Even then the cost is bounded by the gas the submitter supplies, and the tx reverts with no state change.
- **Suggested fix:** none required. Off-chain relayers should simulate with a gas cap before submitting (relayer-side guidance).

### Gas griefing

`test_stress_gasBurnerStealthReverts`: a stealth contract with an infinite loop and a 1M gas cap makes the payment revert. Router balance stays 0. This is self-inflicted, because the payer chooses the stealth address. The fee recipient is immutable (`GhostPayRouter.sol:57`), so no third party can grief payments.

### Reentrancy

| Test | Attempt | Result |
|---|---|---|
| `test_stress_reentrancyNative` | stealth re-enters `payNative` | `ReentrancyGuardReentrantCall`; outer payment succeeds |
| `test_stress_reentrancySweep` | token re-enters `sweep` with a second validly signed order | blocked; nonce 2 stays unused |
| `test_stress_reentrancyPolicyNative` | destination re-enters `executeWithdraw(id2)` during `id1` | blocked; `id2` stays `Pending` |

### F-3 (Info, confirmed): uint64 truncation of timelock timestamps

- **Where:**
  - `PolicyAccount.sol:175` `uint64(block.timestamp + delay)`
  - `PolicyAccount.sol:256` `uint64(block.timestamp + 2*delay)`
- **What:** both wrap silently when `block.timestamp > 2^64 - delay`.
- **Test:** `test_stress_timestampNearUint64Max` warps to `2^64-11`. The request then stores `executeAfter = 86389`, and `executeWithdraw` succeeds immediately, so the timelock is bypassed.
- **Practical risk:** none. That timestamp is about 5.8e11 years away, and the code comments already assume it is unreachable.
- **Suggested fix (hygiene):** use `SafeCast.toUint64`, so the code reverts instead of wrapping.

## 5. Not done / unverified

- Echidna (`echidna.yaml`, `test/echidna/`) and mutation runs were not executed by me.
- Invariant runs used one fixed seed (0x1) at full depth. A different seed at 2048×200 was not tried, due to the cost of about 15 to 20 min per suite under load.
- Factory mass-deployment (CREATE2 collisions at scale) is only covered by the existing 100k fuzz (`testFuzz_saltUniqueness`, `testFuzz_predictAddress_equalsDeployed`).

Raw logs (scratch): `/tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/st/*.log`, `summary.txt`, `run.sh`.
