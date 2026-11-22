# F05 Receipt Assurance — source-pinned completion tracker

Assessment date: 2026-11-22 UTC. Status: PARTIAL / integration BLOCKED. This is an evidence-backed engineering handoff, not a completion claim, product implementation, fresh test result, merger authorization, or release approval.

## 1. Immutable source baseline and scope

- Production main at inspection: eb59d93cffed7848c4aac37d0e9650b87239c6da (2026-11-21 GitHub commit).
- Parent of this docs-only task: draft consolidation PR #371, head 1de6e0247e0f76afe6f1615b43e55007ece25d9b. Its source includes original F05 PR #323 head ccd1b16dea7be84552f40d3bcd0f23b4224699d3.
- Related but separate draft recovery/privacy integration: PR #372, head 055d33e042c63edf1d5bbbdd7833d3c1ef93733d. Its 1,907 changed-file inventory includes receipt UI, reconciliation vault, and scanning paths. Do not merge or cherry-pick it wholesale to implement F05.
- Receipt correctness work in other active drafts: #426 (mixed-case truncated EVM address) and stacked #449 -> #450 -> #452 (defensive malformed chain-verifier results). No changes to their owned packages are made in this task.
- Original F05 product specification: docs/future/modules/F05-ghostproof/SPEC.md in #371. It is **GhostProof selective-disclosure evidence**, not merely a generic receipt viewer. The current task requests completion of the receipt-assurance subset; do not label unsigned digest or ordinary signed receipts as selective-disclosure or zero-knowledge proofs.
- P12 and P05 feature branches at inspection are **specification/documentation only** relative to main: future/p12-selective-disclosure-proofs and future/p05-encrypted-local-state. Existing main encrypted reconciliation infrastructure is real but is not a P12 proof provider.
- Integration coordination: generation-11 lease is recorded held by 994a0d214fb9-root-r3. There is no verified transfer/release. All shared main merges, route activation, deployment and release remain prohibited for this task.

Source URLs: https://github.com/djshellshoxxx/GhostPay/pull/323 ; https://github.com/djshellshoxxx/GhostPay/pull/371 ; https://github.com/djshellshoxxx/GhostPay/pull/372 ; https://github.com/djshellshoxxx/GhostPay/pull/449 ; https://github.com/djshellshoxxx/GhostPay/pull/450 ; https://github.com/djshellshoxxx/GhostPay/pull/452 .

## 2. Fundamental trust model

1. A digest receipt establishes only self-consistency of unsigned data, not identity or payment.
2. A valid signature establishes integrity of a signed statement under a public key, not whether its holder is the right merchant.
3. Invoice signing-key matching, caller-verified invoice context, and out-of-band explicitly pinned signer trust are separate inputs and results; a pin must never silently fall back to an embedded key.
4. A receipt does not create a verified chain observation. Only the existing network-specific verification/scan pipeline may supply independently checked chain evidence, preserving chain, asset, amount, stealth recipient, transaction, block hash, provenance, canonicality and confirmation/finality assumptions.
5. A historical imported observation is not equivalent to fresh canonical chain evidence. Reorganizations, stale RPC data, missing block headers and contradictory providers must downgrade settlement assurance without destroying the prior evidence or audit history.
6. Reconciliation invoice links must never be created or upgraded solely by importing a receipt. Ambiguous associations remain ambiguous and cross-seller/chain identity may not be inferred from text supplied by a third party.
7. The original signed bytes or a precisely authenticated byte-equivalent representation must survive export/reimport. No canonicalization on display may mutate original signed fields.
8. Provider access is opt-in and disclosed as a privacy event; offline checking is the default. No mandatory backend, central signer, custodial service, private-key disclosure or unapproved protocol changes.

Suggested presentation dimensions, mapped to existing project conventions rather than replacing them: format validity; cryptographic authenticity; signer pin/identity; invoice binding/authentication; independent evidence availability; observed/current confirmations/canonicality; conflicts; verification timestamp and provenance. Never reduce these to one success boolean.

## 3. Current implementation coverage

Definitions: VERIFIED_COMPLETE refers only to a bounded independently reviewed slice with later hosted qualification; IMPLEMENTED_UNVERIFIED means code exists but requested end-to-end behavior has not been freshly qualified; PARTIAL means important reusable behavior exists but the F05-specific integration is incomplete; MISSING means no qualifying implementation in the inspected live main plus #371 F05 source; BLOCKED means ownership/required dependency prevents safe completion. All labels are relative to specified acceptance, not speculative feature assertions.

