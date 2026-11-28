# B3 feature inventory (candidate 7a620ff1)

| id | name | tier | impl% | verif% | status | effort | strategy |
|---|---|---|---|---|---|---|---|
| F-BTC-01 | BIP-352 silent payments: keys, addresses, sender derive, receive scan, spend (full-profile web) | beta-supporting | 90 | 80 | IMPLEMENTED_UNVERIFIED | M [2, 4] | consolidate |
| F-BTC-02 | BTC header-chain validation, persistence, scan anchoring (A4 PR #74) | beta-supporting | 90 | 75 | IMPLEMENTED_UNVERIFIED | S [1, 3] | consolidate |
| F-BTC-03 | BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node Esplora, 2-oracle cross-check, worker | full-profile | 90 | 75 | IMPLEMENTED_UNVERIFIED | M [1, 3] | consolidate |
| F-BTC-04 | BTC family engine (LTC/DOGE etc. SP w/ ChainParams) — standalone | experimental | 70 | 60 | EXPERIMENTAL | M [3, 6] | defer |
| F-BTC-05 | BTC PayJoin BIP-78 policy core + v1 HTTP transport (+ optional BIP-77 ffi, unverified) | experimental | 70 | 75 | EXPERIMENTAL | L [4, 8] | defer |
| F-SOL-01 | Solana dual-key ed25519 stealth (solana-stealth) wired to web full profile | full-profile | 75 | 70 | EXPERIMENTAL | L [4, 8] | consolidate |
| F-SOL-02 | chain-solana alt stealth PoC (CLI only) | experimental | 60 | 60 | EXPERIMENTAL | M [2, 4] | consolidate |
| F-TRX-01 | Tron stealth adapter (tron-adapter) wired to web full profile | full-profile | 75 | 70 | EXPERIMENTAL | L [4, 8] | consolidate |
| F-TRX-02 | chain-tron alt PoC (CLI only) | experimental | 60 | 60 | EXPERIMENTAL | S [1, 3] | consolidate |
| F-EVMX-01 | Extra EVM chain manifests + fail-closed verifier (Linea, Scroll, zkSync ... 12 chains) | experimental | 60 | 70 | EXPERIMENTAL | M [3, 5] | defer |
| F-POOL-01 | Shielded pool circuits (circom Groth16, withdraw/commitment) — INSECURE dev ceremony | experimental | 70 | 50 | EXPERIMENTAL | XL [15, 30] | defer |
| F-POOL-02 | Shielded pool contracts (GhostPayShieldedPool ERC20/Native, ASP registry) | experimental | 70 | 60 | EXPERIMENTAL | XL [10, 25] | defer |
| F-POOL-03 | Pool prover + pool SDK (client side proving, Poseidon, note mgmt) | experimental | 70 | 70 | EXPERIMENTAL | L [5, 10] | defer |
| F-POOL-04 | Pool withdrawal relayer service (node:http) | full-profile | 75 | 70 | EXPERIMENTAL | L [5, 10] | defer |
| F-POOL-05 | External pools adapter interface (Privacy Pools, Railgun) — shared machinery | experimental | 65 | 65 | EXPERIMENTAL | L [4, 8] | defer |
| F-POOL-06 | Privacy Pools (0xbow) adapter | experimental | 65 | 65 | EXPERIMENTAL | L [4, 8] | defer |
| F-POOL-07 | Railgun adapter | experimental | 55 | 60 | EXPERIMENTAL | L [4, 8] | defer |
| F-POOL-08 | Payer-hiding contracts PH-2 PayRelay / PH-3 7702 delegate / PH-4 4337 account+paymaster | experimental | 70 | 60 | EXPERIMENTAL | XL [8, 15] | defer |
| F-POOL-09 | Confidential amounts client (ERC-7984 / Zama fhEVM backend) + confidential contracts | experimental | 65 | 60 | EXPERIMENTAL | XL [8, 15] | defer |
| F-PRIV-01 | Privacy pipeline (chain steps, cost/leak preview, run) | experimental | 70 | 70 | EXPERIMENTAL | L [4, 8] | defer |
| F-PRIV-02 | Privacy profiles catalogue/presets/conflict rules | experimental | 75 | 75 | EXPERIMENTAL | M [2, 4] | consolidate |
| F-PRIV-03 | Metadata hardening MH-* helpers | experimental | 70 | 75 | EXPERIMENTAL | M [2, 4] | consolidate |
| F-PRIV-04 | Amount blur (split/round/jitter, Off by default) | experimental | 75 | 75 | EXPERIMENTAL | S [1, 3] | defer |
| F-PRIV-05 | Delayed multi-hop forwarding (Weak) | experimental | 70 | 75 | EXPERIMENTAL | M [2, 4] | defer |
| F-NET-01 | Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP framing + browser fetch transport | beta-supporting | 70 | 65 | PARTIAL | M [2, 5] | consolidate |
| F-NET-02 | Onion URL canonicalization / v3 checksum, reject escaped authorities (PR #122/#134) | beta-supporting | 95 | 85 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-NET-03 | PIR two-server XOR private scan (pir2 scan mode, default OFF) | experimental | 70 | 65 | EXPERIMENTAL | L [5, 10] | defer |
| F-NET-04 | Network test harness (fake SOCKS5/CONNECT proxies; test-only) | experimental | 100 | 60 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-FUT-01 | 5a: No accounts / identifying telemetry | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-02 | 5b: Local encryption and key management | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-03 | 5c: Fresh EVM stealth destinations + local discovery | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-04 | 5d: Privacy-preserving RPC and scanning | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-05 | 5e: Sweep privacy + linkability analysis | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-06 | 5f: Encrypted invoice + metadata minimization | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-07 | 5g: HTTPS and Tor hosting w/ verifiable boundaries | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-08 | 5h: Optional broadcast + gas sponsorship without custody | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-09 | 5i: Buyer-side privacy adapters + identity separation | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-10 | 5j: Confidential amount + settlement integrations | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-11 | 5l: Reproducible builds + release integrity | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-12 | privacy-first 01: GhostTips donations | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-13 | privacy-first 02: GhostStore static storefronts | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-14 | privacy-first 03: Private payment links/QR | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-15 | privacy-first 04: Local merchant dashboard | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-16 | privacy-first 05: GhostProof selective disclosure | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-17 | privacy-first 06: Encrypted backups + full recovery | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-18 | privacy-first 07: Private multi-recipient payouts | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-19 | privacy-first 08: Portable merchant identities | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-20 | privacy-first 09: In-person QR checkout | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-21 | privacy-first 10: Private recurring invoices | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-22 | privacy-first 11: Encrypted collaboration | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-23 | privacy-first 12: P2P offramp handoff | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-24 | privacy-first 13: Privacy-aware fiat conversion | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-25 | privacy-first 14: Privacy-aware multichain routing | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-26 | privacy-first 15: Private scanning/RPC/broadcast | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-27 | privacy-first 16: Per-client identities | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-28 | privacy-first 17: Private sweeping/offline funds | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-29 | privacy-first 18: Selectable privacy modes | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-30 | idea 01: Sweep + link hygiene | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-31 | idea 02: Claim-by-tx-hash + spam filter | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-32 | idea 03: Per-client meta-addresses | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-33 | idea 04: Encrypted backup/restore | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-34 | idea 05: Tor/onion/proxy RPC + padded queries | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-35 | idea 06: Watch-only + airgapped signer | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-36 | idea 07: Selective-disclosure receipts | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-37 | idea 08: Multi-relayer + self-submit | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-38 | idea 09: 'What is public' explainer | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-39 | idea 10: Client-side hosting constraints | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-40 | Spec 18 / req 3q stealth keypair export (reference only; owned by B1b) | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |
| F-FUT-41 | Hosted BTC scan service (mode C / Frigate-style) | future | 0 | 0 | SPEC_ONLY | M [2, 10] | defer |

## Notes

- **F-BTC-01** Real, wired in full profile (App.tsx 'btc' view; absent from AppLean). Package has BIP-352 official vectors (vectors.test.ts) + regtest-mocked spend. Needs real-node/regtest acceptance + PR #113 local spend tracking verdict.
- **F-BTC-02** headersync/headerchain/merkleProof/witness in btc-silent-payments; web headers.ts persists + anchors scans. Verify PR #74 equivalent; PoW/difficulty checks real but no real-network sync run.
- **F-BTC-03** scan/{blindbit,blindbitGrpc,grpcWebUnary,scanner,state}.ts + web oracleSource/scanWorker. Handoffs TEAM_H_*. Needs deployed BlindBit server compat (fixtures only); optional external oracle = operator dependency, default Esplora-only/no oracle URL.
- **F-BTC-04** README: research/testnet only, not imported by web/cli, duplicate of btc-silent-payments code. Keep, label experimental; decide merge-or-freeze later.
- **F-BTC-05** Testnet-only; mainnet refused by design. Not wired to apps. v1 receiver needs a payjoin server (operator) -> optional only. BIP-77 adapter unverified. Blockers: requires receiver HTTP endpoint (server) -> not beta-core.
- **F-SOL-01** ADR-0017. Wired: web SolanaView, devnet/testnet scoped. Unaudited. Fixture test-vectors/solana-stealth.json. Not interoperable with chain-solana (different formats).
- **F-SOL-02** Duplicate Solana format (gpsol:/gpst1 base64url) used by CLI chain commands only; incompatible with solana-stealth. Pick one format before any beta claim. Defects: format split with solana-stealth (README + DEVIATIONS).
- **F-TRX-01** ADR-0019. Wired in web TronView; testnet-scoped; unaudited; secp256k1 stealth, TRC-20 txs, protobuf. Meta tag st:trx:0x.
- **F-TRX-02** Uses st:eth:0x tag; NOT interoperable with tron-adapter (README). No network/signing. Merge into or retire for tron-adapter. Defects: meta-address tag mismatch vs tron-adapter.
- **F-EVMX-01** Config-only, all enabled:false, many fields 'unverified'. No deployments. Not imported by web/cli. Beta is EVM core (Sepolia). zkSync needs non-standard CREATE2 (rejected).
- **F-POOL-01** Deterministic public-beacon dev ceremony: anyone can forge proofs. Forked from 0xbow. Needs real multi-party ceremony + circuit audit. TS helpers testable; circom toolchain not run here. Defects: INSECURE dev ceremony (documented, intended for testnet).
- **F-POOL-02** Foundry; testnet chain guard; forge tests run in CI (pool-contracts matrix, ci.yml ~L473), NOT run here (no forge). Verifiers insecure dev ceremony. Never deployed.
- **F-POOL-03** Client SDK testnet-only; browser proving not wired to apps. Large proof artifacts (zkey) would bloat static app.
- **F-POOL-04** Server process w/ hot key (relayer-hiding of gas payer). Optional operator component, never beta-core; user can self-submit instead. Anvil e2e needs anvil (not installed -> skipped). Blockers: requires operator-run server + hot gas key (constraint 2: optional operator only).
- **F-POOL-05** S1->third-party pool->fresh addr. Not wired. Chains 31337/Sepolia/Base Sepolia. Nothing run against real pools.
- **F-POOL-06** SDK crypto tests, anvil integration test (needs anvil), relayer client. Third-party relayer = remote service dependency.
- **F-POOL-07** Small adapter; third-party infra (Waku/broadcasters) not self-hostable client-side.
- **F-POOL-08** Foundry; CI matrix payer-hiding-contracts (ci.yml:473). Paymaster has SPONSOR_ADMIN privileged role (sponsor deposit only, not user funds). Sponsor sees everything; does not hide payer. forge not run here.
- **F-POOL-09** CT-1 PoC on Zama fhEVM; hardhat tests (confidential-contracts) not run here (fhevm plugin heavy); client pkg vitest. Mainnets refused; Base Sepolia refused for CT-1. Not wired.
- **F-PRIV-01** Pure logic orchestrator over method pkgs; not wired to web; testnet only.
- **F-PRIV-02** No-I/O catalogue of 10 method specs + honest label keys; natural source for spec-18-style 'privacy modes' UI; not wired.
- **F-PRIV-03** Pure helpers; docs: each reduces one named leak; not wired; some map to web privacy hardening (separately implemented in apps/web/src/lib).
- **F-PRIV-04** Friction not anonymity; pure logic, not wired.
- **F-PRIV-05** Labelled Weak; used as type source by hygiene (hop-source.ts) only. Requires relayer/timer => long-lived client or operator. Blockers: delayed legs need an always-on client/relayer -> conflicts static-client model unless user keeps tab open.
- **F-NET-01** net-transport: browser subpath wired into web scanPrivacy (user-selected; default direct, never automatic). Node SOCKS5h agent + OHTTP are node/PoC only (browser can't open SOCKS). OHTTP needs gateway/relay operators.
- **F-NET-02** onion.ts v3 checksum + url.ts; origin/chatgpt/zero-codex/onion-canonical-host-20261111 (72dde82d) is ancestor of cand with 0 unique patches (census) => landed. Verify tests pass with net-transport run.
- **F-NET-03** Needs TWO non-colluding operator-run servers (violates constraint 2 for core) -> optional operator/experimental only. createPir2Source in scan-source; web imports scan-source but pir2 UI not wired (INFERRED; no pir2 ref in web non-test src). Blockers: requires 2 operator servers.
- **F-NET-04** Test-only loopback fakes; only 1 test file. Used by net-transport tests; never bundled.
- **F-FUT-01** Spec only. Maps to: apps/web/src/privacyInvariants.test.ts, ci:scan-secrets (partial guard exists).
- **F-FUT-02** Spec only. Maps to: secret-box, ux-vault, ux-export.
- **F-FUT-03** Spec only. Maps to: core-crypto scheme-1, hygiene, scan-source.
- **F-FUT-04** Spec only. Maps to: net-transport, scan-source, apps/web/src/lib/scanPrivacy.ts, pir-two-server (spec 10 stage-1 partial).
- **F-FUT-05** Spec only. Maps to: hygiene, hops, ux-flow.
- **F-FUT-06** Spec only. Maps to: invoice-schema, metadata-hardening, payment-uri.
- **F-FUT-07** Spec only. Maps to: net-transport/onion.ts, docs/research/hosting.md, CI pages.
- **F-FUT-08** Spec only. Maps to: payer-sponsor, relayer-guard, payer-hiding-contracts.
- **F-FUT-09** Spec only. Maps to: external-pools*, pool-sdk, privacy-pipeline, payer-hiding-contracts.
- **F-FUT-10** Spec only. Maps to: confidential-amounts, confidential-contracts (CT-1 PoC).
- **F-FUT-11** Spec only. Maps to: scripts/build-workspaces.mjs, ops-monitor, CI (owned B-release; ref only).
- **F-FUT-12** Spec only. Maps to: donation, payment-uri.
- **F-FUT-13** Spec only. Maps to: merchant-*, invoice-schema.
- **F-FUT-14** Spec only. Maps to: payment-uri, qr-exchange, ux-links.
- **F-FUT-15** Spec only. Maps to: merchant-ledger, ux-receipts.
- **F-FUT-16** Spec only. Maps to: ux-receipts, specs/ideas/07.
- **F-FUT-17** Spec only. Maps to: ux-vault, ux-export, spec 18 (B1b).
- **F-FUT-18** Spec only. Maps to: merchant-multisig, privacy-pipeline.
- **F-FUT-19** Spec only. Maps to: policy-scheme, merchant-hooks.
- **F-FUT-20** Spec only. Maps to: qr-exchange, ux-flow.
- **F-FUT-21** Spec only. Maps to: ux-schedule.
- **F-FUT-22** Spec only. Maps to: merchant-multisig, secret-box.
- **F-FUT-23** Spec only. Maps to: (none).
- **F-FUT-24** Spec only. Maps to: ux-fiat.
- **F-FUT-25** Spec only. Maps to: chain-adapters, btc-*, solana-stealth, tron-adapter, chain-evm-extra.
- **F-FUT-26** Spec only. Maps to: net-transport, scan-source, pir-two-server.
- **F-FUT-27** Spec only. Maps to: ideas/03, core-crypto.
- **F-FUT-28** Spec only. Maps to: hygiene, ux-vault.
- **F-FUT-29** Spec only. Maps to: privacy-profiles, ux-privacy.
- **F-FUT-30** Spec only. Maps to: hygiene pkg (exists; see B-owners). Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-31** Spec only. Maps to: scan-source, apps scan. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-32** Spec only. Maps to: core-crypto. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-33** Spec only. Maps to: ux-vault, ux-export. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-34** Spec only. Maps to: net-transport, web scanPrivacy (largely implemented stage 1). Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-35** Spec only. Maps to: qr-exchange, tx-review. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-36** Spec only. Maps to: ux-receipts. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-37** Spec only. Maps to: relayer-guard, apps/relayer. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-38** Spec only. Maps to: ux-guide, ux-sandbox, sandbox. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-39** Spec only. Maps to: cross-cutting. Idea spec; some pieces may exist in other teams' scope.
- **F-FUT-40** Spec only. Maps to: ux-export, secret-box, core-crypto. Referenced, not duplicated; spec says approved, not yet implemented. Counterpart 5k.
- **F-FUT-41** Spec only. Maps to: btc-silent-payments/scan. ADR-gated; sends scan key to server; violates constraint 3 by default - keep absent.

## Test run log (local vitest @7a620ff1, no coverage)

- btc-family: files 9 passed (9) | tests 162 passed (162) | exit=0
- btc-payjoin: files 10 passed (10) | tests 158 passed (158) | exit=0
- btc-silent-payments: files 32 passed (32) | tests 559 passed (559) | exit=0
- chain-evm-extra: files 5 passed (5) | tests 44 passed (44) | exit=0
- chain-solana: files 10 passed (10) | tests 97 passed (97) | exit=0
- solana-stealth: files 6 passed (6) | tests 109 passed (109) | exit=0
- chain-tron: files 4 passed (4) | tests 42 passed (42) | exit=0
- tron-adapter: files 8 passed (8) | tests 74 passed (74) | exit=0
- confidential-amounts: files 7 passed (7) | tests 88 passed (88) | exit=0
- external-pools: files 5 passed (5) | tests 93 passed | 1 skipped (94) | exit=0
- external-pools-privacypools: files 7 passed | 1 skipped (8) | tests 73 passed | 4 skipped (77) | exit=0
- external-pools-railgun: files 3 passed | 1 skipped (4) | tests 20 passed | 1 skipped (21) | exit=0
- pool-circuits: files 3 passed | 2 skipped (5) | tests 18 passed | 59 skipped (77) | exit=0
- pool-prover: files 1 passed (1) | tests 8 passed (8) | exit=0
- pool-relayer: files 5 passed | 2 skipped (7) | tests 43 passed | 9 skipped (52) | exit=0
- pool-sdk: files 5 passed (5) | tests 47 passed (47) | exit=0
- privacy-pipeline: files 12 passed (12) | tests 747 passed (747) | exit=0
- privacy-profiles: files 5 passed (5) | tests 176 passed (176) | exit=0
- metadata-hardening: files 10 passed (10) | tests 115 passed (115) | exit=0
- amount-blur: files 8 passed (8) | tests 96 passed (96) | exit=0
- hops: files 8 passed (8) | tests 57 passed (57) | exit=0
- pir-two-server: files 4 passed (4) | tests 60 passed (60) | exit=0
- net-harness: files 1 passed (1) | tests 27 passed (27) | exit=0
- net-transport: files 4 passed (4) | tests 149 passed (149) | exit=0

## Wiring summary
- Lean profile (AppLean.tsx): none of btc/solana/tron/pools/privacy pkgs.
- Full profile (App.tsx): BtcView, SolanaView, TronView; net-transport/browser via scanPrivacy.ts (both profiles via lib).
- CLI: chain-solana, chain-tron.
- Everything else: standalone, no importer in apps/*.
- Foundry contracts (pool-contracts, payer-hiding-contracts) tested in CI only; forge/anvil/circom not installed here.
