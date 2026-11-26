# GhostPay security and privacy invariants (reference digest, snapshot 2026-11-18)

Sources read: SECURITY.md, docs/user/privacy-limits.md, docs/adr/ADR-LOG.md, docs/audits/{01,02,03,08,17}, docs/CONTRACTS_SPEC.md, docs/threat-model/THREAT_MODEL.md (headings + section 7 only), READMEs of contracts, core-crypto, secret-box, relayer-guard. All present. docs/threat-model/ holds only THREAT_MODEL.md. Audits 01/02/03 are dated 2026-10-21 and predate audits 17/08 (2026-10-22); older "Open" statuses may be stale.

## 1. Claims and wording rules
- Never claim an independent audit: only self-run/AI-assisted reviews exist; treat all code as pre-audit. SECURITY.md; docs/audits/08-completion-gates.md
- Never claim deployed, hosted, official host, or mainnet-ready: nothing is deployed, testnet only, no real funds. SECURITY.md; ADR-0015; docs/audits/17-final-security-snapshot.md
- Never say anonymous/private/unlinkable: GhostPay only reduces address reuse; payer, token, amounts, timing, router use, fee flow, sweep source/destination stay public. docs/user/privacy-limits.md
- Anonymity set = GhostPay users on that chain (single router per chain is enumerable). docs/user/privacy-limits.md; THREAT_MODEL D2
- Gas sponsorship/relaying is not unlinkability; delay is timing friction not anonymity; view tags hide nothing; gas buffer is public. docs/user/privacy-limits.md
- Do not describe provider queries (Esplora spentness, EVM Transfer filters/receipts) as RPC unlinkability. docs/audits/17 (PRIVACY-E2E-01/02)
- Do not claim the app checks destination reuse (not wired); only recommend a fresh destination. docs/audits/17 (PRIVACY-E2E-04/DOCS-CLAIMS-03)
- UI must not say "verified seller" (invoice signature binds payload only; trust needs a pinned signer key); block "verified" when signatureValid:false. ADR-0002; ADR-0010
- Invoice link is a bearer secret (key in fragment): never call it confidential vs link holders; may persist in browser history. ADR-0005; docs/user/privacy-limits.md
- Signed seller receipts prove key control only, not seller identity or on-chain payment; never count a receipt signature as payment evidence. docs/audits/08-completion-gates.md
- Policy accounts (scheme 0x47500002): "contracts only, experimental, recovery open"; never market as theft-proof. ADR-0014
- Quotes are quotes, never "exact fiat settlement"; fiat-priced invoices disabled until feeds verified. ADR-0012
- Fee is bypassable by direct payment; never promise otherwise. Direct payments skip router checks and are unverified claims. ADR-0013
- Do not say fee recipient/contract addresses are trustworthy beyond the serving host until manifest authentication ships. docs/user/privacy-limits.md (limit 10); SECURITY.md
- A compromised frontend steals keys; in-app release-hash widget is self-attested and cannot detect a tampered host. SECURITY.md; audits/03 S3-04
- Do not infer closure from green CI, merged source, or ancestry; closure needs commit + test path + command + result. docs/audits/08-completion-gates.md (Evidence standard)
- No Mythril/mutation-testing success claims for the promoted snapshot; zeroization is best-effort only. docs/audits/08; packages/core-crypto/README.md
- Machine-drafted es/ja/ar catalogs must not be called reviewed/localized beyond Settings. docs/audits/08