| Capability | Status | Verified source and exact gap |
| --- | --- | --- |
| Existing signed receipt v1 validation / signing | PARTIAL | packages/invoice-schema/src/receipts.ts on main has version, canonical payload, domain-separated signature and invoice-binding helpers. It is reusable but does not prove chain settlement. |
| Unsigned digest receipt v1 parsing / checking | PARTIAL | packages/ux-receipts/src/parse.ts and verify.ts on main validate format and digest, with optional injected ChainVerifier; the receipt remains unsigned. |
| F05 offline review adapter | VERIFIED_COMPLETE (dormant M1 only) | #323 review.ts and session.ts, preserved by #371; focused 67/67 author/reviewer tests recorded by donor, and #371 hosted jobs qualify dormant composition. No production route imports the module. |
| Cryptographic authenticity vs signer trust | PARTIAL | F05 review.ts distinguishes embedded key, invoice signer and explicitly trusted pin; real UI has no F05 review component presenting these independently. |
| Payment chain confirmation/finality | MISSING in F05 | F05 review.ts intentionally returns chain=not-checked and freshness=unknown; main ux-receipts ChainVerifier accepts limited reported facts and has active defensive corrections #449/#450/#452. No F05-specific canonical-block/depth/reorg validation is implemented. |
| Existing signed-receipt issuance | PARTIAL | apps/web/src/components/ReceiptPanel.tsx signs records from eligible verified scan matches, offers JSON, QR and print, and distinguishes optional verified invoice binding. There is no F05 imported third-party review flow. |
| Existing encrypted signed receipt archive | PARTIAL | main ReceiptPanel archives seller-issued signed receipts through createCurrentReconciliationVault. packages/ux-vault/src/reconciliation-portable.ts archives by receipt ID with dedupe and seller/chain scope. It expressly excludes these archives from payment evidence. |
| Search/list and export of local archive | PARTIAL | main ReconciliationLedger.tsx lists archived receipts, supports removal and explicit plaintext receipts export. No integrated F05 signature/signer/chain review per archived receipt, nor conflict/provenance filters. |
| Encrypted backup and restore | PARTIAL | ReconciliationVault exports encrypted backup and preview/activate import, using guarded compare-and-swap and reorg history. It is not a general imported external-receipt evidence store. |
| Local invoice registration/matching | PARTIAL | main reconciliation-portable.ts and ReconciliationLedger.tsx support scoped verified observation matching, including ambiguous and reorg states; F05 review has no adapter that consumes or updates this ledger. |
| Standalone F05 receipt import from file/text/QR | MISSING | #323 exposes reviewReceipt(text, options) and cancellable session but no mounted accessible browser import UI. Existing encrypted *backup* importer is not a signed-receipt verifier. |
| Archival of externally imported F05 receipt with provenance | MISSING | Archive explicitly accepts and stores seller-issued signed receipts, not external third-party evidence. Do not weaken this guard without a reviewed record type/migration. |
| Receipt replay and duplicate evidence conflict UI | PARTIAL | Existing archive deduplicates receipt IDs; end-to-end third-party import replay, cross-seller conflicts and contradictory-chain-evidence review have no F05 consumer/UI. |
| Original payload preservation/export interoperability | PARTIAL | Signed receiptJSON and explicit exports exist; no F05 cross-device import/export round-trip workflow and provenance-controlled review is demonstrated. |
| F05 idle-lock integration, cross-tab race, stale response | PARTIAL | Dormant session supports abort/supersession/disposal; the real app lock/profile lifecycle is not wired. Existing vault has CAS; end-to-end browser lifecycle is unqualified. |
| P12 selective-disclosure, audience/challenge or ZK proof | BLOCKED | Source-inspected future/p12 branch supplies a specification, not a qualified provider. Never market ordinary F05 signed/digest receipt as selective-disclosure, ownership or zero-knowledge proof. |
| Production browser UI, localization, accessibility and e2e | MISSING | Neither main nor #371 mounts F05 module; donor browser qualification exercised existing app, not a new F05 route. |

## 4. P0 prerequisites before F05 chain claims (highest correctness risk)

