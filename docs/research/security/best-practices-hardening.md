# GhostPay: Best Practices and Hardening Checklist

Status: research draft, 2026-10-21. Pre-audit. Written by a Haiku research subagent.
Legend: **V** = verified in repo file (path:line from grep) or in a fetched/search-snippet source. **U** = unverified (search snippet only, or from memory). Re-check U items before relying on them.

## 1. Sources (cited)

| ID | Source | URL | Status |
|---|---|---|---|
| S1 | OWASP Smart Contract Top 10 2025 (SC01-SC10 list) | https://owasp.org/projects/smart-contract-top-10 ; https://scs.owasp.org/sctop10/archive/2025/Top10:2025/ | V (search snippet) |
| S2 | OWASP ASVS 5.0.0, released 30 May 2025 | https://softwaremill.com/whats-new-in-asvs-5-0/ ; asvs.dev (named in secondary source) | U (secondary source; not fetched) |
| S3 | OWASP SCSVS, latest stable 0.0.1 (Sep 2024) | https://scs.owasp.org/SCSVS/ | U (search snippet) |
| S4 | CCSS v9.0 (3 levels, 47 control objectives, 10 aspects) | https://cryptoconsortium.org/?p=1693 ; https://opensecurityarchitecture.org/frameworks/ccss-v9 | U (secondary sources) |
| S5 | NIST SP 800-218 SSDF v1.1 (final, Feb 2022) | https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf ; https://csrc.nist.gov/News/2022/nist-publishes-sp-800-218-ssdf-v11 | V (search) |
| S6 | SLSA v1.0 Build track L1-L3 | https://slsa.dev/spec/v1.0/levels | V (search); site says v1.2 is current, U |
| S7 | npm provenance and trusted publishing | https://docs.npmjs.com/generating-provenance-statements ; https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/ | V (search) |
| S8 | CSP require-trusted-types-for (MDN) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for | V (search); browser support inconsistent across MDN pages |
| S9 | SubtleCrypto.importKey and CryptoKey.extractable (MDN) | https://developer.mozilla.org/docs/Web/API/SubtleCrypto/importKey | V (search) |
| S10 | ConsenSys Smart Contract Best Practices | https://consensys.github.io/smart-contract-best-practices/ | U (search listing; not fetched) |
| S11 | SWC Registry (CWE-style catalog for Solidity) | https://swcregistry.io ; https://diligence.consensys.io/blog/2019/12/all-smart-contract-security-issues-in-one-place-an-introduction-to-the-swc-registry | V (search) |
| S12 | ERC-4337 spec | https://eips.ethereum.org/EIPS/eip-4337 | V (URL); body not fetched |
| S13 | ERC-4337 bundler/paymaster/signature risks (Cantina) | https://cantina.xyz/blog/erc-4337-security-bundlers-paymasters-signatures | U (secondary, search snippet) |
| S14 | DoD Rainbow Series index (NIST) | https://csrc.nist.gov/pubs/other/1985/12/26/dod-rainbow-series/final ; https://en.wikipedia.org/wiki/Rainbow_Series | V (search); colors conflict across sources |
| S15 | Ethereum RPC read privacy (IP and query leakage) | https://ethereum-magicians.org/t/ethereum-privacy-of-reads/24671 ; https://arxiv.org/pdf/2508.21440v1 | U (snippets only) |

Not yet researched (gaps, see section 7): Nym/mixnet RPC evidence, Trusted Types browser rollout, CCSS v9 control text, SCSVS controls, papers repositories on crypto payment processor and exchange security.

## 2. Repo facts (verified by grep)

