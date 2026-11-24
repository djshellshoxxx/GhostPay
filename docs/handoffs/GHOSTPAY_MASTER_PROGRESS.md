# GhostPay master progress — 2026-11-16

> **Historical snapshot.** Current implementation, source-pinned checks, integration decisions and remaining gates are maintained in [GHOSTPAY_MASTER_COMPLETION_LEDGER.md](GHOSTPAY_MASTER_COMPLETION_LEDGER.md). The older statuses below do not override that ledger.

## Current execution

- Baseline: `4ee9dd770826e705cb8c2437a53cf6714a003635`, branch `codex/ghostpay-caveman-completion-20261116`.
- Follow-up working branch: `codex/ghostpay-caveman-followup-20261116`, based on that exact head.
- Open candidate: [PR #182](https://github.com/djshellshoxxx/GhostPay/pull/182), draft.
- Agents: three read-only audits completed; no implementation agents remain active.
- Candidate CI: web tests and locale/catalog validation failed; aggregate `typescript` gate failed. Other sampled source checks passed. Deployment and post-deployment jobs were skipped.
- Local verification: `git diff --check` and four-catalog key parity pass. `npm ci` and workspace-scoped `npm ci` both exited 137, so no local unit suite ran on this follow-up.
- Current code delta: classify merchant identity disclosure keys as security-critical and fill four missing entries in each machine-drafted locale with source English, preserving English fallback until native review.
- Local commit: `8092e2f7f213f67033d99bb0fd0e408620d24ea2`. Remote branch publication and exact-head hosted checks remain pending. No deployment, release signing or real-funds action occurred.

## Workstream ledger

| Feature | Owner | Status | Completion | Branch / commit | Tests and security | Integration | Next action |
|---|---|---|---|---|---|---|---|
| Merchant identity locale/security fix | Current Codex | PARTIAL | Source change made; qualification pending | `codex/ghostpay-caveman-followup-20261116` / base `4ee9dd77` | Catalog shape and diff checks pass; hosted baseline regression reproduced; no local test run | Local only | Publish and require exact-head web, catalog, Pages and beta checks. |
| Invoice amount reporting | PR #182 | PARTIAL | Source feature present; canonical timing remains | #182 / `4ee9dd77` | Handoff reports targeted tests; final hosted web/browser gates not green | In draft candidate | Add canonical block-time evidence with compatible vault schema; keep legacy records manual-review-only. |
| ERC-6538 builders | PR #182 | PARTIAL | Helpers and reference lifecycle test present | #182 / `4ee9dd77` | Handoff reports 40 helper tests and 5 Anvil cases; external wallet/production pins unqualified | In draft candidate | Verify exact-head build/typecheck and test external wallet workflow when available. |
| Custody and backup recovery | PR #182 | PARTIAL | Verified-backup gate and normalized strength source changes present | #182 / `4ee9dd77` | Handoff reports focused tests; exact-head hosted qualification pending | In draft candidate | Requalify vault, browser restart and recovery cases on exact head. |
| Mythril/source audit gates | PR #182 | PARTIAL | Fail-closed report gate and Solidity scan source present | #182 / `4ee9dd77` | Offline fixtures reported; real Mythril/Echidna campaigns remain unrun | In draft candidate | Run pinned analysis on a capable runner; do not infer campaign completion from fixtures. |
| Merchant profile loader and identity | Current audit | PARTIAL | Bounded fetch and signed-profile notice present | #182 / `4ee9dd77` | 124 focused tests reported; no production URL caller or trusted pin | In draft candidate | Product acceptance for URL consent, identity pin provenance and template behavior. |
| Relayer observability | Current audit | PARTIAL | Authenticated `/metrics` and ops tools exist | Baseline / `4ee9dd77` | Current unit tests exist; separate listener, `/v1/stats`, signed alert webhook and live scrape unqualified | Existing relayer only | Implement only after confirming scope; add HMAC, dedupe and real receiver tests. |
| Verified deployment matrix | Current audit | MISSING | Proposed matrix/rule absent | Baseline / `4ee9dd77` | Requires verified primary-source and deployment data | Pending evidence | Build data-driven matrix once approved verified data is supplied. |
| Static EVM beta release | Coordinator | BLOCKED | Core flows exist; release gates remain | #182 / `4ee9dd77` | Exact-head CI red; device/native and independent audit unqualified | Not release-ready | Resolve candidate CI, origin, signing, manifests, security and external acceptance gates. |
| Guardian recovery and policy AA | Product owner | BLOCKED | Draft designs only | Specs 15–16 | Authority and ABI/privacy decisions absent | Not enabled | Record agreed authority and compatibility decisions before implementation. |
| Milestone escrow | Product owner | DEFERRED | Separate product brief only | Spec 17 | Custody/dispute/authority prerequisites absent | Not in beta | Keep out of beta until separately scoped and approved. |

## Next execution queue

1. Commit and publish the locale/security fix on the follow-up branch; inspect branch head before each write.
2. Re-run candidate application, Pages and beta workflows on the exact new head; fix every reproducible failure.
3. Implement canonical block-time reconciliation only with block timestamp bound to verified block number/hash and a backward-compatible encrypted-vault migration.
4. Keep merchant URL loading, trusted identity pinning and templates behind explicit UX/privacy/trust criteria.
5. Continue per-branch ancestry and patch-equivalence review; integrate only unique, non-superseded work.
6. Preserve release blockers that require owner choices or external evidence; do not fabricate them.
