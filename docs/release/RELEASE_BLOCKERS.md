# Release blocker queue

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

**Both public milestones remain BLOCKED.** Completed native fee review, QR input integrity and six lint repairs are no longer missing-feature items. Their full integrated qualification remains required.

| Priority | Requirement | Exact next action |
| --- | --- | --- |
| 1 | Strict security-analysis clearance | Complete unchanged analyzer campaigns and reproduce/dispose historical findings with evidence. First Echidna campaign failed after Router and Policy exit 137; Sweep completed its original budget. The pinned binary rejects the attempted heap cap. Obtain a suitable execution environment without changing workers, call budgets or properties. Mythril's 11 records remain unresolved |
| 2 | Current CodeQL/Sonar and independent external review | Obtain exact-candidate hosted/finding-level results and required external review. A passing main analysis or agent review is insufficient |
| 3 | Complete original candidate test matrix | Run combined workspace type/lint, complete coverage and nocov, unit/integration/property/fuzz/contract gates. Repair demonstrated failures without changing assertions or thresholds |
| 4 | Real browser execution environment | Provide working Chromium/Firefox/WebKit for actual `/GhostPay/` local-chain, backup/restart/revocation, desktop/mobile/keyboard/accessibility and failure cases |
| 5 | Exact static artifact and reproducibility | Build clean source, verify every served byte and module boundary, compare two builds and perform subpath HTTP/browser checks. Independent-machine reproduction remains a release-policy gate |
| 6 | Hosted CI availability | Required Actions must actually execute and succeed on the exact final source. Current queue has no established candidate pass; its underlying cause is unknown |
| 7 | ADR-0029 decision | Owner records acceptance/rejection and the actual deployment scope. ADR-0015 remains binding; a Proposed ADR is not approval |
| 8 | GP-PAGES-01 dedicated origin | Owner selects a dedicated custom domain or isolated account, verifies DNS/HTTPS and exact GHOSTPAY_PAGES_ORIGIN. No shared-origin exception is silently accepted |
| 9 | Pages environment and exact publication approval | Actions source, main-only deployment environment and reviewed artifact/commit, followed by live commit/assets/routes/browser smoke |
| 10 | Testnet deployment authority | Authorized deployment, code/address/immutable verification, actual identifiers and chosen fee-recipient decisions |
| 11 | Testnet signing authority | Approved public key/fingerprint and offline signing process; authenticated testnet manifest included in the verified build. No secrets in chat, source or artifacts |
| 12 | Real wallet/testnet acceptance | Payment, confirmation, scan, receipt, native sweep, backup/recovery and failure/recovery with actual transaction evidence |
| 13 | Final tag and release assets | Only after required approval/security/CI/integrity/deployment conditions, check tag absence and publish the approved version without replacing an existing tag |

The separate integration lease was released; it is not presently listed as a held-lock blocker. Re-read live ownership and main before promotion. Main's observed unprotected setting does not authorize bypassing checks.

Owner choices are prepared in [DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md). These external dependencies do not excuse unfinished safe local engineering. Continue the independent work and preserve exact evidence until genuine resource, service or authority limits prevent further progress.
