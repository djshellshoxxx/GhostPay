# Changed-file acceptance mapping

Compared the complete feature and qualification packet with main `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.
All **63 changed files** are listed below. The corrected source is local
`10c3993d4d7a215c57b936ee2b1967741d247675`, published as
`4a878e302beac5cca52d20e17cdd756f3fbebb0d`; packet edits afterward change documentation/evidence only.

Section references refer directly to the user attachment, **GhostPay — Complete Bitcoin Spent-Output Detection
and Private Scanning**. This mapping identifies each change's purpose; an authored test is not a claim that it
executed successfully. Actual outcomes and source identities are in [VALIDATION.md](VALIDATION.md).

| Changed file | User acceptance criterion | Purpose |
| --- | --- | --- |
| `apps/web/DEVIATIONS.md` | §7 historical/mempool limits; §14 accurate documentation | Documents local coverage, unknown history, provider disclosure, resumption and remaining limits. |
| `apps/web/e2e/btc-spent-consent.spec.ts` | §4 consent/revocation; §5 legacy state; §9 browser acceptance; §12 Pages compatibility | Browser assertions for zero optional disclosure, consent revocation, legacy refresh, and intentional lean exclusion. |
| `apps/web/e2e/btc-worker.spec.ts` | §5 persistence/reload/resume; §9 browser acceptance | Extends native-worker acceptance through later local spending and a second reload, with no outpoint query. |
| `apps/web/locales/ar.json` | §8 security disclosures and translation fallback | Supplies the established reviewed-English fallback for new Bitcoin security copy. |
| `apps/web/locales/en.json` | §8 mode/status/privacy disclosures | Defines clear local/provider/unknown wording, consent controls, historical limits and refresh guidance. |
| `apps/web/locales/es.json` | §8 security disclosures and translation fallback | Supplies the established reviewed-English fallback for new Bitcoin security copy. |
| `apps/web/locales/ja.json` | §8 security disclosures and translation fallback | Supplies the established reviewed-English fallback for new Bitcoin security copy. |
| `apps/web/src/features/btc/BtcView.headerOwnership.test.tsx` | §4 stale-session prevention; §5 session changes; §9 integration tests | Reproduces delayed old-wallet header loading corrupting a newer wallet's scan. |
| `apps/web/src/features/btc/BtcView.headers.test.tsx` | §6 reorganization correctness; §8 incomplete status; §9 integration tests | Requires fresh spentness evidence after checked headers advance or cease to cover the full scanned suffix. |
| `apps/web/src/features/btc/BtcView.oracle.test.tsx` | §4 mandatory light disclosure; §9 light-oracle tests | Requires explicit light-mode consent before the existing oracle journey can start. |
| `apps/web/src/features/btc/BtcView.secrets.test.tsx` | §4 stale-result prevention; §5 cancellation/lock; §9 regression tests | Preserves cleanup assertions under local scanning and tests late-result wiping after consent/source changes. |
| `apps/web/src/features/btc/BtcView.spentConsent.test.tsx` | §4 revocation/source changes; §8 unknown UI; §9 integration tests | Tests active revocation, source-specific consent reset, light-to-full transitions and disabled unknown outputs. |
| `apps/web/src/features/btc/BtcView.test.tsx` | §3 local detection; §4 default-off provider checks; §9 unit tests | Confirms local default behavior and explicit optional provider requests. |
| `apps/web/src/features/btc/BtcView.tsx` | §4 consent/stale sessions; §5 cancellation; §6 reorg; §8 UI | Implements revocable consent, light preflight, current spentness gating and active-operation ownership. |
| `apps/web/src/features/btc/esplora.test.ts` | §3.1–3.2 extraction/coinbase; §3.9 malformed responses; §4 revocation; §9 unit tests | Tests committed-input extraction, forged coinbase rejection, no dispatch after abort, outpoint bounds and sanitized refusal errors. |
| `apps/web/src/features/btc/esplora.ts` | §3.1–3.2 local extraction/coinbase; §3.7–3.9 identity/validation; §4 revocation; §7 mempool refusal | Derives spends from already-downloaded committed transactions, validates coinbase identity, and guards request dispatch. |
| `apps/web/src/features/btc/fixtures.testutil.ts` | §6 deterministic reorganizations; §9 deterministic fixtures | Adds reusable spending transactions and linked-block extension fixtures. |
| `apps/web/src/features/btc/headers.test.ts` | §6 orphaned evidence; §8 incomplete status; §9 reorg tests | Tests invalidated spending suffixes, advancing tips, shortened checked history and stale counts. |
| `apps/web/src/features/btc/headers.ts` | §6 reconcile chain changes; §3.10 insufficient evidence | Downgrades retained discoveries to unknown when their spending evidence is no longer covered. |
| `apps/web/src/features/btc/oracleSource.test.ts` | §3 source compatibility; §6 cross-check preservation; §9 unit tests | Verifies optional spend capability and binding to the independently agreed block hash. |
| `apps/web/src/features/btc/oracleSource.ts` | §3 local-source integration; §6 cross-check preservation; §12 source compatibility | Forwards local spend data only when available and bound to agreed block evidence. |
| `apps/web/src/features/btc/oracleWorker.test.ts` | §4 light preflight; §9 worker/oracle tests; §12 proof compatibility | Rejects light requests before worker/network creation without consent and preserves authorized proof tests. |
| `apps/web/src/features/btc/scan-secrets.hardening.test.ts` | §3 filtering spent outputs; §5 cancellation; §9 regression tests | Tests wiping of locally spent outputs while preserving authorized provider-path cleanup tests. |
| `apps/web/src/features/btc/scan.spends.test.ts` | §3 matching/unknown; §4 consent; §5 restoration; §6 reorg; §7 legacy refresh; §11 bounds | Covers partial and historical gaps, mixed spent siblings, coverage anchors, local/provider paths and the real output cap. |
| `apps/web/src/features/btc/scan.ts` | §3 local semantics; §4 preflight; §5 resume; §6 evidence; §7 historical refresh; §11 bounds | Combines local spent matching with continuous coverage, historical identity checks, explicit provider authorization and bounded results. |
| `apps/web/src/features/btc/scanWorker.test.ts` | §4 consent enforcement; §9 invalid/stale worker tests; §10 privacy review concerns | Tests unauthorized requests/results, malformed starts, canonical-result validation and transferred-tweak cleanup. |
| `apps/web/src/features/btc/scanWorkerClient.ts` | §4 consent/stale results; §8 active-session correctness; §11 message limits | Passes consent explicitly and validates returned status, identities, bounds and hashes against the active request. |
| `apps/web/src/features/btc/scanWorkerMessages.ts` | §4 worker consent propagation; §12 protocol compatibility | Adds the optional, default-off provider-check flag to the typed start message. |
| `apps/web/src/features/btc/scanWorkerProtocol.ts` | §4 producer-side consent; §9 invalid messages; §10 unauthorized requests | Rejects malformed/light-without-consent starts and gates sensitive source requests inside the worker. |
| `apps/web/src/features/btc/scanWorkerSource.test.ts` | §4 dispatch enforcement; §9 consent regression tests | Proves the main-thread bridge refuses per-outpoint requests without owner authorization. |
| `apps/web/src/features/btc/scanWorkerSource.ts` | §4 retries/cached-dispatch safety; §10 matched-outpoint disclosure | Independently enforces outpoint and light-proof permissions at the actual transport boundary. |
| `apps/web/src/features/btc/verification.ts` | §7 technical limitations; §8 privacy disclosure; §14 accurate explanation | Replaces the unconditional provider-spentness description with local and optional-provider semantics. |
| `apps/web/src/i18n/securityKeys.ts` | §8 established translation policy | Classifies the new security-sensitive disclosure keys for the existing fallback policy. |
| `docs/ai/ACTIVE_WORK.md` | §1 scope boundary; §15 integration ownership | Records branch/source ownership, acceptance responsibilities and excluded workstreams. |
| `docs/handoffs/btc-spent-20261118/ACCEPTANCE_MATRIX.md` | §2 initial acceptance matrix; §15 integration dependencies; §16 deliverables | Maps inspected gaps to acceptance requirements and records the overlapping implementation dependency. |
| `docs/handoffs/btc-spent-20261118/FILE_MAP.md` | §1 explicit scope boundary; §16 changed-file deliverable | Accounts for every changed file against the user's acceptance criteria, including this mapping itself. |
| `docs/handoffs/btc-spent-20261118/INDEPENDENT_REVIEW.md` | §10 independent review; §13 source-pinned evidence; §16 deliverables | Records independent findings, reproductions, fixes, verification and review limitations. |
| `docs/handoffs/btc-spent-20261118/README.md` | §13 qualification report; §14 documentation; §15 integration; §16 deliverables | Provides the feature handoff, evidence semantics, qualification status and integration boundary. |
| `docs/handoffs/btc-spent-20261118/VALIDATION.md` | §13 exact source, commands, counts, failures and skips; §16 final report | Separates combined-source qualification from earlier reproductions, records toolchains and explains evidence limits. |
| `docs/handoffs/btc-spent-20261118/benchmark.mjs` | §11 deterministic performance measurement; §13 reproducible evidence | Provides a deterministic input-filter benchmark without public-network dependencies. |
| `docs/handoffs/btc-spent-20261118/evidence/benchmark-before-measurement.json` | §11 deterministic performance; §13 measured evidence | Retains the observed benchmark workload, resource/cancellation measurements and exact script/source identity without production-throughput claims. |
| `docs/handoffs/btc-spent-20261118/evidence/benchmark-final.json` | §11 deterministic performance; §13 measured evidence | Retains the observed benchmark workload, resource/cancellation measurements and exact script/source identity without production-throughput claims. |
| `docs/handoffs/btc-spent-20261118/evidence/btc-node22-final-report.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/commit-transport.json` | §13 source identity; §15 preserved history | Maps local evidence commits to byte-identical published trees and preserves the original PR219 lineage. |
| `docs/handoffs/btc-spent-20261118/evidence/hosted-ci.json` | §9 regression verification; §13 source-pinned validation; §16 deliverables | Retains actual commands, source/compiled-output identity and executed outcomes, distinguishing failed and prior checks from final qualification. |
| `docs/handoffs/btc-spent-20261118/evidence/hosted-integration.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/hosted-pages-browser.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/hosted-pages.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/independent-tests.json` | §10 independent review; §13 exact evidence | Retains independently executed test outputs with original bytes, hashes and source-pin references. |
| `docs/handoffs/btc-spent-20261118/evidence/local-build-attempt.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/local-check-logs.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/previous-btc-node24-report.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/small-checks.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/source-pins.json` | §13 source-pinned validation; §16 deliverables | Retains exact source-pinned qualification commands, outcomes or raw evidence; distinguishes failures and earlier attempts from final-source passes. |
| `docs/handoffs/btc-spent-20261118/evidence/worker-typing-fix.json` | §9 regression verification; §13 source-pinned validation; §16 deliverables | Retains actual commands, source/compiled-output identity and executed outcomes, distinguishing failed and prior checks from final qualification. |
| `docs/specs/12-bip352-light-client-scanning.md` | §3 semantics; §4 disclosure; §5 persistence; §6 reorg; §14 specification | Updates Spec 12 to match implemented local coverage and explicit provider checks. |
| `docs/user/bitcoin-silent-payments.md` | §7 limitations/refresh; §8 usable explanations; §14 user documentation | Explains mode choice, consent, unknown history, fresh rescan, persistence and reorganization effects. |
| `packages/btc-silent-payments/src/scan/headersync.test.ts` | §6 anchoring preservation; §9 source tests; §12 compatibility | Tests optional spend forwarding and rejection when spend data disagrees with checked headers. |
| `packages/btc-silent-payments/src/scan/headersync.ts` | §3 source compatibility; §6 header evidence; §12 interface preservation | Exposes spend capability only when supported and anchors returned spends to the checked chain. |
| `packages/btc-silent-payments/src/scan/scanner.test.ts` | §3.6 duplicate spends; §6 canonical evidence; §9 unit tests | Tests that repeated consumed outpoints emit only their earliest spending evidence. |
| `packages/btc-silent-payments/src/scan/scanner.ts` | §3.3–3.6 matching/deduplication; §6 rollback safety; §11 bounded indexing | Deduplicates spend callbacks using only watched or discovered outpoints. |
| `packages/btc-silent-payments/src/scan/state.test.ts` | §5 legacy/corrupt state; §6 rollback; §9 persistence/reorg tests | Tests coverage markers, source-mode gaps, duplicate/replayed identities, corrupt evidence and earliest-proof retention. |
| `packages/btc-silent-payments/src/scan/state.ts` | §3.10 unknown evidence; §5 persistence compatibility; §6 canonical state | Persists continuous local coverage, validates checkpoint consistency, preserves earliest spends and rolls back orphaned evidence. |

Every changed file maps to the assigned Bitcoin feature, its verification, or its required documentation.
The feature diff contains no seller checkpoint architecture, Spec18, other-chain implementation, contract,
unrelated dependency or deployment-configuration change. Accepted main changes remain ancestry, not feature edits.