- [ ] Agree a typed chain-evidence contract that retains chain ID, source/provider identity, transaction hash, transfer/log identity, asset/decimals, exact amount in integer units, recipient, block number/hash, confirmation count, observed time and canonicality check. Do not accept a bare boolean as settlement proof.
- [ ] Reconcile existing network/scan contracts and the #449 -> #450 -> #452 defensive fix stack before using ux-receipts as a chain-evidence port. Retain exact source ancestry, independent review and regression evidence.
- [ ] Add an opt-in chain-verification adapter for **supported networks only**, using current EVM receipt/log/stealth scan results and existing trusted network settings. Reject unsupported chains/assets with a typed status; make no fake fallback RPC promises.
- [ ] Verify successful transaction and matched transfer/announcement independently from receipt fields. Match invoice digest where independently established, asset/token decimals, net amount, seller scope, recipient and canonical block identity; do not treat unrelated transactions or transaction existence alone as payment confirmation.
- [ ] Specify chain-specific confirmations versus finality clearly. Model PAYMENT_OBSERVED, PAYMENT_PENDING, PAYMENT_CONFIRMED, PAYMENT_REORGED, PAYMENT_MISMATCH, EVIDENCE_UNAVAILABLE and UNSUPPORTED, using existing equivalents if present. Never claim finality without a supported rule.
- [ ] Make any change to evidence status append-only or revisioned, retain prior observations, recheck reorg tombstones, and prohibit an imported receipt from overriding stronger independently verified evidence.
- [ ] Add cross-seller, chain replay, provider conflict and RPC outage cases to acceptance tests **before** making production code changes.

## 5. P1 browser receipt import and assurance interface

- [ ] On an ownership-approved child of #371, build a **disabled by default** accessible F05 import/review panel that reuses reviewReceipt/createReceiptImportSession; use existing text, file and QR components rather than a new parser or receipt format.
- [ ] Bound file.size before text allocation; bound encoded UTF-8 bytes, strict JSON depth, unknown keys, Unicode and all arrays/record lengths; reject ambiguous or noncanonical input without echoing it.
- [ ] Present separate immutable fields for format, signature/digest, signer pin, invoice authentication, claimed facts, chain evidence, current verification time, source/provenance and limitations; signed statement and confirmed payment must never use indistinguishable visual states.
- [ ] Wire to real app lock/profile/network-change/unmount cancellation. On lock or profile change dispose the F05 session and clear *all* UI-held copies; discard late WebCrypto/network results by generation and scope.
- [ ] Integrate optional read-only association to the existing encrypted invoice ledger without modifying payment observations. Only current independently verified matches can create or revise invoice associations; conflicting or ambiguous entries stay review-only.
- [ ] Add search/filter/review/reverify/archive controls only for well-defined supported formats, preserving original signed bytes, trust scope and provenance. For newly imported external artifacts, introduce a separate versioned record with reviewed compatibility/migration; do not silently route them into seller-issued-only archivedReceipt.
- [ ] Preserve existing localization, text-only rendering, keyboard navigation, focus, responsive styling, and explicit user disclosure before provider lookup or plaintext export.

## 6. P1 persistence, portability and cross-device evidence

- [ ] Audit existing encrypted vault serialization, CAS, imported-history restrictions, seller/chain scoping, reorg tombstones and backup merge before extending any record.
- [ ] Keep imported evidence distinguishable from issued receipts and verified chain observations; record import time, verification-time source pins, original signed representation, algorithm and format version, but exclude private keys and unnecessary personal information.
- [ ] Make duplicate IDs and same-payload imports idempotent; a conflicting same-ID payload must be retained for explicit conflict review rather than overwritten.
- [ ] Verify atomic multi-tab updates, interruption during archival, quota exhaustion and corrupt backup rejection. Imported copies cannot resurrect invalidated chain observations or downgrade the seller-scoped vault.
- [ ] Add explicit authorized original-receipt export and independently verifiable import on a second browser/profile; compare canonical payload bytes and signature, chain/asset, invoice association and provenance.
- [ ] Retain optional export privacy disclosures and never claim that removal revokes an already shared file.

## 7. Test-first acceptance matrix

| Group | Required regression or integration evidence |
| --- | --- |
| Cryptography | Valid signed receipt; wrong signer; valid signature over different content; malformed signature; unknown algorithm/version; digest-only unverified; tampered canonicalization; untrusted embedded key; strict signer pin |
| Parsing and resource bounds | Duplicate JSON keys, malformed UTF-8/Unicode, prototype pollution, unexpected nesting, large files, invalid clocks, negative/fractional/overflow amounts, wrong decimals, unsupported recipient/chain |
| Ledger and settlement | Cross-invoice/chain/seller replay, wrong token, amount and recipient, fake RPC success, missing logs, provider exceptions/getters, pending transactions, incomplete confirmations, reorg and conflicting block hashes |
| Lifecycle and privacy | Lock mid-import, network switch, stale return, component unmount, concurrent tab imports, revoked authorization, explicit RPC consent, no offline egress, no secret export |
| Storage and portable recovery | Exact original receipt round trip, archive duplicate, same-ID conflict, cross-tab CAS, quota/corruption, backup preview, reorg tombstone preservation, cross-device independently verified export |
| Browser and accessibility | Import from file/text and safe QR, visible distinct assurance/payment states, error messaging, search/filters/reverify, keyboard/focus, supported languages, mobile, idle lock |

