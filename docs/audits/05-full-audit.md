# Audit 05: Full-Codebase AI-Assisted Review

Snapshot: `88de0018b86884d49d70d269c430bdcbb39a0b4f` (short `88de001`)
Date: 2026-10-22
Per-area reports: `docs/audits/05/*.md`. `docs/audits/05/docs-claims.md` was **not written**. The docs-claims findings exist only in this file.

> **Read this first.** Autonomous AI agents did this review. It is **not** an independent professional security audit, and it guarantees **nothing** about security. Most areas got static reading only. Section 8 lists what nobody reviewed. Do not use this document to justify deploying with real funds.

---

## 1. Scope and method

### 1.1 Areas

| Area | Scope (summary) | Dynamic work |
|---|---|---|
| contracts-core | `packages/contracts` (router, policy router, PolicyAccount/factory, sweep relayer) | Yes: `forge test` with the dev profile, 402 passed / 0 failed; 2 PoCs in `packages/contracts/test/audit05/ContractsCore05.t.sol` |
| contracts-pools | pool-contracts, pool-circuits, pool-relayer, pool-sdk, payer-hiding-contracts, payer-sponsor, confidential-*, external-pools* | Yes, 2 PoCs only: `packages/payer-hiding-contracts/test/audit05/PaymasterSelfBundle.t.sol`, `packages/pool-contracts/test/audit05/RelayerGasGrief.t.sol` |
| crypto-core | core-crypto, invoice-schema, secret-box, test-vectors/scheme1, scrypt/AES-GCM in `apps/web/src/lib/keystore.ts` | None |
| chain-adapters | `packages/chain-adapters` (logs, rpc, scanVerify, deployments*, fees, registry, router) | None |
| web-app | `apps/web` | None |
| relayer | `apps/relayer`, `packages/relayer-guard` (limiter), `packages/ops-monitor` | None |
| bitcoin | btc-silent-payments, btc-payjoin, `apps/web/src/features/btc` | None |
| solana-tron | solana-stealth, tron-adapter | None |
| wallet-safety | tx-review, address-safety, web sweep/wallet/pay flows, registry view | None |
| supply-chain-ci | `.github/workflows`, `scripts/`, Dockerfiles, lockfile (offline) | None |
| privacy-e2e | keygen, invoice, payment, announcement, scan, sweep (direct and relayer), BTC SP tab, scheme-2, Tron key reuse | None |
| docs-claims | README.md, SECURITY.md, docs/user/**, docs/operators/**, sample of package READMEs/DEVIATIONS, checked against code | None |

### 1.2 Agents and models

- One AI subagent reviewed each of the 12 areas and wrote `docs/audits/05/<area>.md` (except docs-claims).
- Separate AI "skeptic" subagents re-checked each Critical, High and Medium candidate against the snapshot code.
- An AI audit-lead agent wrote this consolidation. It did no new code review.
- All agents are Anthropic Claude model instances running in Claude Code; the lead ran on Claude Opus 5.5. The input data does not record which model each area or skeptic agent used.
- No human security reviewer has signed off on any finding.

### 1.3 Verification procedure (skeptic votes)

1. An area agent reports each finding with a severity, file:line, exploit and recommendation.
2. Each Critical/High/Medium candidate gets 1-2 skeptic agents. Each one re-reads the cited code, tries to refute the finding, and votes `refuted: true/false`. A voter may also propose a different severity.
3. Rules this report applies:
   - **Refuted** if any vote refutes the mechanism. No finding met this (section 6).
   - **Severity after verification**:
     - If every vote that gives a severity gives a lower one, that lower value applies.
     - A vote with no severity counts as accepting the original.
     - If the voters split, the original stays and the entry is marked `disputed`.
   - **Status**:
     - `confirmed`: mechanism upheld and original severity kept.
     - `disputed`: mechanism upheld but severity lowered or split. The original severity is shown.
     - `unverified`: Low/Info items reported by area agents that no skeptic checked.
4. Cross-dedupe. These overlapping findings were merged, and the merged entry keeps the higher verified severity:
   - CHAIN-ADAPTERS-05 into WEB-APP-01
   - SUPPLY-CHAIN-CI-03 into WEB-APP-03
   - CHAIN-ADAPTERS-06 into WEB-APP-04
   - DOCS-CLAIMS-03 into PRIVACY-E2E-04
   - WEB-APP-09 into BITCOIN-03
   - SOLANA-TRON-12 into SOLANA-TRON-04
   - CRYPTO-CORE-06 into WEB-APP-08

   That turns 132 raw IDs into 125 entries.

---

## 2. Executive summary

### 2.1 Counts (after verification and dedupe; 125 entries)

| Severity | confirmed | disputed | unverified | Total |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | **0** |
| High | 1 | 1 | 0 | **2** |
| Medium | 15 | 1 | 0 | **16** |
| Low | 0 | 20 | 66 | **86** |
| Info | 0 | 0 | 21 | **21** |
| Total | 16 | 22 | 87 | 125 |

Notes:
- Verified (Critical/High/Medium) candidates: 41 raw, 38 after merges. None refuted. Skeptics lowered the severity of 22 of the 38, and the merges absorbed 2 more lowered items.
- Area agents reported 0 Critical findings before verification.
- CONTRACTS-POOLS-01 was reported as High. Both skeptics rated it Medium, so it counts as Medium (disputed). It is still the highest-value economic issue found, and section 4 covers it in full.

### 2.2 Top risks in plain language

1. **PayJoin receiver can be made to burn its own money (BITCOIN-01, High).** A hostile sender lies about input amounts. The receiver then pays up to about a third of one of its UTXOs as miner fee. Library only, testnet only, but a real loss of funds if it ever gets used.
2. **One Solana payment can be counted many times (SOLANA-TRON-01, High).** Repeating the announcement memo in one transaction makes the scanner report the same payment up to about 18 times. A merchant that sums detections over-credits.
3. **Gas sponsor deposit can be drained (CONTRACTS-POOLS-01, Medium, originally High).** A paymaster signature works for anyone, and the attacker picks the gas fields. In the PoC the attacker took 89x the real cost from the paymaster deposit.
4. **Payment detection can stop or silently skip money (CHAIN-ADAPTERS-01/02/03, WEB-APP-04):**
   - announcer spam halts scanning for every seller;
   - a lying RPC can move the saved checkpoint past real payments;
   - pending payments vanish on resume;
   - the checkpoint is not bound to the key set.
5. **Duplicate payment after an error (WEB-APP-02).** If verification fails after the wallet broadcast, the UI says "Nothing was sent" and re-enables Send.
6. **Privacy leaks to infrastructure (PRIVACY-E2E-01/02/03/04):**
   - BTC scan tells the Esplora server exactly which outputs are the user's;
   - EVM scan reveals matches to the RPC (a regression from the S3-02 fix);
   - BTC sweep merges all payments into one transaction by default;
   - the documented "used destination" warning does not exist.
7. **Relayer availability and economics (RELAYER-01/03, CONTRACTS-POOLS-02):**
   - about 20 IPs can exhaust the global quote budget;
   - reverting sweeps fill the serial lane;
   - the pool relayer pays for unbounded recipient gas (6x priced gas in the PoC).
8. **Trust in deployment manifests (WEB-APP-01).** Pay and Sweep use a manifest that is unsigned and never read back from chain. Testnets only today.
9. **Untested fund-holding contracts in CI (SUPPLY-CHAIN-CI-04).** pool-contracts, payer-hiding-contracts and pool-circuits/foundry run in no CI job.

No path to the relayer hot key or to user funds through the relayer was found. Neither the contracts-core area nor the crypto-core area had a Critical, High or Medium finding.

---

## 3. Findings table

Severity is after verification. "Orig" is the area agent's severity where it differs. Line numbers are as reported against `88de001`.

### 3.1 Verified (Critical/High/Medium candidates)

| ID | Sev | Orig | Status | Area | File:line | Summary |
|---|---|---|---|---|---|---|
| BITCOIN-01 | High | | confirmed | bitcoin | packages/btc-payjoin/src/receiver/contribute.ts:171,192-199,225-238,271-277,297-299 | PayJoin receiver trusts sender-claimed witness_utxo amounts; hostile sender forces about a 1/3 UTXO fee burn |
| SOLANA-TRON-01 | High | | disputed (1 of 2 voters rated Medium) | solana-tron | packages/solana-stealth/src/scan.ts:41-54,93-102,160-185 | Duplicate memos in one tx multiply the detected payment |
| CONTRACTS-POOLS-01 | Medium | High | disputed | contracts-pools | packages/payer-sponsor/src/sponsor/service.ts:283-293,430-437; GhostPayVerifyingPaymaster.sol:75-128 | Portable paymaster signature and attacker-chosen gas fields; self-bundle drains deposit |
| CONTRACTS-POOLS-02 | Medium | | confirmed | contracts-pools | packages/pool-relayer/src/chain.ts:87-95; service.ts:223-227,249-260 | Relayer gas griefing: no cap on simulated gas relative to fee |
| CHAIN-ADAPTERS-01 | Medium | | confirmed | chain-adapters | packages/chain-adapters/src/logs.ts:196-203; rpc.ts:117-120,206 | Scanner halts forever on RESPONSE_TOO_LARGE (announcer spam) |
| CHAIN-ADAPTERS-02 | Medium | | confirmed | chain-adapters | packages/chain-adapters/src/logs.ts:178-188,224-235; apps/web/src/lib/scanClient.ts:197 | Lying RPC head poisons persisted checkpoint |
| CHAIN-ADAPTERS-03 | Medium | | confirmed | chain-adapters | apps/web/src/lib/scanClient.ts:150-197; scanVerify.ts:72-73 | Pending payments vanish on resume; reorg result ignored |
| WEB-APP-02 | Medium | | confirmed | web-app | apps/web/src/views/Pay.tsx:313-317; lib/payExec.ts:44-61 | Post-broadcast error says "Nothing was sent", re-enables Send |
| RELAYER-01 | Medium | | confirmed | relayer | apps/relayer/src/server.ts:120-123,272-281 | Global quote budget drained by about 20 IPs denies all sweeps |
| RELAYER-03 | Medium | | confirmed | relayer | apps/relayer/src/service.ts:315-331,436-448 | Serial lane and RPC exhausted by reverting sweeps from minted owners |
| BITCOIN-02 | Medium | | confirmed | bitcoin | packages/btc-silent-payments/src/scan/scanner.ts:61-63,67-75 | Output metadata keyed by x-only key (last wins) hides real payment |
| WALLET-SAFETY-02 | Medium | | confirmed | wallet-safety | packages/address-safety/src/meta.ts:1; apps/web/src/views/Pay.tsx:396 | node:crypto used in browser Pay render |
| SUPPLY-CHAIN-CI-04 | Medium | | confirmed | supply-chain-ci | .github/workflows/ci.yml:180-289 | pool-contracts, payer-hiding-contracts and pool-circuits/foundry are in no CI job |
| PRIVACY-E2E-01 | Medium | | confirmed | privacy-e2e | apps/web/src/features/btc/scan.ts:40,77-82; esplora.ts:195-199 | BTC scan sends every matched outpoint to Esplora; UI claims heights only |
| PRIVACY-E2E-02 | Medium | | confirmed | privacy-e2e | packages/chain-adapters/src/scanVerify.ts:32-45,60-74; scanClient.ts:159-169 | EVM scan leaks matches to the RPC (S3-02 regression) |
| PRIVACY-E2E-03 | Medium | | confirmed | privacy-e2e | apps/web/src/features/btc/BtcView.tsx:113; sweep.ts:31-60 | BTC sweep pre-selects and consolidates all outputs |
| PRIVACY-E2E-04 (+DOCS-CLAIMS-03) | Medium | | confirmed | privacy-e2e / docs | apps/web/src/views/Sweep.tsx:87,96,106,128-130; lib/sweep.ts:70-73; docs/user/sweep-and-gas-privacy.md:8,12 | Documented destination-reuse warning does not exist (describeDestination dead) |
| DOCS-CLAIMS-01 | Medium | | confirmed | docs-claims | README.md:28,31-33,42,106-107; apps/web/README.md:3 | README says BTC, secret-box, tx-review and address-safety are unwired; web app imports them |
| CONTRACTS-POOLS-03 | Low | Medium | disputed | contracts-pools | packages/payer-sponsor/src/sponsor/service.ts:404-439,457-475 | PH-4 simulation blind to inner failure; no sender balance pre-check |
| CHAIN-ADAPTERS-04 | Low | Medium | disputed | chain-adapters | packages/chain-adapters/src/scanVerify.ts:35-41,72-80 | "verified" for non-allowlisted attacker tokens; replay duplicates |
| WEB-APP-01 (+CHAIN-ADAPTERS-05) | Low | Medium | disputed | web-app / chain-adapters | apps/web/src/lib/defaultServices.ts:27; views/Scan.tsx:66; lib/pay.ts:93-137,219-232; apps/relayer/src/config.ts:211; packages/ops-monitor/src/cli.ts:91 | Pay, Sweep, Create, relayer and ops-monitor trust an unsigned, chain-unverified manifest |
| WEB-APP-03 (+SUPPLY-CHAIN-CI-03) | Low | Medium | disputed | web-app / supply-chain | apps/web/src/lib/settings.ts:27,66-110; lib/idbStore.ts:3,24 | Path-scoped GitHub Pages shares origin storage with sibling sites |
| WEB-APP-04 (+CHAIN-ADAPTERS-06) | Low | Medium | disputed | web-app | apps/web/src/views/Scan.tsx:20,27,58,78-93; lib/scanClient.ts:176,195,220 | Checkpoint not bound to key/RPC; resume default; second provider not wired |
| RELAYER-02 | Low | Medium | disputed | relayer | apps/relayer/src/service.ts:286,436-459 | Fee never rechecked against gas at send (RL-03 open) |
| RELAYER-04 | Low | Medium | disputed | relayer | apps/relayer/src/service.ts:483-491 | Loss budget charges third-party front-runs to innocent keys |
| RELAYER-05 | Low | Medium | disputed | relayer | apps/relayer/src/service.ts:465-482 | Chain stall leaks daily budget; breaker stays closed (RL-04) |
| RELAYER-07 | Low | Medium | disputed | relayer | packages/ops-monitor/src/cli.ts:43,190-196 | ops-monitor fails silently on fatal config |
| BITCOIN-03 (+WEB-APP-09) | Low | Medium | disputed | bitcoin / web-app | apps/web/src/features/btc/esplora.ts (verifier: :175,213-215,264-265) | Esplora fully trusted; can fabricate incoming payments |
| SOLANA-TRON-02 | Low | Medium | disputed | solana-tron | packages/tron-adapter/src/scan.ts:144 | TRON trustedToken fail-open when trustedTokens unset |
| SOLANA-TRON-03 | Low | Medium | disputed | solana-tron | packages/tron-adapter/src/tx.ts:140-182 | decodeRawTx first-wins vs java-tron last-wins; call_value ignored |
| SOLANA-TRON-04 (+SOLANA-TRON-12) | Low | Medium | disputed | solana-tron | packages/tron-adapter/src/fees.ts:1-10 | TRC-20 sweep needs linking TRX funding; ADR-0019 missing |
| WALLET-SAFETY-01 | Low | Medium | disputed | wallet-safety | apps/web/src/views/Sweep.tsx:87,96,106; lib/sweep.ts:55,63,71 | Sweep poisoning check compares against nothing the user owns |
| WALLET-SAFETY-03 | Low | Medium | disputed | wallet-safety | apps/web/src/features/registry/RegistryView.tsx:142,223 | Registry lookup non-strict parse; overstated authenticity |
| SUPPLY-CHAIN-CI-01 | Low | Medium | disputed | supply-chain-ci | .github/workflows/release.yml:30-46 | Tag signature check is a forgeable grep |
| SUPPLY-CHAIN-CI-02 | Low | Medium | disputed | supply-chain-ci | .github/workflows/pages.yml:10-12,37,55-74 | pages.yml auto-deploys main, contrary to policy |
| SUPPLY-CHAIN-CI-05 | Low | Medium | disputed | supply-chain-ci | apps/relayer/Dockerfile:5,8,15 | Mutable base images; ineffective .dockerignore; relayer image unattested |
| SUPPLY-CHAIN-CI-06 | Low | Medium | disputed | supply-chain-ci | scripts/testnet/verify-sources.sh:126-136,145 | eval of unvalidated manifest strings |
| DOCS-CLAIMS-02 | Low | Medium | disputed | docs-claims | README.md:13; packages/chain-adapters/src/config/chains.ts:34-40 | Docs say 2 testnets enabled; code enables 7 |

### 3.2 Low and Info (unverified)

Section 7 lists these. All 87 are `unverified`: area agents reported them and no skeptic re-checked them.

---

## 4. Detailed write-ups: High, and items originally reported High

### 4.1 BITCOIN-01: PayJoin receiver trusts sender-claimed input amounts (High, confirmed)

**Where:**
- `packages/btc-payjoin/src/receiver/contribute.ts:171,192-199,225-238,271-277,297-299`
- `packages/btc-payjoin/src/receiver/checks.ts:78,86-89`
- `packages/btc-payjoin/src/psbt.ts:95`

**Description:**
- `checkOriginal` computes the original fee F0 from `witness_utxo` amounts that nobody checks (`psbt.ts:95`).
- `buildProposal` sizes the receiver's fee share as `own = ceil(F0*vi/V0) - sc` and takes it out of the payment output.
- Nothing ties the claimed amounts to the chain. Interactive mode checks nothing, and `testMempoolAccept` returns only a bool.
- A segwit-v0 receiver input's BIP-143 signature commits only to its own amount. The final tx therefore stays valid, with a real fee of `F0_real + own`.

**Exploit:**
1. The sender has one real P2WPKH input of 100000 sat. Original fee 141 sat; invoice 10000.
2. The sender sets `witness_utxo.amount=790344` and adds no fee output.
3. The receiver holds UTXOs of 50000 and 1000000. extra is about 333000, so the 50000 UTXO is filtered out (`u <= 3*extra`) and the 1000000 UTXO is chosen.
4. own=333000. The payment output of 677000 passes the `>=` check, and the receiver signs.
5. The attacker signs with the real amount and broadcasts with `maxfeerate=0`.
6. On-chain fee is 333141 sat, so the receiver loses 333000 sat to miners.
7. In non-interactive mode this repeats without limit using fresh sender outpoints.

**Recommendation:**
- Look up the sender's prevouts on the receiver's own node (`gettxout`, or compare `testmempoolaccept` `fees.base` with `psbtFee`) and reject mismatches.
- Cap the receiver's fee share absolutely, e.g. `own <= ceil(maxPolicyFeerate*vi)`, not in proportion to the claimed F0.
- Add a regression test with an inflated `witness_utxo`.

**Verification notes:**
- 2 of 2 skeptics: not refuted, no severity change. Both traced `psbtFee(tx)` with no prevOuts argument. Neither found any chain lookup or max-fee cap in src; the only cap is `maxadditionalfeecontribution`.
- Nobody ran a PoC. The snapshot has no `node_modules`.
- Exposure today: `btc-payjoin` is library-only and testnet-only.
- Related: BITCOIN-04 is the mirror issue on the sender side.

### 4.2 SOLANA-TRON-01: Duplicate announcement memos multiply the detected payment (High, disputed)

**Where:** `packages/solana-stealth/src/scan.ts:41-54,93-102,160-185`

**Description:**
- `memosOf` returns every top-level memo.
- `fetchAnnouncements` yields one record per memo.
- `scanAnnouncements` recomputes the same P for each record and reports the whole-tx credit from `creditsFor(tx,P)`.
- Nothing dedupes by `(signature, P)`. `adapter.ts:110-118` passes the stream through unchanged.

**Exploit:**
1. The payer sends one tx: `System.Transfer(payer->P, 1 SOL)` plus k copies of `Memo('gpst1:'+base58(R||tag))`. About 18 copies fit in 1232 bytes.
2. The scanner yields k detections, each with `lamportsReceived = 1 SOL`.
3. A merchant that sums detections credits k SOL.
4. SPL tokens behave the same way via `tokenReceipts`.

**Recommendation:** Dedupe on `(signature, stealthAddress)` in `scanAnnouncements`, or accept only one announcement per tx. Add a regression test.

**Verification notes:**
- 2 skeptics, both not refuted. One accepted High; one proposed Medium. Following the rules in 1.3, High is kept and marked disputed.
- The package is not wired into the app at this commit. Consumers of the library are exposed.

### 4.3 CONTRACTS-POOLS-01: Portable paymaster signature drains deposit (Medium after verification; originally High; disputed)

**Where:**
- `packages/payer-sponsor/src/sponsor/service.ts:283-293,430-437`
- `packages/payer-hiding-contracts/src/GhostPayVerifyingPaymaster.sol:75-128` (getHash `104-128`)

**Description:**
- `sponsorUserOp` returns a paymaster signature that anyone can use until the quote TTL expires.
- `getHash` binds sender, nonce, initCode, callData, gas limits, preVerificationGas, gasFees, paymaster gas, chain and validUntil. It binds neither the bundler nor the `handleOps` beneficiary.
- `checkUserOp` caps only `(vgl+cgl+pvg+250k)*maxFee <= 0.1 ETH`.
  - It never compares fees with the live gas price.
  - It never bounds pvg.
- EntryPoint v0.7 pays the beneficiary `actualGasCost`, at `min(maxFee, maxPriorityFee+basefee)` plus the full pvg, out of the paymaster deposit.

**Exploit (PoC `packages/payer-hiding-contracts/test/audit05/PaymasterSelfBundle.t.sol`, real EntryPoint v0.7.0, basefee 1 gwei):**
1. Get a quote. Build the expected 4-call batch with maxFee = maxPriorityFee = 90 gwei, vgl=500k, cgl=200k, pvg=50k. This passes the 0.1 ETH cap.
2. Get the paymaster signature from `/v1/sponsor-userop`. Owner-sign the op.
3. Call `EntryPoint.handleOps([op], attacker)` directly.
4. Real cost 0.00064 ETH; the attacker received 0.0570 ETH, all from the paymaster deposit (89x).
5. A market-fee variant (maxFee 2 gwei, pvg 5M) got 17x.

The loss budget and the breaker are bypassed because the sponsor never sends the tx.

**Recommendation:**
- Service:
  - require `maxFeePerGas <= k * live gas price`;
  - cap `maxPriorityFeePerGas`;
  - bound pvg by a limit derived from calldata.
- Contract: add immutable caps on maxPriorityFee, maxFee and pvg inside `validatePaymasterUserOp`.
- Shorten signature validity to minutes.
- Add the balance pre-check from CONTRACTS-POOLS-03.

**Verification notes:**
- 2 of 2 skeptics: mechanism real; both rated it Medium. The vote text is truncated in the input, so it does not say why.
- The lead flags this as **the largest direct fund-loss path in EVM code**, whatever the label. Fix it at P0 before any sponsored use with real funds.

---

## 5. Medium findings (condensed)

**CONTRACTS-POOLS-02: pool-relayer gas griefing.**
- Cause:
  - `chain.ts:87-95` sets gas to 1.2 times the estimate, with no cap;
  - the fee is priced for 600k gas (config.ts DEFAULTS);
  - `GhostPayShieldedPoolNative.sol:28-37` forwards all gas to the recipient;
  - only mined reverts are charged to the loss budget.
- PoC: `packages/pool-contracts/test/audit05/RelayerGasGrief.t.sol` used 3,652,993 gas against 600,000 priced. Repeated requests drain the hot key until the breaker trips, which is a DoS.
- Fix:
  - reject when simulated gas exceeds `gasEstimate*(1+slack)`;
  - set gas to `min(sim*1.2, cap)`;
  - charge `gasUsed*price - fee` on every relay;
  - optionally bound the recipient stipend.
- Verifier: Medium.

**CHAIN-ADAPTERS-01: scan halts on large log responses.**
- Cause:
  - `logs.ts:196-203` halves the window only on -32602/-32005;
  - `RESPONSE_TOO_LARGE` (2 MiB, `rpc.ts:119`) is rethrown even at a 1-block window;
  - the cap is not configurable from `apps/web/src/lib/defaultServices.ts:28`;
  - `logs.test.ts:189` asserts this behaviour as intended.
- Exploit: `announce` is permissionless. About 2000 spam logs in one block stop every web seller's scan for good.
- Fix: treat it as a range error and halve the window; page or stream at 1 block; expose `maxResponseBytes`.

**CHAIN-ADAPTERS-02: lying RPC head poisons the checkpoint.**
- Cause:
  - `logs.ts:187-188` uses an unbounded `blockNumber()`;
  - a fabricated block hash is stored as the checkpoint (`logs.ts:231-236`);
  - `scanClient.ts:195` persists it to localStorage;
  - rollback after a hash mismatch covers only `finalityDepth` blocks.
- Effect: after switching to an honest RPC, payments in the skipped range stay invisible until the user clears the checkpoint by hand.
- Fix:
  - bound head against the cursor and wall-clock time;
  - rewind cursors above head;
  - require 2 providers to agree before saving.

**CHAIN-ADAPTERS-03: pending payments vanish on resume.**
- Cause:
  - `scanClient.ts:193-195` saves `nextBlock=head+1`;
  - pending matches within `finalityDepth` live only in memory;
  - `res.reorg` changes only `pageFrom`, and stale matches are not pruned.
- Fix:
  - checkpoint at `head-finalityDepth`;
  - dedupe by id;
  - prune on reorg;
  - re-verify retained matches.
- Verifier upheld the "pending" half.

**WEB-APP-02: duplicate payment after a post-broadcast error.**
- Cause:
  - `Pay.tsx:313-317` resets phase to `prepared` and drops the hash after `submitTx` (`payExec.ts:44-61`) throws in `verifySubmission`/`pollReceipt`;
  - the message reads "Something went wrong. Nothing was sent." (`errors.ts:42`).
- Exploit: native-token invoice and a flaky RPC. The user clicks Send again and pays twice. Tokens are hit too when an existing allowance is at least 2x gross.
- Fix: keep the hash and move to a terminal "submitted, verification failed" state.

**RELAYER-01: global quote budget DoS.**
- Cause: `server.ts:272-281` charges the global bucket (600/min, burst 100) before content-type and body validation. The per-IP limit is 30/min.
- Exploit: about 20 IPv4 addresses, or one IPv6 /48, return `rate_limited_global` to everyone. Sweeps stop once tokens expire after 120s.
- Fix:
  - charge after validation;
  - reserve a share per source class;
  - recompute the fee at sweep time;
  - alert on `rate_limited_global`.

**RELAYER-03: lane and RPC exhaustion.**
- Cause:
  - owners are free to mint (6/min, burst 3, `config.ts:365`);
  - there is no balance or nonce pre-check before `rt.lane.submit` (`service.ts:331`);
  - each job makes 3-4 RPC calls in a single serial lane (maxPending 16).
- Exploit: about 6 IPs keep the queue full, so honest users get `queue_full`.
- Fix:
  - cheap `eth_call` precheck outside the lane;
  - per-IP in-flight cap;
  - dedupe `(owner,nonce)`.

**BITCOIN-02: duplicate x-only key hides the real payment.**
- Cause: `scanner.ts:61-62` `byKey.set(toHex(xonly), o)` keeps only the last output with a given key.
- Exploit: a later tx in the same block pays 330 sat to the same P. The app lists and sweeps only the dust. After that, rescans count the real output as spent.
- Fix: map each key to a list of outputs, or scan per transaction.

**WALLET-SAFETY-02: node:crypto in the browser.**
- Cause:
  - `packages/address-safety/src/meta.ts:1` imports `createHash` from `node:crypto`;
  - `displayText.ts:37` calls it during Pay render (`Pay.tsx:396`), with no guard;
  - `apps/web/vite.config.ts` has no polyfill, and vitest runs with env `node`, so tests hide it.
- Effect: build error or runtime TypeError expected; not built to confirm. The seller fingerprint is then unavailable or the review view crashes.
- Fix: use `@noble/hashes` sha256 and add a browser test.

**SUPPLY-CHAIN-CI-04: fund-holding contracts outside CI.**
- Cause:
  - `.github/workflows/ci.yml:180-289` covers only `packages/contracts`;
  - pool-contracts and payer-hiding-contracts have foundry tests (ForgedProof, invariant, fuzz) but no CI job;
  - pool-circuits runs only vitest.
- Fix: add forge test/fmt/Slither/`check:verifiers` jobs and gate releases on them.

**PRIVACY-E2E-01: BTC outspend leak.**
- Cause:
  - `scan.ts:79-82` calls `isUnspent` only for matched outputs;
  - each call is a `GET /tx/:txid/outspend/:vout` to the user-chosen Esplora (`esplora.ts:195-199`);
  - `BtcView.tsx:187` claims the server sees only heights.
- Effect: the operator learns every received output, tied to the client IP, which removes BIP-352 light-client unlinkability. High once mainnet is enabled.
- Fix:
  - derive spentness locally, or query whole txs or a decoy set;
  - correct the UI text.

**PRIVACY-E2E-02: EVM scan verification leak (S3-02 regression).**
- Cause:
  - `scanClient.ts:159-169` calls `verifyReceipt` for every match;
  - every match adds one `eth_blockNumber` call;
  - non-router matches add balance reads of the stealth address (`scanVerify.ts:63,70-73`).
- Effect:
  - the RPC can count matches;
  - for direct announcements the RPC learns the exact addresses;
  - the docs (privacy-limits, THREAT_MODEL 3.3) say otherwise.
- Fix:
  - verify on demand;
  - fetch head once per page;
  - update the docs.

**PRIVACY-E2E-03: BTC consolidation by default.**
- Cause: `BtcView.tsx:113` selects all found outputs, and `sweep.ts:31-60` builds a single multi-input tx with no linkage warning.
- Conflicts with the project's own guidance at `anonymization-research.md:417,526`.
- Fix:
  - default to no selection or a single output;
  - warn on more than one input;
  - optionally enforce one input per sweep.

**PRIVACY-E2E-04 (+DOCS-CLAIMS-03): promised destination-reuse warning missing.**
- What the docs claim:
  - `docs/user/sweep-and-gas-privacy.md:8` says "The app warns when the destination looks used";
  - line 12 says the warning is in progress, which contradicts line 8.
- What the code does:
  - `describeDestination` (`lib/sweep.ts:71`) is called only in tests;
  - `Sweep.tsx:87,96,106` pass no `known` list;
  - `Sweep.tsx:129` shows only a static notice.
- Fix: keep an encrypted list of used destinations and warn on reuse, or remove the claim.
- Verifiers: DOCS-CLAIMS-03 voter kept Medium; PRIVACY-E2E-04 voter proposed Low. The merged entry keeps Medium.

**DOCS-CLAIMS-01: wiring claims are false.**
- What the docs claim:
  - `README.md:42` "Nothing else is imported by either app";
  - `README.md:28,106-107`: btc-silent-payments unwired;
  - `README.md:31-33`: secret-box, tx-review and address-safety unwired;
  - `apps/web/README.md:3` and `packages/address-safety/DEVIATIONS.md:3` say the same.
- What the code does:
  - `App.tsx:36-37` routes `btc`;
  - `features/btc/{sweep,wallet,scan,esplora}.ts` import btc-silent-payments;
  - `session.ts:12` imports SecretBox;
  - `txGuard.ts:13` and `sweep.ts:18` import tx-review;
  - `sweep.ts:16` and `displayText.ts:1` import address-safety.
- Risk: reviewers may leave the BTC signing path and the key holder out of scope.
- Fix: regenerate the wiring table from the real imports.

---

## 6. Refuted findings

**No finding in the verified set was refuted.** All 41 Critical/High/Medium candidates passed the mechanism check. Skeptics lowered the severity of many of them (see the "Orig" column in 3.1). The workflow output given to the audit lead holds no candidate that was dropped as refuted. If area agents threw away candidates themselves before verification, those are in the per-area reports and not here.

Notable severity disputes, with skeptic reasons (abridged):
- CONTRACTS-POOLS-03 (Medium to Low): mechanism holds, but damage is bounded by the per-bucket and global loss budget.
- CHAIN-ADAPTERS-04 (Medium to Low): the UI flags "unlisted token" as a caveat.
- WEB-APP-01 / CHAIN-ADAPTERS-05 (Medium to Low): testnet only; non-test chains fail closed without a release key.
- WEB-APP-03 (Medium to Low): the prototype has no manifest and its flows are disabled.
- RELAYER-04 (Medium to Low): documented S3-06 design; the loss budget exists to cap unreimbursed gas.
- RELAYER-07 (Medium to Low): "RPC down at start" is wrong. `run.ts:15-24` turns a failed probe into a warn finding that is exported. Only fatal config errors exit early.
- BITCOIN-03 (Medium to Low): the cited lines do not exist in the snapshot (`esplora.ts` has 297 lines). The verifier re-anchored it to `esplora.ts:175,213-215,264-265`.
- SOLANA-TRON-02/03/04 (Medium to Low): TRON mainnet disabled (`adapter.ts:~22`); not wired into the app.
- SUPPLY-CHAIN-CI-01 (Medium to Low): the human environment approval still gates release.
- SUPPLY-CHAIN-CI-02 (Medium to Low): Pages is not enabled in repo settings.
- SUPPLY-CHAIN-CI-06 (Medium to Low): `schema.json` pattern-constrains fields, but nothing validates them in CI.
- DOCS-CLAIMS-02 (Medium to Low): no manifests exist for the 5 extra testnets, so payments stay disabled.

---

## 7. Low and Info (unverified; 87 entries)

Merged IDs are noted. Details are in `docs/audits/05/<area>.md`.

**contracts-core:**
- CONTRACTS-CORE-01 (L) `packages/contracts/src/GhostPayPolicyRouter.sol`: gas buffer is stuck in PolicyAccount when the limits tree has no native leaf. Forge PoC passes.
- CONTRACTS-CORE-02 (L) `packages/contracts/src/GhostPayRouter.sol`: `payERC20WithBuffer` sends native value with no fee and no metadata, under an announcement that names the router as caller. Forge PoC passes.
- CONTRACTS-CORE-03 (I) `PolicyAccountFactory.sol`: accepts a FEE_TOKEN with no code (C-06 carry-over).
- CONTRACTS-CORE-04 (I) `script/SmokeSepolia.s.sol`: no scheme-2 smoke check.

**contracts-pools:**
- CONTRACTS-POOLS-04 (L) `packages/pool-relayer/src/service.ts`: no in-flight dedupe, unbounded lane queue, pairing check runs per request.
- CONTRACTS-POOLS-05 (L) `packages/external-pools/src/vault.ts`: record rollback and deletion go undetected.
- CONTRACTS-POOLS-06 (L) `packages/external-pools-railgun/src/adapter.ts`: only the unshield leg is validated; the code-hash pin skips the proxy implementation.
- CONTRACTS-POOLS-07 (I) `packages/pool-sdk/src/wire.ts`: HTTP 500 for an out-of-range deadline.
- CONTRACTS-POOLS-08 (I) `packages/pool-sdk/src/flows.ts`: SDK max fee of 1000 bps is looser than the 500 bps cap.
- CONTRACTS-POOLS-09 (I) `packages/pool-circuits/scripts/ceremony-dev.sh`: dev-ceremony verifier keys are forgeable (C-1/PC-01, unchanged).

**crypto-core:**
- CRYPTO-CORE-01 (L) `packages/secret-box/src/secretBox.ts`: no stuck-RNG check; an all-zero pool seed is possible.
- CRYPTO-CORE-02 (L) same file: `assertNoSecretBox` lets SecretScalar through and has no production callers.
- CRYPTO-CORE-03 (L) same file: `use`/`useAsync` return a zeroed buffer when the callback returns the lent view.
- CRYPTO-CORE-04 (I) `packages/core-crypto/src/stealth.ts`: hex and bigint copies of secrets undercut zeroize.
- CRYPTO-CORE-05 (I) `test-vectors/generate.mjs`: single-oracle vectors (ScopeLift SDK only).
- CRYPTO-CORE-07 (I) `stealth.ts`: `parseAnnouncement` decodes metadata of any length.
- (CRYPTO-CORE-06 merged into WEB-APP-08.)

**chain-adapters:**
- CHAIN-ADAPTERS-07 (L) `deploymentsSignature.ts`: no freshness or rollback protection; key-override footgun; invalid signature ignored when no key is set.
- CHAIN-ADAPTERS-08 (L) `deploymentsVerify.ts`: policy section only code-hash checked; implementation can mismatch the factory.
- CHAIN-ADAPTERS-09 (L) `packages/policy-scheme/src/router.ts`: `decodePolicyPaymentCalldata` checks only the stealth/policy binding.
- CHAIN-ADAPTERS-10 (L) `deployments.ts`: validator and helper gaps:
  - impossible dates accepted;
  - unbounded decimals;
  - optional deadline;
  - NaN retries;
  - private RPC hosts allowed;
  - Referer leakage.
- CHAIN-ADAPTERS-11 (L) `apps/web/src/lib/pay.ts`: seller controls the quote staleness window; no sequencer or deviation guard; finality counted in blocks, not time.
- CHAIN-ADAPTERS-12 (I) `adapter.ts`: dead `adapter.scan` paths; announcer not code-pinned; deployTx unverified; signing builders uncapped.
- (CHAIN-ADAPTERS-05 merged into WEB-APP-01; CHAIN-ADAPTERS-06 merged into WEB-APP-04.)

**web-app:**
- WEB-APP-05 (L) `views/Scan.tsx`: matches relabelled with the selected chain (S3-15 not fixed).
- WEB-APP-06 (L) `App.tsx`: a hash change mid-flow leaves a stale prepared payment.
- WEB-APP-07 (L) `lib/session.ts`: `requireSession` leaves plaintext scalars on the heap.
- WEB-APP-08 (+CRYPTO-CORE-06) (L) `lib/session.ts`, `packages/invoice-schema/src/schema.ts`: signing-key separation not enforced; idle lock does not wipe keys.
- WEB-APP-10 (I) `index.html`: thin hosting-dependent hardening (S3-11); no Trusted Types.
- WEB-APP-11 (L) `lib/keystore.ts`: import allows about 2 GiB scrypt memory from an 8 KiB file (S3-13).
- (WEB-APP-09 merged into BITCOIN-03.)

**relayer:**
- RELAYER-06 (L) `apps/relayer/src/service.ts`: RPC outage never opens the breaker; healthz stays ok.
- RELAYER-08 (L) `packages/ops-monitor/src/w1.ts`: W1/W2/W5 use the first RPC only; W6 skips code and getters.
- RELAYER-09 (L) `ops-monitor/src/cli.ts`: W4 is dead but reports "losses within limits".
- RELAYER-10 (L) `ops-monitor/src/fetcher.ts`: unbounded body read; narrow W3 coverage.
- RELAYER-11 (L) `apps/relayer/src/server.ts`: malformed request target gives 500 (RL-08).
- RELAYER-12 (L) `apps/relayer/src/secrets.ts`: key-handling residuals (RL-09, S3-18, S3-21).
- RELAYER-13 (L) `packages/relayer-guard/src/limiter.ts`: overflow bucket can be forced from many /64s (M-3/L-8).
- RELAYER-14 (L) `service.ts`: every mined revert is neutral for the breaker.
- RELAYER-15 (I) `apps/relayer/PRIVACY.md`: drift from code.
- RELAYER-16 (I) `apps/relayer/src/validate.ts`: quote expiry accepts leading zeros.

**bitcoin:**
- BITCOIN-04 (L) `packages/btc-payjoin/src/sender/checks.ts`: receiver can redirect the sender's fee contribution via an inflated witness_utxo (extends PJ-04).
- BITCOIN-05 (L) `packages/btc-silent-payments/src/receiver.ts`: scan stops at the first missing k.
- BITCOIN-06 (L) `apps/web/src/features/btc/BtcView.tsx`: broadcast uses the current URL field with no network check.
- BITCOIN-07 (I) `sender/checks.ts`: receiver input script type not checked.
- BITCOIN-08 (I) `packages/btc-payjoin/src/uri.ts`: untrusted `pj=` may target loopback over http.

**solana-tron:**
- SOLANA-TRON-05 (L) `packages/solana-stealth/src/scan.ts`: arbitrary SPL mints reported with no trust signal.
- SOLANA-TRON-06 (L) `solana-stealth/src/tx.ts`: Token-2022 extension mints not rejected.
- SOLANA-TRON-07 (L) `packages/tron-adapter/src/scan.ts`: hashes `raw_data_hex` but reads fields from unbound JSON.
- SOLANA-TRON-08 (L) `tron-adapter/src/rpc.ts`: `getBlockRange` accepts gaps and empty pages.
- SOLANA-TRON-09 (L) `solana-stealth/src/tx.ts`: `memoProgram` override unvalidated.
- SOLANA-TRON-10 (L) `solana-stealth/src/scan.ts`: memo spam slows the scan; hard-fails at the page cap.
- SOLANA-TRON-11 (I) `tron-adapter/src/meta.ts`: no network binding; reuses EVM keys.
- (SOLANA-TRON-12 merged into SOLANA-TRON-04.)

**wallet-safety:**
- WALLET-SAFETY-04 (L) `apps/web/src/lib/sweep.ts`: guards compare against intent built from the same variables; feeTo policy is tautological.
- WALLET-SAFETY-05 (L) `lib/txGuard.ts`: simulation fails open and trusts the RPC.
- WALLET-SAFETY-06 (L) `lib/sweep.ts`: direct-sweep fees come from untrusted `eth_gasPrice`.
- WALLET-SAFETY-07 (L) `packages/tx-review/src/review.ts`: destination policy inconsistent across sweep paths.
- WALLET-SAFETY-08 (L) `lib/wallet.ts`: wallet names unsanitised (S3-22).
- WALLET-SAFETY-09 (L) `packages/address-safety/src/text.ts`: sanitiser coverage gaps.
- WALLET-SAFETY-10 (L) `lib/payExec.ts`: tx-review not applied to payer permit, buffer payments or registry tx.
- WALLET-SAFETY-11 (L) `lib/wallet.ts`: `verifySubmission` ignores tx type, authorization list and fees.
- WALLET-SAFETY-12 (I) `features/registry/RegistryView.tsx`: incomplete linkage warning; no code-hash pin; decoders can throw.

**supply-chain-ci:**
- SUPPLY-CHAIN-CI-07 (L) `.github/workflows/release.yml`: attestation job installs unneeded tools; floating toolchain.
- SUPPLY-CHAIN-CI-08 (L) `scripts/verify-release.sh`: attestation check does not bind workflow or ref; link entries ignored.
- SUPPLY-CHAIN-CI-09 (L) `scripts/check-actions-pinned.sh`: bypassable; SHA-to-tag mapping unverified (S3-17a).
- SUPPLY-CHAIN-CI-10 (L) `scripts/scan-secrets.sh`: thin regex.
- SUPPLY-CHAIN-CI-11 (L) `.github/workflows/nightly.yml`: installs lack hashes.
- SUPPLY-CHAIN-CI-12 (L) `scripts/testnet/deploy.sh`: weak guards.
- SUPPLY-CHAIN-CI-13 (L) `.github/dependabot.yml`: governance controls absent or unenforced.
- SUPPLY-CHAIN-CI-14 (I) `package-lock.json`: offline dependency posture.
- SUPPLY-CHAIN-CI-15 (I) `apps/web/scripts/scan-bundle.mjs`: heuristic scan; broad `connect-src`.
- (SUPPLY-CHAIN-CI-03 merged into WEB-APP-03.)

**privacy-e2e:**
- PRIVACY-E2E-05 (L) `packages/policy-scheme/src/policy.ts`: policyHash unsalted and public (round-audits F-G).
- PRIVACY-E2E-06 (L) `apps/web/src/lib/sweep.ts`: error text advises funding the one-time address, with no linkage warning.
- PRIVACY-E2E-07 (L) `lib/relayerClient.ts`: quote discloses owner, destination and IP before the user commits.
- PRIVACY-E2E-08 (I) `docs/user/receive-and-scan.md`: privacy docs and threat model are stale.
- PRIVACY-E2E-09 (I) `lib/scanClient.ts`: plaintext checkpoints reveal activity on the device.

**docs-claims:**
- DOCS-CLAIMS-04 (L) `docs/user/set-up-stealth-meta-address.md`: says registry publishing is not offered; RegistryView publishes.
- DOCS-CLAIMS-05 (L) `docs/operators/chain-enablement-checklist.md`: token allowlist understated (code has 6 USDC and 3 EURC).
- DOCS-CLAIMS-06 (L) `README.md`: relayer-guard said to be unwired; only the challenge module is.
- DOCS-CLAIMS-07 (L) `apps/relayer/README.md`: `trustProxyHops` documented, but code rejects it.
- DOCS-CLAIMS-08 (L) `docs/operators/relayer-runbook.md`: stale "in progress" items; lists an `unhealthy` status the code never returns.
- DOCS-CLAIMS-09 (L) `README.md`: says the anvil e2e can skip silently; it now reads REQUIRE_ANVIL and CI.
- DOCS-CLAIMS-10 (L) `docs/operators/release-and-verify.md`: says no Echidna harness exists; harnesses are present.
- DOCS-CLAIMS-11 (L) `docs/operators/deployment-runbook.md`: SmokeSepolia and manifest writer exist despite claims.
- DOCS-CLAIMS-12 (L) `README.md`: a devnet manifest is tracked, contrary to the docs.
- DOCS-CLAIMS-13 (L) `SECURITY.md`: secret scan claim overstated; scan is not a required gate.
- DOCS-CLAIMS-14 (L) `README.md`: some packages lack README or DEVIATIONS.
- DOCS-CLAIMS-15 (L) `README.md`: policy accounts said to have no client support; a client library exists.
- DOCS-CLAIMS-16 (L) `docs/operators/hosting.md`: header consistency overstated; Cloudflare lacks COEP and HSTS.
- DOCS-CLAIMS-17 (I) `README.md`: wrong path to `scan-bundle.mjs`.

Docs claims checked and consistent with code (docs-claims area):
- 25 bps router fee and 400-unit floor;
- relayer fee clamp of max(gas x1.10, 50 bps), capped at 300 bps;
- 16384-byte invoice limit;
- scrypt N=2^17 with AES-GCM and a 10-character passphrase minimum;
- no owner, pause or upgrade in contracts;
- `_headers` CSP;
- lint bans on `Math.random`, `eval` and `innerHTML`;
- relayer port 8787;
- PolicyGate allow-all default.

---

## 8. Not reviewed and limitations

**General**
- This is AI-assisted. No human auditor reviewed or reproduced any finding. Severity is the agents' judgment.
- Mostly static. The only code executed was the contracts-core forge suite (dev profile only) and the 4 audit05 PoCs. Nothing else ran:
  - no node, vitest or Playwright;
  - no anvil, Esplora, BlindBit, PayJoin peer or Solana/TRON node;
  - no real wallet, browser or RPC.
- No real-funds or live-chain testing. No deployed bytecode or announcer was checked on-chain.
- Tools not run:
  - Slither and Echidna;
  - default-profile 10k fuzz and invariant runs;
  - mutation testing and gas measurement;
  - circomspect;
  - `npm audit`;
  - the existing pool/circuit/SDK/relayer/e2e/Slither suites.
- Third-party code was assumed correct from its version and not diffed against upstream:
  - OZ 5.6.1 and forge-std;
  - @noble/curves and @noble/hashes (constant-time behaviour unverified);
  - @scure/btc-signer and @scure/base;
  - @solana/kit 8.4.0;
  - viem;
  - the ScopeLift SDK.
- No lockfile integrity check, no typosquat review, and no check that action SHAs map to the claimed tags.

**ZK and cryptography**
- No formal or R1CS-level soundness review of the circuits. No recompilation, and no diff of the verifiers against a fresh snarkjs export.
- No real trusted-setup ceremony exists. The dev keys are forgeable (C-1).
- No timing or side-channel analysis: JS bigint, the scanner worker, browser fingerprinting.
- Test-vector files `policy-scheme.json`, `shielded-pool.json` and `solana-stealth.json` and their generators were not reviewed.

**Components not reviewed or only skimmed**
- confidential-amounts:
  - `ledger.ts`, the cleartext backend, `zama.ts` and `calldata.ts`;
  - Zama fhEVM ACL, HCU and KMS/gateway trust;
  - the OZ ERC7984 unwrap flow.
- external-pools-privacypools:
  - sdk-crypto, state and derive;
  - upstream 0xbow;
  - the external-pools mock adapter and ledger.
- ERC-7562 bundler rules against a real bundler.
- Deploy scripts for payer-hiding-contracts and confidential-contracts.
- pool-circuits foundry tests.
- btc-payjoin:
  - `src/ffi/index.ts`, the transport memory module, `modes.ts` and `errors.ts`;
  - BITCOIN-01/04 assume `fromPSBT` has no amount check; that source was not read.
- relayer-guard challenge module (unwired).
- GhostPaySweepRelayer beyond permit/nonce handling.
- PolicyAccount logic beyond the parts mirrored in TS.
- The built `dist` bundle; `scan-bundle.mjs` beyond a read-through; `app.css`; accessibility.
- Most docs:
  - `docs/adr/*`, `docs/threat-model/*`, `docs/SPEC_REVIEW.md`, `FEE_SCHEDULE.md`, `DEPLOYMENT_MANIFEST.md`, `THIRD_PARTY.md`;
  - about 40 package READMEs and DEVIATIONS (grep-sampled only);
  - `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`;
  - `docs/remote/**`.

**Infrastructure and runtime**
- Real GitHub settings are not visible from the repo: branch protection, tag rulesets, environment reviewers, secret scanning, Pages source.
- Docker images were not built. Caddy, nginx and systemd configs were not validated.
- No reverse proxy, node_exporter permissions or log retention were checked.
- Token addresses were not checked against issuer docs.
- External links were not checked.
- Non-standard CREATE2 chains (zkSync) and EIP-7702-delegated stealth EOAs were not analysed.
- Fee economics (rate, slackBps, gasEstimate) were not reviewed beyond the gas-cap issue.

**Process**
- Low and Info items are unverified.
- The docs-claims area report file was not written. A single subagent did that area.
- Verifier vote texts in the input are truncated, so some severity reasons are only partly visible.
- The input data does not record which model each subagent ran on.

---

## 9. Prioritised remediation plan

### P0: before any testnet use with real or valuable funds

1. **BITCOIN-01**: check sender prevouts against the receiver's own node; set an absolute cap on the receiver fee share; add a regression test. Also look at BITCOIN-04.
2. **CONTRACTS-POOLS-01**:
   - service: bound fees against the live gas price; bound pvg;
   - contract: immutable caps in `validatePaymasterUserOp`;
   - short signature TTL;
   - with **CONTRACTS-POOLS-03**: sender balance pre-check and detection of inner failure.
3. **CONTRACTS-POOLS-02**: gas cap tied to the fee in pool-relayer; charge `gasUsed*price - fee` on every relay.
4. **SOLANA-TRON-01**: dedupe by `(signature, P)`. With **SOLANA-TRON-02**, make `trustedToken` fail closed.
5. **WEB-APP-02**: never return to `prepared` after a broadcast.
6. **CHAIN-ADAPTERS-01/02/03** and **WEB-APP-04**:
   - halve the window on RESPONSE_TOO_LARGE;
   - bound head;
   - checkpoint at `head-finalityDepth`;
   - bind checkpoints to key and chain;
   - wire the second provider.
7. **WEB-APP-01 / CHAIN-ADAPTERS-05**: run `verifyManifestState` in every flow; show the unsigned-dev banner everywhere; apply the signature check in the relayer and ops-monitor.
8. **WALLET-SAFETY-02**: replace node:crypto and add a browser test.
9. **SUPPLY-CHAIN-CI-04**: add CI jobs for the pool, payer and circuit contracts. **SUPPLY-CHAIN-CI-06**: remove `eval`.
10. **CONTRACTS-POOLS-09 / C-1**: never use dev-ceremony verifiers with value.

### P1: before mainnet

1. Privacy:
   - **PRIVACY-E2E-01** (local spentness);
   - **PRIVACY-E2E-02** (on-demand verify);
   - **PRIVACY-E2E-03** (no default consolidation);
   - **PRIVACY-E2E-04 / DOCS-CLAIMS-03** (reuse warning or remove the claim);
   - **PRIVACY-E2E-05**.
2. Bitcoin: **BITCOIN-02** (per-outpoint mapping); **BITCOIN-03** (second-source cross-check, then header/merkle validation); **BITCOIN-05/06**.
3. Relayer:
   - **RELAYER-01** (charge after validation);
   - **RELAYER-03** (precheck outside the lane);
   - **RELAYER-02** (fee-vs-cost at send);
   - **RELAYER-05** (receipt timeout counts as breaker failure; RBF; send retry 0);
   - **RELAYER-04**;
   - **RELAYER-06/07/09** (monitor liveness metrics).
4. Wallet safety: **CHAIN-ADAPTERS-04** (token allowlist in verifyReceipt); **WALLET-SAFETY-01/03** (lookalike check against owned addresses; fingerprint step); **WALLET-SAFETY-05/10/11**.
5. Release chain:
   - **SUPPLY-CHAIN-CI-01** (`git verify-tag`);
   - **SUPPLY-CHAIN-CI-02** (gate pages.yml);
   - **SUPPLY-CHAIN-CI-05** (digest pins, root `.dockerignore`, attested relayer image);
   - pin the release key (`RELEASE_KEY`) and include the manifest in the hashed release.
6. **WEB-APP-03 / SUPPLY-CHAIN-CI-03**: dedicated origin only.
7. TRON: **SOLANA-TRON-03** (strict protobuf with re-encode equality); **SOLANA-TRON-04** (ADR-0019 plus a funding design).
8. **CHAIN-ADAPTERS-07/08**: manifest freshness; policy section verification.
9. Run the tools not yet run:
   - Slither, Echidna, default-profile fuzz;
   - circomspect, a real ceremony;
   - `npm audit`;
   - action SHA mapping.
10. Get an independent professional audit.

### P2: hygiene

- Remaining Low/Info items: crypto-core RNG and SecretBox items, session key wiping, keystore scrypt bounds, S3-15, S3-22, ops-monitor coverage, CI tooling hashes, governance.
- All DOCS-CLAIMS-01/02 and 04-17 fixes.
- PRIVACY-E2E-08 doc refresh.
- CONTRACTS-CORE-01..04.

---

## 10. Mapping to prior audits and regressions

Prior reports: `docs/audits/00-slither-triage.md`, `01-completeness-audit.md`, `02-security-review-contracts.md`, `03-security-review-client-relayer.md`, `04-independent-design-analysis.md`, and `docs/remote/round-audits/*`. ID families as cited by the area agents.

**Fixed, with no regression:**
- contracts: L-01, L-04, M-02, I-02, L-06, C-10;
- S3-01/CA-01: largely fixed in chain-adapters (signature verify and read-back exist), but wiring is partial (see WEB-APP-01).

**Partly fixed:**
- L-06 (crypto-core): `slice`/`subarray` now throw, but species still leaks through `map`/`filter`;
- S3-01 (web-app): read-back runs only in Scan (WEB-APP-01).

**Regressions:**
- PRIVACY-E2E-02: per-match RPC reads were added by `verifyReceipt` and undo the S3-02 property that the scan sends only block ranges.
- PRIVACY-E2E-01: a new leak added by the BTC feature. The UI text claims otherwise.

**Still open by design:** contracts M-01, M-03, L-02, L-05, C-01, C-02, C-08.

**Still open (carried):**

| Area | Prior IDs |
|---|---|
| crypto-core | S3-12, S3-13 (also WEB-APP-11), L-1, L-4, I-2, I-3, I-02, I-03, BUG-06, M-1 |
| contracts-pools | C-1/PC-01 dev ceremony (CONTRACTS-POOLS-09) |
| contracts-core | C-06 (CONTRACTS-CORE-03) |
| web-app | S3-11 (WEB-APP-10), S3-15 (WEB-APP-05) |
| wallet-safety | S3-22 (WALLET-SAFETY-08) |
| relayer | RL-03 (RELAYER-02), RL-04 (RELAYER-05), RL-08 (RELAYER-11), RL-09/S3-18/S3-21 (RELAYER-12), M-3/L-8 (RELAYER-13), S3-06 design (RELAYER-04), guards.md M-1/L-7 (noted only) |
| supply-chain-ci | S3-17a (SUPPLY-CHAIN-CI-09), S3-17e (SUPPLY-CHAIN-CI-05) |
| bitcoin | security-btcapps M3 (extended by BITCOIN-03); PJ-04 (extended by BITCOIN-04); spend leftover burn, zero-fee rounding, URIError, BlindBit timeout/http |
| privacy | round-audits F-G scheme-2 policyHash linkability (PRIVACY-E2E-05) |
| docs | audit D1 "used destination" warning still in progress (PRIVACY-E2E-04 / DOCS-CLAIMS-03) |

**Not previously covered:** solana-stealth and tron-adapter have no prior audit, so no regressions there.
