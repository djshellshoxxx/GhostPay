# GhostPay core and latest-feature bugcheck — 2026-11-19

**The source review is complete within the selected core and latest-feature scope.** The audit records **17 unresolved findings: 15 newly confirmed and two previously documented residuals**, comprising eight P2 and nine P3 findings. No P0/P1 finding was established. These notes preserve the affected revision, caller reachability, supporting evidence and correction direction for every finding.

Coverage is **945 commit/path records, 482 distinct paths and 595 distinct path/blob versions**, with **zero pending source records**. Physical source lines total 114,971 when each distinct path/blob version is counted once. The complete source manifest, frozen branch selection and original review ledgers are retained here. Application source is unchanged by this audit.

## Read the results

| Document | Contents |
|---|---|
| [FINDINGS.md](FINDINGS.md) | All 17 unresolved findings, priorities, affected source, reachability and detailed evidence links. |
| [COVERAGE.md](COVERAGE.md) | Exact six source pins, included code, exclusions, completion accounting and fresh-worker handoffs. |
| [RESOLVED-DIFFERENCES.md](RESOLVED-DIFFERENCES.md) | Main defects already corrected in newer reviewed source, two later focused fixes, and privacy branch merge risks. |
| [VALIDATION.md](VALIDATION.md) | Actual test/build outcomes, defect checks, setup failures and uncompleted checks. |
| [evidence/INDEX.md](evidence/INDEX.md) | Retained execution logs and local regression source. |
| [source-coverage.json](source-coverage.json) | Every counted revision/path, immutable blob, review method and reviewer evidence. |
| [branch-inventory.json](branch-inventory.json) | The initial 318-ref census and rationale for selecting six representative sources. |

## Findings that deserve attention first

The core UI findings concern receipt archive identity, receipt print visibility, stale chain-specific tags, loss of unrelated settings drafts during partial import, missing wallet-history wiring in the privacy feature, and destination-reuse warnings that fail on five supported EVM testnets. The policy feature also allows a pending asynchronous send to retain an outdated review after form editing; that finding is qualified as latent because the feature is experimental and has no production deployment pins.

The remaining findings concern optional flows, exported API contracts and a conditional contract residual. Their precise boundaries matter: the Bitcoin preview mismatch is blocked by the current browser's earlier network validation; the address-book rekey issue concerns the standalone API rather than the browser's portable session; several hygiene/metadata helpers have no current browser caller. The findings index retains these distinctions instead of implying that every API issue is an active browser payment defect.

The privacy snapshot is **not a superset of the integration snapshot**. It lacks several guards already present in integration. Preserve the newer receipt, QR-input and QR-idle fixes when combining those branches; see the explicit dispositions in [RESOLVED-DIFFERENCES.md](RESOLVED-DIFFERENCES.md).

## Validation outcome

The existing main suites produced **2,051 passing tests and one timeout failure** across ten packages. Nine package suites passed; the core-crypto differential test exceeded its configured 60-second timeout without a reported assertion mismatch. That suite remains failed. Both pinned main and integration passed the lean web TypeScript/Vite build and bundle checks.

Focused local checks confirmed receipt, tags, settings, destination advisory and policy state defects. Their expected-behavior assertions fail because the defects remain present. Other findings have direct-function or source evidence as specified individually. The broad component/i18n run has no completed summary and remains **incomplete**. No new full-profile browser, live-chain, Foundry or formal cryptographic qualification is claimed.

## Scope and completion

The audit covers the first-party browser source, its selected dependency closure, implemented optional Bitcoin/Solana/TRON/policy features, core contract source/deployment scripts, embed SDKs and selected browser delivery code. The main and latest consolidated candidate were reviewed as complete scoped inventories; privacy and later focused fixes were reviewed by exact changed source, with unchanged blobs inherited from the complete inventories.

Fresh workers resumed unfinished web-library and Bitcoin ranges with explicit source pins, completed-path ledgers and remaining ranges. A separate reconciliation reconstructed the expected inventory and found no missing, extra or mismatched normalized source records. Historical branches, independent future architecture and unrelated repository subsystems remain outside this requested scope; the branch census does not imply their source was reviewed.

Main advanced from the frozen `c977b5d…` baseline to `773a94b…` while the audit ran. All **446** audited baseline paths remained byte-identical. The intervening changes concern documentation and the separate portable-hosting toolkit; [main-drift-check.json](main-drift-check.json) records that comparison. Findings and validation remain attached to the immutable source pins in [COVERAGE.md](COVERAGE.md).
