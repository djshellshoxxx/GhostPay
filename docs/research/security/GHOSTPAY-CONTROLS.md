# GhostPay Controls Backlog (synthesized)

Date: 2026-10-21. Pre-audit. Backlog only, nothing implemented here.
Inputs: BP = best-practices-hardening.md, FP = failures-and-prevention.md, PR = papers-and-repos.md, RB = rainbow-books.md.
Status verified by grep of repo this pass (shallow: existence of mechanism, not correctness). impl = implemented, part = partial, miss = missing.
Source claims in input docs are mostly secondary/snippet-level; re-verify before compliance claims.
Effort: S (<1d), M (1-3d), L (>3d).

## P0 (before any testnet user)

| # | Control | Src | Target | Eff | Status |
|---|---|---|---|---|---|
| 1 | Trusted Types in CSP, report-only first | BP1 | `apps/web/index.html`, `apps/web/public/_headers`, `infra/web/Caddyfile.static`, `infra/proxy/Caddyfile`, `infra/proxy/ghostpay-headers.conf` | S | miss (no `trusted-types` anywhere) |
| 2 | Tighten `connect-src` from `https: wss:` to generated allowlist | BP2 | same 5 CSP sites | M | part (documented deviation, `apps/web/DEVIATIONS.md` item 20; RPC/relayer are user data, so needs opt-in strict mode) |
| 3 | SRI on built script/style tags + CI fail on new third-party include | FP Bybit, RB SI-7 | `apps/web/vite.config.ts`, `.github/workflows/ci.yml` | M | miss (no `integrity=` in web build) |
| 4 | Fill SECURITY.md reporting contact / enable private reporting | BP4 | `SECURITY.md` | S | miss (`[OWNER]` placeholders lines 8,12,13) |
| 5 | Sig/request binding to chain, relayer, expiry; replay tests across chain+contract | BP5, FP Wormhole | `apps/relayer/src/service.ts`, `validate.ts`, `packages/contracts` | M | part (chainId, deadline, nonce, EIP-712 domain present; no cross-chain replay test confirmed) |
| 6 | Exact-amount approvals, never MAX_UINT; test + tx-review warning | FP BadgerDAO | `apps/web/src/lib/pay.ts`, `packages/tx-review/src/decode.ts` | S | part (tx-review decodes uint256; no unlimited-approval flag found by grep) |
| 7 | Pre-sign confirmation integrity: reviewed intent hash == signed bytes hash, reject on mismatch | RB2, FP Bybit | `packages/tx-review/src`, `apps/web/src/lib/txGuard.ts` | M | part (tx-review + txGuard exist; hash-equality assertion not found) |
| 8 | Passphrase policy: min 15 (single factor), max >=64, blocklist, no composition rules | RB4,11 | `apps/web/src/lib/keystore.ts`, `packages/external-pools/src/vault.ts` | S | part (MIN_PASSPHRASE=10, no blocklist) |
| 9 | Keystore: scrypt N floor enforced; non-extractable key; zeroize | BP3, RB11 | `apps/web/src/lib/keystore.ts` | S | impl (N=2^17, MIN_N check line 76, extractable=false, fill(0)); passphrase retention as string remains (JS limit) |
| 10 | No key material in browser storage; client-only stealth scan, viewing key never sent to relayer | FP Atomic/Stanford | `apps/web/src/lib/scanClient.ts`, `scanner.worker.ts`, `packages/core-crypto` | M | part (client-side scanner worker exists; no storage/relay negative test confirmed) |

## P1 (before mainnet-shaped testing)

