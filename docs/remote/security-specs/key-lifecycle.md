# Key lifecycle spec: stealth scan/spend keys and relayer signer keys

Status: DRAFT (new, 2026-10-21). Branch `claude/remote-extensions-1`. Gap analysis in section 0.
Scope: generation, storage, backup, rotation, zeroization, recovery.
Out of scope: contract-level owner recovery (C-19), manifest signing (A-06), onion/mirror key rotation (see `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`).

Conventions: MUST/SHOULD per RFC 2119 (wording only, not normative citation). Requirement IDs `KL-n`.

## 0. Existing coverage (grep of repo, 2026-10-21)

| Area | Where | Gap |
|---|---|---|
| Seller keystore export | `docs/APP_AND_RELAYER_SPEC.md:9` (scrypt N=2^17 r=8 p=1, AES-256-GCM, versioned JSON, never raw keys in storage); `apps/web/src/lib/keystore.ts` per `docs/audits/01-completeness-audit.md` W-02 | Operator-facing only. No rotation, no recovery test, no scan/spend split. |
| Keystore audit | `docs/audits/03-security-review-client-relayer.md` S3-13 (import accepts attacker N up to 2^20; 10-char passphrase weak), S3-26 (`autocomplete="new-password"`; hex in React state) | Findings recorded, no spec requirement drives a fix. |
| User guidance | `docs/user/set-up-stealth-meta-address.md` | User doc, not a requirement. |
| Hot key | `docs/operators/relayer-runbook.md` section 4 (mode 600, low balance, rotation and suspected-compromise steps) | Operator procedure only. No testable requirement, no backup, no signer-key zeroization. |
| Stealth key rotation | `docs/audits/01-completeness-audit.md` F4-4, F4-6, G-18 ("Missing") | Missing. |
| Recovery path | `docs/audits/01-completeness-audit.md` C-19 ("lost key = locked funds") | Contract-side; out of scope here. |
| BTC keys | `packages/btc-silent-payments/src/keys.ts:51,53`; `docs/remote/security-specs/review-multichain.md` F4 (HIGH: no key lifecycle section; proposed text not adopted) | Random keys, no seed by default, no label backup. |
| Zeroization | `packages/core-crypto/src/secret.ts:103` (`zeroize`); `packages/btc-silent-payments/DEVIATIONS.md:101` (best-effort, engines copy buffers) | Documented as best-effort; no requirement on what must be zeroized. |
| Haiku audit reports (`docs/remote/audits/*`) | unverified claims per task brief | Not relied on. |

Verdict: no adequate spec. Thin, scattered, and the BTC and relayer-signer lifecycles have no spec. This file is the spec.

## 1. Purpose

Define how secret keys that control user funds or relayer gas funds are created, stored, backed up, rotated, wiped and recovered, with tests that a reviewer can run.

## 2. Assets

| ID | Asset | Loss/compromise impact |
|---|---|---|
| A1 | Seller spend key `s` (scheme 1, `spendingSecret`) | Funds in every one-time address derived from the meta-address. Irreversible. |
| A2 | Seller viewing key `v` | Full payment history and detection of incoming payments; not direct theft. |
| A3 | Keystore file + passphrase | Offline attack target; equivalent to A1+A2 if passphrase weak. |
| A4 | Relayer hot key (gas payer) | Balance loss bounded by float; availability. |
| A5 | Relayer quote HMAC secret | Forged/invalidated quotes. |
| A6 | Invoice-signing key (ADR-0002) | Impersonation of seller in invoices. |
| A7 | BTC `b_scan`, `b_spend`, label set | Loss = unrecoverable outputs; scan key leak = payment history. |
| A8 | Owner key of policy account (scheme `0x47500002`) | Out of scope (see C-19). |

## 3. Adversaries

