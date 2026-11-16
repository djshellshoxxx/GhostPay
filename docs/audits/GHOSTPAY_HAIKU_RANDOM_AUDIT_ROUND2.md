# GhostPay random code audit, round 2 (read-only)

Read-only. No source edits, no commits. Only this file written. Temporary probe tests were created and removed; `git status` clean.

## Method

- Seed `20261116`. Candidates = `git ls-files` under `apps/ packages/ scripts/ .github/workflows/ integrations/ contracts/ tests/` plus `*.sol`, minus `lib/`, `node_modules`, `dist`, `docs/`, `*.md`, `*.json`, lockfiles, generated, images, `.d.ts`, `.html`, `.css`, fixtures, dotfiles, and round 1 sampled files. Result: 1920 candidates (`scratchpad/cands.txt`).
- Main draw: `random.Random(20261116).sample(sorted(candidates), 10)`. No trivially-empty files drawn (smallest 33 lines).
- Stratum (`apps/relayer`, `*relayer*`, `payer-sponsor/`, `ops-monitor`, `.github/workflows`): 144 candidates. Main draw had 0 stratum hits. Per instruction, 3 extras drawn from the stratum with `random.Random(20261116).sample(stratum, 3)`. Total 13 files read, 10 main plus 3 stratum.
- Read in full. Ran vitest for donation, ops-monitor, ux-notify, btc-silent-payments (all pass), and `node --test scripts/tests/check-tx-origin.test.mjs` (7/7 pass).

## Files

Main draw:
1. `packages/btc-silent-payments/src/adapter.test.ts` (241)
2. `packages/btc-silent-payments/src/bip32.test.ts` (125)
3. `packages/pool-circuits/src/inputs.ts` (149)
4. `packages/donation/src/recipient.test.ts` (59)
5. `packages/ux-notify/src/reminder-bridge.test.ts` (89)
6. `scripts/tests/check-tx-origin.test.mjs` (95)
7. `packages/cli/vitest.config.ts` (41)
8. `packages/merchant-ledger/src/index.ts` (33)
9. `packages/pool-contracts/src/interfaces/IGhostPayShieldedPool.sol` (332)
10. `packages/cli/src/node-io.ts` (156)

Stratum extras:
11. `packages/ops-monitor/src/index.ts` (30)
12. `packages/ops-monitor/src/output.test.ts` (126)
13. `packages/payer-sponsor/src/sponsor/types.ts` (149)

Also read for cross-checks: `scripts/check-tx-origin.sh`, `packages/donation/src/{index,recipient}.ts`, `packages/ops-monitor/src/output.ts`, `packages/payer-sponsor/src/sponsor/{service,viemChain,http}.ts`, `packages/pool-contracts/src/{GhostPayShieldedPool,GhostPayShieldedPoolERC20}.sol`, `packages/pool-contracts/src/lib/PoolConstants.sol`, `packages/pool-circuits/src/constants.ts`, `packages/ux-notify/src/reminder-bridge.ts`, `packages/btc-silent-payments/src/{adapter,uri,units,keys}.ts`.

## Findings

### F1. `tx.origin` scanner misses split tokens across lines
- **File:** `scripts/check-tx-origin.sh:41`, per-line regex `tx[[:space:]]*\.[[:space:]]*origin`.
- **Function:** main `while read` loop.
- **Problem:** the check runs one line at a time, so `tx` at end of line and `.origin` on the next line is not matched. Solidity allows this.
- **Repro:** `address o = tx` / `      .origin;` inside `packages/a/src/A.sol`. Script exits 0 with `OK: no tx.origin`. Control with `return tx.origin;` exits 1.
- **Expected:** exit 1 (spec 04: no `tx.origin` in contract sources).
- **Actual:** exit 0.
- **Test gap:** `scripts/tests/check-tx-origin.test.mjs` "fail-closed" cases do not include a split-token case.
- **Severity:** Low-Medium (CI gate bypass; no current use of `tx.origin` found: only a comment at `packages/payer-hiding-contracts/src/GhostPayPayerDelegate.sol:40`).
- **Confidence:** High (reproduced).
- **Class:** Potential vulnerability (gate bypass).
- **Fix:** join lines before matching (e.g. `tr '\n' ' '` per file, or a small node/perl pass), and add a split-token test case.

