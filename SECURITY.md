# Security Policy

GhostPay handles keys and payments. Treat all code as **pre-audit**. There is currently no independent third-party audit: `docs/audits/` holds only self-run and AI-assisted reviews (completeness audit, contracts review, client/relayer review, design analysis, Slither triage). A report from an independent auditor for the exact release commit would be stored there (or under a root `audits/` directory if the owner prefers; this has not been decided) before any mainnet use. Nothing is deployed and no official host exists.

## Reporting a vulnerability
Do not open a public issue, discussion or pull request for a vulnerability. Use GitHub private vulnerability reporting for this repository (Security tab). Include the commit, steps to reproduce, impact and any proof of concept that uses only test keys and test networks. Never include real keys, seed phrases or funds, and do not test against other people's systems or any public deployment without permission.

**[OWNER] to confirm before this file is relied on.** Nothing below is a commitment until the owner fills it in. Until then assume no one is monitoring reports.

| Item | Value |
|---|---|
| Private vulnerability reporting enabled on the published repository | **[OWNER: enable and confirm]** |
| Fallback contact (security mailbox) and PGP key fingerprint | **[OWNER: address, fingerprint]** |
| Acknowledgement target | **[OWNER: e.g. 5 business days; draft value, not committed]** |
| Triage and severity assessment target | **[OWNER: e.g. 10 business days]** |
| Fix or mitigation target (critical / high / other) | **[OWNER: days]** |
| Coordinated disclosure window | **[OWNER: e.g. 90 days from report, or on fix release]** |
| Safe-harbour wording for good-faith research | **[OWNER: legal review]** |
| Bounty | None offered. **[OWNER: confirm]** |
| Signing-key fingerprint for releases | **[OWNER: publish out of band]** |

Handling when a report arrives: acknowledge, reproduce on a local chain or fork, assess, fix in a private branch, coordinate the notice with the reporter, credit them if they wish. Contracts are immutable: a contract bug cannot be patched, so the response is a new deployment plus a deprecation notice. Incident procedures: [`docs/operators/incident-response.md`](docs/operators/incident-response.md).

## Supported versions
Only the latest commit on `main` and the latest tagged release (if any) receive fixes. There is no deployed or supported production release.

## Scope
In scope: contracts in `packages/contracts`, client libraries in `packages/*`, the web app in `apps/web`, the relayer in `apps/relayer`, release artifacts and scripts, CI workflows (`.github/`), hosting configuration in `infra/`.
Out of scope: third-party services and dependencies (report upstream, but tell us if we are affected), social engineering of maintainers, denial of service by volumetric traffic, findings that need a compromised user device, and anything on a host or chain not operated by this project.

## Ground rules for contributors
- No secrets in git. `.env` files are ignored; the root `.env.example` holds variable names only (relayer and deploy scripts); the relayer's JSON configuration is `apps/relayer/relayer.config.example.json` (placeholder values only). CI rejects committed env files and key material.
- No new runtime dependency without a `THIRD_PARTY.md` entry (licence, version pin, purpose, review note). Regenerate the tables with `node docs/tools/third-party-table.mjs --write`.
- No analytics, telemetry, remote fonts, or third-party scripts in the browser app.
- No `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `Math.random` (lint-enforced).
- Crypto changes require updated test vectors and a differential test (for scheme 1 the vectors in `test-vectors/` are cross-checked against the ScopeLift SDK; see `test-vectors/README.md`).

## Supply chain and hosting rules
- Workflow actions are pinned to full commit SHAs with a version comment (`scripts/check-actions-pinned.sh`, enforced in CI). Workflows default to `contents: read`; write scopes are granted per job.
- Releases are built from signed tags, with `npm ci --ignore-scripts`, a deterministic tarball, `SHA256SUMS`, an SBOM and a provenance attestation. Verify from a separate machine ([`docs/operators/release-and-verify.md`](docs/operators/release-and-verify.md)).
- Hosting changes (Pages, proxy, IPFS, onion) follow [`docs/operators/hosting.md`](docs/operators/hosting.md). A GitHub Pages mirror cannot send security headers and is a degraded mirror only.
- Maintainer accounts need hardware-key 2FA, protected `main` and protected `v*` tags (**[OWNER: confirm these repository settings are applied]**).

## Known limitations (also shown to users)
GhostPay reduces address reuse. It does not make amounts, senders, timing, or token transfers private. Gas sponsorship is not unlinkability. A compromised frontend can steal keys; verify release hashes from a separate machine (the in-app hash widget cannot detect a tampered host). The deployment manifest is not yet authenticated. Sweeping to a wallet you already use lets the payer follow the funds. See `docs/threat-model/THREAT_MODEL.md` and `docs/user/privacy-limits.md`.
