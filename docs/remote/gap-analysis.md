# Gap analysis: specs vs code

Branch `claude/remote-extensions-3`, 2026-10-21. Method: specs and DEVIATIONS read, then claims spot-checked against source with grep/read. No tests, `forge` or `npm install` were run, so test counts and coverage figures are quoted from docs and not re-verified. `docs/audits/01-completeness-audit.md` is partly stale; where it conflicts with code, the code check below wins. Several items the docs call "in progress" are still unbuilt in this tree (manifest read-back, scan verification, fiat disable, ERC-6538, `flatSecurity`).

Status: done / partial / missing / ADR (out of scope or gated by an ADR). Gap size: S (under a day), M (days), L (week or more, or needs a design decision).

## 1. Module and feature table

### Contracts (`packages/contracts`)

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| GhostPayRouter (ERC-20, permit, native, buffer, 25 bps, strict metadata) | done | `src/GhostPayRouter.sol`; tests `GhostPayRouter{,.fuzz,.invariant}.t.sol` | - |
| GhostPaySweepRelayer (EIP-712 + permit, nonce bitmap) | done | `src/GhostPaySweepRelayer.sol`, `GhostPaySweepRelayer*.t.sol` | - |
| PolicyAccount + Factory (scheme 0x47500002) | partial (ADR-0014 experimental) | `src/PolicyAccount*.sol`; no recovery path | L |
| GhostPayPolicyRouter (announce scheme 0x47500002) | done in contracts; not in the TS stack except `policy-scheme` | `src/GhostPayPolicyRouter.sol`, `packages/policy-scheme/src/router.ts` | - |
| Unit / fuzz / invariant tests, mock-token matrix | done | `test/*.t.sol`, `test/mocks` | - |
| Event ABI test vs canonical announcer, CC0 reference fork-style test | unverified | no reference announcer source in `test/` | S |
| Echidna | done (300k calls per harness) | `test/echidna/`, `docs/remote/contracts-assurance.md` | multi-seed/long run is S |
| Mythril, mutation testing | missing here | only referenced from branch `remote-extensions-2` | M |
| Deterministic announcer/registry deploy script and codehash check | partial | `Deploy.s.sol` accepts `EXPECTED_ANNOUNCER_CODEHASH`; no `DeployAnnouncer.s.sol`, no 0x4e59 CREATE2 usage in `script/` | S |
| CREATE2 for GhostPay contracts | missing | none in `script/` | S |
| Actual deployment, manifest, smoke script | missing (owner secrets) | `deployments/` holds only `schema.json`, `README.md`; no smoke script | L (needs key) |
| External audit | missing (owner) | audits are self-run | L |
| Pull-vault for fee recipient blacklist risk | ADR-0013 rejected | ADR-LOG | - |
| `foundry.toml` portable (`solc = /home/user/tools/solc`) | partial | README documents sandbox line | S |

### core-crypto, invoice-schema, policy-scheme

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| Scheme-1 stealth derivation, view tag, differential vs SDK | done | `packages/core-crypto/src/stealth.ts`, `differential.test.ts`, `test-vectors/scheme1.json` | - |
| Invoice schema, signing, AES-GCM envelope, `#gpi=v1.` | done | `packages/invoice-schema/src/*` | - |
| Total cross-check (items + tax = fiat) in package | partial (done in web UI only) | invoice-schema DEVIATIONS 3, web DEVIATIONS 17 | S |
| Invoice `schemeId` other than 1 | missing (ADR-0014 gate) | `schema.ts:47` `schemeId: 1` | M |
| Scheme-2 derivation, scanner, limits tree, calldata, vectors | done as library | `packages/policy-scheme/src/*`, `test-vectors/policy-scheme.json` | - |
| Policy scheme in web/relayer/chain-adapters | ADR (gated) | ADR-0014; no import of policy-scheme in `apps/` | L |
| Reviewed ADR for scheme-2 meta-address format | missing | policy-scheme DEVIATIONS S1 | S |