### F2. Receipt timeout after send drops tx hash and skips loss accounting
- **File:** `packages/payer-sponsor/src/sponsor/service.ts:524` (`cls = 'receipt_timeout'`), `:540` (generic `UNAVAILABLE`); `viemChain.ts` `waitForReceipt` uses `waitForTransactionReceipt({ timeout })`.
- **Function:** `execute()`.
- **Problem:** if `waitForReceipt` throws (timeout), the catch maps it to `UNAVAILABLE` without a txHash. `loss.charge` only runs on a mined receipt that failed or lacked the fee (`:533`). A tx sent by the sponsor that later mines as a state-changing revert or no-fee success is never charged to the client's loss budget. The quote is already consumed (`:514`), so the client cannot retry, and the operator has no hash to reconcile.
- **Repro:** code reading only (no timeout test found in `service.test.ts` for this path).
- **Expected:** on send-then-no-receipt, either charge an estimate (`sim.gas * gasPrice`) and log the txHash, or retain the hash.
- **Actual:** no charge, no hash in error or log.
- **Severity:** Medium (sponsor loss under RPC stall).
- **Confidence:** Medium (code path verified; exploit scenario not run).
- **Class:** Probable defect.
- **Fix:** catch receipt errors separately after `send`; charge estimated gas to `ctx.bucket` and log `txHash` with outcome `timeout`.

### F3. Pool-circuits pre-checks accept zero values that the contract rejects
- **File:** `packages/pool-circuits/src/inputs.ts:87` (`assertValue(a.withdrawnValue,…)`), `:86` (`existingValue`), `:140` (`buildRagequitInputs` `value`).
- **Problem:** `assertValue` allows 0. Contracts reject 0: `GhostPayShieldedPool.sol:160` (`withdraw`: `value == 0 → InvalidValue`), `:206` (`ragequit`). The builder doc says it "pre-checks every constraint that would otherwise fail opaquely", but a zero-value witness passes the pre-check and fails only on-chain.
- **Repro:** code reading. `buildRagequitInputs(31337, {value:0n,…})` returns a witness; the contract reverts `InvalidValue`.
- **Expected:** builder throws on zero withdrawn/ragequit value.
- **Actual:** accepted.
- **Severity:** Low (wasted proving and gas; no fund risk).
- **Confidence:** High for the mismatch; medium for impact.
- **Class:** Probable defect (cross-package interface parity).
- **Fix:** require `> 0n` for those values in the builder.

### F4. Interface `WrongChain` doc omits the mainnet-fork refusal
- **File:** `packages/pool-contracts/src/interfaces/IGhostPayShieldedPool.sol:133-134`.
- **Problem:** doc says "Deployed on a chain id other than 31337, 11155111 or 84532." Implementation (`src/lib/PoolConstants.sol:39-42`) also refuses chain 31337 when mainnet WETH9 has code. The circuit side (`pool-circuits/src/constants.ts:30`) lists the three ids only.
- **Expected:** doc states the WETH9 fork refusal.
- **Actual:** doc incomplete.
- **Severity:** Low (documentation).
- **Confidence:** High.
- **Class:** Documentation discrepancy.
- **Fix:** update the NatSpec.

### F5. Donation test title claims upper-hex addresses are accepted
- **File:** `packages/donation/src/recipient.test.ts:8`, test "accepts the fake address, checksummed and upper-hex forms".
- **Problem:** no upper-hex input is tested. Probe: `0x000000000000000000000000000000000000D0D0` (uppercase digits, no valid checksum) returns `false` from `isUsableRecipient`. Lowercase returns `true`. The implementation (`recipient.ts`, `isAddress strict`) is correct for EIP-55 but the title is misleading.
- **Severity:** Low (test/doc).
- **Confidence:** High (probe run, output in `scratchpad/probe.txt`).
- **Class:** Documentation discrepancy.
- **Fix:** rename the test, or add positive and negative cases for valid checksum and invalid uppercase.

### F6. Reminder bridge comment claims per-occurrence re-fire for recurring reminders
- **File:** `packages/ux-notify/src/reminder-bridge.ts:66` (doc comment on `reminderToNotificationInput`).
- **Problem:** `ScheduledReminder` has no recurrence field. Re-fire happens only if the external scheduler rewrites `dueAtMs`. Comment reads as if the bridge handles recurrence.
- **Severity:** Low (documentation).
- **Confidence:** Medium.
- **Class:** Documentation discrepancy.
- **Fix:** reword to say the scheduler must update `dueAtMs` per occurrence.

## Checked, no defect found

- `ops-monitor/src/output.ts` dedupe and Prometheus escaping (99 ops-monitor tests pass).
- `payer-sponsor` `paidFee` (fee log check) and bucket default (`/64`, `/32` as documented).
- `pool-contracts` ERC20 `depositWithPermit` nonce-before-call and `_pullTo`/`_push` balance-delta checks.
- `btc-silent-payments` URI amount formatting, `MAX_MONEY_SATS` bound (`2_100_000_000_000_000n`), scan label and verifier handling (493 tests pass).
- `merchant-ledger/src/index.ts`: every re-exported name is defined in its module.
- `cli/src/node-io.ts`: file open, symlink, and size checks; atomic `link` (no-replace) and `rename` (overwrite) publish paths look sound.
- False positive noted: `bip32.test.ts` vector count `6+6+2+3` matches BIP-32 vectors 1-4 (suite passes).
