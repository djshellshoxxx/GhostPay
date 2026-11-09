# GhostPay product completion ledger

Date: 2026-11-09 (America/Vancouver). Coordinator: this product-completion workstream.

This ledger covers the product brief supplied for this assignment. It distinguishes implemented code,
executed qualification and external acceptance. Percentages are engineering estimates for the bounded
workstreams below, not measured percentages of all possible GhostPay functionality or production readiness.

## Verified starting source and ownership

- Default branch `main`: `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d`.
- Open draft stack: #84 `48b6bc20108079bb7fbf89997249734bf9f41646` → #88
  `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` → #89
  `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` → #90
  `5628bc00b05a6dd0d9cd89f04f0385d9119281ac`.
- Dedicated branch: `gpt/ghostpay-product-completion-20261109`, based on #90. The previous runtime
  qualification belongs to #90's `42ae712f5804724b4213bed4e2e0cb129f855abf`, not this branch.
- #91 `b748ecdce06d2dfa911144814161c31a46a09e9b` remains the separate merchant/CLI companion.
  A concurrent local CLI completion branch was observed with changes to CLI, invoice-schema,
  merchant-billing, qr-exchange, ux-vault and shared web keystore/receipt/reconciliation/tag/seller-pairing
  libraries. Those files, package manifests, the root lockfile and Vite config are reserved.
- No nested `AGENTS.md` was present in this checkout. Repository conventions, the source-pinned
  continuation handoffs and the supplied task brief apply.
- Existing contained source branches are not replayed. No main merge is permitted while the wider
  parent's required security gate is failing. Production manifests, contracts, authority models,
  deployment pins, schedules and paid agent workflows remain outside this product assignment.

## Task inventory

| Workstream | Initial estimate | Current work / owner | Acceptance and remaining dependency |
| --- | ---: | --- | --- |
| Localization infrastructure and dynamic outcomes | 80% | Transaction worker: typed outcomes, nested safe descriptors, current-language statuses, remaining shell/QR copy | Focused tests running; human translation approval remains separate |
| Accessibility, help and responsive UI | 80% | Accessibility worker: help primitive, native picker status, QR dialog focus/reveal scope, shared controls | Unit checks passed in selected scope; exact integrated browser profiles pending |
| QR, receipt, backup and device exchange | 85% | Security worker + coordinator: UTF-8 matrices, bounded QR inputs, file retries, app-lock invalidation, receipt-original guidance | Existing public pairing and signature/payment distinctions retained; new regression checks underway |
| Supported merchant GUI | 85% | Coordinator: invoice registration help, receipt/archive explanations, local-state retry improvements | Subscription/webhook/plugin/CLI packages reserved to #91; fixture-only refund authority is not an operational GUI feature |
| Security and persistence | 80% | Security worker: strict journal parse, same-origin fragment clearing, bounded safe settings save, IndexedDB reopen | Source reproductions and targeted fixes; #84 Sonar issue inventory inaccessible |
| Automated qualification | 80% | Coordinator: focused regression suites and new Playwright journeys | Whole integrated source, full/lean builds and hosted browsers still pending |
| Documentation and website quality | 75% | Security/docs worker: accurate static help/privacy pages, technology attribution, favicon, merchant guide | Source links and build inclusion to verify |

The language registry already contains all fifteen additional requested languages. Only English,
Spanish, Japanese and Arabic ship catalogs; other choices accurately disclose English fallback.
Adding empty or unreviewed security catalogs is not a translation completion claim. Calendar/timestamp
server selection is not implemented in GhostPay; no such control is invented from another project's brief.

## Reproduced defects and verification in progress

- Tag archive: four new cases fail original behavior and pass the fix: unrelated export form erased by
  file choice, stale preview after idle lock, late decryption after lock, and cancelled chooser losing selection.
  Repeated successful import of the same original file is exercised in the passing component test and a
  new full-profile browser journey.
- Settings: two race regressions fail original behavior and pass the fix: a prior endpoint response
  claiming an edited URL is connected, and an older test overwriting the newer result.
- Seller keystore: a pending file read could decrypt/install keys after app lock. The regression fails
  the old component and passes the operation cancellation fix.
- Security worker: fifteen reproduced failures cover Unicode QR corruption/bounds, fragment clearing,
  unexpected serialized settings fields, transient IndexedDB opens and malformed attempt journals.
- Accessibility worker: nine reproduced failures cover secret QR reveal scope, dialog focus, motion
  preference changes and stale copy outcomes.

Initial setup: Node 24.22.1 / npm 11.9.0; frozen `npm ci --ignore-scripts` and `npm run build:libs` passed.
No dependencies were added. The first integrated typecheck ran while catalog work was incomplete and
failed on pending message keys; it is not a passing result.

Local Chromium launch was attempted and failed before page execution with
`process_singleton_posix.cc: socket() failed: Operation not permitted`. Collection or component tests
are not represented as browser execution. Hosted CI will be recorded separately for exact published source.

## External gates

1. PR #84 Sonar check `128302927200`: D Security Rating on New Code, required A. A fresh check-runs
   read showed 31 successful checks, one Sonar failure and one skipped review. The issue inventory API
   returned HTTP 403 with CloudFront `Request blocked`; twelve annotations do not establish the causal
   rule/severity/location. No finding is invented or suppressed.
2. Human review of non-English translations, physical-device/Safari acceptance and public-network
   qualification remain external. Test fixtures do not authorize production deployment or funded payments.
3. Recovery authority decisions, trusted deployment/asset pins, internal-pool ceremony artifacts and
   scheme-2 lifecycle acceptance are separate gates; the experimental flow remains disabled.
4. The reserved `packages/qr-exchange/src/generate.ts` uses the same pinned byte encoder pattern found
   in the web QR helper. Its active CLI owner must assess Unicode behavior before claiming that package
   supports arbitrary Unicode end to end. Existing canonical ASCII exchange formats are a distinct scope.

## Publication and final acceptance

This section is updated after completed integrated checks and publication. No current statement here
claims this source is merged, released, deployed, audited or production-ready.
