---
name: ghostpay-security-invariants
description: GhostPay's security, privacy and wording invariants as a review checklist. Use when reviewing or writing code in contracts, core-crypto, invoice-schema, chain-adapters, secret-box, tx-review, address-safety, apps/web signing/scan/sweep flows, apps/relayer or relayer-guard; when editing CI, dependencies or THIRD_PARTY.md; and when writing any user-facing text, README, doc or PR description that describes what GhostPay protects.
---

# GhostPay security invariants

Full checklist with a source reference on every line: [REFERENCE.md](REFERENCE.md). Read only the sections
the change touches (1 claims, 2 contracts, 3 crypto/keys, 4 web, 5 relayer, 6 supply chain, 7 open findings).
The source documents win over the digest; cite them, not the digest, in findings.

## Never (blocking in review)

- Claims: never say anonymous, unlinkable, audited, deployed, hosted, mainnet-ready or "verified seller".
  GhostPay reduces address reuse only (`docs/user/privacy-limits.md`). Reviews are self-run or AI-assisted.
- Contracts: no owner, proxy, pause, rescue, fee setter, `delegatecall` or arbitrary external call. `FEE_BPS = 25`,
  solc 0.8.28 pinned, every router entry `nonReentrant`, exact balance-delta checks on ERC-20 paths, sweep nonce
  consumed before external calls (`docs/CONTRACTS_SPEC.md`).
- Crypto: no custom cryptography and no crypto library beyond noble and viem (ADR-0004). A scheme-1 derivation
  change needs a new scheme id, updated `test-vectors/` and the differential test (ADR-0001, `SECURITY.md`).
  `Math.random`, `eval`, `new Function`, `innerHTML` and `dangerouslySetInnerHTML` are lint-banned.
- Secrets: spend, view and invoice-signing keys stay in `SecretBox`/`SecretScalar`; never log, serialise,
  `structuredClone`, post to a worker beyond the documented scan hand-off, or put them in error messages.
- Web: payment stays disabled without an authenticated manifest; unknown chains and tokens fail closed; the
  review preview must byte-equal the signed calldata; no telemetry, remote fonts, third-party scripts or new egress.
- Relayer: quotes stay stateless HMAC tokens; simulate before send; reserve budget before nonce; no request bodies,
  IPs, addresses or amounts in logs; exact-origin CORS.
- Supply chain: actions pinned by full SHA (`scripts/check-actions-pinned.sh`); exact dependency pins; every new
  runtime dependency gets a `THIRD_PARTY.md` entry; no GPL code copied in (pool verifiers stay out of the repo).

## Review procedure

1. Map changed files to sections of REFERENCE.md; read those sections only.
2. For each invariant touched, find the test that enforces it (`graphify_tests_for` if connected, else grep the
   workspace's `*.test.ts` / `test/*.t.sol`). An invariant change with no failing-then-passing test is a finding.
3. Run `bash scripts/scan-secrets.sh` and, for workflow edits, `bash scripts/check-actions-pinned.sh`.
4. Report findings as severity, file:line, the invariant and its source, failure scenario, and the fix.
   Closure needs commit plus test path, command and result (`docs/audits/08-completion-gates.md`); green CI alone
   is not evidence.

## Keeping it current

Section 7 (open findings) is a snapshot: audits 01 to 03 predate the consolidation reports. Before citing an
item as open, confirm in `docs/audits/08-completion-gates.md`, `17-final-security-snapshot.md` and the newest
numbered audit. When an audit or ADR changes an invariant, update REFERENCE.md in the same PR.
