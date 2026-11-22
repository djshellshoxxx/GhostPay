# GhostPay F04 — Merchant Dashboard Completion Tracker

Updated: 2026-11-22 UTC. This tracker records source inspection, not a claim that F04 is production ready.

## Exact inspected sources

- Main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Pure F04 projection owner: PR #322, `future/f04-merchant-dashboard`, head `066731b4d6d19d96469dd18fa082b264f3efed5d`.
- Dormant combined source: PR #371, `consolidate/ghostpay-dormant-modules-1f782-20261121`, head `1de6e0247e0f76afe6f1615b43e55007ece25d9b`.
- Private export consent: PR #397, `feat/f04-deliberate-local-export-20261121`, head `a9f19eb236fb2265f48444a0b4ad7bbffb411897`, stacked on #371.
- This isolated analytics candidate: `feat/f04-evidence-analytics-20261122`, based on #397. See `docs/handoffs/F04_ANALYTICS_20261122.md`.
- Current integration control, per #371 and #397 handoffs: generation 11 held by `994a0d214fb9-root-r3`; **no authority to take over, merge, or change the lock**. Reconfirm live state before integration.
- P03 current-canonical scanner and P05 encrypted-local-state future branches: their compared branch changes were specification-only according to the #397 source review. Do not treat those names as implemented provider contracts.

## Component truth table

Status vocabulary: VERIFIED_COMPLETE (only for the exact scope independently evidenced), IMPLEMENTED_UNVERIFIED, PARTIAL, MISSING, BROKEN, BLOCKED.

| Component | Status | Confirmed evidence / still needed |
| --- | --- | --- |
| M1 strict invoice/observation decoder | VERIFIED_COMPLETE (isolated code only) | #322 reports 61 focused tests, scoped TypeScript/lint/coverage; no production import |
| M1 evidence-qualified atomic projection | VERIFIED_COMPLETE (isolated code only) | #322 checks canonical-event identity, duplicates, conflicts, reorg and late amounts; only an injected approved provider can assert finality |
| M1 bounded selectors and cancellation | VERIFIED_COMPLETE (isolated code only) | #322 focused qualification; real lock/revision lifecycle not connected |
| F04 dormant source consolidation | IMPLEMENTED_UNVERIFIED | #371 assembles F04 with F05/F10 and current main; final-head hosted checks, lock reconciliation and main promotion pending |
| Explicit preview and one-use CSV/JSON approval | IMPLEMENTED_UNVERIFIED | #397 adds a dormant export coordinator; 8 standalone scenarios, not repository Vitest/CI/UI or file downloads |
| Per-asset local analytics summaries | IMPLEMENTED_UNVERIFIED | Isolated analytics branch derives exact per-chain/asset counts and atomic amounts; 9 local stub-based Node smoke tests passed and strict TypeScript passed after fixing untouched-invoice review misclassification. 8 committed Vitest cases, repo/browser tests pending |
| Approved P03 canonical evidence adapter | MISSING | P03 future branch only specifies the required interface; no approved current canonical event/finality source wired into F04 |
| Encrypted P05 merchant journal | MISSING | No F04 transactional merchant persistence, encryption lifecycle, indexed reads, or durable revision CAS demonstrated |
| Invoice registration and payment journal ingestion | MISSING | Signed issuance, observations, reconciliation and recovery need typed provenance-preserving F04 adapters; imported labels cannot prove settlement |
| Merchant dashboard navigation and overview | MISSING | No F04 browser route, unlocked/locked UI or production import |
| Searchable invoice/payment management UI | MISSING | Selectors exist but no browser-visible search/filter/sort/detail/history/reconciliation screens |
| F05 receipt assurance | PARTIAL | Separate dormant F05 offline proof-review M1 exists; F04 must consume checked results via an explicit contract, never duplicate verification |
| Scan coverage/finality/fee provenance | MISSING | Coverage currently `not-evaluated`, historic fee evidence `null`; no completeness claims or arbitrary fiat totals |
| Export selection/preview/download UI | MISSING | Require explicit human approval, stale-preview invalidation and lock-aware cancellation before local file creation |
| Encrypted backup, preview/restore and migrations | MISSING | No merchant-specific encrypted portable archive or crash-safe restore evidenced |
| Cross-tab reconciliation and conflict policy | MISSING | No F04 persistent revision CAS, other-tab invalidation, quarantine/corruption handling or durable migration testing |
| Privacy/security/browser/device acceptance | BLOCKED | Needs production activation behind validated P03/P05, then browser/RPC/lock/IndexedDB/fuzz/CodeQL/keyboard/mobile tests |
| Mainline production integration | BLOCKED | Held generation-11 coordinator lock; must not bypass ownership or merge/deploy |

## Ordered engineering milestones