## 2. Contract invariants
- No owner, proxy/upgrade, pause, rescue, fee setter, delegatecall, arbitrary external call, or blocklist anywhere. docs/CONTRACTS_SPEC.md; packages/contracts/README.md; ADR-0006
- Solidity 0.8.28, EVM cancun, optimizer 200 runs, OpenZeppelin 5.x, Foundry; solc pinned in foundry.toml. docs/CONTRACTS_SPEC.md; packages/contracts/README.md (Compiler); ADR-0004
- Router: FEE_BPS=25, BPS=10_000, fee = gross*25/10000 rounded down; net=gross-fee, net>=minNet && net>0; dust under 400 base units pays no fee. docs/CONTRACTS_SPEC.md s1; ADR-0013
- ANNOUNCER and FEE_RECIPIENT immutable, non-zero; FEE_RECIPIENT != router; stealth not zero/this/FEE_RECIPIENT. docs/CONTRACTS_SPEC.md s1
- All router entry points nonReentrant; deadline checked (block.timestamp <= deadline); ephemeral key 33 bytes, prefix 02/03; metadata exactly 57 bytes with fixed selector/marker/asset/net layout. docs/CONTRACTS_SPEC.md s1
- ERC-20 path: SafeERC20 + exact balance-delta checks on stealth and fee recipient (rejects fee-on-transfer/rebasing); router holds zero tokens (invariant test). docs/CONTRACTS_SPEC.md s1, s5
- Native path: both calls must succeed; assembly call copies no return data (L-01 fixed); gas buffer carries no fee. docs/CONTRACTS_SPEC.md s1; packages/contracts/README.md (Audit follow-ups)
- `payERC20WithPermitAndBuffer` (ADR-0030, not deployed): buffer bounds (`BufferRequired`, `BufferTooLarge`) checked before the permit so a refused call consumes no nonce; then the `payERC20WithPermit` and `payERC20WithBuffer` rules unchanged; signature as a `PermitSig` struct. docs/CONTRACTS_SPEC.md s1; docs/adr/ADR-0030-router-permit-and-buffer.md
- Router announces SCHEME_ID=1 only; policy router announces 0x47500002. No invoice id on-chain; events carry no payer/stealth/invoice fields. docs/CONTRACTS_SPEC.md; ADR-0003
- Standard ERC-5564 announcer (0x55649E01...4564) and ERC-6538 registry used as deployed, never re-implemented. docs/CONTRACTS_SPEC.md
- Sweep relayer: EIP-712 domain {GhostPaySweepRelayer, "1", chainId, verifyingContract}; typehash over token, owner, destination, feeTo, amount, fee, deadline, nonce. docs/CONTRACTS_SPEC.md s2
- Sweep: OZ ECDSA.recover (low-s) must equal owner; unordered bitmap nonce consumed BEFORE external calls; amount > fee; permit in try/catch (front-run permit must not block) and permit.value >= amount; EOA signers only. docs/CONTRACTS_SPEC.md s2; packages/contracts/README.md
- Supported tokens: ERC-2612 permit or pre-granted allowance; DAI-style permit, fee-on-transfer, rebasing, ERC-777 unsupported; USDT needs direct path/gas buffer. ADR-0011; docs/CONTRACTS_SPEC.md s2
- PolicyAccount: funds only to destination; signed Withdraw commits limitLeafHash (L-04 fixed); MIN_DELAY = 1 hours (I-02 fixed); destination change after 2*delay; deploy charges F-SECURE fee with exact delta checks. docs/CONTRACTS_SPEC.md s4; packages/contracts/README.md
- Required Foundry tests: fuzz 10,000 runs; invariants (zero router balance, fee+net==gross, sweep nonce single-use); mock tokens incl. reentrant/blacklisting/fee-on-transfer; announcer ABI test. docs/CONTRACTS_SPEC.md s5
- Immutability means any defect = new deployment + new manifest/release; old clients keep old router. ADR-0013; SECURITY.md
- Fee recipient never in source; enters only via deployment manifest; must accept ETH, be hardware/multisig, not the deployer key. ADR-0007; ADR-0013
- Announcements are unauthenticated: scanners must verify actual transfer evidence; never treat caller==router as proof. packages/contracts/README.md (L-02); docs/audits/02 L-02

