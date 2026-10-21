# Security Policy

GhostPay handles keys and payments. Treat all code as pre-audit until `audits/` contains an independent report for the exact release commit.

## Reporting a vulnerability
Do not open a public issue. Use GitHub private vulnerability reporting for this repository (Security tab). Include the commit, steps to reproduce, and impact. Do not include real keys or funds. Expect an acknowledgement within 5 business days (**[OWNER]: confirm contact and SLA**).

## Scope
Contracts in `packages/contracts`, client libraries in `packages/*`, the web app in `apps/web`, the relayer in `apps/relayer`, and release artifacts.

## Ground rules for contributors
- No secrets in git. `.env` files are ignored; `.env.example` holds names only.
- No new runtime dependency without a `THIRD_PARTY.md` entry (licence, version pin, purpose, review note).
- No analytics, telemetry, remote fonts, or third-party scripts in the browser app.
- No `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `Math.random` (lint-enforced).
- Crypto changes require updated test vectors and a differential test.

## Known limitations (also shown to users)
GhostPay reduces address reuse. It does not make amounts, senders, timing, or token transfers private. Gas sponsorship is not unlinkability. A compromised frontend can steal keys; verify release hashes.
