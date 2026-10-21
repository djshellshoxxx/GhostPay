# Rainbow Series and successor standards: controls for GhostPay

Scope: non-custodial client-side crypto payment app (`/home/user/GhostPay`).
Date: 2026-10-21. Method: WebSearch snippets plus WebFetch where reachable.

## Verification status (read first)

- Primary sources NOT read in full. Fetch results:
  - `csrc.nist.gov`: proxy policy denial (`CONNECT tunnel failed, response 403`). Not routed around (per `/root/.ccr/README.md`).
  - `irp.fas.org`, `en.wikipedia.org`, `pages.nist.gov`, `www.sakimura.org`, `nob.cs.ucdavis.edu`: DNS `ENOTFOUND` from WebFetch.
- Everything below marked **[snippet]** comes from search-result text only (secondary). **[UNVERIFIED]** = conflicting or unconfirmed. Re-verify against primary PDFs before any compliance claim.
- Rainbow books are withdrawn/historical per NIST. Use them as design patterns, not normative requirements.

---

## 1. Rainbow Series index (NIST table)

Source: https://csrc.nist.gov/pubs/other/1985/12/26/dod-rainbow-series/final (listing only, blocked; index via search snippet https://irp.fas.org/nsa/rainbow.htm **[snippet]**).

- NIST status note **[snippet]**: Rainbow Series is "outdated, out of print, and provided here for historical purposes ONLY". Orange and Red Books superseded by CCEVS / Common Criteria.
- Relevant books: Orange (TCSEC, DoD 5200.28-STD), Red (TNI, network extension of TCSEC), Green (CSC-STD-002-85 password mgmt), Tan (NCSC-TG-001 audit), Light Blue (NCSC-TG-017 I&A; NCSC-TG-018 object reuse), Light Pink (covert channel analysis, number conflicting **[UNVERIFIED]**: TG-030 vs TG-020-A).

### Apply to GhostPay (index-level)
- `docs/research/security/` is the home for this research; link successor standards from `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` (not yet cross-linked, verify before editing).

---

## 2. Orange Book (TCSEC, DoD 5200.28-STD)

Sources: https://www.wikipedia.com/wiki/TCSEC **[snippet]**; https://nob.cs.ucdavis.edu/classes/ecs235b-2025-02/modules/58-evalsys.pdf **[snippet]** (unreachable for full read).

What it says (snippet level):
- Trusted path: "direct communications path between the user and the TCB"; required at B2 and above per two sources. A CISSP-style summary says B3 adds trusted paths **[UNVERIFIED conflict; treat B2 as likelier]**.
- Covert channels: B2 covers covert storage channels; B3 adds timing channels; B1 has no covert channel requirement **[snippet]**.
- Successor: superseded by Common Criteria (ISO/IEC 15408). Date conflict: 1999 (better supported) vs 2005 in one Wikipedia sentence **[UNVERIFIED]**.

### Apply to GhostPay
- Trusted path analogue: the only trustworthy confirmation is what the user sees on a non-page-controlled surface before signing. Targets: `packages/tx-review/src` (pre-sign decoder, `decodeTx` / `decodeTypedData`), `apps/web/src` signing/confirm views. Action: confirm the reviewed intent hash equals the signed bytes hash; reject on mismatch.
- Audit (B2-style): structured, tamper-evident log of security events. Targets: `packages/ops-monitor/src`, `packages/relayer-guard/src` (`GuardedBreaker` already has counters/health; add signed event records).
- Covert channel (timing/size) analysis: relayer response timing and payload sizes can leak which user acted. Targets: `packages/pool-relayer` (see `PRIVACY.md`), `packages/relayer-guard`. Action: document channels, pad or batch responses where feasible. Analysis only, not a Rainbow requirement.
- Least privilege: separate keys per role (sweep relayer, payer-sponsor, stealth spend). Targets: `packages/payer-sponsor`, `packages/relayer-guard`, `packages/policy-scheme` (keep ADR-0014 experimental flag off in prod).

---

## 3. Red Book (TNI, Trusted Network Interpretation)

Source: https://cisre.egr.uh.edu/?p=130 **[snippet]**. Part I extends TCSEC to networks **[snippet]**. Full text not read.

### Apply to GhostPay
- Treat client to relayer and client to RPC as untrusted networks: authenticate every relayer response and verify on-chain before showing "done". Targets: `packages/pool-sdk/src/relayerClient.ts`, `packages/chain-adapters/src/rpc.ts`, `packages/address-safety` (parse strict addresses at trust boundary).
- Do not trust RPC/indexer data for amounts or addresses without independent check. Targets: `packages/btc-silent-payments/src/scan/blindbit.ts` (external scan source), `packages/solana-stealth/src/rpc.ts`.