### chain-adapters

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| Chain table, token allowlist | partial | `config/chains.ts` (9 chains, 2 enabled testnets), `config/tokens.ts` (2 testnet USDC). Gnosis absent | M (needs doc verification) |
| `fees.ts` fee/buffer/sponsor maths | done | `src/fees.ts` | - |
| Fee parity vs compiled router (differential execution) | missing | DEVIATIONS 13: vectors + regex only | M (anvil test, relayer e2e already does anvil) |
| Manifest validation | done (format only) | `deployments.ts` | - |
| Manifest read-back (`FEE_RECIPIENT()`, `ANNOUNCER()`, `FEE_BPS()`, codehash) | missing | grep for `eth_getCode`/`FEE_RECIPIENT()` finds nothing in app code | M |
| Manifest signature verification | missing (needs release key) | `signature` optional, never checked | M (code) + owner key |
| `rpc.ts` incl. fallback reconciliation | partial | `requestWithFallbackCheck` exists, unused by scanner | S |
| `logs.ts` paginated, reorg-safe, hostile-log tolerant | done | `src/logs.ts` | - |
| `quote.ts` Chainlink with checks | partial | code fails closed; `FEEDS` is empty (`quote.ts:36`) | M (needs verified feed addresses) |
| Uniswap TWAP source | missing | spec'd in ADR-0012, not built | M |
| L2 sequencer-uptime check | missing | ADR-0012 point 4 | S |
| `router.ts` builders + calldata decode | done | `src/router.ts` | - |
| `sweep.ts` EIP-712 + permit builders | done | `src/sweep.ts` | - |
| ERC-6538 registry ABI and builders | missing | no registry reference in `chain-adapters/src` | S |
| ABIs for PolicyRouter/PolicyAccount | missing here (in `policy-scheme`) | `policy-scheme/src/abi` | S |
| `ChainAdapter` interface (`parseRecipient`, `buildPaymentRequest`, `scan`, `fees`) | partial | `adapter.ts` EVM-shaped, `family` field present | M |
| `flatSecurity` capability | partial | hard-coded `'not_deployed'` at `adapter.ts:156`, although ADR-0014 says it reflects `manifest.policy` | S |
| Bitcoin adapter wiring | partial | `btc-silent-payments/src/adapter-types.ts` copies the interface; not integrated | L |

### btc-silent-payments (Tier 2)

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| BIP-352 keys, sp1 address, labels, sender, receiver | done (official vectors) | `src/{keys,address,sender,receiver,labels}.ts` | - |
| BIP-21/BIP-321 `sp=` URI | done | `src/uri.ts` | - |
| BlindBit oracle scanner | partial | `src/scan/blindbit.ts`: HTTP `/info`, `/tweaks`, `/utxos` only; gRPC missing, never run on a real oracle | M |
| Spend (PSBT, key path) | done (unverified on network) | `src/spend.ts` | S (no testmempoolaccept) |
| Own-node `TweakSource`, reorg tracking, scan persistence | missing | DEVIATIONS "Out of scope" | M |
| Integration in web (invoices with `chain: bitcoin-mainnet`, QR, wallet instructions) | missing | no `btc-silent-payments` import in `apps/web` | L |
| Frigate-style hosted scanning | ADR/spec out of scope | MULTICHAIN s4 | - |
| Solana, LTC/DOGE/BCH, Monero/Zcash, Tron | out of scope by spec | MULTICHAIN s5 | - |
| Bitshala differential reference | missing | DEVIATIONS (not installed) | S (needs install) |

