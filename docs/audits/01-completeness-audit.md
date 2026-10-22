# GhostPay completeness audit (01)

- Auditor: independent, read-only (this file is the only file written).
- Repo: `/home/user/ghostpay`, branch `claude/inspiring-fermat-vxv689`. Audited at `1f7ab71`; HEAD moved to `d6e5ea1` (CI lib-build fix + Slither triage, by another session) during the audit and that commit is taken into account.
- Method: every spec in the brief read in full; every claim in package READMEs / `DEVIATIONS.md` re-checked against code; all test suites actually executed (section 2). No `npm install`, no commits, no network.
- Concurrency note: other sessions were editing the tree while this audit ran. Untracked `packages/contracts/test/audit/*.t.sol` (not mine) currently fails to compile (`Error 2527`, `Sweep.audit.t.sol:24`), so `forge build/coverage` is broken in the working tree until that is fixed or removed. My forge run (225 pass) happened before those files appeared. `forge coverage` / `forge snapshot --check` could therefore not be re-run, so the "100 % coverage" claim in `packages/contracts/README.md` is **not re-verified**.

Status legend: **Done** (implemented and evidenced), **Partial**, **Missing**, **Deviates** (built differently from spec, or doc contradicts code), **Planned** (explicitly out of scope / specified-only).

**Counts (209 traceability rows in section 3):** Done 106, Partial 31, Missing 55, Deviates 10, Planned 7 (Bitcoin tier, Solana, EIP-3009, ERC-4337 paymaster/sponsorship, Feature 3, Feature 5 stages 2-3 are all confirmed specified-only). Rows whose subject is a single sentence in a spec may be counted individually; the P0-P3 list in section 4 is the actionable summary.

---

## 1. Executive summary

The core engine is genuinely strong: contracts, crypto, invoice envelope, chain-adapters, relayer and the web app are implemented to a high standard, and all automated suites pass. The gaps are almost entirely in what surrounds the code:

1. **Nothing is deployed or integrated for real.** `deployments/` holds only `schema.json` and a README; the web app disables payment without a manifest; every wallet / RPC / relayer interaction in the tests is a mock (only the relayer has an anvil e2e). No testnet deployment, smoke test or live-wallet run exists.
2. **The fiat-quote path cannot work**: `FEEDS` is empty, token addresses and chain parameters are unverified (`TODO-VERIFY.md`), yet the Create page offers "Fiat price".
3. **Policy-guarded account (scheme `0x47500002`) is contracts-only**: no TS derivation, no announcement path (router hard-codes scheme 1), no scanner, no UI, no ADR, no vectors, no recovery path.
4. **ERC-6538 publish flow, wallet-facing registry lookup: not built** (a warning paragraph only).
5. **Release engineering is almost absent**: no release workflow, SBOM, SHA256SUMS, reproducible-build script, release manifest, signing, IPFS/ENS/Tor jobs, nightly deep jobs (Echidna/Mythril/mutation), e2e in CI.
6. **Docs required by Playbook 1.3 do not exist**: `docs/user/`, `docs/operators/`. Also missing: `THIRD_PARTY.md`, `DEPLOYMENT_MANIFEST.md` (both claimed by SPEC_REVIEW), per-feature Phase B security reviews, a real STRIDE/LINDDUN threat model.
7. **Several README / DEVIATIONS / SPEC_REVIEW claims are false or overstated** (section 5), notably "Feature 5 stage 1 built" and "differential test against the compiled router".

---

## 2. Test and tooling results (actually run)

| Suite | Command | Result |
|---|---|---|
| core-crypto | `npm test` (vitest + v8 coverage) | 7 files, **54 passed**; coverage 98.95 / 98.01 / 100 / 98.75 (thresholds 95/90/95/95 met) |
| invoice-schema | `npm test` | 7 files, **174 passed**; 99.36 / 99.27 / 100 / 99.48 |
| chain-adapters | `npm test` | 10 files, **216 passed**; 98.45 / 98.45 / 95.87 / 99.5 |
| relayer | `npm test` | 6 files, **193 passed**, including the anvil e2e against the real `GhostPaySweepRelayer` (ran, not skipped) |
| web (unit) | `npx vitest run` | 29 files, **320 passed** (first run under `npm test` printed only the coverage tail, no failure lines; re-run confirmed 320/320); coverage 95.69 / 91.51 / 92.71 / 97.47 (thresholds 90/85/90/90 met) |
| web (e2e) | `npx playwright test` | **15 passed** (Chromium only) |
| contracts | `forge test` (forge 1.8.5, solc 0.8.28, fuzz 10 000, invariants 256x50) | 11 suites, **225 passed**, 0 failed, 0 skipped |
| contracts | `forge fmt --check`; `scripts/check-natspec.sh` | both **OK** (4 contracts) |
| workspace | `npm run typecheck`; `npm run lint` | both exit 0 |

Totals: 957 vitest + 15 Playwright + 225 Forge = **1 197 tests, 0 failures, no flaky test observed** (each suite run once, web unit twice).
Not run / unavailable: Echidna, Mythril (not installed, not configured: no `echidna.yaml`); Slither not run by me (a triage file `docs/audits/00-slither-triage.md` from another session shows it was run on v0.11.6 with two by-design findings excluded); `forge coverage`, `forge snapshot --check` (blocked, see header); clean-checkout `npm ci` build (not allowed); Firefox/Safari e2e; any real wallet/chain.

---

## 3. Requirement-traceability matrix

Columns: ID | requirement (abbreviated) | spec file section | status | evidence | notes.

