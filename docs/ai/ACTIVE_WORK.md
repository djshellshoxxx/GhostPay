# Unified completion coordinator — 2026-11-16

Owner: root coordinator. Branch: `codex/ghostpay-unified-completion`; base `0c4c3c8d951a9d6e71affcdaa26478911c8037f1`.
Owned paths: integration conflicts, locale/security catalogs, master completion ledger, final evidence and handoffs.
Acceptance: preserve source ancestry and verified behavior; classify new identity/privacy disclosures; run combined-head checks and record remaining gates. Worker branches own their separate modules; no protected-main merge, deployment, signing or release.

## Historical and worker claims

## Ops-monitor W3 streamed artifact cap — 2026-11-16

Worker: current Codex child agent. Branch: `codex/ghostpay-ops-response-cap-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `packages/ops-monitor/src/fetcher.ts`, focused fetcher tests, this registry, task handoff.
Acceptance: enforce release-artifact byte cap while streaming; refuse oversized declared lengths without consuming the
body; cancel rejected streams without waiting on a remote cancel promise; preserve exact-limit bytes, malformed/missing
length handling and UTF-8 bytes split across chunks.
Status: implemented. Full package suite passes 113/113 with 98.01% statements, 93.59% branches, 97.72% functions and
99.78% lines; package typecheck/build and focused ESLint pass. Full package lint terminated with exit 137; external
HTTP receiver acceptance was not run.
## Team A unified reconciliation review — 2026-11-16

Worker: reconciliation agent, Caveman workflow. Branch: `codex/unified-reconciliation`.
Base: `27852ba898968a08f7d7c448fac8b19058189281` (PR #186).
Owned paths: chain-adapters logs/rpc/scanVerify and tests; vault reconciliation modules/tests; web scanner and reconciliation libraries/tests.
Acceptance: canonical header timestamps survive scanning and encrypted persistence; provider disagreement, reorg, imported history, duplicate conflicts and finality remain fail-closed; exact bigint arithmetic is preserved. Run targeted tests, correct reproduced defects, and provide a source-pinned handoff. No public-chain writes or release qualification claim.

## Historical and worker claims

## Canonical block-time reconciliation — 2026-11-16

Worker: canonical-time implementation agent. Branch: `codex/ghostpay-canonical-time-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: chain-adapter block references and announcement scanner; portable reconciliation record/matcher;
reconciliation tests and related security-key/locale entries if new message key is needed; this registry and handoff.
Acceptance: only timestamp from a canonical block header matching announcement block number/hash can establish
invoice timing; new verified late-scanned pre-expiry payments can match; post-expiry payments remain ambiguous;
legacy/imported records without block timestamp never become exact through wall-clock fallback; optional field keeps
old vault data readable; reorg and backup/import behavior remain sound.
Status: implementation and regression coverage complete. `git diff --check` and locale JSON/key parity pass; `npm ci --ignore-scripts --no-audit --no-fund` exited 137, so focused tests, typechecks and build cannot run here (Vitest and TypeScript unavailable).

## Unified registry ENS lookup — 2026-11-16

Worker: Team B registry. Branch: `codex/unified-registry`. Base: `365a1c38`.
Owned paths: chain-adapters registry and ENS helpers/tests/index exports; web registry view/tests;
`docs/handoffs/agents/TEAM_B_REGISTRY_UNIFIED.md`.
Acceptance: explicit ENS lookup uses only the selected, already-validated Ethereum or Sepolia RPC;
normalizes names, validates returned addresses and meta-addresses, never follows offchain gateways,
and rejects stale UI results. No cross-chain fallback or delegated signing/sending UI is added.
Locale additions are coordinated with the integration owner.
## Unified Team D — verified matrix — 2026-11-16