- ADV1: Remote web attacker (XSS, malicious embed, malicious RPC). Must not read key material from page or worker. Basis: `docs/audits/03` PoC 04, 06.
- ADV2: Local malware / browser extension on seller device (reads page memory). Partly out of scope; mitigations are limited to shrinking exposure time. Stated in `docs/user/set-up-stealth-meta-address.md`.
- ADV3: Offline attacker with a keystore file (brute force passphrase).
- ADV4: Relayer operator or host (sees requests; holds A4/A5). Must not hold A1/A2 at all.
- ADV5: Backup-store operator (cloud, support, email). Must see only ciphertext.
- ADV6: Operator error (lost passphrase, wrong file, reused key across chains or environments).
- ADV7: Hosted scan service (Frigate-style). Must never receive `b_scan`/`v` (`docs/remote/security-specs/review-multichain.md` MS:30; `packages/btc-silent-payments/DEVIATIONS.md`, Frigate `subscribe` not implemented).

## 4. Requirements

### 4.1 Generation

- KL-1 (MUST): Seller stealth keys MUST be generated with a CSPRNG (`crypto.getRandomValues` or Node `crypto.randomBytes`), reduced to a valid scalar with rejection or bias bound checked. Test: vectors + bias test (`randomScalar`).
- KL-2 (MUST): Spend and viewing secrets MUST be independent random scalars, or both derived from one seed by a documented, versioned KDF. The two MUST NOT be equal, and the viewing secret MUST NOT allow derivation of the spend secret.
- KL-3 (MUST): Keys MUST NOT be generated from user-typed input (passphrases, brain wallets).
- KL-4 (SHOULD): Relayer hot keys SHOULD be generated offline or on the operator host with the same CSPRNG; the runbook MUST state the command used.
- KL-5 (MUST, BTC): Bitcoin receive keys MUST come from a seed (BIP-32 path per BIP-352, coin type per network) OR the random mode MUST produce a backup (KL-12). Current default `generateSilentPaymentKeys` (`packages/btc-silent-payments/src/keys.ts:53`) is random-only and is a gap.

### 4.2 Storage

- KL-6 (MUST): Seller secrets MUST NOT be written to `localStorage`, `sessionStorage`, IndexedDB, cookies, URLs, logs, errors or telemetry in plaintext. Test: e2e storage scan (existing `app.spec.ts:131`) extended to IndexedDB and Cache API.
- KL-7 (MUST): At rest, secrets MUST be only in a keystore encrypted per section 4.3 or in memory.
- KL-8 (MUST): Secret-bearing values MUST be non-serializable (existing S-05 module pattern) and MUST NOT pass to a worker other than the scanner worker, and only the viewing key goes there (S-05, scan-only).
- KL-9 (MUST): The relayer hot key MUST be a regular file, mode 0600 or stricter, owned by the service user (existing check `apps/relayer/src/secrets.ts:262-265`). Env-var form (`RELAYER_KEY`) MUST log a warning at startup and MUST NOT be used in production (`secrets.ts:284`; see `docs/remote/security-specs/review-relayer-app.md` section on `RELAYER_KEY`).
- KL-10 (SHOULD): Hot key SHOULD reside on encrypted storage and SHOULD be funded only with a float (runbook section 4). `feeTo` MUST NOT default to the hot-key address (`apps/relayer/src/config.ts:197`; review-relayer-app R-06).

### 4.3 Keystore format and backup