### apps/web

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| Home, Seller keys, Create, Pay, Scan, Sweep, Settings, About | done | `src/views/*` | - |
| Keystore (scrypt 2^17 + AES-GCM) | done | `src/lib/keystore.ts` | - |
| ERC-6538 publish | missing | `SellerKeys.tsx` only warns | M |
| Fiat-quote invoices | partial / disabled-in-practice | `CreateInvoice.tsx:126` still offers option with warning; ADR-0012 says disable | S |
| Pay: calldata-vs-preview assertion, independent RPC re-fetch | done | `src/lib/payExec.ts`, `pay.ts` | - |
| Fee recipient / contracts from manifest, authenticated | partial | `manifest.ts` fetches unauthenticated manifest | M |
| Scan: verify non-router announcement amounts | missing | `scanClient.ts:125` only sets `viaRouter`; `Scan.tsx:198` labels it, but no `Transfer`/`balanceOf` check | M |
| Scan: finality gating, invoice reconciliation by nonce/amount | partial | not seen in `scannerCore.ts` | M |
| Sweep: relayed (permit) and direct | done | `src/lib/sweep.ts`, `relayerClient.ts` | - |
| Sweep: destination history / linkability check | missing | README says generic notice only | S |
| Feature 1 gas buffer | partial | fixed 100k gas estimate; no fiat estimate, no simulate, no permit+buffer | M (contract change for permit+buffer) |
| Feature 2 embed | partial | popup-only, takes full link; no `postMessage`, no iframe, no merchant profile | M |
| Feature 4 local tags | partial | encrypted IndexedDB; no archive export/import, no key rotation | M |
| Feature 6 jitter | done | `src/lib/jitter.ts` | - |
| Feature 5 stage 1 (Tor/proxy-aware, padded/fixed-window queries) | missing | no proxy/padding code in web or chain-adapters | M |
| Feature 5 stages 2-3 / `apps/indexer` | out of scope (planned) | audit 01 G-33 | L |
| CSP / `_headers` / bundle scan | done (never run on a real host) | `public/_headers`, `scripts/scan-bundle.mjs` | - |
| Playwright egress assertion in pay/scan/sweep flows | partial | audit 01 s5 item 12; `flows.spec.ts` | S |
| Release-hash widget | partial (self-attested) | audit 03 S3-04 | doc/UX S |
| WalletConnect adapter, i18n | missing (optional) | web DEVIATIONS 7 | M |
| Accessibility (axe, screen reader), Firefox/WebKit | missing | `playwright.config.ts` single project | S (axe + projects) |
| `apps/web` README | missing | file list: no `apps/web/README.md` | S |

### apps/relayer

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| `/v1/quote`, `/v1/sweep`, `/healthz`, `/v1/info`, limits, budget, lane, breaker | done | `src/{server,service,limiter,budget,lane,breaker}.ts` | - |
| Breaker half-open latch fix (S3-05) | done | `service.ts:73,177` has `degraded` status; verify behaviour | S |
| Oracle-based pricing | partial | static operator constants (`pricing.ts`) | M (needs feeds) |
| Metrics endpoint / alert webhook | missing | no metrics route in `src/` | S |
| PolicyGate sanctions screen | ADR-0006 hook only | default allow-all | owner decision |
| Anvil e2e runs (not skipped) in CI | done | `ci.yml` lines 38-53 | - |
| Real-chain test | missing (needs deployment) | - | L |
| Relayer client package (`@ghostpay/relayer-adapter`) | out of scope (in `apps/web/src/lib/relayerClient.ts`) | APP spec delta table | - |

### Docs, release, ops

| Spec item | Status | Evidence | Gap |
|---|---|---|---|
| ADR 0001-0015 | done | `docs/adr/ADR-LOG.md` | - |
| Docs: user guides, operator runbooks, reviews | done | `docs/user/`, `docs/operators/`, `docs/reviews/` (F1, F2, F4, F6, P1, P2) | - |
| Threat model STRIDE/LINDDUN with DFDs and attack trees | partial | `docs/threat-model/THREAT_MODEL.md` | M |
| THIRD_PARTY.md, DEPLOYMENT_MANIFEST.md, `.env.example`, SECURITY.md | done | root files | - |
| `third-party-additions.md` rows merged into THIRD_PARTY.md | missing | `docs/remote/third-party-additions.md` | S |
| `audits/` path referenced by SECURITY.md | partial | only `docs/audits/` | S |
| CI (TS, e2e, contracts incl. Slither/coverage/snapshot), nightly, release, repro scripts | done as files, never observed green | `.github/workflows/*`, `scripts/*` | needs push |
| Nightly: Echidna/Mythril/mutation steps | verify | `nightly.yml`; Echidna harnesses now exist | S |
| `forge snapshot --check`, coverage in CI | done | `ci.yml` 105-107 | - |
| Release signing, SBOM publication, fingerprint | ADR-0015 gated (owner key) | `release.yml` stops at draft | owner |
| Hosting, domain, ENS, IPFS, Tor | ADR-0015 gated | - | owner |
| LICENSE, terms, privacy notice, legal | missing (owner) | no `LICENSE`; packages `UNLICENSED` | owner |
| Pen-test / observer measurements on testnet | missing (needs deployment) | `docs/audits/poc/` are local PoCs | L |
| Stale-doc hygiene (Roadmap F1 `invoiceId`, Playbook s5 names, DEV spec package map, SPEC_REVIEW C5 Feature 5 claim, contracts README test counts, audit 01 s5 items 6-10) | partial | audit 01 section 5 | S |

