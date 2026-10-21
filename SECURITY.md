# Security Policy

GhostPay handles keys and payments. Treat all code as **pre-audit**. There is currently no independent third-party audit: `docs/audits/` holds only self-run and AI-assisted reviews (completeness audit, contracts review, client/relayer review, design analysis, Slither triage). A report from an independent auditor for the exact release commit would be stored there (or under a root `audits/` directory if the owner prefers; this has not been decided) before any mainnet use. Nothing is deployed and no official host exists.

## Reporting a vulnerability
Do not open a public issue. Use GitHub private vulnerability reporting for this repository (Security tab). Include the commit, steps to reproduce, and impact. Do not include real keys or funds. The acknowledgement target below is a placeholder.

**[OWNER] to confirm before this file is relied on:** that private vulnerability reporting is actually enabled on the published repository, a fallback contact (for example a security mailbox and a PGP key), the acknowledgement/fix timelines (the draft says 5 business days for acknowledgement; no commitment has been made), and whether safe-harbour wording is wanted. Until confirmed, do not assume anyone is monitoring reports. Do not post vulnerabilities in public issues, discussions or pull requests.

## Scope
Contracts in `packages/contracts`, client libraries in `packages/*`, the web app in `apps/web`, the relayer in `apps/relayer`, and release artifacts.

## Ground rules for contributors
- No secrets in git. `.env` files are ignored; the root `.env.example` holds variable names only (relayer and deploy scripts); the relayer's JSON configuration is `apps/relayer/relayer.config.example.json` (placeholder values only). CI rejects committed env files and key material.
- No new runtime dependency without a `THIRD_PARTY.md` entry (licence, version pin, purpose, review note). Regenerate the tables with `node docs/tools/third-party-table.mjs --write`.
- No analytics, telemetry, remote fonts, or third-party scripts in the browser app.
- No `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `Math.random` (lint-enforced).
- Crypto changes require updated test vectors and a differential test (for scheme 1 the vectors in `test-vectors/` are cross-checked against the ScopeLift SDK; see `test-vectors/README.md`).

## Known limitations (also shown to users)
GhostPay reduces address reuse. It does not make amounts, senders, timing, or token transfers private. Gas sponsorship is not unlinkability. A compromised frontend can steal keys; verify release hashes from a separate machine (the in-app hash widget cannot detect a tampered host). The deployment manifest is not yet authenticated. Sweeping to a wallet you already use lets the payer follow the funds. See `docs/threat-model/THREAT_MODEL.md` and `docs/user/privacy-limits.md`.