## 3. Crypto and key handling
- Scheme 1 (ADR-0001): S = p_eph*P_view as 33-byte compressed point; s_h = keccak256(S); view tag = s_h[0]; h = int(s_h) mod n, non-zero; Q = P_spend + h*G; address = last 20 bytes of keccak256(Q.x||Q.y); p = (p_spend+h) mod n, reject zero. ADR-0001; packages/core-crypto/README.md
- Hash change requires a NEW scheme id. ADR-0001
- Derived secret must be re-derived and verified against the announced address before use/signing. packages/core-crypto/README.md; audits/03 s4
- View tag leaks 1 byte of hash by design; payer can set a bad tag to hide a payment (D4: deep-scan not built). packages/core-crypto/README.md; THREAT_MODEL D4
- SecretScalar (Uint8Array subtype) throws on JSON.stringify/String/template/inspect/console.log; structuredClone copies raw bytes so never send secrets to workers/storage. packages/core-crypto/README.md
- SecretBox: WeakMap-held, not a Uint8Array; access only via use/useAsync/take; withScope wipes temporaries; assertNoSecretBox before payloads leave context; long-lived seller keys boxed in apps/web lib/session.ts. packages/secret-box/README.md
- Redaction/zeroize are guardrails, not a boundary (JS strings/bigints cannot be wiped; engines copy buffers). packages/secret-box/README.md; packages/core-crypto/README.md
- Randomness: crypto.getRandomValues with rejection sampling; Math.random banned by ESLint; production passes no rng, tests inject deterministic RandomSource. packages/core-crypto/README.md; SECURITY.md
- Errors are fixed strings with stable code; never include key bytes or offending input. packages/core-crypto/README.md
- checkAnnouncement returns {matches:false} on malformed log data (hostile logs cannot stop scanner). packages/core-crypto/README.md
- No custom crypto: noble libs + viem only; no other crypto library for GhostPay code. ADR-0004 (installed closure has noble 1.x copies via viem/ox/scure; decision pending)
- Test vectors in test-vectors/scheme1.json; crypto changes require updated vectors AND differential test vs @scopelift/stealth-address-sdk 1.0.0-beta.5 (dev-only, never imported by src). SECURITY.md; packages/core-crypto/README.md; ADR-0001
- Invoice signing uses a dedicated secp256k1 key, never spend/view keys; low-s enforced; domain prefix; signature covers full canonical plaintext. ADR-0002; ADR-0010; audits/03 s4
- Envelope: AES-256-GCM, random 96-bit nonce, random key per invoice, AAD = "GPI1"||chainId||signerPubKey; fragment #gpi=v1.<base64url>. ADR-0005
- Meta-address decoder accepts only two distinct 33-byte keys; invoice address inputs lowercase hex only (mixed-case/EIP-55 rejected). ADR-0010

## 4. Client/web rules
- Pay disabled when no manifest exists (loadManifest absent); chain/token tables are allowlists, unknown fails closed (CHAIN_DISABLED). docs/audits/01 s1; ADR-0011
- Manifest must be authenticated: compiled into hashed bundle and read back on-chain (FEE_RECIPIENT/ANNOUNCER/FEE_BPS/codehash) before payment is enabled. ADR-0015; docs/audits/08 (reported implemented; no real keys/deployments yet)
- Tx review: preview must byte-equal final calldata (assertPreviewMatchesCalldata); exact-amount approve with calldata assertion; permit domain checked against token DOMAIN_SEPARATOR. docs/audits/03 s4
- Chain re-read before each signature/send; account lists from eth_requestAccounts and eth_accounts must agree; no silent auto-submit. docs/audits/03 s4
- After broadcast with known hash: terminal "already broadcast, verifying" state, never offer Send again. docs/audits/17 (WEB-APP-02)
- Address safety: browser-compatible @noble/hashes only (no node:crypto in runtime paths). docs/audits/17 (WALLET-SAFETY-02)
- Scan: direct announcements are claims even if the address has funds; router payment needs exact tx-bound transfer/receipt evidence; txhash helper binds receipt, block hash and log hashes. docs/audits/17
- Scan matches buffered until secondary provider comparison; stop at first discrepancy, do not checkpoint past it; caps 100,000 announcements / 10,000 matches per run. docs/audits/17
- Fiat invoices refused on Pay until FEEDS verified; quote read fails closed on stale/zero/negative/decimals mismatch. ADR-0012
- Sweep: outputs unchecked by default, explicit per-output selection (BTC); recommend fresh destination. docs/audits/17
- No analytics, telemetry, remote fonts, third-party scripts; zero external requests; no service worker. SECURITY.md; audits/03 s4
- No eval, new Function, innerHTML, dangerouslySetInnerHTML, Math.random (lint-enforced). SECURITY.md
- CSP: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https: wss:; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'; no unsafe-inline/eval. docs/audits/03 s4 (meta-tag only on GitHub Pages = degraded mirror, S3-11)
- Bundle scan (apps/web/scripts/scan-bundle.mjs) asserts no fetch/XHR/WebSocket/EventSource/sendBeacon/importScripts in worker chunk; heuristic only. docs/audits/03 s4, S3-23
- Fragment cleared from address bar after read and on hashchange; invoice parser strict (dup keys, proto keys, depth>8, 16 KiB cap). docs/audits/03 s4
- Worker receives public logs plus viewing key once (zeroised both sides). docs/audits/03 s4
- Tag vault v2 AAD binds chain, record ID, lookup token; seller vault passphrase-gated with idle lock. docs/audits/17; docs/audits/08
- Embed SDK: same-origin https link, noopener popup, no postMessage. docs/audits/03 s4

