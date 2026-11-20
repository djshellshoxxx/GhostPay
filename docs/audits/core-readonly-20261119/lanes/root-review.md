> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay root review checkpoint

Status: complete for the root-owned ledger. This is static defensive source inspection; no runtime exploit reproduction, browser interaction, deployment, or product-code changes. Exact coverage is in root-review.json. Original claims use the first 20 selected heads; final coverage and applicability reconcile 24 immutable snapshots.

## Confirmed source observations

### ROOT-01 — Independent lean report verification tolerates incomplete module evidence

Severity: Low assurance/defense-in-depth, not an established deployment bypass. Present on main and integration.

At integration e22c1748a3de6eb02f5be3abe27d634b238c67c6, scripts/pages/verify-pages-site.mjs:186–203 checks format/profile and nonempty top-level chunks/workers, then treats absent per-chunk modules and per-worker chunks as empty lists. It does not validate complete chunk provenance, file names, correspondence to site output, or finite nonnegative rendered lengths. The later integration variant of apps/web/scripts/scan-bundle.mjs uses a similarly permissive traversal of optional lean report data; the main variant lacks that traversal. In contrast, apps/web/scripts/localBuildProfile.mjs validates the actual bundler metadata and worker evidence before producing a normal report. Its tests explicitly require nonempty provenance for executable chunks and valid rendered lengths.

Impact: the nominally independent downstream checks provide weaker assurance if their evidence is incomplete or supplied incorrectly. The regular producer remains a control; no path from an untrusted external user to a deployed artifact was established. Checksums alone authenticate neither a hostile build nor a hostile report.

Remediation: share a strict evidence schema, require all executable app and worker chunks to have matching provenance, validate finite nonnegative lengths and required exports, and reject missing evidence before exclusions are assessed. Keep legitimate zero-length tree-shaken modules distinct from absent records. Validation should assert schema rejection and artifact/report correspondence without attack payloads or live deployment.

### ROOT-O01 — Tight CSP controls are not wired through the stock Pages workflow

Informational configuration limitation, not a demonstrated confidentiality issue. Integration build-pages.sh supports GHOSTPAY_CONNECT_ORIGINS and GHOSTPAY_REQUIRE_TIGHT_CSP, but .github/workflows/pages.yml does not pass these repository settings into the build environment. The ordinary default remains connect-src allowing HTTPS and WSS, needed for arbitrary user-configured endpoints. An operator must change the workflow or invoke the script with these settings to enable a narrow deployment-specific policy. Do not present broad CSP alone as an XSS finding.

### ROOT-02 — Receipt printing is suppressed by globally imported bill-print CSS

Confirmed independently by payment_surfaces_wave2, which owns the consolidated finding. Low product correctness; no security impact established. AppShell eagerly imports Pay; Pay imports PrintableBill; PrintableBill imports styles/print.css. That stylesheet marks body * hidden !important and restores only bill-sheet. styles/app.css restores receipt-print without !important. ReceiptPanel mounts receipt-print and invokes window.print. The combined cascade therefore suppresses the receipt print content. Existing PrintableBill tests check its own CSS text and a mocked print invocation, not this combined receipt cascade. No browser reproduction performed.

## Branch-dependent hardening differences

- Release/completion add frame/origin guards; main has no equivalent. The origin guard protects accidental copies, not an attacker able to modify the app.
- Release/completion use fixed React root error labels instead of logging arbitrary error messages.
- Production release key configuration rejects known public test signing keys in later branches; main lacks this denylist if an operator configures such a key. No actual compromised release key was found.
- Later setup-forge checks the pinned solc binary hash; main does not verify the cached binary in that action.
- Later Pages workflow binds deployment to file checksums/attestation, and integration verifies assembled artifact integrity before promotion. These differences do not themselves establish a malicious artifact or an active bypass.
- Latest networking adds scoped authorization/revocation. Custody/network reviewer owns impact analysis.
- Main's legacy manifest loader is exported but default app services already use strict bundled signed manifests. Do not label this as an active unsigned-manifest bypass without a reachable default caller.

## Dependency advisory evidence

Read-only npm audit --package-lock-only --ignore-scripts was run on the exact main lock and integration lock, separately for production-only and all dependencies. No installs or fixes were run.

Main: production 286 / all 814 dependency entries. Integration: production 286 / all 820. Both production scans report zero known vulnerabilities. Both all-dependency scans report 17 low-severity affected package entries from two underlying advisory records (cookie GHSA-pxg6-pf52-xh8x, elliptic GHSA-848j-6mx2-7j84), via Hardhat/development dependency trees. No moderate/high/critical advisories reported. These are registry results at audit time, not proof of runtime safety; separate the development and excluded confidential-contracts tooling from the active browser application.

All lock records were structurally checked for resolution/integrity: main 815 package records, integration 821; 678/684 nonlink resolved artifacts respectively, all HTTPS registry.npmjs.org with SHA-512 integrity. The three install-script indicators are fsevents, keccak, secp256k1. Vendored dependency implementations are outside this first-party review.

## Retired / bounded observations

- Journal state in sessionStorage is deliberately limited non-secret recovery/anti-duplicate data; same-origin code already has authority. JSON parsing differences alone do not establish a new attacker boundary.
- computeReleaseHash is a bounded same-origin diagnostic, not a claim of independent authentication of a hostile serving host.
- i18n renders inert React text and gates security-critical translations on reviewed language status. Message parser recursion receives bundled catalogs, not arbitrary imported invoice strings; no remote parser issue established.
- Optional iframe embedding requires full profile and explicit host configuration. Lean only includes its no-op completion hook; standalone SDK transport observations must retain their inactive-browser scope.
- Relayer padding fallback is explicitly tested compatibility behavior; do not claim it hides plaintext from the relayer or defeats all traffic analysis.

## Publication status

Local branch docs/ghostpay-core-readonly-audit-20261119 has an initial scope checkpoint commit 3b7c60d3d67eed0f038108d60f362f5dbef33e39. Automatic approval review rejected git push to djshellshoxxx/GhostPay, citing remote publication of potentially sensitive security findings without explicit publication authorization. Do not bypass via a connector or alternate push. Finish the report/coverage locally, then request explicit approval for that concrete docs-only branch.