- KL-11 (MUST): Export MUST be an AEAD-encrypted, versioned file: KDF scrypt (N=2^17, r=8, p=1, 32-byte output, random 16-byte salt) or Argon2id with equal or greater cost; AES-256-GCM (or XChaCha20-Poly1305) with random 12-byte (or 24-byte) nonce; all header fields in AAD. Current format meets this (`docs/APP_AND_RELAYER_SPEC.md:9`; audit 03 S3-13 accepted).
- KL-12 (MUST, BTC random mode): Backup MUST contain `b_scan`, `b_spend`, and the label set (labels `m >= 1`), under the same encryption as KL-11. Source: BIP-352 "Backup and Recovery": "If a wallet uses labels, this information SHOULD be included in the backup" (retrieved 2026-10-21 from https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki). Labels SHOULD be part of backup; this spec makes it MUST for GhostPay because labels are our own format.
- KL-13 (MUST): Import MUST reject scrypt parameters outside a fixed allowlist (not up to 2^20). Test: S3-13 PoC; file with N=2^20 rejected in <100 ms.
- KL-14 (MUST): Passphrase MUST be >= 12 Unicode code points (raise from 10; audit 03 S3-13 flagged weak link). Passphrase input MUST use `autocomplete="off"` or the explicit `new-password` only on the export field (fix S3-26).
- KL-15 (MUST): Export MUST show that the file and passphrase are unrecoverable by the project (existing text in `docs/user/set-up-stealth-meta-address.md`) and MUST require the user to re-enter the passphrase before download.
- KL-16 (SHOULD): Backup file SHOULD carry a version, meta-address and checksum of the meta-address (non-secret) so a restore can confirm identity before decrypting.
- KL-17 (MUST NOT): Backups MUST NOT be sent to project infrastructure, support, or any third-party upload path by default.

### 4.4 Rotation

- KL-18 (MUST): Seller stealth meta-address rotation MUST be a new keypair with a new published meta-address; the old keystore MUST remain decryptable until the user confirms migration (completeness audit F4-6 open). Old outputs stay spendable with the old spend key.
- KL-19 (MUST): The app MUST warn that rotation does not move funds already sent to the old meta-address and that a reused meta-address links payments (`docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` line 290).
- KL-20 (MUST): Relayer hot-key rotation MUST follow runbook section 4: new key, fund, switch, drain old, delete file; each step logged by operator (not by the service).
- KL-21 (MUST): Quote secret rotation MUST invalidate outstanding quotes (documented in runbook; test that a quote signed with the old secret is rejected after restart with the new one).
- KL-22 (SHOULD): Rotation of the invoice-signing key (A6) SHOULD publish the new key id and keep the old key valid for verification for a stated window.

### 4.5 Zeroization

- KL-23 (MUST): Code MUST NOT claim guaranteed JavaScript zeroization. Wording: "best effort; engines may copy buffers" (`packages/btc-silent-payments/DEVIATIONS.md:101`; playbook line 258).
- KL-24 (MUST): Secret byte buffers (`Uint8Array`) created for a signing or derivation step MUST be passed to `zeroize()` (`packages/core-crypto/src/secret.ts:103`) in `finally`, and this MUST be covered by a test that asserts the buffer is zero afterward.
- KL-25 (MUST): Secrets used only as `bigint` MUST be documented as not wipeable; the design MUST minimize their lifetime (derive, sign, drop).
- KL-26 (SHOULD): Keystore passphrase and raw hex inputs SHOULD be cleared from DOM and React state on lock and on failed import (S3-26).
- KL-27 (MUST): Lock or tab-hide events MUST drop in-memory keys within 60 s (new requirement; to be tested with fake timers).

### 4.6 Recovery

- KL-28 (MUST): A restore from keystore alone (no network) MUST reproduce the meta-address and detect all test-vector outputs.
- KL-29 (MUST, BTC): Recovery scan MUST cover at least max(100000, recorded label count) labels, per BIP-352 "strongly recommended ... 100k labels" (wording verified 2026-10-21). Label count MUST be recorded in the backup.
- KL-30 (MUST): Recovery MUST be tested on testnet per playbook line 209 before launch, with a written runbook entry.
- KL-31 (MUST): Lost-passphrase state MUST be stated as unrecoverable; no "forgot passphrase" flow may send data off-device.

### 4.7 Compromise and incident response

- KL-32 (MUST): Relayer hot-key suspected compromise: stop service, sweep, rotate (runbook section 4 and incident table line 98). Tested by tabletop, recorded.
- KL-33 (MUST): Seller spend-key suspected compromise: the only in-protocol response is moving future funds to a new meta-address (KL-18). The UI and docs MUST say that existing outputs cannot be protected by rotation.

## 5. Design notes