### P0-A — Real verified-evidence contract (blocks any revenue claims)
- [ ] Inventory current invoice creation, scan, reconciliation, transaction journal, Sweep and recovery interfaces on a fresh main checkout.
- [ ] Specify and test a P03 adapter that binds invoice ID, chain, asset, event identity, amount, expected amount, expiry, inclusion timestamp and independently validated canonical finality.
- [ ] Separate claimed/unverified, observed/pending, finalized, late, partial, overpaid, reorged/reverted, failed, ambiguous, recovered/refunded-with-evidence states.
- [ ] No RPC lookup from a mere row render, no implicit opt-in to remote scanning, no matching by amount alone and no silent unknown-to-final promotion.
- [ ] Preserve proof source, scan coverage and chain tip; fail closed on missing or stale canonical evidence.
- [ ] Integrate current-journal revision with provider assessments; prove reorg rebuild removes prior final contributions.

### P0-B — Encrypted, durable merchant state (blocks UI activation)
- [ ] Reuse GhostPay-approved vault-derived encryption/key lifecycle and IndexedDB transaction architecture; do not store decryption keys alongside ciphertext.
- [ ] Design schema-versioned records with profile/seller/chain isolation; atomic-unit strings, immutable evidence, revisioned annotations and provenance.
- [ ] Authenticate ciphertext and bind schema, profile, chain and record identity as associated data.
- [ ] Implement transactional compare-and-swap revision, conflict detection, failed/quota/blocked/terminated transaction handling, and safe retry without losing records.
- [ ] Handle tab locking, visibility changes, browser closure, reopen and schema migration without stale decrypted-cache publication.
- [ ] Preserve corrupted evidence for recoverable user action; never silently discard or reinterpret it as settled.

### P1-C — Merchant experience
- [ ] Activate a dedicated F04 route only after P0 providers are qualified; no service/relayer/database requirement.
- [ ] Build private overview with per-chain/asset final, pending, late, outstanding, expired and review counts; keep coverage uncertainty adjacent to summaries.
- [ ] Build invoice list/detail, search, date/state/chain/asset filtering, sorting, payment history, explicit ambiguous-match and recovery views.
- [ ] Add private local annotations and scoped seller identity; never persist unencrypted customer metadata.
- [ ] Integrate F05 checked receipt outcomes through a stable interface with honest unavailable/unverified labels.
- [ ] Use the isolated analytics and export modules without changing source evidence authority.

### P1-D — Authorized exports and recoverability
- [ ] Connect #397 preview/approve to explicit UI controls; choose records/columns/format, show disclosure preview, and require a fresh human gesture.
- [ ] Cancel one-use approval on lock/revision/profile changes; ensure stale approvals cannot create downloads after cancellation.
- [ ] Test CSV spreadsheet injection/Unicode handling/byte limit, JSON schema/atomic units, correct chain+asset+state context and no mixed-asset total.
- [ ] Implement encryption-backed backup, strict archive validation, restore preview, duplicates/conflicts, schema migration and rollback.
- [ ] Reject backup records as independent proof of settlement; do not overwrite newer verified evidence with stale imports.
- [ ] Prove reload/crash recovery and corrupted archive failure without deleting existing local records.

### P1-E — Quality, privacy and release gates
- [ ] Run F04 focused Vitest, all affected workspace tests, TypeScript, typed ESLint, build, lean-bundle scanner, dependency/security checks and mandatory hosted CI at **exact final head**.
- [ ] Run Playwright in real browser for route/lock/reload/IndexedDB/reorg/exports/backups/network-selection/mobile/keyboard/accessibility flows.
- [ ] Run deterministic faults/fuzz: malformed address/amount/JSON, hostile strings and Unicode, CSV formula, duplicate references, reorg ordering, cancellation/races, concurrent writes, storage quota and interrupted export/restore.
- [ ] Assert no keys, merchant notes or sensitive record bytes go to console/analytics/RPC absent explicit merchant action.
- [ ] Obtain an independent code/security review; address all findings and retain exact test/commit evidence.
- [ ] Reconcile original donor ancestry, latest heads and current ownership lock; integrate only via authorized owner and qualification gates.

## F04 completion decision

Completion requires *all* acceptance checks from the full F04 mission: browser-accessible and accessible UI; actual verified evidence and no fabricated settlement; exact isolated atomic analytics; encrypted crash-safe persistence; backup/restore; explicit CSV/JSON export approval; working idle lock and cross-tab invalidation; tests/CI/browser/device evidence at integrated head; and separate approval. Library-only or stub-based checks cannot close F04.

No automatic refunds, live payments, main merges, deployments, service jobs or claims of blockchain anonymity are part of this tracker or the current analytics branch. Work remains isolated until evidence, storage and integration ownership permit safe activation.