Worker: matrix; branch `codex/unified-matrix`; base `365a1c38`.
Owned paths: `packages/chain-adapters/config/matrix.json`, `scripts/check-chain-matrix.mjs`,
`scripts/lib/chain-matrix.mjs`, companion tests, release gate wiring and operator matrix documentation.
Acceptance: all configured chains/tokens/feeds have provenance-aware cells; malformed or mismatched data fails;
release verification refuses every enabled chain with an unverified required cell. Existing development configuration
remains available. No deployment addresses, code hashes, source attestations or runtime verification are invented.
Status: implementation in progress; external deployment/RPC acceptance remains pending.
## Unified observability review and completion — 2026-11-16

Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source.
Status: matrix implemented at `aa1d5153`; quote-decimal agreement implemented at `39f79175`. Targeted checks passed; final combined web typecheck/CI and external deployment/RPC acceptance remain pending.
Follow-on ownership: `packages/chain-adapters/src/quote.ts` and tests; `apps/web/src/lib/pay.ts` and tests.
Acceptance: configured feed decimals must agree with the RPC result before any quote/payment request is produced;
generic standalone `readPrice` callers may omit the expected-decimals parameter.
## Team B/I unified merchant embedding — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `365a1c38`.
Owned paths: `App.tsx`, merchant-profile components and tests, `embedHost.ts` and tests,
`merchantIdentity.ts` and tests, embedding documentation. Catalog changes belong to the coordinator.
Acceptance: explicit HTTPS loading with bounded/cancellable fetch; verified signed profile presentation;
user-confirmed source-origin/full-key pins, mismatch warnings without silent replacement; signed template display
without changing or authorizing an invoice. Remains excluded from the lean Pages profile.

# Active AI work registry

## Relayer observability spec 07 completion — 2026-11-16

Worker: current Codex worker. Branch: `codex/ghostpay-observability-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `apps/relayer/src/config.ts`, `server.ts`, `runtime.ts`, `alerts.ts`, `metrics.ts`, `metricsServer.ts`,
their focused tests, `apps/relayer/README.md`, `docs/operators/relayer-monitoring.md`, this registry.
Acceptance: add opt-in loopback metrics listener, authenticated `/metrics` and `/v1/stats`, signed HMAC-SHA256
alerts with 15-minute per-event/chain dedupe, and safe shutdown. Preserve request-path behavior. Add endpoint,
signature, privacy, SSRF and shutdown tests.
Handoff: local implementation committed on this branch. `git diff --check` passes. `npm ci --ignore-scripts --no-audit --no-fund` exits 137. Targeted Vitest cannot load `vitest/config`; typecheck lacks `tsc`; lint lacks `eslint`. No test suite, typecheck, lint, real Prometheus scrape, or receiver acceptance completed. Keep spec 07 partial until real scrape and receiver acceptance pass. Exact source pin is in task handoff.

## Merchant identity localization and security classification — 2026-11-16

Worker: current Codex session using Caveman workflow. Branch: `codex/ghostpay-caveman-followup-20261116`, base
`4ee9dd770826e705cb8c2437a53cf6714a003635`.
Owned paths: `apps/web/locales/{es,ja,ar}.json`, `apps/web/src/i18n/securityKeys.ts`,
`apps/web/src/i18n/securityKeys.test.ts`, this registry.
Acceptance: match all source catalog keys in locale drafts; classify merchant identity verification disclosures as
security-critical so unreviewed translations cannot replace English; pass catalog and security-key regressions.
Status: locale/security source fix implemented. GitHub logs confirmed 12 locale-key validation errors and the exhaustive security-key census failure on the 4ee9dd77 candidate. Reviewed #178 recovery: current source already revokes its Blob URL and removes the anchor on click or append failure; current tests cover both paths, so #178 source change is superseded. Local dependency installation is unavailable (npm ci exits 137); catalog shape and diff checks remain available. Exact-head hosted CI is still required.

## Registry builder acceptance — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-registry-lifecycle-20261116`, base `7a208005`.
Owned paths: web `features/registry/registry.anvil.test.ts`, this record, continuation evidence.
Acceptance: the recovered builders execute against the local reference registry; a valid delegated registration works,
replay fails, nonce invalidation rejects a previously signed update and fresh authorization succeeds. No public-chain
transaction, wallet signing UI or production contract modification.
Completed: five native Anvil/reference-registry tests passed with zero skips, web typecheck and focused lint passed.
Local reference compiler is solc 0.8.38; hosted pinned-compiler checks remain required.

## Merchant profile stream cap — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-profile-cap-20261116`, base `beb99464`.
Owned paths: web `embedHost.ts`, `embedHost.test.ts`, `e2e/reconciliation.spec.ts`, and this record.
Profile tests: 47 plus 77 integration/privacy cases passed; web typecheck/full lint passed.
Also scope the reconciliation browser assertion to the invoice identity paragraph after the amount summary added a
second nested hint. Preserve the digest, language-change, backup import and lock assertions. Baseline #182 browser
CI reproduced the strict-selector failure; final browser execution remains required.
Acceptance: enforce the existing 8192-byte profile limit during streaming, cancel rejected responses without waiting
on remote cancellation, preserve signed-profile verification and fetch privacy options, and test exact boundaries,
lying/missing length headers and split UTF-8. No UI/network enablement or new endpoint is introduced.

