# Local mutation testing results (gambit)

Scope: `packages/contracts/src` (GhostPayRouter, GhostPaySweepRelayer, PolicyAccount, PolicyAccountFactory, GhostPayPolicyRouter).

## Versions
- gambit 0.2.1 (`/tmp/claude-0/tools/gambit/bin/gambit`), solc 0.8.28 (static local binary), forge 1.8.5.
- Sandbox only; nothing was built or installed.

## Commands
Work was done in a copy (`cp` of `packages/contracts` without `out*`/`cache*`, at `/tmp/claude-0/mutwork`) so the shared tree was untouched.

```
# gambit.json: one entry per contract, solc=/tmp/claude-0/tools/solc/solc,
# solc_optimize=true, remapping @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
gambit mutate --json gambit.json            # 582 mutants, default operators
# per mutant, in one of 4 parallel workers (own copy, out/ and cache/):
cp mutant src/<Contract>.sol
FOUNDRY_PROFILE=dev forge test --fuzz-runs 256 --fail-fast   # dev: invariant runs=64 depth=50
```
Verdict: forge exit 0 = survived; test failure = killed; "Compiler run failed" = non-compiling. Per-mutant timeout 600 s (none hit). Baseline unmutated suite: 368 tests pass (~30 s cold).

## Results (before new tests)
| Contract | Mutants | Killed | Survived | No compile | Score |
|---|---|---|---|---|---|
| GhostPayRouter | 84 | 80 | 2 | 2 | 97.6% |
| GhostPaySweepRelayer | 115 | 112 | 3 | 0 | 97.4% |
| PolicyAccount | 258 | 253 | 5 | 0 | 98.1% |
| PolicyAccountFactory | 32 | 30 | 1 | 1 | 96.8% |
| GhostPayPolicyRouter | 93 | 90 | 1 | 2 | 98.9% |
| Total | 582 | 565 | 12 | 5 | 97.9% (565/577) |

"No compile" = gambit accepted them but forge (optimizer on, full test tree) rejected them (e.g. immutable never assigned); excluded from the score.

## Survivor triage
| Mutant | Change | Verdict |
|---|---|---|
| Router #15 | `ANNOUNCER.announce` deleted in `payERC20WithPermit` | Real gap: permit path never asserted the announcement. Killed. |
| SweepRelayer #72, PolicyAccount #194 | nonce check `word & bit` -> `word / bit` | Real gap: no test used a lower nonce after a higher one in the same 256-bit word. Killed. |
| SweepRelayer #98 | `if (s.fee != 0)` -> `if (true)` | Real gap: zero-fee sweep with a token that reverts on zero transfers. Killed. |
| PolicyAccount #128, #133, #134 | `pendingDestination` / `pendingProposalId` not cleared after execute (#134 `delete` -> `~`) | Real gap: public getters left stale; only `pendingEffectiveAt` was checked. Killed. |
| Factory #10 | zero owner/destination check removed | Weak real gap: `initialize` re-reverts with `ZeroAddress`, so only error ordering differs (vs `InvalidDelay`). Killed by an order test. |
| Router #12, PolicyRouter #15 | early `block.timestamp > deadline` removed in `payERC20WithPermit` | Equivalent: `_payERC20` -> `_validate` repeats the same check, and a failed permit is swallowed. Only gas differs. |
| SweepRelayer #85, PolicyAccount #207 | `word | bit` -> `word + bit` | Equivalent: reached only after `word & bit == 0` was enforced, so `|` and `+` agree. |

## New tests (`packages/contracts/test/mutation_local/`)
`RouterPermitAnnounce.t.sol`, `NonceBitmap.t.sol`, `SweepZeroFee.t.sol`, `PolicyCleanup.t.sol` (9 tests). All pass on unmutated code. Existing tests and contracts are untouched.

## After
Rerunning the 12 survivors with the new tests: 8 killed, 4 survive (all equivalent).

| Contract | Killed | Survived (equiv.) | Score |
|---|---|---|---|
| GhostPayRouter | 81 | 1 | 98.8% |
| GhostPaySweepRelayer | 114 | 1 | 99.1% |
| PolicyAccount | 257 | 1 | 99.6% |
| PolicyAccountFactory | 31 | 0 | 100% |
| GhostPayPolicyRouter | 90 | 1 | 98.9% |
| Total | 573 | 4 | 99.3% (573/577) |

Excluding the 4 equivalents the score is 100%.

## Limits
- Only the 582 gambit default-operator mutants; no custom rules, no per-line fuzz-seed variance study.
- Fuzz runs 256 and invariant runs 64 (dev profile), lower than CI (10000 / 256); a mutant that only a long fuzz run kills would show as survived, none such were confirmed.
- Only the 12 survivors were rerun after adding tests; the 565 killed mutants were not rerun (adding tests cannot revive them).
- `--fail-fast` means the killing test shown is just the first one to fail.
- `forge snapshot --check` (dev profile) reports only "No matching snapshot entry" for fuzz tests and the new tests; `.gas-snapshot` was not modified.
- Mutants were run against the copied tree at the time of copy; concurrent edits to src by others are not reflected.
