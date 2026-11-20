# GhostPay core and latest-feature security audit

**Status: complete for the pinned scope.** Audit date: November 19, 2026, America/Los_Angeles. Source cutoff: **10:29:30 p.m. Pacific** (2026-11-20 06:29:30 UTC).

All **546 paths / 670 distinct source versions** across **12 pinned snapshots** were reviewed, with **zero pending coverage**. The audit includes initial main, main at the final cutoff, the selected latest release/privacy/repair branches and the newly appeared Tor static-hosting feature with its full first-party hosting implementation closure.

## Findings

The core review records **16 deduplicated finding families: 4 Medium and 12 Low**. Thirteen concern browser-facing behavior with stated configuration/testnet limits; three are supporting or disabled APIs. Supplemental hosting review adds **three Low documentation/local operational defects**, with conditional library hardening and filesystem assumptions recorded separately. **No Critical or High issue was established in this scope.** This is source-review completion, not release qualification or proof of absence.

The four Medium findings concern RPC receipt identity/status validation, idle-lock authority for an unbacked session, wrapper-owned key copies surviving revocation, and stale sweep review context. Existing fixes are distributed across branches. The later recovered-fixes branch does not contain the newer lifecycle/sweep work; consolidation/format omit the separate ERC-20 simulation and backup-component clipboard fixes. No selected snapshot resolves the full finding set.

Independent review confirmed that TRON token receipt requests still reveal local matches even in updated branches, and that only privacy-snapshot/quick-hide carry the backup component's conditional clipboard-clearing repair. It narrowed the wallet-connection continuation finding to Low because the established effect is additional account/chain requests, not signing or transaction submission.

The hosting review found incorrect generated subpath-isolation guidance, a containment helper with conditional local input-loss consequences during profile replacement, and cleanup that can delete a recovery backup after rollback failure. These have explicit local/operator prerequisites and are not represented as remotely exploitable services.

## Start here

- [FINDINGS.md](FINDINGS.md): consolidated findings, exact branch matrices, impact limits, known repairs, hosting issues and recommended repair order.
- [COVERAGE.md](COVERAGE.md): included code, exclusions, immutable source pins, branch movement and complete coverage accounting.
- [VALIDATION.md](VALIDATION.md): what actually ran, what did not, dependency advisories and publication boundary.
- [finding-status.json](finding-status.json): machine-readable core and hosting dispositions by final ref.
- [coverage-summary.json](coverage-summary.json) and [reviewed-coverage.json](reviewed-coverage.json): zero-pending coverage with source identity and reviewer traceability.

## Detailed evidence

| Area | Report |
| --- | --- |
| Browser views and feature integrations | [web-views-review.md](web-views-review.md) |
| Browser libraries and components | [web-libs-review.md](web-libs-review.md) |
| Core cryptography, schemas, SDK, policy and vault | [crypto-schema-review.md](crypto-schema-review.md) |
| Chain adapters and contracts | [chain-contracts-review.md](chain-contracts-review.md) |
| Bitcoin, Solana and TRON packages | [multichain-review.md](multichain-review.md) |
| Network transport, privacy, address/transaction and exchange | [network-privacy-review.md](network-privacy-review.md) |
| Build, release, translation boundary and new Tor deployment | [build-hosting-review.md](build-hosting-review.md) |
| Static-export/header/routing closure | [hosting-feature-review.md](hosting-feature-review.md) |
| Hosting archive/core/CLI | [hosting-core-review.md](hosting-core-review.md) |
| Hosting adapters, profiles, preview and reference scanner | [hosting-adapters-review.md](hosting-adapters-review.md) |
| Independent core finding challenge | [finding-quality-review.md](finding-quality-review.md) |
| Independent hosting finding challenge | [hosting-finding-quality-review.md](hosting-finding-quality-review.md) |

## Method and validation

Reviewers read complete source or a complete baseline plus its full changes, traced callers and trust boundaries, and verified exact Git blobs. Fresh workers continued from explicit ledgers/handoffs; the coordinator finished remaining components and reconciled all final aliases. Identical source is deduplicated rather than counted as new review on every branch. The final identity check matched 6,218 commit/path appearances, and every included version has a completed review row.

Three benign repository checks passed on the initial-main checkout: pinned GitHub Actions, the repository's `tx.origin` check and its limited secret-pattern scan. Both distinct dependency lockfiles returned zero production advisories; full-tree queries reported 17 Low entries derived from two development-toolchain advisories. No install, lockfile rewrite or forced audit fix occurred.

No application/contract/browser test suite, exploit reproduction, live endpoint probe, wallet operation, transaction, container, Tor process or deployment was executed. Existing tests were read as source, not claimed as passing. Historical/future-only code, unrelated paused application services, third-party internals and exhaustive tests are outside the defined scope. The audit does not certify live deployments, anonymity, complete key erasure or cryptographic interoperability.

## Repository and publication status

The audit changes only this notes directory and the coordinator's appended ownership/completion entry in `docs/ai/ACTIVE_WORK.md`. Production source is unchanged. Notes are on local branch **`audit/zero-cool-core-20261119`**.

Public publication remains blocked. On November 20, the completed audit commit was independently rechecked after the user replied “continue” to the publication question. Automatic approval review rejected the requested push because it did not treat that response as explicit authorization to disclose the security findings and coverage metadata publicly. No remote write occurred, and no alternate publication route was attempted. See [PUBLICATION_STATUS.md](PUBLICATION_STATUS.md) for the dated result and required next authorization. The unrelated remote audit branch with a different name is not this audit.

[AUDIT_HANDOFF.md](AUDIT_HANDOFF.md) records completed scope, continuation rules and the publication restriction.