### 3.1 Contracts (`packages/contracts`, CONTRACTS_SPEC)

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| C-01 | Solidity 0.8.28, cancun, optimizer 200, OZ 5.x pinned, Foundry | CONTRACTS_SPEC header | Done | `foundry.toml`; OZ 5.6.1 vendored in `lib/` | `solc = "/home/user/tools/solc"` is sandbox-only; CI sed-replaces it |
| C-02 | No owner / proxy / pause / delegatecall / arbitrary call / mutable config | CONTRACTS_SPEC header | Done | read all 4 contracts; `GhostPayRouter.sol:20-40`; invariants + `test_noReceiveOrFallback` | policy clone uses EIP-1167 by design |
| C-03 | Router ctor `(announcer, feeRecipient)` non-zero, `FEE_BPS=25`, `BPS`, immutables | S1 | Done | `GhostPayRouter.sol:35-66` | extra `SCHEME_ID`, `NATIVE` constants (documented) |
| C-04 | `payERC20` rules: nonReentrant, deadline, stealth != 0/this/feeRecipient, gross>0, floor fee, minNet, key 33B 02/03, metadata 57B layout | S1 | Done | `:70-80`, `_validate :202`, `_checkMetadata :227` | |
| C-05 | `payERC20WithPermit` (ERC-2612) | S1 | Done | `:84-107` | permit wrapped in try/catch: documented deviation (front-run grief protection) |
| C-06 | `payNative` with 0xeeeeeeee layout, checked `call` to fee recipient and stealth | S1 | Done | `:110-128` | fee call skipped when fee==0 (documented) |
| C-07 | `payERC20WithBuffer` (`msg.value>0`, `<=maxBufferWei`, no fee on buffer, forward before announce) | S1, S3 | Done | `:132-146` | no permit variant (see F1-4) |
| C-08 | SafeERC20 + exact balance-delta check; rejects FoT/rebasing | S1 | Done | `_pull :179-198`; `test_feeOnTransferToken_reverts` | |
| C-09 | `FeeCollected(address indexed token, uint256 amount)` | S1 | Done | `IGhostPayRouter.sol:15` | only emitted when fee>0 (documented) |
| C-10 | All 12 custom errors with exact names | S1 | Done | `IGhostPayRouter.sol:18-40` | |
| C-11 | `receive()/fallback()` revert; no rescue | S1 | Done | `:150-158` | |
| C-12 | Announcement `announce(1, stealth, eph, metadata)` unchanged ERC-5564 ABI | S1, DEV S Module A | Done | `IERC5564Announcer.sol`; ABI-event tests vs vendored CC0 reference | |
| C-13 | Sweep relayer `Sweep`/`PermitSig`, EIP-712 domain, typehash, `sweepWithPermit`, `sweep`, `nonceUsed`, `DOMAIN_SEPARATOR`, `Swept` | S2 | Done | `GhostPaySweepRelayer.sol`; `test_typehashMatchesSpecString` | |
| C-14 | Sweep rules: deadline, `amount>fee`, non-zero/non-self, ECDSA.recover (no high-s), nonce before external calls, permit try/catch, `permit.value>=amount`, delta checks, nonReentrant | S2 | Done | `:80-142`; `test_highSMalleableSignature_rejected`, `test_frontRunPermit_sweepStillSucceeds` | stricter than spec: owner delta check makes `destination==owner` revert (documented) |
| C-15 | EIP-3009 `receiveWithAuthorization` | S2 | Planned | CONTRACTS_SPEC says "documented future function, not built" | |
| C-16 | Policy factory: immutables, `deploy`, EIP-1167 clone, F-SECURE flat fee, once-only init | S4 | Done | `PolicyAccountFactory.sol:87-118` | factory takes pre-image, derives `policyHash` itself (documented) |
| C-17 | PolicyAccount: only `destination` receives; request/execute/cancel; destination change `proposeDestination` + 2x delay + owner sig, cancellable; per-token rolling cap; no delegatecall/generic execute | S4 | Done | `PolicyAccount.sol:112-280`; 73+22+6 tests + invariants | requestWithdraw takes structs + merkle proof; two-bucket window is conservative (DEVIATIONS P1-P4) |
| C-18 | Policy announcement `schemeId 0x47500002`, `stealthAddress=A_acct`; scanner derives `A_owner`, predicts `A_acct` | S4 | Missing | router hard-codes `SCHEME_ID = 1` (`GhostPayRouter.sol:40`); no code anywhere emits or scans 0x47500002 | DEVIATIONS confirms "nothing announces" |
| C-19 | Policy: recovery path / guardian / versioned recovery config; lockout resolved | Playbook P3 | Missing | `contracts/DEVIATIONS.md` "not specified and not implemented" | lost key = locked funds |
| C-20 | Policy: optional ERC-4337 sponsorship with caps | Playbook P3, ADR-0009 | Planned | ADR-0009 defers | |
| C-21 | Use canonical announcer/registry as deployed; where absent deploy CC0 reference via deterministic deployer and verify address | S header | Partial | `Deploy.s.sol:46` checks only `code.length != 0` | no deterministic-deployer script, no codehash comparison, no registry handling |
| C-22 | Unit + fuzz(10 000) + invariants (router zero balance, fee+net==gross, metadata==net, nonce single-use, relayer cannot alter terms) | S5 | Done | 225 tests pass; invariant suites for router, relayer, policy | |
| C-23 | Mock tokens: standard, no-return, false-return, FoT, reentrant, permit, blacklist, 2/18 decimals | S5 | Done | `test/mocks/*`; `invariant.t.sol:178` (2/6/18) | |
| C-24 | Mock **rebasing** token and "extreme decimals" | Playbook S1.1 | Partial | no rebasing mock (grep); decimals only 2/6/18 | FoT mock covers delta check; add rebasing + 0/36 decimals |
| C-25 | Event ABI test vs canonical announcer; fork-style test with CC0 source compiled locally | S5 | Done | `test/utils/ERC5564Announcer.sol`; router tests | no live-network fork (README honest) |
| C-26 | Gas snapshot | S5 | Done | `.gas-snapshot` (197 lines) | `forge snapshot --check` not in CI; not re-checked (header) |
| C-27 | NatSpec on every contract/function/event/error/param/return + CI check | Playbook S5.1 | Done | `scripts/check-natspec.sh` OK; wired in CI | |
| C-28 | Static analysis: Slither pinned, fail high; Echidna nightly; Mythril RC | Playbook S3.1 | Partial | Slither in CI (`--fail-medium`) + triage file; no `echidna.yaml`, no Mythril | |
| C-29 | Deployment scripts + testnet smoke test (`SmokeSepolia.s.sol`) | Playbook S1.1/1.2 | Partial | `Deploy.s.sol`, `DeployPolicy.s.sol` exist and are tested; no smoke script | script does not write the manifest |
| C-30 | Deterministic (CREATE2) addresses where feasible | ADR-0008, MULTICHAIN S2 | Missing | `Deploy.s.sol:48` uses plain `new` | different addresses per chain/nonce |
| C-31 | Contracts deployed to Sepolia / Base Sepolia; manifest committed | SPEC_REVIEW C3, Playbook S1 | Missing | `deployments/` = schema + README only | **P0** |
| C-32 | Independent audit before mainnet | README, DEV S Inv.7 | Missing | none | pre-mainnet gate |

### 3.2 Core crypto (`packages/core-crypto`, DEVELOPER_SPECIFICATION Module B, ADR-0001)

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| K-01 | Scheme-1 derivation exactly per ADR-0001 (compressed ECDH, keccak, view tag, `h` non-zero, address, spend key) | DEV B, ADR-0001 | Done | `stealth.ts`; `vectors.test.ts` vs ScopeLift SDK-generated `test-vectors/scheme1.json` | |
| K-02 | API: `generateKeySet`, `encodeMetaAddress`, `deriveStealthPayment`, `checkAnnouncement`, `deriveStealthSecret` | DEV B | Done | `index.ts` | plus `decodeMetaAddress`, metadata builders |
| K-03 | Secrets non-serialisable, redacted errors, best-effort zeroise | DEV B, Playbook S3.2 | Done | `secret.ts`, `secrets.test.ts` | |
| K-04 | CSPRNG only; no `Math.random`; test RNG injectable | DEV B | Done | `rng.ts`; eslint ban `eslint.config.js:23` | |
| K-05 | Negative tests: bad prefix, invalid point, scalar bounds, truncated metadata, endian/leading zeros | Playbook S1.1 | Done | `negative.test.ts`, `hash-edge.test.ts` | |
| K-06 | Differential test vs independent implementation | DEV B Phase 2 | Done | `differential.test.ts` | |
| K-07 | Coverage thresholds 95/90 | Playbook S1.1 | Done | 98.95/98.01 | |
| K-08 | Scheme `0x47500002` derivation (owner key, `A_acct` prediction) + per-chain vectors | Playbook P3, CONTRACTS S4 | Missing | `grep 47500002` finds only a comment in `deployments.ts:21` and `fees.ts:170` | |
| K-09 | TSDoc with `@security`/`@testVector` on crypto functions | Playbook S5.2 | Done | all 22 exported fns documented; `@testVector` present | |

