# B1a feature inventory: protocol, crypto core, contracts, account abstraction, deployments

Team B1a. Target candidate worktree `/home/user/wt/cand` @ `7a620ff1` (PR #203 head). Scope source identical to CI-qualified `d91ae16a` (`git diff --name-only d91ae16a 7a620ff1` = docs + `apps/web/src/views/SellerKeys.test.tsx` only). Contract `src/` unchanged vs main `cfaebeea`. Machine-readable rows: `features_proto.json` (same dir). Generator: `gen_features_proto.py`.

Marks: VERIFIED = I read code / ran command at the SHA; CI = job log of run 44231986652 (or named run) on `d91ae16a` downloaded via `gh api` (read-only) into `ci_logs_proto/`; INFERRED/UNVERIFIED as labelled. Effort numbers are ESTIMATES.

**Rows: 31.** Status: VERIFIED_COMPLETE 12, PARTIAL 6, BLOCKED 6, IMPLEMENTED_UNVERIFIED 3, EXPERIMENTAL 3, SPEC_ONLY 1. Tier: beta-core 15, beta-supporting 8, experimental 5, full-profile 2, future 1.

## Local runs (VERIFIED @7a620ff1, no build, `npx vitest run --maxWorkers=2`, logs in `logs_proto/`)

| Package | Result | Note |
|---|---|---|
| core-crypto | 9 files, 75/75 |  |
| invoice-schema | 12 files, 715/715 |  |
| payment-uri | 3 files, 199/199 |  |
| qr-exchange | 7 files, 233/233 |  |
| sdk | 8 files, 54/54 |  |
| scan-source | 6 files, 57/57 |  |
| policy-scheme | 88 pass / 7 skip | anvil absent locally; CI 95/95 with REQUIRE_ANVIL=1 |
| chain-adapters | 26 files, 551 pass / 22 skip | anvil absent locally; CI 573/573 with REQUIRE_ANVIL=1 |
| scripts/testnet node --test | 8/9 | 1 env failure: `cast` not installed (verify-sources.test.mjs:37); CI rest-0 201/201 |
| scripts/tests chain-matrix + cli + release-manifest | 17/17 |  |
| check-chain-matrix.mjs | exit 0; `--release` exit 1 | 73 unverified required cells: 42 chain, 27 token, 4 feed over 11155111, 84532, 11155420, 421614, 80002, 97, 43113 |
| experimental models | policy-recovery 19/19, milestone-escrow 19/19 | not run by any CI workflow |

CI on `d91ae16a` (VERIFIED via job logs): forge 34 suites 490/490; coverage lines Router 98.59 %, Sweep 100 %, PolicyRouter 98.82 %, PolicyAccount 99.21 %, Factory 100 %; Slither 34 contracts / 64 detectors / 0 results; contracts-static green; web 2749 pass / 1 skip (incl registry.anvil 9, spam/bench/fuzz nocov); relayer 475/475 (e2e.anvil 5 incl permit front-run fallback); Contract analysis 44231986631: echidna success, mythril failure (by design); Beta acceptance 44231986665: 141 PASS lines (router pay ETH/USDC/USDT/DAI, fee parity, scan, receipt, relayer sweep + replay 409, CLI Part B deployment verify on anvil).

## Feature table

| ID | Feature | Tier | Impl % | Verif % | Status | Effort (ESTIMATE) | Strategy |
|---|---|---|---|---|---|---|---|
| F-PROTO-01 | EIP-5564 scheme-1 stealth derivation, view tags, announcement check, stealth key | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-02 | Stealth meta-address encoding (st:eth:0x) + key generation | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-03 | Announcement discovery primitives: verified RPC client + reorg-safe announcement fetch/validation | beta-core | 95 | 95 | PARTIAL | S 0.5-1d | repair |
| F-PROTO-04 | Payment claim verification library (spec 02 library side) | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-05 | Announcer spam & anonymity-set bounds (spec 05) | beta-supporting | 90 | 80 | IMPLEMENTED_UNVERIFIED | S 1-2d | implement |
| F-PROTO-06 | Invoice schema v1/v2 + canonical JSON + signing/verification | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-07 | Invoice link envelope #gpi=v1. (none / A256GCM / A256GCM-PW passphrase) | beta-core | 100 | 90 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-08 | Invoice-bound signed seller receipts | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-09 | Strict payment URI builders/parsers (EIP-681, ERC-3770, BIP-21/321+sp, Solana Pay, tron:, invoice link) | beta-supporting | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-PROTO-10 | QR exchange: GPQ1 multipart, assembler, camera/readers, generation, seller/settings payloads | beta-supporting | 100 | 100 | VERIFIED_COMPLETE | S 0-1d | none |
| F-PROTO-11 | Scan-source abstraction (range / indexer-tor / pir2 / light-client / quorum) | full-profile | 70 | 100 | EXPERIMENTAL | L 3-10d | defer |
| F-PROTO-12 | SDK programmatic API (@ghostpay/sdk) | full-profile | 45 | 90 | PARTIAL | M 1-3d | defer |
| F-PROTO-13 | Spec 18 stealth keypair export formats + crypto adapter (protocol side of 3q) | beta-core | 10 | 10 | SPEC_ONLY | L 5-9d | implement |
| F-CTR-01 | GhostPayRouter scheme-1 checkout router (native, ERC-20, ERC-2612 permit, buffer) + client builder | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-CTR-02 | Permit griefing fallback & error surfacing (spec 04) | beta-supporting | 100 | 95 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-CTR-03 | GhostPaySweepRelayer + relayer-authorized sweep (EIP-712 signed terms incl. deadline, nonce bitmap) | beta-supporting | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-CTR-04 | ERC-6538 registry integration (canonical singleton used as deployed) + delegated-registration builders (#181) + ENS | beta-supporting | 90 | 85 | IMPLEMENTED_UNVERIFIED | S 0.5-1d | repair |
| F-CTR-05 | Fee schedule F-PAY / F-SPONSOR (math, immutables, disclosure, manifest-sourced recipient) | beta-core | 100 | 100 | VERIFIED_COMPLETE | S 0-0.5d | none |
| F-CTR-06 | Gas buffer v2 (spec 13) + invoice v2 seller bufferPolicy (ADR-0024) | beta-supporting | 95 | 80 | IMPLEMENTED_UNVERIFIED | M 1-3d | implement |
| F-CTR-07 | Contract qualification gates (Foundry unit/fuzz/invariant, coverage, Slither, Echidna, Mythril, NatSpec) | beta-core | 90 | 80 | BLOCKED | M 2-4d | implement |
| F-AA-01 | Scheme-2 policy-guarded account contracts (PolicyAccount, PolicyAccountFactory, GhostPayPolicyRouter) | experimental | 85 | 85 | EXPERIMENTAL | M 2-4d | defer |
| F-AA-02 | Policy-scheme client (scheme-2 derivation, gp2 meta-address, limits tree, EIP-712, calldata, record restore) + flagged web path | experimental | 80 | 80 | EXPERIMENTAL | L 5-10d | defer |
| F-AA-03 | F-SECURE factory flat fee + fee-token handling (N1 freeze residual) | experimental | 55 | 55 | BLOCKED | M 1-3d | defer |
| F-AA-04 | EIP-7702 / ERC-4337 / ERC-7579 account-abstraction path (spec 15) | experimental | 15 | 0 | BLOCKED | XL 15-30d | defer |
| F-AA-05 | Policy-account recovery / guardian (spec 16, ADR-0023, ADR-0028) | experimental | 30 | 15 | BLOCKED | XL 15-30d | defer |
| F-AA-06 | GhostMilestones escrow (spec 17) | future | 15 | 15 | BLOCKED | XL 20-40d | defer |
| F-DEP-01 | Deployment manifests: schema, strict loader, structured release signature, build-time bundling | beta-core | 85 | 80 | PARTIAL | S 0.5-1d | repair |
| F-DEP-02 | On-chain manifest read-back verifyDeployment (spec 01) | beta-core | 85 | 80 | PARTIAL | S 1-2d | repair |
| F-DEP-03 | Chain/token/feed deployment matrix + release gate (spec 09) | beta-core | 75 | 70 | PARTIAL | M 2-4d | implement |
| F-DEP-04 | Testnet deployment tooling + Sepolia-first deployment of record | beta-core | 75 | 55 | BLOCKED | M 1-3d | implement |
| F-DEP-05 | EVM multichain config + ChainAdapter interface (MULTICHAIN_SPEC tier 1, ADR-0016) | beta-supporting | 80 | 80 | PARTIAL | S 1-2d | repair |

## Notes per feature

- **F-PROTO-01** Byte-equal to ScopeLift SDK + bigint ref; malformed logs never throw; deep-scan opt-in keeps address check. Only external audit/wallet interop open.
- **F-PROTO-02** Strict st:eth:0x codec, KEY_REUSE + on-curve checks, registry 66-byte form. Done.
- **F-PROTO-03** PARTIAL only by rubric (impl<100): one minor S3-14 item (per-log block-hash cross-check) not done; all scan-halting/reorg/range logic CI-green incl anvil.
- **F-PROTO-04** received requires router caller + canonical block + traced transfer; replay dedupe; anvil 17/17 in CI. Under/over/double-pay reporting lives in ux-vault (B1b).
- **F-PROTO-05** Lanes/budget/memo/1M-spam acceptance all CI-green (web nocov). Missing: Pay amount-hygiene hint, verified endpoint list. Thresholds heuristic.
- **F-PROTO-06** Strict v1/v2 schema, canonical JSON, domain-separated secp256k1 signing (not EIP-712, by design). Recovery-snapshot branches = archive only.
- **F-PROTO-07** A256GCM-PW matches ADR-0020 (N allow-list pre-KDF, AAD header binding); web prompt now wired. ADR-0020 still Proposed.
- **F-PROTO-08** Invoice-bound receipts with explicit-trust signer rule; CLI + web wired; receipts never treated as payment proof.
- **F-PROTO-09** Uniform strict parser for 6 URI families; wired into web QR/payment-request. Wallet interop external.
- **F-PROTO-10** GPQ1 multipart + camera lifecycle + e2e camera specs CI-green. Device/glare/permission acceptance external; CRC/SHA prefix is not authentication.
- **F-PROTO-11** Only indexer-tor + padWindow wired (web scanPrivacy, full profile). range/pir2/light/quorum library-only; all backends fakes. Testnet-only PoC.
  - blockers: testnet-only PoC by design; real backends need operators
- **F-PROTO-12** Tested library (54/54) but private/UNLICENSED, no README, no consumer, merchant API server absent. Not needed for static beta.
  - defect: Info: no README/API doc for @ghostpay/sdk (ls packages/sdk)
  - blockers: owner decision on public SDK + licence
- **F-PROTO-13** No spec-18 format code exists (grep). Primitives to reuse exist (deriveStealthSecret, addressOfSecret, keystore-portable). K01/K02/K05/K06 protocol side; K03/UI = B1b.
  - blockers: R-15 spec wording (clipboard/telemetry/in-memory step-up) for K03 only
- **F-CTR-01** All 4 entry points, exact balance deltas, invariants, Echidna, fee parity on anvil, beta acceptance pays 4 assets. Undeployed; Permit2 not specified/absent.
  - blockers: Mythril policy decision gates any release (F-CTR-07)
- **F-CTR-02** Classifier (6 states), relayer front-run fallback e2e CI-green, payer pre/post-sign checks. Option C event deferred (optional). griefReserveBps=0 untuned.
- **F-CTR-03** Signed terms incl inclusive deadline, nonce bitmap, low-s, relayer-cannot-alter invariants; 100% coverage; relayed USDC/DAI sweeps on anvil.
  - blockers: F-SPONSOR rate is [OWNER] decision before mainnet
- **F-CTR-04** Publish/lookup/clear + ENS (no CCIP) + #181 delegation builders tested vs CC0 reference on anvil. Missing per-chain codehash pin; ADR-0018 stale.
  - defect: Info: ADR-0018 stale vs code (registerKeysOnBehalf builders + ENS now exist)
  - blockers: registry presence + codehash per testnet unverified (external)
- **F-CTR-05** F-PAY/F-SPONSOR math + disclosure + chain-read recipient done. Owner fee/legal decisions outstanding (F-SECURE in F-AA-03).
  - blockers: [OWNER] fee recipient (HW/multisig), sponsor rates, legal/sanctions review before mainnet
- **F-CTR-06** Contract + client buffer + v2 bufferPolicy done. Missing fiat estimate and an anvil e2e proving a sweep funded only by the buffer.
- **F-CTR-07** Forge 490/490, coverage ~99-100% on 5 contracts, Slither 0, Echidna green; Mythril red by design -> owner decision gates releases.
  - blockers: Owner: Mythril disposition mechanism or keep releases blocked (PROMOTION_PACKET blocker 2); main unprotected (blocker 1)
- **F-AA-01** Contracts well tested (99%+ cov) but experimental/disabled; AUD24-01 policyHash calldata linkability OPEN (Medium privacy).
  - defect: Medium (privacy) AUD24-01 OPEN: PolicyRef{owner,policyHash} in router calldata links scheme-2 payments to one seller (IGhostPayPolicyRouter.sol:18, GhostPayPolicyRouter.sol:236-241)
  - defect: Medium conditional N1 OPEN: see F-AA-03
  - blockers: ADR-0014: stays out of releases; owner ABI decision AUD24-01
- **F-AA-02** Client lib + flagged web path tested incl anvil; no public pins (PINNED_POLICY_DEPLOYMENTS={}), no scheme-2 invoice, gate-4 verification not consumed.
  - blockers: ADR-0014/0027 gates; AUD24-01 ABI decision
- **F-AA-03** Fee delta/waiver logic correct + 33 disposition tests, but N1 freeze residual OPEN (Medium conditional); owner must pick zero-fee factory or fail-open spec.
  - defect: Medium conditional (not exposed; scheme 2 undeployed) N1/R-11 OPEN: PolicyAccountFactory._collectFee (sol:128-166) can freeze counterfactual funds
  - blockers: Owner: zero-fee factory for upgradeable/fee-switch tokens or specified fail-open change (PROMOTION_PACKET blocker 3)
- **F-AA-04** Spec/design only; no SweepDelegate, no 7702 signing; intended ADR numbers 0017-0019 reused for other topics. Blocked behind spec 16 + audit.
  - blockers: spec 15: no build before 16 + audit; owner ABI/privacy decision (D03)
- **F-AA-05** ADR-0028 unaccepted; JS authority model 19/19 (local, not in CI); current PolicyAccount cannot rotate owner.
  - defect: Info: experimental model tests not wired into any CI workflow (grep policy-recovery .github: none)
  - blockers: Owner authority decision (D04)
- **F-AA-06** Design brief + JS model 19/19 (local, not in CI); no contract; custody/legal decision first.
  - blockers: custody/dispute decision; spec 17 "do not start before 01-09 done"
- **F-DEP-01** Loader + structured signature + build-time fail-closed OK. README cites missing npm script; no in-repo signing helper; release keys empty; no manifest of record.
  - defect: Low CONFIRMED doc/script drift: apps/web/deployments/README.md references missing npm script validate:deployments (grep apps/web/package.json) @7a620ff1
  - blockers: release signer key absent (allowed_signers comments only; RELEASE_PUBLIC_KEYS [] default); no manifest of record (deployments/ has only unsigned 31337.json)
- **F-DEP-02** Readback checks chainId/getters/codehashes/two providers, CI anvil Part B green. Gaps: announcer codehash pin, divergent relayer verifier, no cache.
  - defect: Low CONFIRMED: two divergent read-back verifiers - verifyDeployment (web/CLI, verify.ts:184-235) skips policy implementation hash; verifyManifestOnChain (relayer, deploymentsVerify.ts:44-70) does not require canonical announcer or a second provider
  - blockers: announcer codehash per chain unverified (external)
- **F-DEP-03** Matrix + strict gate VERIFIED: --release rejects 73 cells (42 chain/27 token/4 feed, 7 testnets). Missing nightly revalidation + policy pin record.
  - blockers: 73 unverified release cells need authenticated deployments + primary sources (Sepolia first)
- **F-DEP-04** Tooling present and partly tested; no public deployment of record; deploy.sh network list mismatches enabled chains; rehearse not in CI.
  - defect: Info CONFIRMED: deploy.sh network list != enabled testnets (no BNB testnet/Fuji path; hoodi unsupported in config)
  - blockers: Owner: ADR-0029 acceptance, release key, fee recipient, broadcast (B01/B02)
- **F-DEP-05** Adapter + verified-only allowlist/feeds; chain params are engineering defaults; README/TODO-VERIFY stale on FEEDS.
  - defect: Info CONFIRMED stale docs: chain-adapters README/TODO-VERIFY say FEEDS empty; quote.ts:52 lists 4 testnet feeds
  - blockers: chain params + token permit/blacklist cells need provider evidence

## Confirmed defects / findings in scope (CONFIRMED = read at 7a620ff1)

| # | Severity | Finding | Evidence | Row |
|---|---|---|---|---|
| 1 | Medium (privacy), open, scheme 2 undeployed | AUD24-01: GhostPayPolicyRouter takes `PolicyRef{owner, policyHash}`; seller-constant policyHash in calldata links scheme-2 payments | IGhostPayPolicyRouter.sol:18; GhostPayPolicyRouter.sol:236-241 | F-AA-01 |
| 2 | Medium conditional, open | N1/R-11: `_collectFee` reverts on failing fee-token views or wrong-delta transfer -> counterfactual funds frozen, no factory recovery | PolicyAccountFactory.sol:128-166 | F-AA-03 |
| 3 | Low | Doc/script drift: README step 4 runs `npm run validate:deployments -w @ghostpay/web`; script absent | apps/web/deployments/README.md; grep validate apps/web/package.json = none | F-DEP-01 |
| 4 | Low | Two divergent read-back verifiers: `verifyDeployment` skips policy implementation codehash; relayer `verifyManifestOnChain` skips canonical-announcer pin and 2nd provider | verify.ts:184-235 vs deploymentsVerify.ts:44-70 | F-DEP-02 |
| 5 | Info | Stale docs: chain-adapters README/TODO-VERIFY "FEEDS is empty" (4 testnet feeds now); ADR-0018 says on-behalf unsupported + no ENS (both exist) | quote.ts:52-90; registryDelegation.ts; registryEns.ts | F-DEP-05, F-CTR-04 |
| 6 | Info | deploy.sh networks (sepolia, base-sepolia, op-sepolia, arbitrum-sepolia, polygon-amoy, hoodi) != enabled chains (adds 97, 43113; hoodi not configured) | scripts/testnet/deploy.sh:31-37; chains.ts:40-48 | F-DEP-04 |
| 7 | Info | Experimental recovery/escrow model tests (19+19) not wired into CI | grep policy-recovery|milestone-escrow .github: none | F-AA-05, F-AA-06 |
| 8 | Info | SDK private/UNLICENSED, no README/API doc, merchant API server absent | packages/sdk/package.json; ls packages/sdk | F-PROTO-12 |
| 9 | Info (outside scope) | PROMOTION_PACKET "later commits documentation only" is stale: head 7a620ff1 also changes apps/web/src/views/SellerKeys.test.tsx | git diff --name-only d91ae16a 7a620ff1 | - |

Dispositioned, not counted as open defects: Mythril SWC-116 x3 (Sweep:83, PolicyAccount:161/:262; intended inclusive deadlines) and PolicyAccountFactory R4-R11 (false positives / fail-closed), per audits/mythril-14290880802-*; release gate stays red (F-CTR-07).

## Package -> row map (completion criterion)

- `packages/core-crypto`: F-PROTO-01, F-PROTO-02 (+ primitives for F-PROTO-13)
- `packages/contracts (src/test/script/scripts/echidna)`: F-CTR-01, -02, -03, -05, -06, -07, F-AA-01, F-AA-03, F-DEP-04
- `packages/policy-scheme`: F-AA-02
- `packages/chain-adapters (incl config/matrix.json)`: F-PROTO-03, -04, -05, F-CTR-01..06, F-DEP-01, -02, -03, -05
- `packages/scan-source`: F-PROTO-11
- `packages/sdk`: F-PROTO-12
- `packages/invoice-schema`: F-PROTO-06, -07, -08, F-CTR-06; support code: merchantProfile.ts = spec 14 signed profile codec (owned by spec-14 team)
- `packages/payment-uri`: F-PROTO-09
- `packages/qr-exchange`: F-PROTO-10
- `deployments/, apps/web/deployments`: F-DEP-01, F-DEP-04 (only unsigned 31337.json; no manifest of record)
- `test-vectors/`: scheme1.json -> F-PROTO-01; policy-scheme.json -> F-AA-02; support code for other teams: tags.json (web tagArchive), solana-stealth.json, shielded-pool.json (pool pkgs)
- `scripts/testnet`: F-DEP-04
- `scripts/lib/chain-matrix.mjs, scripts/check-chain-matrix.mjs`: F-DEP-03
- `scripts/experimental/{policy-recovery,milestone-escrow}`: F-AA-05, F-AA-06

## Related branches / PRs (corrected census `evidence/branch_census_current.json` 06:06; shallow 05:37 census superseded)

- All feature PRs touching scope are ancestors of the candidate: #2, #3, #4, #5, #14, #17, #24, #27, #30, #41, #60, #64, #65, #68, #69, #70, #89, #90, #113-#118, #121, #137, #180, #181, #182, #187, #190, #195.
- Non-ancestor refs with scope files differing from candidate: `pr/39` 1d28f24d + `pr/40` 63994db6 (chain-adapters rpc.ts/errors.ts; ledger: semantically superseded); 5 recovery snapshots `codex/ghostpay-recovered-lean-checkpoint-20261028` 371d235c, `ghostpay-cloud-recovery-2026-10-26` 2ec98b23, `ghostpay-local-lean-boundary-20261027` 020ba327, `ghostpay-offline-deps-2026-10-27` 3697f539, `ghostpay-sbom-repro-2026-10-27` b5b04b99 (permit.ts, quote.ts, invoice schema, ADR-0024; ledger: archive as evidence); Dependabot #23, #25, #33, #34, #45, #86, #87, #176 (scope package.json bumps; maintenance backlog). No missing scope feature found in them (INFERRED from ledger + file list; patches not re-diffed line by line).

## Overlaps with B1b (`features_web.json`) - count once when aggregating

- F-PROTO-13 = same scope as F-KEY-07/-08/-11/-12 (spec 18 K01/K02/K05/K06). B1b scores 0 %; this row gives half credit for the reusable derivation primitive only (raw 8.8 %). Count effort once.
- Library vs UI split (both rows valid, effort mostly on one side): F-PROTO-05 vs F-WEB-06; F-PROTO-08 vs F-WEB-10; F-PROTO-10 vs F-WEB-24; F-CTR-03 vs F-WEB-12; F-CTR-04 vs F-WEB-14; F-CTR-06 vs F-WEB-05 (count effort once); F-DEP-01/-02 vs F-WEB-17; F-AA-02 vs F-WEB-15.

## Missing tests (summary)

- anvil e2e: sweep funded only by gas buffer (F-CTR-06)
- explicit 0xef0100 / proxy-code readback test (F-DEP-02)
- deploy.sh rehearse + pre-deploy-check.sh in CI (F-DEP-04)
- CI wiring for scripts/experimental model tests (F-AA-05/06)
- per-log block-hash cross-check (F-PROTO-03)
- spec-18 format vectors (F-PROTO-13)
- no official EIP-5564 vectors exist in repo (F-PROTO-01)

## UNVERIFIED (why)

- Foundry/Echidna/Mythril not run locally (forge/echidna/mythril not installed): contract results are CI job logs only; Echidna/Mythril report bodies not read.
- Anvil-dependent TS tests (chain-adapters 22, policy-scheme 7) skipped locally; counted from CI REQUIRE_ANVIL=1 logs.
- Web/relayer behaviour cited for wiring is from CI logs + code reads; browser/app qualification belongs to B1b.
- No public testnet, real RPC provider, wallet, device, ENS or registry presence checked (no deployment exists; external).
- Spec 01 "re-run at Pay preview" not traced in web code here (B1b).
- Echidna "13 safety properties / all canaries" and Mythril record counts taken from PROMOTION_PACKET; only job conclusions verified via gh api.