1. Keep spend and viewing secrets separate in code and in backup (two fields, same envelope). Viewing key can be shared with a scanner; spend key MUST NOT.
2. One envelope version covers both seller and BTC keys so the test suite exercises one parser.
3. Prefer a seed + versioned derivation (BIP-32 for BTC) over random keys: one secret to back up. Random mode then needs KL-12 explicit backup.
4. Hot key holds float only; `feeTo` points to a cold or multisig address (runbook). This bounds A4.
5. Passphrase-based KDF is the weak point for A3 (offline). Raising the minimum to 12 and considering Argon2id (memory-hard; check library availability in `@noble/hashes`) is a SHOULD follow-up.
6. Zeroization is a risk reducer, not a guarantee. Lifetime minimization matters more.

## 6. Acceptance tests

| Test | Requirement | Pass |
|---|---|---|
| T-1 random-scalar bias sample (existing `randomScalar` argument, add sampled test) | KL-1 | chi-square passes |
| T-2 storage scan across localStorage, sessionStorage, IndexedDB, Cache API after create/import | KL-6, KL-7 | no secret bytes or hex |
| T-3 worker message audit: only viewing key crosses to scanner | KL-8 | scan of postMessage calls |
| T-4 keystore tamper (all header fields, N, r, p, salt, iv, meta) | KL-11 | all rejected, identical error |
| T-5 keystore with N=2^20 or r>16 | KL-13 | rejected before scrypt |
| T-6 passphrase 11 chars rejected, 12 accepted | KL-14 | yes |
| T-7 hot-key file mode 0644 refused; `RELAYER_KEY` env warns | KL-9 | yes |
| T-8 zeroize buffers after sign/derive (spy on `zeroize`) | KL-24 | buffers all zero |
| T-9 lock drops keys in 60 s (fake timers) | KL-27 | yes |
| T-10 testnet restore from keystore reproduces meta-address and outputs | KL-28 | yes |
| T-11 BTC restore with 100k label scan finds labelled outputs | KL-29 | yes |
| T-12 old quote rejected after quote-secret rotation | KL-21 | yes |
| T-13 tabletop: hot-key compromise runbook timed | KL-32 | record time |

## 7. Open questions

1. Argon2id vs scrypt: is Argon2id available in the browser bundle without size problems? Unverified.
2. Should seller stealth keys be seed-derived (one secret) or independent random (current)? Decision affects KL-2 and export size.
3. Label count recording: stored in backup header or derived? Backup format change needed.
4. Does the relayer need a cold `feeTo` default or must it be mandatory in config? (review-relayer-app R-06.)
5. Rotation window for invoice-signing key (KL-22): how long?
6. Whether a passphrase-less "device key" option is desired (would weaken A3). Recommend no.

## 8. References

- BIP-352 (Silent Payments), "Backup and Recovery", https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki, retrieved 2026-10-21. Verified: backup SHOULD include labels; 100k label precompute "strongly recommended".
- BIP-32 (HD wallets), referenced by BIP-352 path. Not fetched this session. Unverified here.
- RFC 7914 (scrypt). Not fetched: network to datatracker/rfc-editor failed on 2026-10-21. Unverified; parameters are taken from `docs/APP_AND_RELAYER_SPEC.md:9`.
- NIST SP 800-57 Part 1 (key management) and SP 800-88 (media sanitization). Not fetched. Unverified.
- ERC-6538 (stealth meta-address registry), referenced in `docs/APP_AND_RELAYER_SPEC.md:9`. Not fetched. Unverified.
- Repo: `docs/threat-model/THREAT_MODEL.md` (assets list line 9), `docs/audits/01-completeness-audit.md` (F4-4, F4-6, G-18, C-19, W-02), `docs/audits/03-security-review-client-relayer.md` (S3-13, S3-26, PoC 08), `docs/remote/security-specs/review-multichain.md` (F4), `docs/remote/security-specs/review-relayer-app.md` (R-06), `docs/operators/relayer-runbook.md` (section 4, line 98).
- Haiku audit reports in `docs/remote/audits/` were not relied on (unverified per brief).