- Key storage: `apps/web/src/lib/keystore.ts` uses scrypt (N=2^17, r=8, p=1, line ~24), AES-256-GCM, AAD binds `meta` (metaAddress, signer). `importKey(..., extractable=false, ['encrypt','decrypt'])` at line 45. Plaintext buffers `.fill(0)` at lines 47, 100, 166.
- CSP: `apps/web/index.html:9` (meta), `infra/web/Caddyfile.static:14`, `infra/proxy/Caddyfile:26`, `infra/proxy/ghostpay-headers.conf:3`. Policy is `script-src 'self'`, `connect-src 'self' https: wss:`. **No `trusted-types` or `require-trusted-types-for` directive found.**
- COOP same-origin, COEP require-corp, CORP set: `infra/web/Caddyfile.static:19-39`, `infra/proxy/Caddyfile:31-61`.
- Relayer: body cap 16 KiB (`apps/relayer/src/server.ts:14`), header/request timeouts (`:127-129`), per-IP limiter and global quote budget (`:112-121`, `:273-277`), salted keyed-hash limiter buckets (`apps/relayer/src/limiter.ts:43`), nonce-reuse error `NonceAlreadyUsed` 409 (`apps/relayer/src/service.ts:106`), `NonceManager` (`lane.ts`). Caddy `trusted_proxies` (`infra/proxy/Caddyfile:12`).
- Relayer hot key: 32-byte file or env source, mode checks (`apps/relayer/src/secrets.ts:29`, `:72-73`).
- CI: `release.yml` builds SLSA-style attestation with `actions/attest-build-provenance` pinned to SHA (line ~103), `npm ci --ignore-scripts` (line 54), `check-actions-pinned.sh` gate. `nightly.yml:74-80` runs `npm ci --ignore-scripts` and a signature/provenance check. `package-lock.json` has 735 `resolved` entries.
- Deps pinned exact: `viem 2.57.7`, `@noble/hashes 2.4.0`, `@noble/curves 2.4.0` (no caret).
- `SECURITY.md` still has an `[OWNER] to confirm` placeholder for reporting contact. No independent audit exists yet.

## 3. Prioritized checklist

Priority: P0 = fix before any testnet user touches it. P1 = before mainnet-shaped testing. P2 = hardening backlog. Owner and effort are suggestions.

### P0

1. **Add Trusted Types to CSP (report-only first).** Add `require-trusted-types-for 'script'; trusted-types ghostpay-default` to the three CSP sites above. Start with `Content-Security-Policy-Report-Only` so violations surface without breaking the app. Sources: S8. Files: `apps/web/index.html`, `infra/web/Caddyfile.static`, `infra/proxy/Caddyfile`, `infra/proxy/ghostpay-headers.conf`.
2. **Tighten `connect-src`.** `https: wss:` allows any origin. Replace with an explicit RPC/relayer/esplora allowlist per deployment, generated from config. File: all four CSP sites. Basis: S1 (supply and XSS-to-drain paths), general CSP practice (U).
3. **Keystore: confirm non-extractable only where required.** Key import is correct (`extractable=false`, V). Verify that scrypt-derived raw bytes are not kept in long-lived variables and that the passphrase string is not retained. JS cannot guarantee memory zeroization (U, general limit). Files: `apps/web/src/lib/keystore.ts`, `apps/web/src/lib/wallet.ts`. Source: S9.
4. **Replace placeholder reporting contact in `SECURITY.md`.** Fill the `[OWNER]` table or mark the reporting channel as not active. File: `SECURITY.md`.
5. **Relayer: bind signed requests to chain, relayer and expiry.** Check `service.ts` nonce handling covers replay across chains and EntryPoint/pool addresses. Basis: S13 signature-scope warning (U), S12 chain-ID and EntryPoint binding (V URL). Files: `apps/relayer/src/service.ts`, `apps/relayer/src/validate.ts`.

### P1

6. **Add npm provenance on publish of internal packages if any are published.** Use trusted publishing with GitHub Actions and `id-token: write`. Require npm CLI 9.5 or later (S7). Files: `.github/workflows/release.yml`, package `package.json` `repository` fields.
7. **Raise SLSA posture.** Current attestation covers Build L2-like provenance (U mapping). Target Build L3 by isolating signing and using a hardened hosted builder (S6). Record which level is claimed in `docs/audits/` and in the release manifest. Files: `.github/workflows/release.yml`, `scripts/gen-release-manifest.mjs`.
8. **Map controls to SSDF practices.** Produce a short table from NIST SP 800-218 PO/PS/PW/RV groups to GhostPay CI jobs (S5). Keep it a risk-based map, not a checklist, per NIST's own framing (S5). File: `docs/research/security/` (new mapping doc, later).
9. **Relayer DoS and rate limits.** Current per-IP and global budgets exist (V). Add per-chain-address and per-invoice budgets and a paymaster-style economic cap (per S13 griefing notes, U). Files: `apps/relayer/src/limiter.ts`, `apps/relayer/src/server.ts`, `relayer-guard` package.
10. **Smart-contract checks against SWC and OWASP SC Top 10.** Run Slither and the SWC checklist against `packages/contracts` and `packages/pool-contracts`. Focus SC01 access control, SC02 oracle manipulation, SC05 reentrancy, SC07 flash loan, SC09 randomness (S1, S11). Files: `packages/contracts`, `packages/pool-contracts`, `packages/payer-hiding-contracts`.
11. **Privacy: RPC leakage.** Wallet reads (`eth_getLogs`, `eth_call`, `eth_getBalance`) reveal the address and the client IP to the provider (S15, U on details). Options: route RPC through a user-selectable proxy or light client, cache and batch queries, add query jitter. Files: `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/defaultServices.ts`, `packages/chain-adapters`.
12. **ERC-4337 surfaces (only if account abstraction is in scope).** Check bundler DoS, paymaster economic attacks, initCode griefing, and custom signature schemes (S12, S13, U). Files: `packages/payer-sponsor`, `packages/payer-hiding-contracts`.