| # | Control | Src | Target | Eff | Status |
|---|---|---|---|---|---|
| 11 | Relayer hot-key spend cap per window + outflow anomaly alert | FP Coincheck/Bitfinex/Binance | `apps/relayer/src/budget.ts`, `alerts.ts`, `packages/ops-monitor` | M | part (DailyBudget per-chain gas, alerts.ts exist; value-outflow cap and burst-alert test not confirmed) |
| 12 | Independent limit guard (separate process/keys) so API compromise cannot exceed limits | FP Bitfinex | `packages/relayer-guard` | L | part (breaker, limiter, challenge exist in-package; independent process not confirmed) |
| 13 | Relayer key via KMS/HSM interface, not env; rotation runbook + test | FP KuCoin, BP15, PR CCSS | `apps/relayer/src/secrets.ts`, `docs/remote/security-specs/key-lifecycle.md` | L | part (file/env source with mode checks; key-lifecycle spec doc exists; no KMS signer) |
| 14 | Quorum/key separation: no single operator holds threshold; delegation expiry | FP Ronin/Harmony | `packages/contracts`, `docs/remote/security-specs/key-lifecycle.md` | M | part (doc only; PolicyAccount has timelock refs) |
| 15 | Contract invariants: trusted root != 0 after init/upgrade; no arbitrary cross-chain call; keeper changes timelocked | FP Nomad/Poly | `packages/contracts/test`, `packages/pool-contracts` | M | part (invariant tests exist for PolicyAccount, SweepRelayer, PolicyRouter; Echidna configs present; Nomad-style init test not confirmed) |
| 16 | Slither/Echidna in CI vs SWC / OWASP SC Top 10 | BP10 | `.github/workflows/ci.yml`, `docs/audits/00-slither-triage.md` | S | impl (`contracts-slither` job, echidna.yaml in 3 pkgs, triage doc) |
| 17 | Dependency lockfile + audit + provenance gate; pin SDK versions; WalletConnect ID config-pinned | FP Ledger, BP6, RB13 | `.github/workflows/*.yml`, `package-lock.json` | S | impl (`npm audit`, `npm audit signatures`, `--ignore-scripts`, attest-build-provenance SHA-pinned, check-actions-pinned.sh; no WalletConnect usage found) |
| 18 | Address-poisoning guard: lookalike flag, full-address display, EIP-55, no prefill from history | FP, PR USENIX25 | `packages/address-safety/src/address.ts`, `apps/web/src/views` | S | part (`lookalike_of_saved` class + lookalikeScore exist; UI full-address-diff and no-prefill tests not confirmed) |
| 19 | Reconcile by full tx hash+outputs, not txid alone (malleability); no double credit | FP Mt.Gox | `apps/relayer/src/chain.ts`, `apps/web/src/features/btc` | M | miss (not found by grep; verify) |
| 20 | Tamper-evident signed audit log (hash chain + signature), append-only, actor/reason on key use | RB3,5,9 (AU-9(3)), FP FTX | `packages/ops-monitor/src`, `packages/relayer-guard/src`, `apps/relayer/src/log.ts` | L | miss (no hash-chain found; log.ts redacts by construction) |
| 21 | Log minimization + redaction test; no IP/address pairing beyond TTL; dev cannot reach prod | FP Hansa/AlphaBay, RB15 | `apps/relayer/src/log.ts`, `packages/pool-relayer` | S | part (redaction by construction; explicit test not confirmed) |
| 22 | Constant-time secret ops: dudect-style test for stealth ECDH; verify noble use | FP Stanford/Cure53, RB7 | `packages/core-crypto/src/stealth.ts`, `packages/solana-stealth`, `packages/btc-silent-payments` | M | part (constant-time notes in btc-silent-payments/pool-prover; no dudect test; relayer HMAC uses timingSafeEqual) |
| 23 | Per-address and per-invoice relayer budgets + economic cap | BP9 | `apps/relayer/src/limiter.ts`, `server.ts` | M | part (per-IP + global quote budget exist) |
| 24 | RPC read-privacy: user-selectable proxy/light client, batching, jitter | BP11, PR Stanford | `apps/web/src/lib/scanClient.ts`, `jitter.ts`, `defaultServices.ts`, `packages/chain-adapters` | M | part (`jitter.ts` exists; proxy option not confirmed) |
| 25 | Stealth: never publish full shared secret; view-tag FP-rate test; BIP-352 linking/omitted-payment tests + sender scannability check | PR ERC-5564, ePrint 2026/2037, bips#2153 | `packages/tron-adapter/src/stealth.test.ts`, `packages/btc-silent-payments`, `packages/core-crypto` | M | part (view tag in tron-adapter; BIP-352 attack tests not confirmed) |
| 26 | Solana account validation negative tests (owner/sysvar spoof) | FP Wormhole | `packages/solana-stealth/src` | M | part (ed25519 tests exist; spoof tests not confirmed; research gap) |

## P2 (hardening backlog)

