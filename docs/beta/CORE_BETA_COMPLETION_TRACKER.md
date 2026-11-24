# GhostPay core functional-beta completion tracker

Date: 2026-11-11 (UTC). Branch `claude/nice-ritchie-8vivls`, [PR #114](https://github.com/djshellshoxxx/GhostPay/pull/114), stacked on the
integration candidate [PR #98](https://github.com/djshellshoxxx/GhostPay/pull/98) at `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7`
(all 34 hosted checks green on that exact head, observed 2026-11-11). `main` (`14f9b26`) is 581 commits behind the candidate
and is **not** the baseline for beta work.

This tracker is built from the current source and from commands run in this session. It is not an audit. "Remaining" figures are
engineering estimates for the **core EVM lifecycle only**; they are not measured completeness of all GhostPay features or of production readiness.

## Single acceptance command

```bash
bash scripts/beta/acceptance.sh
```

It runs three stages on fresh local anvil chains with the real contracts and real transactions, using public anvil dev keys only. No stage is skipped silently.

| Stage | What runs | Result on `c7a2113` (local, 2026-11-11, Node 22.23.4, Foundry 1.8.5, solc 0.8.28) |
| --- | --- | --- |
| `lib` | `scripts/devnet/e2e.mjs`: library lifecycle on chain 31337 (keygen → 4 signed invoices → ETH/ERC-20 approve/permit payments → scan → receipt → direct and relayer sweeps → backup/restore rescan) | PASS, 14 steps, 14 transactions |
| `cli` | `scripts/beta/cli-devnet.e2e.mjs`: the unmodified CLI (see the CLI section) | PASS, 124/124 checks |
| `browser` | `scripts/beta/browser-devnet.sh`: the **built** web app in Chromium against its own anvil | PASS, 3/3 tests |

Overall: `ACCEPTANCE OK` from a cold start, including `build:libs`, in 4 min 42 s. The hosted [Beta acceptance](../../.github/workflows/beta-acceptance.yml)
workflow runs the same command on PRs that touch the payment path. Its first exact-head result belongs in the milestone log below once it reports.

## Lifecycle status (current source)

| # | Step | Implemented | Real-chain evidence (this session) | Mocked or unit evidence (existing) | Open / known limits | Est. remaining |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Seller keys (generate, import, encrypted vault, backup/restore) | Yes. `lib/keyVault.ts`, `keystore.ts`, `session.ts`, `appLock.ts`; CLI `backup *` | Browser: keys generated in app. CLI: `backup generate/inspect/verify/create`, wrong-passphrase refusal | `recovery.spec.ts`, `passphrase-vault.spec.ts`, core journey | Real-chain browser backup/restore not in the devnet spec; library and mocked browser cover it | 5% |
| 2 | Create, sign, save, reopen and share an invoice | Yes. `invoice-schema`, `lib/invoiceCreate.ts`; CLI `invoice create/sign/verify/link` | Browser: signed 0.5 ETH invoice opened by the payer from its link. CLI: create/sign/verify/link plus tampered/pin/amount negatives | CreateInvoice tests, `invoice-parity.test.ts` | QR transfer belongs to the QR worker | 5% |
| 3 | Buyer review, wallet connect, network check, consent | Yes. `lib/pay.ts`, `payExec.ts`, `txGuard.ts`, `views/Pay.tsx` | Browser: no wallet call before Send; wallet on 31337 cannot connect; network switch before Send refused with nothing sent | `flows.spec.ts` (preview = calldata, wallet mutation refused, account change refused), expiry refusal | Real wallet extensions and physical devices not qualified | 10% |
| 4 | Broadcast; pending → included; no duplicate on retry or reload | Yes. `walletJournal`, `duplicateAttemptJournal.ts`, `transactionOutcome.ts` | Browser: tx held in the mempool shows pending, then included; reload keeps the hash and refuses a second Send; wallet called once; payer nonce +1 | `core-journey` unknown/late outcomes, `flows.spec.ts` late hash | Duplicate journal is per tab (sessionStorage), documented; a multi-tab duplicate is not prevented. ERC-20 approve/permit only at library level on devnet | 10% |
| 5 | Payment verification (chain evidence, finality, reorg) | Yes. `chain-adapters` `verifyClaimedPayment` (router caller, canonical block hash, direct router receipt bound to calldata, Transfer log, evidence ids, optional second provider) | Browser: "waiting for enough confirmations" before finality, verified after 101 blocks. CLI: `payment verify` pending-finality, then final; wrong amount, recipient or unrelated tx refused | audits 17/20/21; `payments.test.ts` 33 tests; `core-journey` reorg case | **ERC-20 proof on devnet stays "unverified" by design**: devnet tokens are not in the verified token registry. Native ETH proof only on the local chains | 10% |
| 6 | Seller detection (scan, checkpoints, dedupe, reorg) | Yes. `scannerCore.ts`, `scanClient.ts`, worker; CLI `scan plan/run/inspect` | Browser: Worker scan finds the payment. CLI: scan run/inspect, resume of a completed scan refused | `Scan.test.tsx`, `scanClient.test.ts` (73), fuzz suites | **Fixed here: F1**, see Security | 5% |
| 7 | Merchant history, reconciliation, invoice association | Yes. Encrypted reconciliation vault, proposals, manual confirm; CLI `reconcile *`, `history *` | CLI: register → propose → confirm (`seller-confirmed`) → record → history | `reconciliation.spec.ts`, vault tests | **Fixed here: F2**. Remaining: an unsaved payment is timed by the scan currently showing it, and a restored or imported payment takes the time of its next live save (needs block timestamps and a schema bump; documented in ADR-0026 open item 8 and the user guide) | 10% |
| 8 | Receipts (bound to the invoice, verification, export) | Yes. `lib/receipts.ts`; CLI `receipt create/verify/inspect/export` | Browser: invoice-bound receipt checked field by field and by the payer. CLI: bound and manual-digest receipts; tampered, other-invoice and unrelated-tx negatives | `receipt-lean.spec.ts`, audit 21 | A receipt signature is seller attestation, not payment proof; the UI and CLI keep these separate | 5% |
| 9 | Direct sweep (review, authorize, broadcast, journal, no duplicate) | Yes. `lib/sweep.ts`, `sweepAttemptJournal.ts`, `views/Sweep*.tsx` | Browser: direct sweep; destination balance gain equals the tx value; stealth nonce 1; journal `included`; a second sweep of the leftover native fee dust is refused by the fee check, with no new tx (this is not a duplicate-sweep guard; the mocked `sweep.spec.ts` covers the journal duplicate guard). Library: ETH and USDT direct sweeps | `sweep.spec.ts` (journal before handoff, duplicate refused through reload) | Real OP-stack L1 data fee not exercised (anvil uses a 0-fee oracle stub). The relayer sweep belongs to the relayer workstream and is exercised only at library level here | 10% |
| 10 | Persistence and restart recovery | Yes. Journals, encrypted vaults, scan checkpoints | Browser: reload during pending payment; reload after inclusion | `recovery.spec.ts`, `product-backup-retry.spec.ts` | Crash in the middle of a write is covered by unit tests only | 10% |
| 11 | CLI parity | Yes, offline by default; live reads are read-only (no signing or broadcast by design) | 124 checks, see the CLI section | CLI suite 537/537 | **31337 gap**: see the CLI section | 10% |

Rough remaining effort for the automatable local core: about 10%. External gates (testnet, wallets/devices, audit) are listed separately and are not part of that figure.

## CLI on local chains

- On the shared devnet (chain 31337), every live CLI command fails closed with exit 5 `UNSUPPORTED_CHAIN`. The script asserts this in 11 checks. Causes:
  - `packages/chain-adapters/src/config/chains.ts:40-63` has no 31337 entry.
  - `verifyDeployment` requires the canonical ERC-5564 announcer (`chain-adapters/src/verify.ts:189-193`).
  - The devnet deploys the announcer at a fresh address (`packages/contracts/script/devnet/DeployDevnet.s.sol:17,38`).
- On a script-owned anvil that reports chain 84532 with the announcer installed at the canonical address (on that private chain only), the unmodified CLI passes:
  - deployment verify and RPC diagnostics;
  - scan;
  - payment verify/status, final after 101 confirmations;
  - receipt create/verify;
  - reconcile register/propose/confirm/record and history;
  - documented-exit-code negatives: exit 1 mismatches, exit 2 usage, exit 3 existing output, exit 4 unreachable RPC, exit 6 trust/pin/chain/insecure-URL.
- Proposed design, not implemented (it touches the chain trust model and needs review):
  - deploy the reference announcer at the canonical address in the devnet;
  - add an explicit local-dev chain config that `findChain` never returns;
  - add a CLI flag accepted only for 31337 with loopback-only RPCs and an explicit `--manifest-digest`, with reports tagged `verificationScope:"local-devnet"`.

## Browser journey on a real chain

`apps/web/e2e/devnet-journey.spec.ts` with `apps/web/playwright.devnet.config.ts`:

- The app's https RPC URL is forwarded byte for byte to `127.0.0.1:8546`. Any other origin is aborted, and the spec asserts none were attempted.
- The deployment uses the unmodified `DeployDevnet.s.sol`, then `anvil_setChainId(84532)`.
- The manifest is signed with the public Playwright test key by `apps/web/e2e/devnet/prepare-devnet-manifest.mjs`. That script refuses non-loopback, non-anvil or non-84532 RPCs and reads the manifest back on-chain first.
- The existing `prepare-manifest.mjs` fake-address guard is unchanged.
- The mocked suite excludes the devnet spec: `playwright.config.ts` desktop `testIgnore` leaves the listing at 67 tests, unchanged.

Not covered on the real chain:
- ERC-20 approve/permit;
- relayer sweep;
- backup/restore;
- reorg;
- a real wallet extension;
- multi-tab duplicates.

The library stage covers ERC-20, the relayer and backup on a real chain. The mocked browser suites cover reorg and backup.

## Security (core lifecycle)

An independent read-only review covered the invoice, checkout, tx build, verification, scanning, receipts, sweep and key handling. It reported two findings. Three skeptics with different lenses then each tried to refute each finding, and both survived. The fixes were written test-first and reviewed independently.

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| F1 | Medium | A front-run router "dust" announcement that reuses the payer's (one-time address, ephemeral key) hid the genuine payment. `dedupeClaims`, the scan client ledger, the Scan view and CLI scan kept only the earliest router record | **Fixed** (`c7a2113`): every router record is kept (each needs its own direct router tx and evidence id; one transfer is still credited once); non-router replays still fold; the Scan view warns on a shared address. No on-chain uniqueness check, because it would let a front-runner revert the payer. Audit 20 addendum |
| F1b | Low (follow-up review) | CLI `reconcile` rejected a current context holding two verified router observations with the same (S, E) as `DUPLICATE_OBSERVATION`, so a 1-wei front-run copy blocked reconciling the genuine payment | **Fixed**: the S:E check is removed; per-log record id and evidence id still reject a repeated observation or reused evidence (`packages/cli/src/reconcile-frontrun.test.ts`, red then green) |
| F2 | Low | Re-saving a reconciliation record overwrote its first-seen time, so an old payment could become an "exact" match for a newer invoice | **Fixed** (`c7a2113`) for live records; imported or invalidated records keep fresh-time semantics. The first-scan case is documented as open (ADR-0026 item 8) |

A second independent review covered the whole PR diff in four dimensions; each finding then went to an adversarial verifier. All 9 findings were confirmed, at low severity. Besides F1b they covered harness and docs:
- the CI path filter was too narrow (widened);
- the runner's manifest restore was unconditional (now gated on this run starting the devnet, restoring the exact pre-run bytes);
- an empty `--stages` reported OK (now exit 2);
- test coverage for a later-page non-router replay was missing (added and mutation-checked);
- two reconciliation-time doc statements were inaccurate (corrected);
- the audit 20 note on native-ETH sweep dust was wrong (corrected);
- a stale spec comment.

Covered: the scan client's claim-ledger rebuild after a reorg now has direct tests (`scanClient.test.ts`, "claim ledger rebuild after a reorg on a later page") for a rollback above genesis (replay dropped, kept replay replaced in place, distinct router record appended) and a rollback to genesis from a later page (all pairs new again). Residual: a rollback above genesis never drops already-kept matches (page commits precede the fork point), so a partial drop with the array shrinking is not reachable through `fetchAnnouncements` and is not exercised.

Areas the review found clean: invoice signing, digest and envelopes; tx build and guards; manifest verification; receipt binding; direct sweep; no plaintext secret persistence.

Already recorded and still open:
- L2-I4: no secondary RPC on manifest readback.
- Provider privacy disclosures (audit 17).
- Parent #84 Sonar gate (PR #98 item 2).

## Ownership and parallel work (not taken over)

| Workstream | Where | Note |
| --- | --- | --- |
| Integration candidate | #98 | Base of this PR; draft; not mergeable to `main` until its qualification items close |
| BTC/spec 05/spec 04 hard lanes | #113 (stacked on #98, active) | No file overlap with this PR |
| Relayer completion | relayer PRs, e.g. #69 | Used only through the existing relayer at library level |
| QR, device pairing, encrypted backup transfer | #60, #61 and others | Untouched |
| CLI test-only PRs | #105–#111 | This PR changes `packages/cli/src/scan-commands.test.ts` (F1 regression). Check those PRs for overlap when integrating |
| Docs/wiki | #104, #112 | This tracker is additive |

## External gates (human or authorization required)

1. **Public testnet** (Sepolia candidate; see `docs/operators/testnet-runbook.md`):
   - deployer and fee-recipient custody;
   - funded test accounts;
   - an explicit owner authorization to broadcast;
   - a signed manifest from the real release key;
   - source verification.
   No public deployment or broadcast was performed.
2. **Release-signing trust root** and real release evidence.
3. **Real wallets and devices**: wallet extensions, mobile and Safari.
4. **Independent professional audit**: the reviews here are AI-assisted.
5. **Human review** of translations and accessibility.
6. **Merge of #98 to `main`**: requires owner approval and the #98 qualification list.

## Definition-of-beta checklist (local, automatable)

The browser and CLI items below were exercised on real local chains in this session. Mocked-only items are not counted as real-chain passes.

- [x] Seller generates keys (browser, CLI); creates a valid signed invoice; reopens it from its link.
- [x] Buyer opens and validates the invoice, connects a wallet, reviews, authorizes, broadcasts; sees pending then included.
- [x] Seller detects the payment; verification waits for finality; payment verified.
- [x] Invoice-bound receipt generated and verified by seller and payer.
- [x] Direct sweep; completion verified on-chain; a second attempt sends nothing (fee check on native dust; journal duplicate guard covered by the mocked suite).
- [x] Reload after submission keeps the tx hash; no duplicate payment.
- [x] CLI: invoice, receipt, payment verify/status, scan, reconcile and history (84532-alias local chain).
- [x] No false payment confirmation in the exercised negatives (wrong amount, recipient or tx, before finality, forged receipt, front-run dust).
- [ ] Merchant history: browser reconciliation on the real chain (CLI covered; mocked browser only).
- [ ] Interrupted-session recovery across a full browser restart on the real chain (reload covered; mocked suites cover restore).
- [ ] Exact-head hosted CI green on this PR (pending; see the log below).
- [ ] Consolidation into #98 and owner approval.

## Milestone log

| Time (UTC) | Commit | Event |
| --- | --- | --- |
| 2026-11-11 01:30 | `364b1f1` | Baseline rebuilt locally: `npm ci`, `build:libs`, workspace `typecheck` and `lint` exit 0; devnet lib e2e 14/14 |
| 2026-11-11 02:08 | `c7a2113` | F1/F2 fixed; chain-adapters 450/450, CLI 537/537, ux-vault 255/255; full acceptance OK from a cold start |