For defects, commit a failing test before the fix. Use local Anvil/testnet fixtures and bounded fuzzing; no real funds. Never count source-equivalent isolated probes as repository Vitest, nor old-commit CI as the final source-head gate.

Repository-supported commands identified from package scripts:

- npm run test -w @ghostpay/invoice-schema
- npm run test -w @ghostpay/ux-receipts
- npm run test -w @ghostpay/web
- npm run typecheck -w @ghostpay/web
- npm run lint -w @ghostpay/web
- npm run build -w @ghostpay/web
- npm run test:e2e -w @ghostpay/web
- npm run ci:scan-secrets
- npm run ci:check-tx-origin

Focused historical F05 test command in donor review: NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run src/features/future/ghostproof/review.test.ts src/features/future/ghostproof/session.test.ts --maxWorkers=1 (from apps/web). Re-evaluate after integrating production UI.

## 8. Current verification record — do not overclaim

- #323 original F05 independent review: 67/67 focused tests passed at corrected donor source, no skips. This is **historical qualified offline module evidence** only. Its standalone PR checks contain failures, including CodeQL and tooling, and it remains draft.
- #371 final public head 1de6e0247e0f76afe6f1615b43e55007ece25d9b: GitHub checks API inspected on 2026-11-22 returned 39 completed runs; applicable TypeScript, lint, tests, CodeQL, Pages artifact/browser and hosting jobs succeeded. Explicit deployment/release jobs were skipped. These outcomes qualify dormant consolidation at that SHA, not production F05 UI/provider claims.
- This documentation task has **not** executed Vitest, TypeScript, lint, build, Playwright, chain simulation or independent security review. Direct local clone was unavailable in the current execution environment because github.com DNS resolution failed. Only connected GitHub source and hosted-status APIs were inspected.
- No code defect fix or production behavior change is claimed. No merge, deployment, contract call, wallet operation or real-funds test is performed.

## 9. Prioritized integration order and ownership decisions

1. **P0 evidence integrity:** coordinate receipt-provider bug stack #449/#450/#452 and #426, complete source-pinned typed settlement adapter, validate canonicality, finality constraints and mismatch precedence before exposing any payment-confirmed UI.
2. **P1 user-verifiable receipt import:** add disabled, accessible F05 browser import/review using #371 module; enforce lock, stale and privacy boundaries before activating.
3. **P1 invoice/ledger bridge:** add read-only review of verified existing evidence with no receipts-as-evidence upgrade; test collisions/reorgs and exact seller/network association.
4. **P1 guarded archival/export:** preserve existing issued-receipt encrypted vault; add separately typed imported evidence only with explicit version/migration and durable original signed bytes; test cross-device round trips.
5. **P1 qualification:** new exact-head unit/integration/browser, Anvil/other applicable network fixtures, static/egress review, independent security review, accessibility and localization.
6. **P2 original GhostProof expansion:** optional P12 selective-disclosure audience/challenge and local proof-generation provider after independently reviewed cryptographic implementation exists. P12/P05 specs alone are insufficient.

Each subsequent worker must register exact owned paths and starting SHA, recheck currently open PRs/owner claims and avoid editing other workers' branches. Promote only a deliberately narrow F05 child, after current integration lock legitimately transfers/releases and all exact-head CI and independent reviews complete.

## 10. Release acceptance criteria (all required)

- [ ] Browser can import, verify, reverify, archive and export supported receipts.
- [ ] Cryptographic validity, signer trust, invoice authentication and independently observed settlement remain separately visible.
- [ ] Forged, altered, duplicate, cross-chain, cross-seller, expired, oversized or unsupported evidence fails closed.
- [ ] Independent chain evidence validates transaction, asset/amount, recipient, canonical block and supported confirmation policy, with missing/reorged evidence transparently downgraded.
- [ ] Reconciliation cannot be forged or overwritten by receipt imports; conflicts and imported history retain provenance.
- [ ] Encrypted storage and backup restore survive tab races/interruption and preserve original signed representations without plaintext private keys.
- [ ] Exported supported receipt verifies on another device without the original local database.
- [ ] Real app-lock, profile/network switches, privacy/consent, localization and accessibility are qualified.
- [ ] Relevant exact-head Vitest, typecheck, lint, build, Playwright, security tests, fuzz/property tests and independent review are evidenced.
- [ ] No critical correctness defect remains, ownership locks are reconciled and required integration gates pass.
- [ ] Deployment and release remain separate explicitly authorized steps.

**Current result:** F05 receipt-assurance completion NOT achieved. The inspected evidence proves useful dormant offline verification and substantial existing main receipt/vault capabilities, but not a complete, evidence-qualified end-to-end browser assurance system.
