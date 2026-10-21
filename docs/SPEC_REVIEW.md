# Specification Review: findings and resolutions

Reviewed: README, MASTER_BLUEPRINT, DEVELOPER_SPECIFICATION, SECURITY_QA_DEVOPS_PLAYBOOK, POST_LAUNCH_FEATURES_SECURITY_ROADMAP (checked 2026-10-21). Primary-source checks: ERC-5564/6538 text and the ScopeLift reference contracts (CC0) and SDK (MIT).

## A. Errors and contradictions fixed

| # | Finding | Resolution |
|---|---|---|
| A1 | The router sketch emitted a public `invoiceId`, contradicting the stated rule "do not index invoice IDs that reveal commercial data". | `invoiceId` removed from router events and calldata. Single-use invoices are enforced off-chain; ADR-0003. |
| A2 | The sketch relied on a `bool` return from `transferFrom` and no balance checks, though the same document lists fee-on-transfer and no-return tokens as unsupported. | Router uses SafeERC20 plus balance-delta checks and `nonReentrant`. |
| A3 | Router metadata was only checked for length >= 1. A payer could announce metadata that does not match the transfer. | Router requires the exact 57-byte ERC-20 layout (view tag, `transfer` selector `0xa9059cbb`, token, net amount), or the ETH layout (`0xeeeeeeee`, `0xEeee...EEeE`, amount), and a 33-byte compressed ephemeral key. |
| A4 | Scheme-1 hash was only described as "must match the reference". | Pinned in ADR-0001: `s = ECDH(p_eph, P_view)` as a 33-byte compressed point, `s_h = keccak256(s)`, view tag = `s_h[0]`, `P_stealth = P_spend + (s_h mod n)·G`, `p_stealth = (p_spend + s_h) mod n`. Verified against `@scopelift/stealth-address-sdk` 1.0.0-beta.5 source. |
| A5 | LaTeX in DEVELOPER_SPECIFICATION is corrupted (literal tab characters before `ext{MSB}`; "(rin[1,n-1])"). | Section rewritten as plain text in the Developer Specification. |
| A6 | Invoice "seller signature" had no defined signing key. Reusing the stealth spending key for signing is a key-reuse hazard, and a fresh signing key embedded in the link authenticates nothing against a link tamperer. | ADR-0002: dedicated Schnorr/ECDSA invoice-signing key, separate from spend/view keys. The signature provides integrity only against parties who pin the signer key (merchant profile, embed widget); for a bare link it is a consistency check, and the UI says so. |
| A7 | Spec said "6x reduction" and "99.6%" inconsistently. | Standardised wording: view tag lets the scanner skip ~255/256 of the later point operations; log download is unchanged. |
| A8 | Playbook CI template used `npm` while spec said "pnpm or npm". | Decision: npm workspaces, lockfile committed. |
| A9 | Spec lists `ethers` or `viem`. | Decision: `viem` only. |
| A10 | Noble 2.x requires `.js` subpath imports (`@noble/curves/secp256k1.js`) and renamed some APIs; spec examples assume 1.x. | ADR-0004 pins versions and import paths. |
| A11 | GitHub Pages cannot set response headers; `frame-ancestors`, `Referrer-Policy` headers cannot be enforced, so Feature 2 anti-clickjacking cannot be honoured there. | Primary deployment target is a host with header control (Cloudflare Pages `_headers` shipped). GitHub Pages is documented as a degraded mirror: meta CSP + meta referrer only, embed iframe mode disabled, popup mode only. |

## B. Gaps filled (new documents)

| Gap | Document |
|---|---|
| No fee/revenue specification, no owner-wallet handling, no gas-sponsorship pricing | FEE_SCHEDULE.md |
| Native-asset (ETH) payments absent | Router spec in DEVELOPER_SPECIFICATION addendum and `GhostPayRouter.payNative` |
| No ERC-2612 permit payer path (approve + pay doubles transactions) | `payERC20WithPermit` |
| Gasless sweep contract never specified (spec only says "token-authorized") | `GhostPaySweepRelayer` (EIP-712 sweep signature + permit), see CONTRACTS_SPEC.md |
| No contract-level spec of PolicyAccount (Proposal 3) | CONTRACTS_SPEC.md section 4 |
| No multi-chain / non-EVM plan | MULTICHAIN_SPEC.md |
| No ADRs, no threat-model directory, no deployment manifest format | docs/adr/, docs/threat-model/, DEPLOYMENT_MANIFEST.md |
| No SECURITY.md, no dependency/licence register | SECURITY.md, THIRD_PARTY.md |
| No test-vector provenance | test-vectors/README.md |

## C. Plan changes

1. Phase order changed: core-crypto and contracts are built in parallel (shared interface is fixed in CONTRACTS_SPEC.md), the UI follows.
2. ERC-4337 sweeping is removed from the MVP path. MVP sponsorship is permit + EIP-712 sweep signature through `GhostPaySweepRelayer`. ERC-4337 remains a future scheme (Proposal 3).
3. Chain scope for v1: Ethereum Sepolia, Base Sepolia (test), then Base, Optimism, Arbitrum One, Polygon PoS, Ethereum mainnet only after audit. Non-EVM follows MULTICHAIN_SPEC.md.
4. Monetisation added as a first-class workstream (FEE_SCHEDULE.md), with an explicit rule that the owner's wallet enters only through the deployment manifest.
5. Feature 5 stage 2/3 (PIR/MPC) stay research-only and are not built. Stage 1 (Tor-friendly range queries, local matching) is built as an RPC adapter option.
6. Feature 3 (escrow) stays out of v1 scope (custody); specified, not built.

## D. Open items needing the owner

- Fee recipient address per chain, fee rate confirmation (25 bps default), F-SPONSOR and F-SECURE numbers.
- Licence for the repository (currently none; packages marked `UNLICENSED`).
- Jurisdictional/legal review of the fee model.
- Hosting target (see README "Hosting" once decided).
