# Final engineering handoff — current checkpoint

**Release verdict: BLOCKED.** Work completed here is real source consolidation and regression-backed security repair. No public demonstration, testnet beta, main promotion or release tag is claimed.

## Identities and checkpoint metrics

| Metric | Evidence |
| --- | --- |
| Main | `c977b5d6723f6822c3b5d86cd6b231712c53c395`, observed 2026-11-19 |
| Canonical candidate | `release/ghostpay-beta-qualification-20261119` at `73124433c08c8ef6835f11d03709060c6eea7a3f` |
| Product checkpoint | `35978ab796b7c476eb35dd9ed634ca4ff86ff9b9`; later changes preserve production app blobs and add main audit documentation, test typing and artifact tooling |
| Branches inventoried | 287 live heads; focused reviews distinguished from mechanical ancestry |
| Dispositions | 201 integrated (177 main/24 candidate), 44 actionable, 19 superseded, 16 equivalent, 5 deferred, 2 incompatible |
| Unique work recovered | Fresh payment-key export grants/private checkpoints, quote/balance lifecycle, monotonic invoice expiry; further signing, clock, session-entry and native-consent repairs |
| PRs merged by this lane into main | None; no PR closed or historical branch deleted |
| Remaining focal PRs | #262/#270 integration source, #255 security evidence, #275 policy fixture, #276 artifact verifier; all tracked in consolidation ledger |
| Required tests | Scoped suites passed; full matrix remains incomplete. Full application typecheck/build now pass after the test-only envelope correction. Full coverage and exhaustive lint remain in progress; browser launch blocked |
| Open security evidence | 11 historical Mythril records (3 Medium/8 Low), two historical CodeQL High reports lacking final hosted clearance, 17 Low development dependency entries; external review outstanding |
| Feature completeness | No unsupported percentage. Existing source inventory and unverified acceptance are listed in FEATURE_MATRIX |
| Demonstration readiness | BLOCKED; 0/12 mandatory final-source browser scenarios verified here; source/CI/artifact/hosting/approval gates open |
| Testnet readiness | BLOCKED; demonstration gates plus fee review, signed manifest/deployment, real-wallet acceptance and independent review |
| External dependencies | Origin/ADR decisions, Pages environment, approved release public key/signing authority, authorized deployer, CI/browser resources, external reviewer |
| Next engineering priority | Finish full coverage and exhaustive unchanged lint, build/verify/reproduce the Pages artifact, then resolve external deployment gates and the remaining native fee-review requirement |

## Completed source and evidence

The base is PR #270 `73545f63...`, preserving the newer #262 implementation. Worker isolation prevented competing edits to the integration branch. Key-export changes were normally merged with their source ancestry; Sweep was semantically reconciled so the quote-lifecycle changes did not erase explicit network grants, endpoint disclosures, destination reuse checks or transaction-outcome handling.

The independent reviewer verified unchanged production blobs after the main refresh: Sweep component `2b04af66...`, helper `6d14435b...`, jitter `9845576a...`, Scan `d92f0f2d...`, network authority `04defade...`. See [combined-source-review.json](combined-source-review.json). This review is bounded and AI-assisted, not an external audit.

Key source fixes:

| Commit | Change |
| --- | --- |
| `72079315c6ba6fa2283c5ffab34bb4358cdc7ac9` | Semantic #272 integration |
| `c60f7cc3a1c320e092a86131d73faf2b760741ac` | #274 monotonic expiry integration |
| `1d8445b656bdc6a78449dcc3b112b57322e3f482` | Helper review-authority guards |
| `04ded6b5b9b8a8edc0fc55fe31d6bce51aaf1951` | Caller guard wiring/stale-error handling |
| `89ec593b0c3a324fa30c2973ecb26b53c8ba6eec` | Session-entry try/finally repair |
| `676093a3e802032ca5508693fd60ef08a3acc6a9` | Invalid/rollback authority clock refusal |
| `acdebc5a281d41bf0250e93bf217c04624fdd9d9` | Final payment export/authority integration |
| `3f6fcb845320a6d898e996d4a11d6fa22816b671` | Native fresh-balance equality |
| `35978ab796b7c476eb35dd9ed634ca4ff86ff9b9` | Final native-consent integration |
| `73124433c08c8ef6835f11d03709060c6eea7a3f` | Current main refresh |

Worker receipts preserve original failures, subsequent passes, fixture corrections, test source and evidence hashes. Do not sum overlapping counts or re-label cached-dependency runs as clean installations. Late full-build failure shows why scoped Vitest and typed lint are insufficient to claim complete compilation.

## Reproducible continuation

1. Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/ACTIVE_WORK.md`, the current integration lease and the eight release documents. Re-read live main/PR heads before changing provenance.
2. Resume the canonical isolated checkout, or fetch its published handoff branch if available. Never overwrite another worker's checkout. Preserve uncommitted evidence before environment cleanup.
3. Repair only the demonstrated fixture type defect, review #276's artifact validator and #275's fixture scope, then refresh the exact source identifier in every new test receipt.
4. Run the original clean-install, library, full/lean build, workspace type/lint/unit/coverage, contract/analyzer and artifact gates. Inspect failures; retain unchanged thresholds. Obtain supported browsers for the actual /GhostPay/ local-chain journey.
5. Complete direct native fee review before testnet acceptance. Keep demonstration payment execution disabled.
6. Prepare the exact artifact and proposed owner settings in DEPLOYMENT_READINESS; obtain mandatory final approvals only after the reviewable result exists.
7. Coordinate lease handoff, use the approved merge workflow after all applicable checks, verify resulting main and CI, then execute only the authorized deployment.
8. Record live commit/assets/routing/browser/smoke, then complete separate real-testnet acceptance before creating an approved beta release.

Current scratch locations: canonical checkout `/tmp/ghostpay-final-246ff268d20d`; discovery/reviewer evidence `/tmp/ghostpay-discovery-246ff268d20d`; coordinator raw logs `/tmp/ghostpay-evidence-246ff268d20d`. Preserve final receipts in the repository/release package; these transient locations alone are not a durable handoff.

## Release documents

[Feature matrix](FEATURE_MATRIX.md), [branch consolidation](BRANCH_CONSOLIDATION.md), [security audit](SECURITY_AUDIT.md), [test results](TEST_RESULTS.md), [blocker queue](RELEASE_BLOCKERS.md), [deployment readiness](DEPLOYMENT_READINESS.md), [release notes](RELEASE_NOTES.md). User recovery, buyer, seller and privacy guides are linked from the feature matrix.

An independent final reviewer must issue READY FOR DEMONSTRATION, READY FOR TESTNET BETA or BLOCKED against the exact final source, tests, artifact and approvals. The current evidence supports **BLOCKED**.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