### 3.3 Invoice schema and envelope (`packages/invoice-schema`, DEV Module C, ADR-0002/3/5/10)

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| I-01 | Versioned fragment `#gpi=v1.<base64url>` | DEV C | Done | `envelope.ts:28` | |
| I-02 | Size cap (16 KiB decoded), strict schema, no duplicate keys, depth limit, safe numbers, NFC text, no control chars, fail closed | DEV C, Playbook S2.1 | Done | `MAX_DECODED_BYTES=16_384` (`envelope.ts:26`), `json.ts` (depth 8), `schema.ts`; `fuzz.test.ts` | |
| I-03 | Fields: version, chainId, scheme, meta-address, nonce, fiat currency+minor units, token, quote source/timestamp/expiry/slippage, invoice expiry, line items, tax, fee policy, signer/signature | DEV C, MASTER | Done | `schema.ts:46-70` | |
| I-04 | Limits: 50 line items, 200-char description, 500-char memo, 9-digit qty, 30-digit fiat | DEV C ("e.g. 16 KiB") | Done | `schema.ts:5-9,92-97` | values chosen by implementer, normative via ADR-0010 |
| I-05 | AES-256-GCM, random 96-bit nonce, AAD `GPI1||chainId||signer`, key in fragment, bearer-link label | ADR-0005 | Done | `envelope.ts:111-190`; independent `@noble/ciphers` cross-check in tests | |
| I-06 | Dedicated invoice-signing key, ECDSA, domain-separated digest | ADR-0002 | Done | `sign.ts` | |
| I-07 | Signature "covers canonical public fields plus ciphertext hash" | DEV C | Deviates | signs full plaintext invoice, binds ciphertext via GCM/AAD (`invoice-schema/DEVIATIONS.md` 1, ADR-0010) | accepted by ADR-0010; spec text not updated |
| I-08 | "Address inputs must be lowercase **or strictly EIP-55**" | ADR-0010 | Deviates | `ADDRESS_RE=/^0x[0-9a-f]{40}$/` (`schema.ts:88`) accepts lowercase only | ADR text wrong or code too strict; web must lowercase |
| I-09 | Invalid signature does not throw; UI must not say "verified" | ADR-0010 | Done | `isSignatureVerified/isTrustedSeller` (`envelope.ts`) | |
| I-10 | Invoice carries buffer policy: accepted?, max amount, refund behaviour | Roadmap F1 Architecture 1 | Missing | no buffer field in `schema.ts`; buffer is payer-side only | |
| I-11 | `schemeId` other than 1 (policy scheme) | CONTRACTS S4 | Missing | `schemeId: 1` literal type | blocks P3 end-to-end |
| I-12 | Signed merchant profile format (for Feature 2 `data-merchant-id`) | Roadmap F2 | Missing | none | |

### 3.4 Chain adapters (`packages/chain-adapters`, APP_AND_RELAYER_SPEC S2, FEE_SCHEDULE, MULTICHAIN S1)

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| A-01 | `config/chains.ts`: ids, names, native symbol, block time, finality depth, log range cap | APP S2 | Partial | `chains.ts:34-45` (9 chains, 2 testnets enabled) | values are "conservative defaults, NOT provider-verified" (`TODO-VERIFY.md`) |
| A-02 | `config/tokens.ts`: per-chain allowlist, decimals, permit flag | APP S2, MULTICHAIN S2 | Partial | only Sepolia + Base Sepolia USDC (`tokens.ts:19-22`) | no USDT/DAI/WETH, no mainnet token; addresses taken from search snippets, unverified |
| A-03 | `fees.ts`: `FEE_SCHEDULE`, pure bigint fee/buffer/sponsor math | APP S2, FEE S4 | Done | `fees.ts`; `fees.test.ts` | |
| A-04 | Client fee preview == contract result, "differential test against the compiled router" | FEE_SCHEDULE S4 | Partial | `chain-adapters/DEVIATIONS.md` 13: shared boundary vectors + regex of Solidity source; **no execution test** | anvil + built artifacts are available (relayer e2e uses them): easy to close |
| A-05 | `deployments.ts`: manifest loader validated against `deployments/schema.json` | APP S2 | Done | `deployments.ts`; sync test with `schema.json` | hand-written validator, stricter than schema |
| A-06 | Manifest signature verification | FEE S1.4, ADR-0007, Playbook release | Missing | `signature` optional and never verified; no release key (`web/DEVIATIONS` 5) | UI says so honestly |
| A-07 | Manifest vs chain check (`FEE_RECIPIENT()`, `ANNOUNCER()`, `FEE_BPS()`, codehash) | Playbook S2.1 "immutable configuration matches deployment manifest" | Missing | `chain-adapters/DEVIATIONS.md` 2 calls it "a required release gate" | wallet preview trusts manifest only |
| A-08 | `rpc.ts`: verify `eth_chainId`, timeouts, size cap, retry w/ jitter | APP S2 | Done | `rpc.ts`, `rpc.test.ts` | |
| A-09 | `rpc.ts`: optional fallback-provider reconciliation | APP S2, DEV Sec.3 (spam) | Missing | no matches for fallback/reconcil in `rpc.ts`/`logs.ts` | omission/censorship by single RPC undetected |
| A-10 | `logs.ts`: paginated, reorg-safe cursor, emitter/chain checks, hostile-log skipping | APP S2, Playbook S2.3 | Done | `logs.ts:152-`; `logs.test.ts` | |
| A-11 | `quote.ts`: Chainlink `latestRoundData` with positive/stale/decimals checks, fail closed | APP S2, DEV C | Done (code) | `quote.ts:60-120` | see A-12 |
| A-12 | Chainlink FEEDS table populated per chain | MULTICHAIN S2, DEV C | Missing | `quote.ts:36` `FEEDS = []` | fiat invoices cannot be paid (W-06) |
| A-13 | Uniswap TWAP quote source | DEV C, Playbook P1 `"uniswap-twap"` | Missing | no TWAP code | spec says first release may be Chainlink only: P3 |
| A-14 | `router.ts`: typed wrappers + calldata decode for preview equality | APP S2 | Done | `router.ts`; `assertPreviewMatchesCalldata` | takes tx + chainId (documented) |
| A-15 | `sweep.ts`: EIP-712 builders, permit signing, domain-separator check | APP S2 | Done | `sweep.ts:125-290` | |
| A-16 | `ChainAdapter` interface; EVM adapter; chain-mismatch rejection | MULTICHAIN S1/S6 | Done | `adapter.ts:105-` | |
| A-17 | `FeeCapability.flatSecurity = enforced` on EVM Tier 1 | MULTICHAIN S4 | Deviates | hard-coded `'not_deployed'` (`adapter.ts:156`) even when manifest carries `policy` | |
| A-18 | Policy account ABI / calldata builders / address prediction | CONTRACTS S4 | Missing | no `abi/policy*`; exports list (`index.ts`) | |
| A-19 | ERC-6538 registry ABI / helpers | APP S1 view 2 | Missing | none | |