---

## 4. Green Book (CSC-STD-002-85, DoD Password Management Guideline, 12 Apr 1985)

Sources: https://irp.fas.org/nsa/rainbow/std002.htm (unreachable); https://everyspec.com/DoD/DOD-General/CSC-STD-002-85_Green_11745/ **[snippet, not read]**.

What it says (snippet level only):
- Covers password-based user authentication for classified/sensitive ADP systems **[snippet]**.
- Length/composition: an Air Force citing document (AFSSI 5102) says 8+ alphanumeric with a special character **[UNVERIFIED, secondhand; not the Green Book text]**.
- One-way storage of passwords: not confirmed **[UNVERIFIED]**.

### Apply to GhostPay
- Passphrase policy for the local keystore and vault: minimum length, blocklist of common passphrases, no forced periodic rotation (modern guidance, see section 5). Targets: `apps/web/src/lib/keystore.ts`, `packages/external-pools/src/vault.ts`, `apps/web/src/views/SellerKeys.tsx` (passphrase UI hint at line ~150).
- Store only a derived verifier, never the passphrase. Confirm vault header in `packages/external-pools/src/vault.ts` stores only `check` and salt (it does per header write at line ~194).

---

## 5. Tan Book (NCSC-TG-001, A Guide to Understanding Audit in Trusted Systems, v2, 1 Jun 1988)

Source: NIST table snippet https://irp.fas.org/nsa/rainbow.htm **[snippet]**; full text not read.

### Apply to GhostPay
- Audit records must capture who/what/when for signing, key unlock, and relayer submission. Make logs append-only.
- Targets: `packages/ops-monitor/src/cli.ts`, `packages/ops-monitor/src/config.ts`, `packages/relayer-guard/src`. Redact any key material or address-to-identity link in logs.
- Cross-ref NIST SP 800-53 AU-9 (section 9 below).

---

## 6. Light Blue Book: NCSC-TG-017 (I&A) and NCSC-TG-018 (Object Reuse)