| # | Control | Src | Target | Eff | Status |
|---|---|---|---|---|---|
| 27 | Client-side unlock backoff + idle auto-lock clearing SecretBox | RB6,11 | `apps/web/src/lib/keystore.ts`, `session.ts`, `packages/secret-box` | S | part (idle-minutes setting for local tags exists; unlock backoff missing; SecretBox dispose exists) |
| 28 | WebAuthn/fresh assertion for any admin route | FP NiceHash | `apps/web`, `apps/relayer` | M | miss (no admin route found; moot unless one is added) |
| 29 | Key inventory (all key classes, owner, cryptoperiod, storage) | RB10, SP800-57 | `docs/DEPLOYMENT_MANIFEST.md`, `docs/remote/security-specs/key-lifecycle.md` | S | part (key-lifecycle spec exists; inventory table not confirmed) |
| 30 | SLSA Build L3 target stated in release manifest | BP7 | `.github/workflows/release.yml`, `scripts/gen-release-manifest.mjs` | M | part (attestation + repro-check + SBOM exist; level not claimed) |
| 31 | Release integrity extended to web bundle hashes | RB9 (SI-7) | `scripts/release-build.sh`, `verify-release.sh` | S | part (scripts + `apps/web/src/lib/release.ts` exist) |
| 32 | SSDF practice-to-evidence table | BP8, RB13 | `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` | S | miss |
| 33 | Covert/timing/size channel inventory; pad/batch relayer responses | RB2,7 | `packages/pool-relayer/PRIVACY.md`, `packages/relayer-guard` | M | part (PRIVACY.md exists) |
| 34 | Mixing/anonymity-set analysis harness; fixed denominations; no unique-amount leak | FP Wasabi/Samourai | `packages/pool-contracts`, `packages/payer-hiding-contracts` | L | miss (analysis harness not found) |
| 35 | Key backup: tested restore path, strength meter, warning | BP16 | `apps/web/src/lib/keystore.ts`, `views/SellerKeys.tsx` | S | part (versioned AAD-bound file; restore test not confirmed) |
| 36 | Trust boundary: authenticate relayer responses, verify on-chain before "done"; strict parsing | RB3 | `packages/pool-sdk/src/relayerClient.ts`, `apps/web/src/lib/relayerClient.ts` | M | part (tests exist; independent on-chain confirm not confirmed) |
| 37 | Watch-only/PSBT default for BTC; keep signing keys off server | PR BTCPay | `packages/btc-payjoin`, `apps/web/src/features/btc` | M | part (client-side wallet; PSBT flow not confirmed) |
| 38 | Credential-rotation + dependency-version runbook (BTCPay-style incident) | PR BTCPay | `docs/remote/security-specs/incident-response.md` | S | part (IR spec exists) |
| 39 | Counterparty/provider exposure cap and exit path | PR Moore/Christin | `docs/operators`, `docs/threat-model/THREAT_MODEL.md` | S | miss |
| 40 | Ledger reconcile test: sum(balances)==on-chain holdings | FP FTX | `apps/relayer/src` | S | miss (non-custodial; likely N/A, confirm) |
| 41 | ERC-4337 bundler/paymaster griefing review (if AA in scope) | BP12 | `packages/payer-sponsor`, `packages/payer-hiding-contracts` | M | part (payer-sponsor exists; review not done) |
| 42 | MPC/TSS: ZK-proof-all-rounds, pinned libs (only if TSS added) | PR TSSHOCK | n/a | L | miss (N/A today) |

## P3 (standards alignment, docs, low value)

| # | Control | Src | Target | Eff | Status |
|---|---|---|---|---|---|
| 43 | ASVS 5.0 mapping (V2,V5,V13,V14) | BP13 | `docs/` new | M | miss |
| 44 | CCSS L1 then L2 as external-audit goal; verify against C4 original | BP14, PR CCSS | `docs/audits/` | M | miss |
| 45 | Common Criteria-style security target / assurance evidence | RB12 | `docs/threat-model/` | L | part (THREAT_MODEL.md exists; no ST) |
| 46 | Crypto-boundary doc; no FIPS 140-3 claim | RB8 | `packages/core-crypto/README.md` | S | part (RNG uses getRandomValues in rng.ts; boundary doc not confirmed) |
| 47 | Cross-link successor standards from playbook; cite Rainbow by NCSC-TG number only | RB1, BP18 | `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` | S | miss |
| 48 | PCI-style key lifecycle (split knowledge/dual control) for deployer keys | RB14 | `scripts/testnet/deploy.sh`, `docs/DEPLOYMENT_MANIFEST.md` | S | miss (only if card rails added) |
| 49 | RASP-style runtime checks | PR Alberta | `apps/relayer` | L | miss (low evidence) |
| 50 | SCSVS / SWC full-list mapping | BP10 | `docs/audits/` | M | miss |

## Do not do / caveats

- Monero/Tor deanonymization items (PR) are background; no Monero in scope.
- NIST IR 7765 unverified, do not cite. Rainbow Book numbers conflict (Light Pink); cite by TG number after verifying.
- Tron and Solana-specific research is thin (BP5 note, FP gaps).
- Payment-processor incident research (Coinbase Commerce, BitPay, Chainalysis heuristics) not done in any input doc.

## Counts

P0 10, P1 16, P2 16, P3 8 = 50. impl 3 (#9,#16,#17), part 31, miss 16.