### P2

13. **Adopt ASVS 5.0 as the verification target.** Map the web app and relayer to ASVS 5.0 chapters (S2, U on exact chapter list). Start with V2 authentication, V5 validation, V13 API, V14 configuration.
14. **Adopt CCSS levels as an external-audit goal.** Target CCSS Level I first, then II (S4, U). Use after the independent audit is scheduled.
15. **Relayer secret handling.** Keep the 32-byte hot key out of env where possible, check file modes on every start (V, `secrets.ts`), and add rotation runbook. Consider a KMS/HSM signer later (U).
16. **Key backup.** Keystore file is versioned and AAD-bound (V). Add a tested restore path, a passphrase strength meter, and a warning that the file plus passphrase are the only recovery (U).
17. **Pin and verify build tools.** Keep `check-actions-pinned.sh` in CI (V). Add SBOM diffing and reproducibility checks (V scripts exist: `scripts/repro-check.sh`, `scripts/normalize-sbom.mjs`).
18. **Rainbow Series (S14).** The series is historical and largely superseded by Common Criteria (S14). It adds no concrete control beyond what ASVS/SSDF cover. Use it only for vocabulary, such as TCSEC audit and trusted-distribution concepts. Colors conflict across sources, so cite by NCSC-TG number, not color.

## 4. Mapping: threat to file

| Threat | Primary files | Priority |
|---|---|---|
| XSS to key or payment drain | `apps/web/index.html`, `infra/*/Caddyfile*` | P0 |
| Malicious or hijacked dependency | `package-lock.json`, `.github/workflows/*.yml`, `scripts/` | P1 |
| Relayer replay or cross-chain signature reuse | `apps/relayer/src/service.ts`, `validate.ts` | P0 |
| Relayer DoS or griefing | `apps/relayer/src/server.ts`, `limiter.ts` | P1 |
| Hot key theft | `apps/relayer/src/secrets.ts`, deploy config | P2 |
| Seller key backup loss or theft | `apps/web/src/lib/keystore.ts` | P0/P2 |
| Contract access control, reentrancy, oracle | `packages/contracts`, `packages/pool-contracts` | P1 |
| RPC and IP privacy leak | `apps/web/src/lib/scanClient.ts`, `packages/chain-adapters` | P1 |

## 5. Notes on the mix of chains

Requested: ETH, BTC, Solana, stablecoins. Repo has EVM (viem), Bitcoin (`btc-payjoin`, `btc-silent-payments`), Solana (`solana-stealth`), and Tron (`tron-adapter`). The checklist above is chain-neutral except items 10 and 12 (EVM-specific). Solana and Tron specific research is not done (gap).

## 6. Open questions

- Does `service.ts` bind nonces to chain ID and pool address? Not read in detail.
- Current SLSA target level claimed by the project: not stated in docs read.
- Browser support for `require-trusted-types-for` is inconsistent across MDN pages (S8). Test in target browsers.

## 7. Gaps and next research

- Nym and mixnet support for RPC traffic: no evidence found in this pass.
- CCSS v9 control text and SCSVS control list: only summaries read.
- SWC entries relevant to repo contracts: full list not read.
- Payment-processor and exchange security papers: not searched in this pass.
- Darknet, exchange, and blockchain incident case studies: covered by a separate task (`failures-and-prevention.md`).
