# ERC-20 payment and recovery qualification on local anvil — 2026-11-27

## Source and scope

- Base: `origin/main` `3f7fcd0a` (merge of PR #746). Branch `worktree-agent-a676678ca1808d02b`; not pushed.
- Question: is the ERC-20 path payer -> router -> stealth announcement -> seller scan/reconcile -> receipt -> sweep ->
  recovery from an exported backup covered end to end on a local chain? Answered from source and existing tests, not docs.
- Scope is core payment, privacy and recovery. No stopped product (F01/F02/F04/F08/F09/F11/F12/F13/P07/F14) is touched, no
  contract, dependency, chain scope or production source changed. Tests and one handoff only.
- Limits (read before quoting): everything runs on a disposable loopback anvil. Mock token runtime code is injected at the
  allowlisted token address of that anvil only (`anvil_setCode`), exactly as `packages/chain-adapters/src/payments.anvil.test.ts`
  does. This is not deployed USDC, not a live network, not a browser run, not an audit. Wallets are synthetic keys.

## Gap table (before this change)

| Path step | Existing test (source) | Gap |
| --- | --- | --- |
| Router splits, exact-delta check, fee-on-transfer reverts | `packages/contracts/test/GhostPayRouter.t.sol` (70 forge tests), `TokenEdgeCases.t.sol`; `chain-adapters/src/router.anvil.test.ts` (fee differential, real router) | none for the contract; no app-level proof that a fee-on-transfer token is refused before the wallet is asked |
| Payer review, approval, permit, send, verify | `apps/web/src/lib/payExec*.test.ts`, `payExec.acceptance.test.ts` (MockWallet + `mockRpc`) | mocked chain only: no real router call, real allowance, real permit or real receipt through `payExec` |
| Announcement evidence for a payment | `chain-adapters/src/payments.anvil.test.ts` (17 tests: verifier vs real router and fault injection) | not driven through the app's `runScan` + worker; no seller-side outcome |
| Seller scan, pending vs verified | `scanClient*.test.ts` (mocked chain) | no real-chain scan of an ERC-20 payment (`pending` then `verified`) |
| Reconciliation: exact, under, over, wrong token, forged | `reconciliationMatch*.test.ts`, `reconciliationVault*.test.ts`, `scanClient.test.ts` (fixture matches) | no case built from real router evidence; under/over/dust/wrong-token/forged classification never seen with real amounts; manual-link below/above/equal not exercised |
| Receipt binding | `receipts.test.ts` (hand-made `ScanMatch`) | not bound to a real scan match; refusals (amount, asset, chain, claimed) not shown on real evidence |
| Interrupted payment, reload, no double pay | `duplicateAttemptJournal*.test.ts`, `attemptStatus.test.ts`, `WalletAttempts*.test.tsx` (mock RPC) | pending/confirmed/not-found/nonce-consumed never read from a real node; double-pay refusal never shown against a real chain with real balances |
| Token sweep of a stealth address | `sweep.test.ts` (mock RPC); e2e `sweep.spec.ts` (mocked network); `scripts/devnet/e2e.mjs` (library, USDT direct sweep, relayed) | `directSweep` of a real ERC-20 balance with a real buffered payment untested in CI; the devnet script is not in CI and leaves ERC-20 receipts `unverified` (token not in registry) |
| Recovery from exported backup, standalone path | `paymentKeyExport*.test.ts` (vectors), `scripts/recovery/*.test.mjs` (vectors; `raw-key-anvil.test.mjs` spends **native** only) | no ERC-20 spend from a recovered key; no backup built from a real announcement; master/keystore + announcement route untested with a token |
| Wrong chain / wrong token | unit tests in `pay.test.ts`, `txGuard.test.ts`, `wallet.test.ts` | not shown against a real RPC for another chain, a real unlisted token, or a wallet that swaps token or amount after review |
| Browser e2e with ERC-20 on a chain | `apps/web/e2e/*` use `flowMocks.ts`; `devnet-journey.spec.ts` is native only; `pages-devnet.spec.ts` c2 records that DeployDevnet has no token at the allowlisted address | **still open** (see below) |

## What was added (all new files)

Harness: `apps/web/src/lib/erc20Anvil.testutil.ts` (anvil, real contracts, token alias, synthetic EIP-1193 wallet),
`apps/web/src/lib/erc20Flow.testutil.ts` (the app's own review/pay/scan/sweep calls). Tests, all `skipIf` without anvil and
artifacts, and a hard failure under `REQUIRE_ANVIL=1`:

- `erc20Payment.anvil.test.ts` (2): exact approve+pay (exact allowance, two wallet sends, exact split, scan `pending` then
  `verified`); permit payment (one signature, one send, nonce consumed).
- `erc20Reconcile.anvil.test.ts` (11): exact link and bound receipt; under/over/dust payment never proposed, linked or
  receipted, manual link reports `below`/`above` with real nets; partial + top-up sums to `equal`; double payment is
  `ambiguous`, hand-linking both is `above`; EURC for a USDC invoice; forged direct announcement stays `claimed`; invoice
  for another chain; pending/claimed cannot become verified records; `payer_pays` with an awkward amount is exact.
- `erc20Interrupted.anvil.test.ts` (5): reload while pending; page lost after the hash (typed `PostBroadcastError`);
  wallet crash with unknown outcome; dropped transaction then nonce taken; mined then reorged away. In each, a second
  payment is refused (dry run once the allowance is spent, durable journal when it is re-approved) and the chain shows
  at most one payment.
- `erc20Guards.anvil.test.ts` (12): wrong network (cannot switch, switches after review, RPC of another chain, manifest of
  another chain, unknown and disabled chain); unlisted token blocked in review; wallet that swaps the token or the
  amount after review is a typed submission mismatch with the hash; underfunded payer; fee-on-transfer token reverts with
  `UnexpectedBalanceDelta` and the app refuses at the dry run.
- `erc20Recovery.anvil.test.ts` (6): direct sweep of a buffered payment (the stealth pays its own gas, exact net, no second
  sweep); sweep without gas refused, then done after a plain top-up; no keys, no sweep; single encrypted backup ->
  standalone decoder (separate process, empty env) -> recovered key spends the tokens; master backup, seller keystore +
  announcement and the all-discovered archive agree on the keys and spend; wrong chain, wrong passphrase and tampered
  file are refused by the decoder.
- `scripts/recovery/erc20-backup-recovery.test.mjs` (1, node:test): no app code at all: real router ERC-20 payment to the
  reference-vector seller, backup built from the real announcement, standalone decoder, spend with Foundry `cast`.

## Findings

No production defect was found, so no production file was changed. Fail-first evidence: each guard below was removed in
turn (production edit, test run, `git diff` clean again) and the named tests went red.

| Mutation (reverted) | Tests that failed |
| --- | --- |
| `receipts.ts` skip the net-amount check | 3 (under/over/dust receipt refusal) |
| `reconciliation-portable.ts` `candidate` ignores amount | 3 (under/over/dust proposal) |
| `duplicateAttemptJournal.ts` `beginAttempt` drops the duplicate check | 4 of 5 interrupted tests |
| `wallet.ts` `verifySubmission` skips the call-data comparison | 2 (token swap, amount swap) |
| `pay.ts` `reviewInvoice` drops the disallowed-token blocker | 1 (unlisted token) |

Observations (not defects, recorded so nobody rediscovers them):

1. By design the encrypted vault keeps only observations that could pay a registered invoice
   (`observeInvoicePayments`). An under/over/wrong-token payment is not stored by the scan; the seller sees it in the scan
   result and can hand-link it. After a reload it reappears on the next scan. Pinned by `erc20Reconcile`.
2. With two exact payments for one invoice, `confirmProposal` refuses both (ambiguous); only the manual `save` link works.
3. A token sweep or a recovered-key spend needs native coin at the stealth address: a gas buffer in the payment, or a plain
   top-up. Without it the app refuses before signing and the standalone path simply cannot pay for the transfer.
4. `reconcileDirectSweep` stays `submitted` until a receipt exists (absence is never proof); tests mine a block first.
5. The shared sandbox starved one parallel run once (a 120 s hook timeout while another worker ran its own suite). The
   harness now bounds start-up to 45 s, retries once on a fresh node and reaps spawned anvils on exit; the five files
   together then passed 12 runs in a row (3 of them after that change). The cause of the single hang was not isolated.

## Still open (not done here)

- Browser (Playwright) ERC-20 journey on a real chain. Blocked: the devnet script deploys no token at the allowlisted
  address, and no Chromium is installed in this environment, so nothing browser-level could be run. A future change would
  alias a mock token at the allowlisted USDC address in `scripts/beta/browser-devnet.sh` (as the harness here does) and add an
  `apps/web/e2e/*erc20*` spec; that script and the e2e fixtures belong to other workers.
- Relayed (sponsored) ERC-20 sweep against a real `GhostPaySweepRelayer` is covered only by `scripts/devnet/e2e.mjs` (not CI)
  and forge tests. Out of scope here.
- The OP Stack L1-fee reserve is exercised with a zero-fee GasPriceOracle stub, not real fees.

## Commands

```bash
npm ci --ignore-scripts && npm run build:libs && (cd packages/contracts && forge build)
export ANVIL_BIN=$(which anvil) CAST_BIN=$(which cast) REQUIRE_ANVIL=1
(cd apps/web && npx vitest run src/lib/erc20*.anvil.test.ts --coverage=false)
node --test scripts/recovery/erc20-backup-recovery.test.mjs
```

A subset run under `--coverage` reports the global coverage thresholds as unmet; they are defined for the whole suite and
were not changed.