## 2. Gaps closable in-repo without owner secrets or deployments, ranked

Ranking = security value, then spec contradiction, then effort.

1. **Manifest read-back verification** (chain-adapters + web Pay + relayer start). Read `FEE_RECIPIENT()`, `ANNOUNCER()`, `FEE_BPS()`, and compare `eth_getCode` keccak with `bytecodeHashes` (account for immutables), fail closed. Unit-test with mock RPC, anvil-test with compiled router. Size M. (Audit S3-01 / A-07 / G-05.)
2. **Verify non-router announcements in Scan** (`scanClient.ts`, `scannerCore.ts`, `Scan.tsx`): check `Transfer` logs or `balanceOf` at the stealth address before showing an amount, show "claimed" otherwise, gate on `finalityDepth`. Size M. (S3-02, G-04.)
3. **Disable fiat-quote option in `CreateInvoice.tsx`** until `FEEDS` is non-empty; Pay already fails closed. Size S. (ADR-0012, G-03.)
4. **ERC-6538 registry**: add ABI + builders to chain-adapters (canonical `0x6538...6538`, runtime code check), a "Publish meta-address" action with a public-association confirmation, test against CC0 reference compiled locally. Size S for ABI, M for UI. (G-07, W-03.)
5. **Router fee differential test** via anvil in chain-adapters (reuse relayer's anvil harness `apps/relayer/src/harness.testutil.ts`): execute the compiled router and compare to `fees.ts` including 399/400 boundaries. Size M. (Fixes FEE_SCHEDULE s4 claim.)
6. **`flatSecurity` from manifest**: replace hard-coded `'not_deployed'` (`adapter.ts:156`) with `available` when `manifest.policy*` present, plus tests. Size S. (ADR-0014 point 2.)
7. **Wire RPC fallback reconciliation into the scanner** (`requestWithFallbackCheck`, second-provider log comparison at checkpoints) and add an L2 sequencer-uptime guard in `quote.ts`. Size S-M. (A-09, G-21, ADR-0012.)
8. **Feature 4 encrypted archive export/import + key rotation** using the keystore's scrypt format, with round-trip and locked-vault tests. Size M. (G-18.)
9. **Feature 5 stage 1**: proxy/Tor-aware fetch option, fixed-window padded `getLogs`, in chain-adapters and Settings; fix SPEC_REVIEW C5 wording if not done. Size M. (G-20.)
10. **Relayer metrics endpoint and alert webhook** (`/metrics` or JSON stats, low-balance hook). Size S. (R-08, G-26 part.)
11. **Playwright**: egress assertions for pay/scan/sweep with a configured-origin allowlist, axe checks, Firefox/WebKit projects (web DEVIATIONS: Chromium only). Size S-M. (G-25 part.)
12. **Scripts and docs**: `DeployAnnouncer.s.sol` (0x4e59 deterministic deployer + codehash check) and CREATE2 deploy option; make `foundry.toml` portable; merge `docs/remote/third-party-additions.md` into THIRD_PARTY.md; add `apps/web/README.md`; fix stale claims in audit 01 section 5; point SECURITY.md at `docs/audits/`. Size S each.
13. **Sweep destination-history check and sharper linkability copy** (D1). Size S.
14. **Uniswap TWAP quote source** (spec'd, ADR-0012 allowlist item). Size M, lower value because no feeds or pools are verified.
15. **BlindBit gRPC client, own-node `TweakSource`, scan persistence**, then Bitcoin integration into web behind a flag. Size M to L; the web integration needs an ADR on `ChainAdapter` union types first.

## 3. Not closable in-repo (need owner secrets, deployment or decisions)

Testnet and mainnet deployment and manifests (G-01/G-02), verified Chainlink feed and token addresses from provider docs (network-gated; `TODO-VERIFY.md`), release signing key and fingerprint, hosting, licence, terms and sanctions position, fee recipient choice, external audit, real-wallet and real-chain testing, GitHub CI first green run, policy-account recovery design and scheme-2 enablement (ADR-0014 gate), Solana and other Tier-3 chains (out of scope).