## Custody recovery — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-custody-caveman-20261116`, base `47f92f6f`.
Owned paths: `keystore-portable.ts`, web `keyVault.ts`, `keyVault.test.ts`, `keystore.test.ts`, and the SellerKeys comment.
Recover the two isolated custody fixes from `dded4c02` and `f12f9418`, reproduce their regressions against the published
candidate, then qualify normalized password policy and verified-copy checks before integration. No other local branch
payload is imported. Recovery source and final checks must be recorded in the continuation handoff.

## Caveman continuation — 2026-11-16

- Worker: current Codex session, sequential implementation and review.
- Branch: `codex/ghostpay-caveman-completion-20261116`.
- Published base: `b4be8866f6ff883fbbedc49be88b5b251a7d270e` (#179). Recovery inputs: #180 and #181.
- Owned paths: `packages/ux-vault/src/reconciliation-amounts*`, `portable.ts`; web invoice summary and reconciliation ledger components/tests; associated locale/security keys; registry builder verification; relevant completion documentation.
- Acceptance: exact bigint invoice totals from explicit live final-at-scan links; scope-wide conflict rejection and deduplication; no inferred linking or settlement claim; UI wiring and translation safeguards; package builds, regression/property tests, typecheck and lint. Validate recovered analyzer and registry helpers before publishing.
- Status: implemented; final hosted checks pending. Existing source branches remain unchanged. This record supersedes no other worker claim.

The same branch also owns integration review of #164's `payer-sponsor`, `pool-relayer`, QR warning and source-gate
changes. Acceptance includes preserving both sets of linear-parser regressions and rejecting invalid queue limits.

This file is a coordination template, not a live lock service. Always inspect open PRs and branch heads before relying on it.

| Worker | Branch | Base SHA | Owned paths | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- |
| Codex browser cleanup worker | `codex/ghostpay-download-cleanup-20261116` | `f6728033258edf203f35fe1a064660fb6ff233ce` (test-only #178) | `apps/web/src/components/Common.tsx`; `apps/web/src/components/Common.test.tsx`; this registry | Failed downloads preserve the thrown error and release the Blob URL and temporary anchor; successful downloads retain the deferred revocation window | Implemented; test-only `1ed3926b` reproduced 2 failures / 12 passes, corrected suite 14/14 passes and targeted ESLint passes. Combined-tree typecheck/build/CI still required. |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | Integrated locally; coordinator owns final combined-head verification |

| Codex historical preflight review | `codex/ghostpay-policy-preflight-20261116` | `d239d520294513114e686bd2d2e94422436fb327` | Read-only policy send/journal assessment; this registry and consolidation ledger | Verify whether historical remediation is safely recoverable; run current behavior tests | Complete: historical patch already intentionally rejected; 37/37 focused tests passed |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | In progress |
| Codex linear parser worker | `codex/ghostpay-linear-parsers-20261116` | `30733000` | `packages/i18n/src/ux/readability.ts`; readability regression tests; `packages/ops-monitor/src/fetcher.ts`; fetcher regression tests; this registry | Remove confirmed polynomial regex paths while preserving sentence and URL semantics; pass adversarial-input regressions and seeded equivalence checks | Implemented. Test-only `28a94f25` reproduced both performance failures. Corrected full suites: i18n 213/213, ops-monitor 106/106, coverage gates pass; 2,000 seeded equivalence cases pass; both typechecks and i18n lint pass. Ops-monitor lint terminated by local memory limits (exit 137); CI required. |

Incoming Pages #173–#177 records are preserved in their source history; their fixes are integrated here for combined-head validation. This branch owns only consolidation, not the original workers’ branches.

Workers should update their task-branch copy and communicate ownership through the PR description. Do not treat absence from this table as proof a path is free.

| Fuzz harness QA | `codex/ghostpay-fuzz-harness-20261116` | `d26418c2539619fb75783a82886a96971142d226` | `packages/contracts/scripts/run-echidna.sh`, `scripts/tests/echidna-runner.test.mjs` | Reject missing/duplicate/unknown property results and abnormal exits; require all real properties passed and all canaries failed; validate with offline executable fixtures | Complete: 13/13 offline runner regressions passed; bash syntax and diff checks passed; real Echidna campaign not run |
| protocol_qa | codex/ghostpay-protocol-qa-20261116 | d26418c2539619fb75783a82886a96971142d226 | packages/ux-vault/src/reconciliation-portable.ts; apps/web/src/lib/reconciliationMatch.test.ts; apps/web/src/lib/reconciliationVault.invoices.test.ts | Imported historical annotations cannot reserve a current invoice; verified live links still reserve it; encrypted import/confirmation and bounded property regressions pass | Implemented; 3 regressions RED before fix, 28 matching/vault tests GREEN, 150 property cases, typecheck/lint passed; full coverage retry pending after worker SIGKILL |
| spec-acceptance worker | codex/ghostpay-pages-runtime-acceptance-20261116 | 30733000 | apps/web/e2e/pages-devnet.spec.ts; apps/web/e2e/devnet/pages.ts if needed; docs/handoffs/GHOSTPAY_SPEC_STATUS_2026-11-16.md | Built Pages artifact handles same-nonce cancellation without false payment success or duplicate send; seller profile survives browser-process restart with encrypted vault, checkpoint and reconciliation intact | in progress |
| security_notes | codex/ghostpay-security-20261116 | d26418c2539619fb75783a82886a96971142d226 | PolicyReceive.tsx; PolicyReceive.regression.test.tsx; policyTime.ts/test; relayer config.ts/config.test.ts/ops.test.ts/README.md | Preserve fresh withdrawal-attempt discovery, render arbitrary chain timestamps without throwing, require explicit development/test mode for ephemeral relayer state; targeted regressions and lint/typecheck | implemented; targeted verification complete; independent review requested |
| security_notes | codex/ghostpay-security-20261116 | 1acb7b79 | packages/cli/src/invoice-parity.test.ts; packages/payer-hiding-contracts/test/GhostPayErc4337.t.sol; security remediation note | Assert disabled-chain inspection classification and fuzz EntryPoint rejection of inverted paymaster windows without deposit expenditure | implemented; 11 CLI tests and 10,000 inverted-window fuzz cases passed |
| Mythril gate QA | `codex/ghostpay-mythril-gate-20261116` | `b4be8866` | `packages/contracts/scripts/run-mythril.sh`; `scripts/tests/mythril-runner.test.mjs`; this registry | Reject abnormal tool exits and malformed/incomplete reports; preserve pinned analyzer invocation; prove gates with offline executable fixtures | Complete: test-only `5e7c23c3` reproduced 9 failures / 10 passes; corrected Mythril fixtures 19/19 and existing Echidna fixtures 13/13 pass; bash syntax and diff checks pass. No real symbolic-analysis run claimed. |

## Coordinator status — 2026-11-16

All scoped worker patches above are integrated locally and source-reviewed in PR #179. The coordinator owns
final combined-head CI and the completion task ledger. Earlier in-progress statuses describe original worker
claims; they do not imply that those source branches were modified or that release gates passed.

| Codex registry builder worker | `codex/ghostpay-registry-recovery-20261116` | `b4be8866f6ff883fbbedc49be88b5b251a7d270e` | `packages/chain-adapters/src/registryDelegation.ts`; companion tests; `src/index.ts` export; scoped spec audit note | Match canonical ERC-6538 calldata; validate registrants/keys/signature bytes; retain opaque ERC-1271 signatures; no sends, signing, pins or UI enablement | Recovered from recorded source after environment loss. 40 focused tests/3 files and 200 seeded cases passed locally. Typecheck/lint killed137; build/export and recovered-tree verification pending. |

## Unified independent security and authority review — 2026-11-16

Worker: Team J (`security_inventory`). Branch: `codex/unified-audit`. Base: `365a1c38770ba02826d7e039dbeef44e5a966323`.
Owned paths: this claim and `docs/handoffs/agents/TEAM_J_UNIFIED.md`; product edits require coordinator notification first.
Acceptance: independently inspect PR #184, execute supported security gates, inventory authority-model and external-adapter blockers, and reconcile relevant historical branch provenance without claiming an external audit.
Team B/I milestone: implementation `4655bab8` is committed. Final focused integration has 116 passing tests and
web typecheck/focused lint pass, using coordinator catalog overlay `cb6a3de3`. Independent reviewers found and
rechecked pin concurrency, stale consent and remote iframe corrections. Browser acceptance is added but unrun.
See `docs/handoffs/agents/TEAM_B_UNIFIED.md`; coordinator owns final combined-head qualification.