## 5. Relayer rules
- Quotes are stateless HMAC-SHA-256 tokens (fixed field list, version prefix, constant-time compare, TTL 10-600 s). docs/audits/03 s4 (S3-21: single static key, no rotation window)
- Simulate before send (twice), check priced gas cover and gas movement; read order state before simulation; token price fixed 1.0, native price operator constant (replace before mainnet). docs/audits/17 (RELAYER-03); ADR-0012 item 5
- Reserve loss/budget before nonce/send, release or settle after; ambiguous receipts keep reservation; single serial nonce lane; maxGasPriceWei cap. docs/audits/17; audits/03 s4
- LossBudget: per-key, per-group and global caps on unreimbursed gas. packages/relayer-guard/README.md
- GuardedBreaker: single-use permits, probe timeout, half-open reports "degraded"; user-attributable failures (revert, nonce used, caps, front-run) never open it. packages/relayer-guard/README.md
- Trusted proxy: X-Forwarded-For honoured only from TrustedProxies, walked right to left; buckets IPv4 /32, IPv6 /64; limiter table bounded. packages/relayer-guard/README.md
- Hard limits: 16 KiB body cap, JSON content-type only, strict field allowlists, exact-origin CORS (no wildcard), allowlist-only logging (no body/IP/address/amount). docs/audits/03 s4
- Config: https-only RPC without credentials; mainnet needs manifest and ALLOW_MAINNET=1; secrets from 0600 files; refuses chains without manifest. docs/audits/03 s4; docs/audits/01 s1
- Challenge module is only bot-cost friction, not a security boundary, and is NOT wired into apps/relayer. packages/relayer-guard/README.md
- No relayer is hosted/advertised until ADR-0015 gates are met. ADR-0015

## 6. Supply chain and CI
- Workflow actions pinned to full commit SHA with version comment (scripts/check-actions-pinned.sh, CI-enforced); default contents: read, write per job. SECURITY.md
- Releases only from signed tags, npm ci --ignore-scripts, deterministic tarball, SHA256SUMS, SBOM, provenance; release workflow stops at draft, publication stub disabled (needs new ADR). SECURITY.md; ADR-0015
- No secrets in git; CI rejects committed env files and key material; .env.example names only. SECURITY.md
- No new runtime dependency without a THIRD_PARTY.md entry (licence, pin, purpose, review); regenerate with docs/tools/third-party-table.mjs --write. SECURITY.md
- Exact version pins (no ^ ~ *), lockfile v3 with integrity, registry-only, no git/tarball deps, no prod lifecycle scripts; npm audit clean. docs/audits/03 s2, s4
- Licence: none chosen, all packages UNLICENSED (owner decision). README.md; docs/audits/01 G-23
- GPL isolation: privacy-pools-core GPL verifiers stay OUTSIDE this repo (PP_CONTRACTS_OUT). packages/external-pools-privacypools/README.md
- MPL-2.0 lightningcss: build tool only, nothing copied into shipped output; confirm it stays build-time. THIRD_PARTY.md
- CI: Foundry matrix covers pool-contracts and payer-hiding-contracts under aggregate "contracts"; hosted run not yet verified. docs/audits/17 (SUPPLY-CHAIN-CI-04)
- Maintainer accounts: hardware 2FA, protected main and v* tags ([OWNER] to confirm). SECURITY.md
- Dev ceremony pool artifacts must never secure valuable funds. docs/audits/08

## 7. Open findings index
Statuses from audit 17/08 (2026-10-22) where available; audits 01/02/03 are older ("status unclear" = no later doc closes it).