### 3.5 Web app (`apps/web`, APP_AND_RELAYER_SPEC S1)

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| W-01 | View 1 Home: Seller/Pay/Sweep choice, privacy-limits summary, fee disclosure, release hash | S1 | Done | `views/Home.tsx`, `lib/release.ts` | hash is of the entry script fetched from same origin (honestly caveated) |
| W-02 | View 2 Seller keys: generate/import, encrypted keystore scrypt N=2^17 r=8 p=1 + AES-256-GCM, versioned JSON, never raw keys in storage | S1 | Done | `lib/keystore.ts:28-29`, e2e storage test (`app.spec.ts:131`) | |
| W-03 | View 2: optional ERC-6538 registry publish with public-association warning | S1, MASTER S2 | Missing | warning text only (`SellerKeys.tsx:160`); no registry call anywhere | web DEVIATIONS 3 cites "no registry address in manifest": canonical address is fixed in CONTRACTS_SPEC, so the reason is weak |
| W-04 | View 3 Create invoice: sign, optional encrypt, link, local QR, copy, bearer warning | S1 | Done | `CreateInvoice.tsx`, `lib/qr.ts` (no network) | |
| W-05 | View 4 Pay: parse -> fail closed -> review (chain, token, destination, gross, fee, net, expiry, quote source/time, fee recipient from manifest, public-data notice) | S1 | Done | `lib/pay.ts`, `Pay.tsx:386-435`; 328+256 unit tests | |
| W-06 | Pay of `fiat_quote` invoices | DEV C, S1 | Partial | code path `createPayContext -> readPrice -> fiatToTokenAmount` unit-tested with injected feed; with real config fails closed (`pay.ts:143`) | Create page still offers "Fiat price" (only a warning) |
| W-07 | Pay: optional jitter (Feature 6), optional gas buffer (Feature 1), calldata decode == preview before send | S1 | Done | `payExec.ts`, `pay.ts:219`; e2e "refuses when the wallet mutates the transaction" | verified only against a mock wallet |
| W-08 | View 5 Scan: chain/RPC/start block, worker, match list, local tags | S1 | Done | `Scan.tsx:115`, `scannerCore.ts` | |
| W-09 | Seller verifies receipt (token, chain, amount, confirmations, nonce) and does not trust client-reported data | MASTER S2 step 7 | Partial | `Scan.tsx:146-151` prints the announced metadata amount; for non-router announcements (`viaRouter=false`) the amount/token is **payer-supplied and unverified** | any party can announce a fake "payment" to a published meta-address; no balance/Transfer check, no finality gate, no invoice-nonce reconciliation |
| W-10 | View 6 Sweep: derive key in memory, show source/destination/fee/linkability, EIP-712 (+permit) sig, relayer or direct broadcast | S1 | Done | `Sweep.tsx`, `lib/sweep.ts`, `relayerClient.ts` | relayed path needs permit token; others direct |
| W-11 | View 7 Settings: RPC (https/wss, chainId verified), relayer URL, delay range, lock timeout, theme | S1 | Done | `settings.ts:6-22,66-102` | |
| W-12 | View 8 About/Privacy: observer table, limitations, fee disclosure, release verification | S1 | Done | `About.tsx`, `Disclosure.tsx` | |
| W-13 | Wallet integration EIP-1193 + EIP-6963, no hidden fallback | Playbook P2 | Done | `wallet.ts:42-` | `window.ethereum` fallback is labelled |
| W-14 | Real wallet / chain / RPC verification | Playbook S1.1 testnet smoke | Missing | `web/DEVIATIONS` "Unverified": all mocked | **P0 evidence gap** |

Security controls (APP_AND_RELAYER_SPEC S1):