Sources: search snippets only (https://irp.fas.org/nsa/rainbow.htm; https://danielmiessler.com/p/rainbow-book-list **[snippet]**).

- TG-017: identification and authentication in trusted systems (Sep 1991) **[snippet]**.
- TG-018: object reuse in trusted systems (Jul 1992) **[snippet]**. Object reuse = clearing storage before reuse so old data is not visible.

### Apply to GhostPay
- Object reuse in JS: buffers and key material must be zeroized before reuse or release. Existing: `packages/core-crypto/src/secret.ts` (`zeroize`, `wrapSecret`, `SecretScalar`), `packages/core-crypto/src/stealth.ts` (`zeroize(shared, digest)`, `zeroize(spendBytes)`), `packages/core-crypto/src/rng.ts` (zeroize scratch buffer).
- Known gap: JS cannot guarantee memory wipe (GC copies, strings are immutable). `secret.ts` already documents "best-effort, not a boundary" (audit S3-08). Action: keep passphrases as `Uint8Array`, not `string`, where feasible; document residual risk in `packages/core-crypto/README.md`.
- Auth: session lock/auto-timeout clears `SecretBox` contents. Target: `packages/secret-box`, `apps/web/src/views/Settings.tsx`.

---

## 7. Light Pink Book: covert channel analysis (NCSC-TG-030 or TG-020-A) [UNVERIFIED number]

Source: search snippets only; conflicting IDs **[UNVERIFIED]**.

### Apply to GhostPay
- Enumerate covert/side channels: timing of signing, sizes of relayer requests, RPC polling patterns, UI timing. Targets: `packages/relayer-guard`, `packages/pool-relayer`, `packages/pool-prover`.
- Mitigate with constant-time crypto (verify `@noble/curves` use is constant-time for secret ops, not yet checked) and batched/padded submissions.

---

## 8. FIPS 140-3 (cryptographic module validation)

Source: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.140-3.pdf **[snippet link only; not read]**. Supersedes FIPS 140-2 **[snippet]**. Validated via CMVP (NIST and CCCS) **[snippet]**. A vendor page gives a 2026 transition deadline **[UNVERIFIED]**.

### Apply to GhostPay
- The app uses JS crypto libraries (for example `@noble/hashes`, `@noble/curves`), which are not FIPS 140-3 validated as far as known **[UNVERIFIED for these versions]**. Do not claim FIPS compliance. Only needed if a customer requires it.
- Document the crypto boundary: which module performs scrypt, AES-GCM, secp256k1, RNG. Targets: `packages/core-crypto/README.md`, `packages/external-pools/src/vault.ts`, `apps/web/src/lib/keystore.ts`.
- RNG: `packages/core-crypto/src/rng.ts` must use `crypto.getRandomValues` (or equivalent CSPRNG). Verify in the file (not yet checked).

---

## 9. NIST SP 800-53 Rev 5 (controls relevant to the Rainbow lessons)

Source: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/Final (blocked). Snippet source: https://www.stigviewer.com/controls/nist-800-53/AU-9 **[snippet]**.

- AU-9 Protection of audit information: protect audit info and tools from unauthorized access, modification, deletion; alert on attempts **[snippet]**.
- AU-9(3) (high baseline): cryptographic protection of audit integrity, e.g. signed hashes with asymmetric crypto **[snippet]**.
- SI-7 Software integrity and SC-12 key establishment/management: text NOT retrieved **[UNVERIFIED]**. Release 5.2.0 (27 Aug 2025) revised SI-07(12) **[snippet]**.

### Apply to GhostPay
- AU-9(3): sign audit log chain (hash-chain + signature) in `packages/ops-monitor` and `packages/relayer-guard`.
- SI-7: release integrity already present: `scripts/release-build.sh`, `scripts/verify-release.sh`, `scripts/repro-check.sh`, `packages/pool-circuits/SHA256SUMS`. Extend to web bundle hashes in `apps/web` build output.
- SC-12: key lifecycle doc (generation, storage, rotation, destruction) for relayer and deployer keys. Target: new `docs/` key-lifecycle section; link `deployments/`.

---

## 10. NIST SP 800-57 Part 1 Rev 5 (key management, May 2020)

Source: https://doi.org/10.6028/NIST.SP.800-57pt1r5 **[snippet]**; supersedes Rev 4 (2016). Changes: stronger protection of key metadata, access control, identity authentication, inventory of keys and certs; aligned with FIPS 201 and SP 800-63-3 **[snippet]**. Recommendations text NOT read **[UNVERIFIED specifics]**.

### Apply to GhostPay
- Key inventory: list every key class (stealth view/spend, vault KEK, relayer hot key, deployer key) with owner, cryptoperiod, storage. Target: `docs/DEPLOYMENT_MANIFEST.md`, `deployments/`.
- Protect key metadata (labels, derivation paths, stealth scheme ids) as well as key bytes. Targets: `packages/core-crypto/src/metadata.ts`, `packages/policy-scheme`.

---

## 11. NIST SP 800-63B-4 (authenticators, final July 2025)

Source: https://csrc.nist.gov/pubs/sp/800/63/b/4/final **[snippet; blocked]**. Supersedes SP 800-63B (2020) **[snippet]**. Defines AAL requirements **[snippet]**. Includes syncable authenticators (synced passkeys) **[snippet]**.

Memorized secret points from commentary **[snippet, UNVERIFIED]**:
- Minimum: 15 characters if password is single-factor; 8 if part of MFA. Sources conflict (one says 8 for all **[UNVERIFIED]**).
- Maximum length at least 64 characters **[snippet]**.
- No composition rules; no periodic forced change **[snippet]**.
- Blocklist screening of compromised/common passwords **[snippet]**.
- Section numbering (3.1.1.2 vs 5.1.1.2) **[UNVERIFIED]**.

### Apply to GhostPay
- Keystore/vault passphrase: min 15 chars when single-factor (assume worst case until verified), max >= 64, paste allowed, blocklist check (client-side hash-prefix lookup or bundled list), no composition rules, no periodic rotation. Targets: `apps/web/src/lib/keystore.ts`, `packages/external-pools/src/vault.ts`, passphrase UI in `apps/web/src/views/`.
- Rate limiting on unlock attempts (client-side backoff; cannot be server-enforced in non-custodial design). Target: `apps/web/src/lib/keystore.ts`.
- KDF cost: scrypt N=2^17, r=8, p=1 already set (`packages/external-pools/src/vault.ts` line ~44; `apps/web/src/lib/keystore.ts` line ~28). Keep; add a test that refuses lower N in production builds.

---

## 12. Common Criteria (ISO/IEC 15408) and EAL levels

Sources: https://en.wikipedia.org/wiki/Protection_Profile **[snippet]**; https://www.wikipedia.com/wiki/ISO_15408 **[snippet]**. Adopted as ISO 15408 in 1999 **[snippet]**. Seven EALs, EAL1 lowest, EAL7 highest **[snippet]**.

### Apply to GhostPay
- Plan assurance evidence at about EAL2-EAL4 style depth for the independent audit (design docs, functional tests, vulnerability analysis). Targets: `docs/threat-model/`, `docs/audits/`, `packages/*/DEVIATIONS.md`.
- Write a Protection Profile-style security target for the wallet app: assets, threats, security functions. Target: `docs/threat-model/`.

---

## 13. NIST SP 800-218 SSDF (secure software development)

Sources: https://csrc.nist.gov/pubs/sp/800/218/r1/ipd **[snippet]**; https://csrc.nist.gov/News/2025/draft-ssdf-version-1-2 **[snippet]**.
- SP 800-218 v1.1: final, 3 Feb 2022 **[snippet]**. SP 800-218A (genAI profile): final 26 Jul 2024 **[snippet]**.
- SP 800-218r1 (v1.2): initial public draft, 17 Dec 2025, comments closed 30 Jan 2026. Still draft in results **[snippet]**.

### Apply to GhostPay
- Map to existing CI: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/nightly.yml`; `scripts/check-actions-pinned.sh` (pin actions), `scripts/scan-secrets.sh` (secrets), `scripts/normalize-sbom.mjs` (SBOM), `scripts/gen-release-manifest.mjs`.
- Add: dependency vulnerability gate in ci.yml; signed release artifacts; a written SSDF practice-to-evidence table in `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`.

---

## 14. PCI DSS v4.0.1 key management (only if card or payment-processor scope)

Sources: https://ce.prod.cloudaware.com/frameworks/pci-dss-v4.0.1/03/07/06 **[snippet, secondary]**; https://www.cryptomathic.com/cryptographic-key-governance-guide-pci-dss-v4.0.1-insights **[snippet]**. Official PCI SSC text NOT read.
- Requirements 3.6 and 3.7 cover key protection and key lifecycle (generation, distribution, storage, cryptoperiod, retirement, substitution protection, split knowledge and dual control for manual cleartext keys) **[snippet, paraphrase]**.
- Numbering conflict: one source uses v3.2.1-style 3.6.1-3.6.8 **[UNVERIFIED]**.

### Apply to GhostPay
- Not in PCI scope for a non-custodial wallet unless card rails are added. Use the lifecycle checklist for the relayer and deployer keys: split knowledge and dual control for any manual cleartext key. Targets: `packages/relayer-guard`, `scripts/devnet/`, `scripts/testnet/deploy.sh`, `docs/DEPLOYMENT_MANIFEST.md`.

---

## 15. NIST SP 800-92 (log management)

Sources: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-92.pdf **[snippet link]**; https://en.wikipedia.org/wiki/NIST_SP_800-92 **[snippet]**. Published Sep 2006, Kent and Souppaya **[snippet]**. High-level planning guide, not a step-by-step manual **[snippet]**. Specific retention numbers NOT verified **[UNVERIFIED]**.

### Apply to GhostPay
- Define what is logged, where, retention, and who reviews: `packages/ops-monitor/ops-monitor.config.example.json`.
- Never log secrets, addresses linked to users, or raw tx bytes. Targets: `packages/ops-monitor/src/cli.ts`, `packages/relayer-guard`.

---

## Priority actions (ranked, implement now)

1. Passphrase policy + zeroize discipline: `apps/web/src/lib/keystore.ts`, `packages/external-pools/src/vault.ts`, `packages/core-crypto/src/secret.ts`.
2. Pre-sign confirmation integrity: `packages/tx-review/src`, signing view in `apps/web/src`.
3. Tamper-evident signed audit log: `packages/ops-monitor/src`, `packages/relayer-guard/src`.
4. Key inventory and lifecycle doc: `docs/DEPLOYMENT_MANIFEST.md`, `docs/threat-model/`.
5. SSDF evidence table and CI gates: `.github/workflows/ci.yml`, `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`.
6. Covert channel inventory (timing/size): `packages/pool-relayer/PRIVACY.md`, `packages/relayer-guard`.

## Open items (blocked, re-verify)

- Read primary PDFs: Green Book, TG-017, TG-018, Orange Book trusted-path section, SP 800-63B-4 section 3 (min length, KDF), SP 800-57 Pt1 r5 recommendations, SP 800-53 SC-12/SI-7, FIPS 140-3 Annex list, PCI SSC v4.0.1.
- Network blocks: NIST CSRC (proxy 403 policy), irp.fas.org and en.wikipedia.org (DNS). Do not route around; request an allowlist change if needed.