| ID | Description | Severity | Status / source |
|---|---|---|---|
| PRIVACY-E2E-01 | BTC matched outpoints disclosed to Esplora provider | Medium | Open (disclosure only); audits/17 |
| PRIVACY-E2E-02 | EVM Transfer filters/receipt queries reveal matches to RPC | Medium | Partially mitigated, correlation open; audits/17 |
| PRIVACY-E2E-03 | BTC sweep: user may still select linking outputs | Medium | Auto-consolidation closed; user-selected linkage remains; audits/17 |
| PRIVACY-E2E-04 | No destination-reuse detection (claim corrected) | Medium | Feature absent; audits/17 |
| S3-01 | Manifest unauthenticated root of trust | High | Audit 08 says signature+on-chain readback implemented; real keys/deployments pending; ADR-0015 still lists as gate (unclear) |
| S3-02 / G-04 | Forged announcements shown as payments | Medium | Closed for Scan path (audits/17); direct payments remain claims |
| S3-03 | Invoice fragment in browser history DB | Medium | Status unclear; documented limit in privacy-limits.md |
| S3-04 | Release-hash widget self-attested; no signed releases | Medium | Open; no release signed (SECURITY.md, ADR-0015) |
| S3-05/06/07 | Relayer breaker latch, gas-grief, XFF bypass | Med/Low | Addressed by relayer-guard + audit 17 (RELAYER-01/03); no live test; status unclear for S3-07 |
| S3-09 | Direct sweep: attacker-chosen target, uncapped fee params | Low | Status unclear; audits/03 |
| S3-10/11 | Embed SDK unversioned/no SRI; meta-CSP only, broad connect-src | Low | Status unclear (S3-11 partly accepted trade-off); audits/03 |
| S3-17 | CI: no e2e job, no release workflow/SBOM, base image not digest-pinned | Low | Status unclear; SHA-to-tag mapping never verified; audits/03 |
| S3-18/19 | Relayer ops hardening (conn cap, feeTo=hot key); approve left on abort | Low | Status unclear; audits/03 |
| S3-24 | Two noble major versions installed (viem closure) | Low | Open, no decision; ADR-0004 amendment |
| M-01 / D5 | Immutable fee recipient blacklist/ETH-reject bricks payments >=400 units | Medium | Open by design (operational mitigation only); ADR-0013; audits/02 |
| M-02 | Scheme-1 router cannot announce scheme 2 | Medium | Policy router added; scheme 2 still experimental/not enabled; ADR-0014 |
| M-03 | Fee-token failure freezes counterfactual policy accounts | Medium | Open, documented; contracts README |
| L-02 / L-03 | Unauthenticated announcements; relayer economics | Low | Open by design, client/service mitigations; contracts README |
| D3, D4, D6, D7, D8, D10 | Stable meta-address; hidden-tag payments; policy-account no recovery; frontend compromise; RPC/relayer metadata; compliance | Med/High | Open per THREAT_MODEL s7 (written before audit 17) |
| G-01/G-02 | No deployment/manifest; no real-wallet e2e | P0 | Open; audit 08 pre-funds checklist unchecked |
| G-15 | Independent professional audit | P2 | Open; audit 08 mainnet gate |
| G-23 | Owner items: licence, terms, sanctions, fee recipient | P2 | Open; README.md, SECURITY.md [OWNER] table |
| G-03 | Fiat quote path: FEEDS empty, tokens unverified | P1 | Open (disabled); ADR-0012; audit 08 |
| G-13 | Policy account client side (scheme 2) | P2 | Open, experimental; audit 08 gap 4 |
| G-14 / G-33 | Release engineering; Planned items (BTC, Solana, EIP-3009...) | P2/P3 | Partly built per audit 08; signing root pending |
| Trusted setup | Real ceremony for pools; Mythril/mutation not current evidence | Gate | Open; audits/08 |
| SECURITY.md [OWNER] | Reporting contacts, SLAs, safe harbour, PVR not confirmed | n/a | Open; assume nobody monitors reports |
| Other G-05..G-12, G-16..G-32 | Remaining completeness gaps | P1-P3 | Status unclear (audit 01 predates consolidation; check audit 08/22) |