| ID | Control | Status | Evidence | Notes |
|---|---|---|---|---|
| S-01 | CSP exactly as specified (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https: wss:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'self'`) in `_headers` + meta fallback | Done | `public/_headers`, `index.html:8-10` (meta omits `frame-ancestors`, correct) | runtime RPC-origin allowlist is in the RPC adapter; never exercised on a real host |
| S-02 | `Referrer-Policy: no-referrer`, nosniff, Permissions-Policy, COOP/CORP | Done | `_headers` | only text-asserted by `scan-bundle.mjs`; no header test against a real host (Cloudflare/Netlify) |
| S-03 | No third-party scripts/fonts/analytics; Playwright egress test fails on any non-same-origin/non-configured request | Partial | `app.spec.ts:49` covers parse + review only | scan, pay, sweep flows (`flows.spec.ts`) do not assert egress; allowed-origin set "configured RPC/relayer" is not modelled |
| S-04 | Never log `location.href`/hash; offer `history.replaceState` | Done | no `console.*` in app code (grep); `Pay.tsx:573`; e2e `app.spec.ts:120` | |
| S-05 | Secrets in dedicated non-serialisable module; viewing key to worker only during scan; worker has no fetch/WebSocket/XHR, tested | Done | `scannerCore.test.ts` source scan; `scan-bundle.mjs` `WORKER_FORBIDDEN`; e2e real worker | |
| S-06 | Build output scan (eval, new Function, innerHTML, dangerouslySetInnerHTML, `http://`, unknown hosts) | Done | `scripts/scan-bundle.mjs`, `scanBundle.test.ts`, `postbuild` hook | |
| S-07 | Accessibility: keyboard flows, labels, ARIA live, no colour-only status | Partial | e2e keyboard/contrast/mobile tests | no axe or screen-reader audit (`web/DEVIATIONS` admits); Playbook P2 acceptance requires an a11y audit |
| S-08 | GitHub Pages documented as degraded mirror (meta CSP only, popup embed) | Done | `_headers` comment, `web/DEVIATIONS` | |
| S-09 | `apps/web` README / hosting docs ("README Hosting once decided") | Missing | `apps/web` has no README; root README has no Hosting section | SPEC_REVIEW D |

### 3.6 Relayer (`apps/relayer`, APP_AND_RELAYER_SPEC S3, DEV Module D)

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| R-01 | Node 22, `viem` only (+ Node built-ins) | S3 | Done | `package.json` (viem + workspace adapters) | |
| R-02 | JSON API, 16 KiB cap, strict schema, no CORS wildcard, content-type check | S3 | Done | README table; `api.test.ts` | |
| R-03 | `POST /v1/quote` with live gas estimate **and token price**; HMAC stateless quote token | S3 | Partial | live `eth_gasPrice` yes; token price is fixed 1.0 and `nativeUsdPrice` is an operator constant (`relayer/DEVIATIONS.md` 2) | acceptable for stables on testnet; no oracle |
| R-04 | `POST /v1/sweep`: quote token, `fee>=quote`, `feeTo`, allowlists, deadline<=30 min, signer==owner, simulate, gas cap, daily budget, hot-key send | S3 | Done | README "Sweep checks"; `chain.test.ts`, `e2e.anvil.test.ts` | extra `fee_above_cap` check |
| R-05 | `GET /healthz`, `GET /v1/info` | S3 | Done | `server.ts` | |
| R-06 | Per-IP-bucket and per-owner rate limits; circuit breaker; bounded queue; one in-flight tx per chain with nonce mgmt | S3 | Done | `limiter.ts`, `breaker.ts`, `lane.ts` | |
| R-07 | Hot key from env/file mode 600, never logged | S3 | Done | `secrets.ts`; `runtime.test.ts` | |
| R-08 | Balance alerts | S3 | Partial | log event + breaker only (`relayer/DEVIATIONS.md` 15) | no pager/metrics |
| R-09 | Structured logging: no bodies/destination/signature; IP only as rotating salted hash <=24 h; privacy notice | S3 | Done | `log.ts`, `PRIVACY.md` | |
| R-10 | Failure modes: 503 RPC down, 422 revert class, 429/503 budget, 409 replay | S3 | Done | README class table | |
| R-11 | `PolicyGate` hook, default allow-all | S3, ADR-0006 | Done | `policy.ts` | no sample sanctions screen shipped (spec: operator-supplied) |
| R-12 | Anvil e2e against the real contract | FEE S4 | Done | `e2e.anvil.test.ts` ran (193 pass) | requires anvil at `/home/user/tools/foundry` or `ANVIL_BIN`; skipped silently if absent (`describe.skipIf`); CI `typescript` job has no Foundry, so it skips there (O-06) |
| R-13 | Operator runbook | Playbook 1.3 | Missing | no `docs/operators` | `Dockerfile` and systemd unit exist (bonus) |
| R-14 | ERC-4337 bundler / paymaster adapter | DEV D | Planned | ADR-0009 | |
| R-15 | Separate `@ghostpay/relayer-adapter` package; `apps/ui`, `apps/indexer` | DEV pkg map | Deviates | client lives in `apps/web/src/lib/relayerClient.ts`; app named `apps/web`; no indexer | package map in DEV spec and MASTER "Initial repository structure" (`stealth-crypto`, `contracts/`, `audits/`) is stale |

### 3.7 Post-launch features (POST_LAUNCH_FEATURES_SECURITY_ROADMAP)

| ID | Requirement / acceptance item | Status | Evidence | Notes |
|---|---|---|---|---|
| F1-1 | Contract `payERC20WithBuffer`, atomic token + native + announce, max/zero checks | Done | C-07; tests | |
| F1-2 | `calculateBuffer` ceil formula, `GasBufferQuote`, re-estimate before confirm, cap, stale rejection | Done | `fees.ts:102`, `pay.ts:164-205` | gas limit is a fixed 100 000 constant, not a token simulation (spec: "when possible") |
| F1-3 | UI: opt-in default off, native qty **and fiat estimate separately**, public-linkage notice, retry/refresh | Partial | `Pay.tsx:461-468` toggle default off; no fiat estimate of the buffer found | |
| F1-4 | Wallet call = ERC-20 allowance/**permit** plus buffer | Deviates | permit path disabled when buffer used (`Pay.tsx:283`, web DEVIATIONS 12): contract has no permit+buffer function | CONTRACTS_SPEC itself defines no such function; spec inconsistency |
| F1-5 | Invoice specifies buffer acceptance / max / refund | Missing | I-10 | |
| F1-6 | Checklist: unsupported token / sweep-estimate failure fail closed; matching preview; tests for omitted/exact/over-max/fee spike | Partial | `pay.test.ts`, `payExec.test.ts` cover cap and expiry | no per-token estimate failure case; no Phase B review |
| F2-1 | Static SDK `ghostpay-embed.js`, zero deps, DOM APIs only, pinned versioned URL | Done | `public/ghostpay-embed-v1.js` (66 lines); `embed.test.ts` | unminified, good |
| F2-2 | Merchant attributes `data-amount/currency/token/chain/merchant-id` + signed merchant profile | Deviates | takes a full `data-invoice` link instead (`web/DEVIATIONS` 6) | profile format does not exist (I-12) |
| F2-3 | Sandboxed iframe mode for allow-listed merchants, `postMessage` with exact origin/source/nonce/schema, completion callback | Missing | popup-only, `noopener`, no message channel | acceptable on GitHub Pages (SPEC_REVIEW A11) but nothing for Cloudflare Pages where headers exist |
| F2-4 | Checkout `frame-ancestors` allow-list per merchant | Missing | `_headers` is `frame-ancestors 'none'` | consistent with popup-only |
| F2-5 | Release checklist: fuzz data attributes and message schema, malicious parent, spoofed message, publish SDK hash + SRI + CSP examples | Partial | 3 unit tests + 1 e2e (same-origin only); no fuzz, no SRI/hash publication | |
| F3 | Encrypted Milestone Escrows (GhostMilestones) | Planned | no escrow code anywhere (grep); SPEC_REVIEW C6 | confirmed specified-only |
| F4-1 | Encrypted tag records: random id, HMAC lookup token, AES-GCM, IV per record, IndexedDB ciphertext only | Done | `lib/tags.ts:24-36,110-143`; e2e inspects real IndexedDB | `transactionHash` replaced by `announcementId` (documented) |
| F4-2 | HKDF-SHA-256 from view key with per-profile salt, separate AES and HMAC keys, non-extractable | Done | `tags.ts:106-125` | |
| F4-3 | Lock on inactivity / tab close; wipe | Done | `Scan.tsx:258,296`, `TagVault.lock/wipe` | |
| F4-4 | Export **only an encrypted archive** with passphrase (Argon2id/scrypt); import with round-trip tests | Missing | `TagVault` has save/find/list/remove/wipe, no export/import | |
| F4-5 | Key rotation / re-encrypt after compromise; "rotate profile salt/key version" | Missing | none | |
| F4-6 | Checklist: XSS locked/unlocked, wrong password, no plaintext in logs/backups; document unlocked-session caveat | Partial | caveat in UI; e2e ciphertext check | no XSS-while-locked test, no export tests |
| F5-1 | Stage 1: Tor-routed light indexer with fixed-size padded windows, randomised padding, response-shape verification | Deviates | **not built**; scanning = user RPC + `getLogsMaxRange` windows; no Tor/proxy option, no padding, no indexer client (`web/DEVIATIONS` 8) | SPEC_REVIEW C5 says "built as an RPC adapter option": overstated |
| F5-2 | Stages 2 (DPF-PIR) and 3 (MPC) | Planned | research-only | confirmed specified-only |
| F6-1 | Delay window default 2-15 min, CSPRNG with rejection sampling, bounds visible | Done | `jitter.ts:12-26`; `jitter.test.ts` | |
| F6-2 | Nothing signed/queued while waiting; cancel; send now; revalidate expiry/quote/chain/fees at due time; monotonic timer; no auto-submit | Done | `jitter.ts` scheduler, `Pay.tsx:181`; `web/DEVIATIONS` 15 | tab close cancels |
| F6-3 | Honest wording (no "Securing Transmission") | Done | grep | |
| F6-4 | Checklist items: sleep / clock change / suspended tab tested | Partial | monotonic timer used; unit tests exist; no browser-level suspend test | |

### 3.8 Playbook Section 4 proposals

| ID | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| P1-1 | Seller sets fiat amount, token, quote source, freshness, slippage, expiry; payer sees quote, exact token, timestamp, fee, min net, observability | Done | invoice `quote` fields; `Pay.tsx:386-435` | |
| P1-2 | Preview equals calldata; stale quote disables payment; decimals/rounding tested | Done | `pay.ts:78,219`; `quote.test.ts` | |
| P1-3 | Local receipt export, differentiating included vs **final** | Partial | `buildReceipt` (`payExec.ts:128-`), `Pay.tsx:553`; status only `included/reverted/unconfirmed`, no finality; announcement not re-verified from receipt | |
| P1-4 | Allowlisted quote adapters (`chainlink`, `uniswap-twap`) fail closed, never silently switch | Partial | Chainlink only, feeds empty | |
| P2-1 | EIP-1193 + EIP-6963, optional WalletConnect, `WalletAdapter` interface | Partial | `wallet.ts` implements 6963 + injected; no `WalletAdapter`/`getCapabilities`; WalletConnect absent (optional) | |
| P2-2 | QR encodes public URL only, local generation, accessible copy/download, bearer warning | Done | `QrView.tsx`, `qr.test.ts` | |
| P2-3 | Accessibility audit passes; localisation-ready strings | Partial | no audit; no i18n layer | |
| P2-4 | Two independent provider paths tested | Partial | mock wallet only | |
| P3-1 | Contracts: factory, clone, destination allowlist, delay, limits, unauthorized-init fails, deterministic address | Done | C-16/C-17 | |
| P3-2 | New scheme id only after ADR + interoperability review | Missing | ADR-LOG ends at 0010; no scheme-2 ADR | |
| P3-3 | UI shows deployment/gas cost, delay, factory; per-invoice opt-in; ERC-4337 caps | Missing | no UI | |
| P3-4 | Address-derivation vectors per chain; recovery tested; audit; testnet soak | Missing | none | |

### 3.9 Developer / Master blueprint cross-cutting requirements

| ID | Requirement | Spec | Status | Evidence | Notes |
|---|---|---|---|---|---|
| B-01 | 7 security invariants (keys never leave browser; RPC only public data; exact calldata shown; versioned size-limited input; scheme vectors; third parties optional; no mainnet before review) | DEV Scope | Done | mainnets `enabled:false` (`chains.ts`); relayer needs `ALLOW_MAINNET=1` + manifest | by construction + tests; unaudited |
| B-02 | Standard announcer used unchanged, no custom indexed view-tag, no invoiceId | DEV A, SPEC_REVIEW A1 | Done | `IERC5564Announcer.sol`; ADR-0003 | |
| B-03 | Fiat-quote semantics: "quote + explicit token amount, not exact fiat settlement" | DEV C | Done | `Pay.tsx:386` ("Not a guaranteed fiat value") | |
| B-04 | Chain/token allowlists only; token decimals explicit | DEV C | Done | `pay.ts`, `tokens.ts` | list is tiny (A-02) |
| B-05 | Worker cancellation, reorg checkpoint rollback, duplicates, provider caps | DEV C | Done | `scannerCore.ts`, `logs.ts`, `scanClient.test.ts` | |
| B-06 | Stage gates / Phase exit gates (testnet measurements, independent review) | DEV S4, MASTER S4 | Missing | none | no public-testnet measurement of observer-visible data |
| B-07 | Hosting: GitHub Pages + IPFS + ENS + Tor mirrors, cross-mirror hash match, host failover | DEV Phase 5 | Missing | none | |
| B-08 | `ghostpay.eth` pointer + compromise recovery doc | DEV Phase 5 | Missing | none | |
| B-09 | SPEC_REVIEW fixes A1-A11 applied | SPEC_REVIEW | Done | A5 (formulas) rewritten; A8 npm workspaces; A9 viem-only; A10 noble 2.x pinned; A11 `_headers` | stale code samples remain in Roadmap F1 sketch (`bytes32 invoiceId`) and Playbook S5 (`GhostPaySettled`, `GhostPayPaymentRouter`) |
| B-10 | Owner open items: fee recipient, rate confirmation, F-SPONSOR/F-SECURE numbers, licence, legal, hosting | SPEC_REVIEW D | Missing | no `LICENSE`; no terms/sanctions page; no hosting decision | [OWNER] |

### 3.10 Fees (FEE_SCHEDULE)

| ID | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| FE-1 | F-PAY 25 bps floor, immutable, dust < 400 pays 0 | Done | `GhostPayRouter.sol:40,215`; boundary tests 399/400 | |
| FE-2 | F-SPONSOR `max(gas x 1.10, 50 bps)` cap 300 bps; fee+feeTo inside signature | Done | `fees.ts`, relayer, `Sweep` struct | |
| FE-3 | F-SECURE flat fee at creation, immutable per deployment | Done (contract) | `PolicyAccountFactory.sol:104-112` | stable amount must be set per chain by deployer; no UI |
| FE-4 | Fee recipient never in source; only via manifest | Done | grep for hard-coded addresses: none; `Disclosure.tsx` reads manifest | |
| FE-5 | Mandatory disclosure copy in UI | Done | `Disclosure.tsx:39-53` | |
| FE-6 | Gas-buffer: no fee, pass-through | Done | `payERC20WithBuffer` | |
| FE-7 | Terms page + sanctions-policy decision (ADR-0006: applied in hosted frontend / relayer) | Missing | none; relayer has only the hook | [OWNER] |
| FE-8 | Native fee call "gas stipend limits documented" | Deviates | all-gas `call` (documented as deliberate, Safe compatibility) | spec bug noted by implementer |

### 3.11 Multi-chain (MULTICHAIN_SPEC)

| ID | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| M-01 | Tier 1 EVM: Sepolia, Base Sepolia (test); Base, OP, Arbitrum, Polygon, Ethereum after audit; BNB/Avalanche/Gnosis candidates | Partial | 9 chains in `chains.ts`; only the 2 testnets enabled; Gnosis absent | per-chain prerequisites (verified announcer, deployment, tokens, feeds) unmet |
| M-02 | Tier 2 Bitcoin BIP-352 (seller keys, `sp1` addresses, scanner via BlindBit, PSBT sweep) | Planned | not in HEAD; an **untracked** `packages/btc-silent-payments/` scaffold (BIP vectors, address/keys/receiver stubs) appeared during the audit | listed as planned per instructions |
| M-03 | Solana / other families | Planned | MULTICHAIN S5 research only | |
| M-04 | Fee-capability matrix honest per chain | Partial | A-17 | |
| M-05 | Chain-mismatch rejection, amount-unit property tests | Done (EVM) | `adapter.test.ts` | |

### 3.12 ADR log

| ADR | Status | Evidence / note |
|---|---|---|
| 0001 scheme-1 derivation | Done | K-01 |
| 0002 invoice signing key | Done | I-06 |
| 0003 no on-chain invoice id | Done | no invoiceId anywhere in contracts |
| 0004 pinned libs (viem 2.x, noble 2.x, vite 8, react 19, vitest 5, OZ 5, Foundry 1.8.5, solc 0.8.28) | Done | `package.json`, `foundry.toml`, CI `version: v1.8.5`; **no `THIRD_PARTY.md`** as the ADR says |
| 0005 envelope encryption | Done | I-05 |
| 0006 no blocklist/admin | Done in contracts; frontend/relayer compliance policy undocumented | FE-7 |
| 0007 owner wallet only via manifest | Done | FE-4 |
| 0008 multichain; CREATE2 deterministic addresses | Partial | C-30 missing; Bitcoin planned |
| 0009 sponsorship without 4337 | Done | relayer + sweep contract |
| 0010 schema field shapes | Deviates | I-08 |
| Missing ADRs required by Playbook Phase 1 step 2 and Proposal 3: supported chains, supported tokens, quote rules, fee behaviour, policy scheme `0x47500002`, hosting | Missing | ADR-LOG.md has 10 entries |

### 3.13 Operations, CI/CD, release engineering, documentation (Playbook S1.2, S1.3, S2, S3, S5)

| ID | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| O-01 | PR stage: typecheck, lint, tests, forge unit/fuzz, Slither, secret scan, build | Partial | `.github/workflows/ci.yml` (typescript, contracts, secrets-and-egress jobs) | CI has never been observed running; at `1f7ab71` it lacked a lib-build step (fixed in `d6e5ea1`); Slither runs with two detectors excluded (triaged) |
| O-02 | `format:check` (prettier or equivalent) | Missing | no script, no config | `forge fmt --check` only |
| O-03 | SHA-pinned actions, `permissions: contents: read`, `persist-credentials:false`, concurrency | Done | `ci.yml` | SHAs not independently verified here |
| O-04 | `npm audit`, dependency review | Partial | `npm audit --omit=dev --audit-level=high` present; no dependency-review action, no lockfile-diff gate | |
| O-05 | Playwright e2e in CI (`npm run test:e2e`) | Missing | not in `ci.yml` | 15 tests pass locally |
| O-06 | Anvil available in CI for relayer e2e | Missing | `e2e.anvil.test.ts` is `describe.skipIf(!available)` with default `ANVIL_BIN=/home/user/tools/foundry/anvil`; the `typescript` CI job never installs Foundry | the real-contract relayer e2e silently skips in CI |
| O-07 | Nightly/deep: Echidna, Mythril, fork tests, mutation tests, reproducibility check, `schedule:` trigger | Missing | none | |
| O-08 | Testnet deployment job (manual dispatch, protected env `testnet`, chain allowlist) | Missing | none | |
| O-09 | Release candidate: signed tag, clean build, **SBOM (CycloneDX / `npm sbom`)**, **SHA256SUMS**, hashes | Missing | no `scripts/`, no release workflow | |
| O-10 | Reproducible build script + reproducibility comparison | Missing | none | |
| O-11 | Static publication (IPFS pin, CID record), ENS update, Tor mirror jobs, mainnet release job, protected GitHub Environments | Missing | none | |
| O-12 | Release manifest (tag/commit, tool versions, lockfile digest, SBOM, artifact SHA-256, IPFS CID, onion hash, chain IDs, addresses, deploy txs, verification, token/oracle matrix, test/fuzz/static/audit summaries, limitations, signing-key instructions) | Missing | only `deployments/schema.json` for the contract part | |
| O-13 | Deployment-manifest signing procedure | Missing | `signature` field optional, no procedure, no key (A-06) | |
| O-14 | Signed-tag / release-verification instructions for users | Missing | About page only says "compare hash" | |
| O-15 | Coverage / snapshot / NatSpec gates in CI | Partial | NatSpec yes; vitest thresholds yes (via `npm test`); no `forge snapshot --check`, no `forge coverage` | |
| O-16 | TSDoc coverage review | Partial | 96 of 126 exported functions/classes in `apps/web` have TSDoc (30 do not); all exported functions in core-crypto, invoice-schema, chain-adapters and relayer have it; no CI check | |
| D-01 | `docs/user/`: "Set up a stealth meta-address", "Review and pay an invoice", "Sweep funds and understand gas privacy" | Missing | `docs/` has no `user/` | **required by Playbook 1.3** |
| D-02 | `docs/operators/`: "Host a GhostPay mirror", "Run a local scanner/RPC" (+ relayer operation) | Missing | no `operators/` | |
| D-03 | `THIRD_PARTY.md` (licence/version/purpose/review note per runtime dependency) | Missing | referenced by `SECURITY.md`, ADR-0004, SPEC_REVIEW B | file does not exist |
| D-04 | `DEPLOYMENT_MANIFEST.md` | Deviates | content lives in `deployments/README.md`; SPEC_REVIEW B lists the named file as created | |
| D-05 | `SECURITY.md` | Done | `SECURITY.md` | contact/SLA is [OWNER] |
| D-06 | `audits/` with independent report for exact release commit | Missing | none at root; `docs/audits/` now holds this and other sessions' reports (not independent third-party) | |
| D-07 | `.env.example` (SECURITY.md rule) | Missing | `git ls-files` has none | relayer uses a JSON example instead |
| D-08 | `LICENSE` | Missing | packages `UNLICENSED` | [OWNER] |
| D-09 | Threat model: STRIDE/LINDDUN-style model, data-flow/trust-boundary diagrams, attack trees, systemic failure modes | Partial | `docs/threat-model/THREAT_MODEL.md` = 29 lines (observer table, revenue-path threats) | |
| D-10 | Phase B post-implementation security review per feature (F1, F2, F4, F6, P1, P2, P3): diff review, abuse tests, privacy disclosure, residual risk, retest of release hash | Missing | no record; `docs/audits/` only has Slither triage + design analysis | |
| D-11 | Penetration-test checklist executed and recorded (Playbook S2.3) | Missing | none | |
| D-12 | One feature branch + security-review checklist per feature; release notes, supported-chain matrix, rollback/feature flags | Missing | no flags; no matrix beyond `chains.ts` | |
| D-13 | Testnet measurements of what observers learn (privacy claims "no broader than guarantees") | Missing | none | |

---

## 4. Prioritised gap list

### P0 - blocks any real use

| # | Gap | Recommended fix |
|---|---|---|
| G-01 | **No deployment, no manifest.** `deployments/` has no `<chainId>.json`; `loadManifest` returns `absent` so Pay is disabled; relayer refuses chains without a manifest. (C-31) | Deploy `Deploy.s.sol` (+ `DeployPolicy.s.sol` if kept) to Sepolia and Base Sepolia with a throw-away test fee recipient; verify sources; write and validate `deployments/11155111.json` and `84532.json`; copy into `apps/web/public/deployments/`; commit via PR. Add `script/SmokeSepolia.s.sol`. |
| G-02 | **No end-to-end evidence with a real wallet/chain/RPC/relayer.** Every web test uses mocks; fee parity vs compiled router not executed (W-14, A-04). | After G-01: scripted testnet run (create invoice -> pay with MetaMask -> scan -> relayer sweep and direct sweep), record tx hashes in a dated test log; add the anvil-based router fee differential test to `chain-adapters`. |

### P1 - before testnet launch

| # | Gap | Recommended fix |
|---|---|---|
| G-03 | Fiat-quote path dead: `FEEDS` empty, tokens/chain params unverified (A-01, A-02, A-12, W-06). Create page still lets sellers make unpayable fiat invoices. | Verify Sepolia/Base Sepolia (and later mainnet) Chainlink feed addresses + heartbeats and USDC addresses from issuer docs; populate `FEEDS`/`TOKENS`; until then hide or disable "Fiat price" in `CreateInvoice.tsx` (not just warn). |
| G-04 | Seller can be shown fake receipts: Scan prints announced metadata for non-router announcements without checking the transfer (W-09). | For `viaRouter=false`, verify via `Transfer` log / `balanceOf` at the stealth address before showing an amount; label unverified rows "claimed"; gate on `finalityDepth`; add reconciliation by invoice nonce/amount. |
| G-05 | Manifest trust: no signature verification, no on-chain cross-check of `FEE_RECIPIENT/ANNOUNCER/FEE_BPS/codehash` (A-06, A-07). | Add read-back verification in `chain-adapters` at load time (fail closed); define release key + detached-signature verification before any mainnet manifest. |
| G-06 | `docs/user/*` and `docs/operators/*` missing (D-01, D-02, R-13). | Write the five Playbook 1.3 guides + relayer runbook using synthetic examples; link from README. |
| G-07 | ERC-6538 publish/lookup flow missing (W-03, A-19). | Use the canonical registry address (`0x6538...6538`) as a constant per chain (verify code at runtime); add `registerKeys(1, metaAddress)` button with explicit public-association confirmation, plus optional payer lookup; ADR + test against the CC0 reference registry compiled locally. |
| G-08 | Docs claim files/features that do not exist (THIRD_PARTY.md, DEPLOYMENT_MANIFEST.md, Feature 5 stage 1) and root README is stale (section 5). | Create `THIRD_PARTY.md`; fix SPEC_REVIEW B/C5 and README status; add README sections: status, packages, build/test commands, hosting. |
| G-09 | CI not proven: never observed green; e2e not in CI; relayer anvil e2e silently skips in CI (O-01, O-05, O-06). | Push the branch and get a green run (the missing lib-build step was fixed in `d6e5ea1`); add a Playwright job; install Foundry in the `typescript` job and make the anvil e2e fail, not skip, when `CI=true`. |
| G-10 | Phase B reviews + per-feature checklists absent for F1, F2, F4, F6, P1, P2 (D-10, D-12). | One short dated review per feature in `docs/audits/` with checklist ticks tied to test names, residual risk, and user-facing disclosure text. |
| G-11 | Relayer pricing is static operator config (R-03, R-08). | Acceptable on testnet; document required operator numbers; add low-balance alert hook. Oracle needed before mainnet (see P2). |
| G-12 | Untracked `packages/contracts/test/audit/*.t.sol` breaks `forge build` (other session). | Fix compile error (`pure` -> `view`, `Sweep.audit.t.sol:24`) or keep out of the tree before any commit/CI run. |

### P2 - before mainnet

| # | Gap | Recommended fix |
|---|---|---|
| G-13 | Policy-guarded account has no client side (C-18, K-08, I-11, A-18, P3-2..4, A-17): no scheme-2 derivation, announcement path (router emits scheme 1 only), scanner, UI, vectors, ADR, recovery. | Decide scope. Either ship as "contracts only, experimental" and say so in README, or: ADR for scheme id, TS derivation + vectors, router/announcer path for scheme `0x47500002`, scanner + sweep UI, recovery design, then audit. Make `flatSecurity` reflect `manifest.policy`. |
| G-14 | Release engineering absent (O-07..O-14, B-07, B-08). | Add release workflow: signed tag, reproducible build script, `SHA256SUMS`, `npm sbom`, release-manifest JSON schema, protected environments, IPFS pin job; nightly workflow with Echidna (harness + `echidna.yaml`), Mythril, mutation testing, repro diff. |
| G-15 | External audit; independent review of release artifact (C-32, D-06). | Commission; store under root `audits/`. |
| G-16 | Pen-test checklist unexecuted; no testnet observer measurements (D-11, D-13, B-06). | Execute Playbook S2.3 on testnet; record per-test evidence; measure what each observer sees. |
| G-17 | Threat model thin (D-09). | Expand to STRIDE/LINDDUN with DFDs and attack trees (compromised frontend, mirror, relayer, oracle). |
| G-18 | Feature 4 archive export/import and key rotation (F4-4/5/6). | Implement encrypted archive (scrypt as in keystore), round-trip tests, rotation, XSS-while-locked test. |
| G-19 | Feature 2 completeness (F2-2..5, I-12). | Define signed merchant profile; iframe + `postMessage` mode behind the header-capable host; fuzz tests; publish SDK hash/SRI and CSP examples. |
| G-20 | Feature 5 stage 1 is not built (F5-1) while SPEC_REVIEW says it is. | Either implement (fixed windows, padding, proxy/Tor-aware fetch option, indexer client with response verification) or correct the spec. |
| G-21 | RPC fallback reconciliation (A-09). | Second-provider log comparison at checkpoints; surface discrepancy. |
| G-22 | Announcer/registry deterministic deploy + codehash verification (C-21); CREATE2 for GhostPay contracts (C-30). | Add `DeployAnnouncer.s.sol` using the deterministic deployer; compare runtime codehash to canonical. |
| G-23 | Owner items: licence, terms/sanctions policy, legal review, fee recipient, hosting (B-10, FE-7, D-08). | Owner decisions; add `LICENSE`, terms page, frontend/relayer compliance statement per ADR-0006. |
| G-24 | Mainnet chain enablement prerequisites (M-01): verified token/feed/range data per chain, manifests. | Per-chain checklist in `docs/`; do not flip `enabled` without it. |
| G-25 | Accessibility audit and cross-browser/real-wallet matrix (S-07, P2-3, P2-4). | axe + manual screen-reader pass; Firefox/WebKit Playwright projects; at least two real wallets. |
| G-26 | Relayer oracle-based pricing and metrics/alerting (R-03, R-08). | `GasPriceSource`/`TokenPriceSource` implementations; Prometheus-style metrics + alert docs. |
| G-27 | Missing ADRs (supported chains/tokens, quote rules, fee behaviour, policy scheme, hosting) (3.12). | Write ADR-0011+. |

### P3 - nice to have

| # | Gap | Recommended fix |
|---|---|---|
| G-28 | Uniswap TWAP source (A-13); WalletConnect adapter + `WalletAdapter` interface (P2-1); i18n layer (P2-3). | Optional per spec. |
| G-29 | Rebasing/extreme-decimals mocks (C-24); `forge snapshot --check` and coverage in CI; mutation testing. | Add mocks + CI steps. |
| G-30 | Fiat estimate for gas buffer (F1-3); per-token sweep gas simulation (F1-2); permit+buffer combined function (F1-4). | Spec change needed first. |
| G-31 | Doc hygiene: stale code samples (Roadmap F1 `invoiceId`, Playbook S5 `GhostPaySettled`/`GhostPayPaymentRouter`), stale package maps (DEV spec, MASTER "Initial repository structure"), ADR-0010 wording (I-08). | Annotate or update. |
| G-32 | `eslint-plugin-security`, SonarCloud, TSDoc lint gate (O-16), `apps/web` README, `.env.example` (D-07, S-09). | Add. |
| G-33 | Bitcoin Tier 2 (BIP-352), Solana, EIP-3009, ERC-4337 paymaster, Feature 3 escrow, Feature 5 stages 2-3, `apps/indexer`. | Planned; no action now. |

---

## 5. False, stale or overstated claims found

| # | Where | Claim | Reality |
|---|---|---|---|
| 1 | `README.md` "Project status" | "This repository documents the architecture ... and proposed features" | Stale: four contracts, five TS workspaces, relayer and web app exist; README lists no packages/build/test commands and no Hosting section (SPEC_REVIEW D refers to one). |
| 2 | `docs/SPEC_REVIEW.md` B | `DEPLOYMENT_MANIFEST.md` and `THIRD_PARTY.md` filled as gaps | Neither file exists. `SECURITY.md` and ADR-0004 also depend on `THIRD_PARTY.md`. |
| 3 | `docs/SPEC_REVIEW.md` C5 | "Feature 5 stage 1 (Tor-friendly range queries, local matching) is built as an RPC adapter option" | No Tor/proxy option, no padding, no fixed windows beyond the log-cap, no indexer client (web DEVIATIONS 8 itself says "No network-reachable light indexer"). |
| 4 | `docs/FEE_SCHEDULE.md` S4 | "A unit test asserts the client preview equals the contract result (differential test against the compiled router)" | Not true; chain-adapters/DEVIATIONS 13 admits it is vectors + a regex of the Solidity source. |
| 5 | `docs/adr/ADR-LOG.md` ADR-0010 | addresses "lowercase or strictly EIP-55" | `ADDRESS_RE` accepts lowercase only (`schema.ts:88`). |
| 6 | `packages/contracts/README.md` | "122 tests across 6 suites" / "100 % line and branch coverage" | First figure is stale (225 tests / 11 suites now; the file contradicts itself later). Coverage not re-verified (tree currently does not build with the untracked audit tests). |
| 7 | `apps/web/DEVIATIONS.md` 1 | `package-lock.json` has no `@noble/hashes` entry for `apps/web` | Stale: lock has it. |
| 8 | `apps/relayer/DEVIATIONS.md` 12 | manifest with `policy*` fields makes the relayer refuse to start | Stale: fixed by `1664d8b` (`deployments.ts` accepts and validates policy keys). |
| 9 | `packages/chain-adapters/DEVIATIONS.md` 6 | `flatSecurity` is `not_deployed` because manifest has no factory field | Manifest now has the field, yet `adapter.ts:156` is still hard-coded. |
| 10 | `apps/web/DEVIATIONS.md` 3 | ERC-6538 not published because "the deployment manifest has no registry address" | Registry address is fixed in CONTRACTS_SPEC; reason is not a real blocker. |
| 11 | `docs/APP_AND_RELAYER_SPEC.md` S3 vs code | quote "using a live gas estimate and token price" | token price is a constant 1.0 (documented in relayer/DEVIATIONS 2; spec not updated). |
| 12 | `docs/APP_AND_RELAYER_SPEC.md` S1 | Playwright egress test "fails on any request to an origin that is not same-origin or a configured RPC/relayer" | Egress test covers parse/review only; no configured-origin allowlist is asserted in pay/scan/sweep flows. |
| 13 | `docs/POST_LAUNCH...` implementation-order list | Features built "per summary" (1, 2, 4, 6) | F2 is a reduced popup-only variant; F4 lacks archive/rotation; F1 lacks invoice-level policy and fiat estimate - all documented in web DEVIATIONS but not reflected in any status doc. |
| 14 | `SECURITY.md` | points to `audits/` for an independent report and `.env.example` | neither exists at the stated path (only `docs/audits/` self-audits). |

Honest and verified claims (spot-checked): contracts DEVIATIONS (all 12 + P1-P19 matched the code), relayer/web statements that everything is mocked, TODO-VERIFY (FEEDS empty, tokens unverified), "Slither/Echidna/Mythril not run" in contracts README (Slither has since been run), NatSpec/fmt/test counts for contracts (225).
