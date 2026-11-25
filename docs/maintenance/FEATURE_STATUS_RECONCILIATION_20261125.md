# Feature and task status reconciliation, 2026-11-25

Read-only reconciliation of the feature and task items named in the repository trackers against current evidence.
No tracker, PR or issue was edited or closed. No tests were run and no CI status was queried.

## Method and baseline

- Base: `origin/main` = `c8e131c1` (merge of PR #500). Worktree branch `docs/maintenance-haiku-20261125` HEAD = `d4288414`, one commit ahead of main (ACTIVE_WORK ownership claim, +8 lines). That commit is not reconciled here. Worktree was clean before this file was written.
- Sources read: README "Status"; `docs/COMPLETION_PLAN.md`; `docs/CONSOLIDATION_STATUS.md`; `docs/CONSOLIDATION_PROGRESS.md`; `docs/MASTER_BLUEPRINT.md`; `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`; `docs/FEATURE-ASSESSMENT-2026-10-23.md` (sections: headline, feature inventory, test evidence, launch gates); `docs/ai/HANDOFF.md`; `docs/ai/ACTIVE_WORK.md` (existence only).
- Open PRs: 92 in total (page 1 = 50 rows, page 2 = 42 rows), read as titles, heads and draft flags only. No bodies, no check runs. Open PRs are not merged work.
- Merged history: `git log origin/main` (150 most recent titles).
- Spot checks: cited source paths were tested on `origin/main`. Commit SHAs were checked with `git cat-file`.
- Implementation percentages from FEATURE-ASSESSMENT are deliberately not carried over. The assessment itself says they are implementation estimates, not launch scores.
- Last-verified date for every row: 2026-11-25.

Status labels: Implemented and integrated; Implemented but unmerged (cite PR); Implemented but disabled; Experimental; Partially implemented; Specification-only; Deferred; Blocked; Independently qualified (none found; see Conflicts).

Test-evidence column: "FA" means the result is recorded in FEATURE-ASSESSMENT at commit `081b76b0` (exists in this clone). Those runs were not repeated here. "none recorded" means no result appears in the sources read.

## A. Core product rows (FEATURE-ASSESSMENT core inventory, 18 rows)

| ID | Item (tracker name) | Status | Implementation evidence | Branch | Test evidence | Remaining work |
|---|---|---|---|---|---|---|
| C1 | Scheme-1 stealth cryptography | Implemented and integrated | `packages/core-crypto/src/keys.ts`, `packages/core-crypto/src/stealth.ts` (main) | main | FA: core-crypto 55 tests / 7 files at 081b76b0 | No independent cryptographic audit (gate in audit 08, not read) |
| C2 | Invoice create/open, signature, encryption | Implemented and integrated | `packages/invoice-schema/src/envelope.ts`, `apps/web/src/views/CreateInvoice.tsx`, `apps/web/src/views/Pay.tsx` | main | FA: invoice-schema 626 tests / 9 files; Playwright 17 pass (081b76b0) | Overlaps passphrase item 2a (see Duplicates) |
| C3 | EVM checkout, fees, gas buffer | Partially implemented | `packages/contracts/src/GhostPayRouter.sol`; `apps/web/src/views/Pay.tsx`; `apps/web/src/lib/pay.ts` | main | FA: web 737 pass / 1 skip; chain-adapters 356 / 20 (081b76b0); 17 local-Anvil checks owner-reported | FA marks the v2 token and buffer requirements partial. See F1 (P1) |
| C4 | EVM scan and payment verification | Implemented and integrated | `apps/web/src/views/Scan.tsx`, `apps/web/src/lib/scanClient.ts` | main | FA: Playwright worker scan and ciphertext-only tag storage (081b76b0) | Only mocked or local RPC exercised; no live-RPC run recorded |
| C5 | EVM sweep, direct or relayed | Implemented and integrated | `apps/web/src/views/Sweep.tsx` | main | FA: Foundry main 411 pass, payer 108 pass (081b76b0) | No production-chain sweep recorded |
| C6 | Relayer and abuse/operations controls | Partially implemented | `apps/relayer/src/service.ts`, `apps/relayer/src/server.ts` | main | FA: relayer 248 pass, relayer-guard 146 pass in a partial workspace log that did not pass as a whole (081b76b0) | Live hot-key operations and external alert delivery untested (FA) |
| C7 | Seller keys, backup and encrypted vault | Implemented and integrated | `apps/web/src/views/SellerKeys.tsx`; `apps/web/src/lib/reconciliationVault.ts` | main; PR #540 (keystore switch browser flow, open, ready) | FA: focused seller-operation suite 13 pass (081b76b0) | No physical recovery exercise. Recovery and backup work open in PR #530 (draft), PR #573 (draft), PR #622 (draft) |
| C8 | QR display, device exchange, camera import | Partially implemented | Commits `74121278`, `41a598b8`, `85693bf2` on main; `apps/web/src/views/Settings.tsx`, `apps/web/src/views/SellerKeys.tsx` | main; PR #547 (native image-decode qualification, open, ready) | FA: 78 QR/keystore/settings tests / 10 files; web 737 pass (081b76b0) | Physical camera and second-device interoperability untested |
| C9 | Receipts and payer receipt import | Partially implemented | `apps/web/src/lib/receipts.ts`; `apps/web/src/components/ReceiptPanel.tsx`; receipt and bill printing merged as `0d3d804b` | main; PR #587 (receipt timestamp retention, draft); PR #548 (receipt print fixes, draft) | FA: web 737 pass; UX-receipts 117 tests (081b76b0) | Open PRs #587 and #548 remain unmerged |
| C10 | Encrypted merchant reconciliation ledger | Implemented and integrated | `apps/web/src/lib/reconciliationVault.ts` | main; PR #635 (P1-LATE late-payment reconciliation, open, ready); PR #575 (partial and on-time credit across rescans, draft) | FA: Chromium two-tab CAS, race and reorg check (081b76b0) | Late-payment and partial-credit semantics not yet merged (#635, #575) |
| C11 | Settings and device settings transfer | Implemented and integrated | `apps/web/src/views/Settings.tsx`, `apps/web/src/lib/settingsExchange.ts` | main | FA: web 737 pass / 1 skip (081b76b0) | No second physical device test |
| C12 | ERC-6538 public registry | Implemented and integrated | `apps/web/src/features/registry/RegistryView.tsx` | main | FA: web coverage includes registry (081b76b0) | No live target-registry transaction |
| C13 | Localization and accessibility | Partially implemented | `apps/web/src/i18n/context.tsx`, `apps/web/src/i18n/LanguagePicker.tsx`; Settings uses catalogs, other views still hard-coded English (FA examples) | main; PRs #623, #627, #633 (i18n fixes, drafts); PR #583 (responsive Pages, draft); PR #588 (mobile qualification, draft) | FA: Playwright keyboard, colour-scheme and mobile-width checks (081b76b0) | Native-speaker review, assistive-technology review, WCAG acceptance unrun |
| C14 | Bitcoin Silent Payments | Experimental | `packages/btc-silent-payments/src/index.ts`; `apps/web/src/features/btc/BtcView.tsx` (test network only) | main | FA: 353 tests / 21 files (later all-required log, 081b76b0) | Test-network only. No hardware-wallet or live-chain acceptance |
| C15 | Solana chain support | Experimental | `packages/solana-stealth/src/tx.ts`, `packages/solana-stealth/src/rpc.ts` | main | FA: chain-solana 97 tests / 10 files (081b76b0) | RPC mocked. No validator or deployment acceptance |
| C16 | Tron chain support | Experimental | `packages/tron-adapter/src/tx.ts`, `packages/tron-adapter/src/rpc.ts` | main | FA: chain-tron 42 tests / 4 files (081b76b0) | No live network or app integration test |
| C17 | App security, manifest and release engineering | Implemented and integrated | `apps/web/src/lib/manifest.ts` (fails closed); used by `apps/web/src/views/Pay.tsx` and `Sweep.tsx` | main | FA: typecheck, lint, build and secret/action-pin checks passed (081b76b0) | Release-signing trust root and independent review not evidenced |
| C18 | Deployment, testnet operations, public launch | Blocked | `deployments/` holds no qualified manifest (README); `docs/operators/testnet-runbook.md` | main | none recorded for public launch | Funded deployer key, real-wallet and device runs, release key, audit, hosting decision (COMPLETION_PLAN Phases 6 and 7) |

Note: the 7 chains enabled in `packages/chain-adapters/src/config/chains.ts` are all `testnet: true`. Confirmed on main.

## B. Post-launch and optional rows (roadmap Features 1 to 6, FEATURE-ASSESSMENT optional rows)

| ID | Item (tracker name) | Status | Implementation evidence | Branch | Test evidence | Remaining work |
|---|---|---|---|---|---|---|
| P1 | Feature 1: gas-sponsoring checkout (in-flight gas buffer) | Partially implemented | Roadmap annotation (2026-10-21): built at reduced scope; `packages/contracts/src/GhostPayRouter.sol`; `apps/web/src/lib/pay.ts` | main | none recorded beyond C3 | Invoice-level buffer policy, fiat estimate, permit plus buffer; fee-router and token audit gate |
| P2 | Feature 2: embeddable "Pay with GhostPay" | Partially implemented | `apps/web/public/ghostpay-embed-v1.js` (header: popup only, no iframe, no postMessage) | main | FA: Playwright popup same-origin and refusal flow in its 17-test suite | Signed merchant profile, postMessage completion, iframe mode, real merchant integration |
| P3 | Feature 3: encrypted milestone escrow (GhostMilestones) | Specification-only | `docs/specs/17-milestone-escrow.md`; `scripts/experimental/milestone-escrow/model.mjs` (a model script, not product code) | main | none recorded (model test file exists, not run) | No contract, package or app route on main. Custody and legal decisions open |
| P4 | Feature 4: encrypted local client tags, key rotation (also spec 08) | Partially implemented | `apps/web/src/lib/tags.ts` (key-generation field on records); `apps/web/src/lib/tagArchive.ts`; `apps/web/src/components/TagArchive.tsx` (wired from `apps/web/src/components/BackupPanel.tsx`) | main | FA: Playwright ciphertext-only tag storage; no archive or rotation acceptance test recorded | CONFLICT with tracker text (see Conflicts). Archive round-trip and rotation acceptance tests still needed |
| P5a | Feature 5 stage 1: Tor-routed light indexer, client match checking | Specification-only | Roadmap annotation: not built. App scan uses the user's RPC (`apps/web/src/views/Scan.tsx`) | main | none recorded | Indexer client, padding, Tor route |
| P5b | Feature 5 stage 2: two-server PIR over fixed-size pages | Experimental | `packages/pir-two-server/README.md` (prototype package) | main | FA: pool-circuits 77 tests (081b76b0); PIR package not separately recorded | Not product-wired. No reviewed protocol |
| P5c | Feature 5 stage 3: research-only private matching | Specification-only | Roadmap section 5A stage 3 (research) | main | none recorded | Research only |
| P6 | Feature 6: announcement jitter and timing UX | Partially implemented | `apps/web/src/lib/jitter.ts`; delay UI in `apps/web/src/views/Pay.tsx` (discloses no anonymity gain) | main; PR #515 (expiry rollback qualification, draft, stacked on #274) | FA: web 737 pass / 1 skip covers scheduling (081b76b0) | Spam telemetry not built (FA partial). Anonymity claims not permitted |
| P7 | Policy accounts and EIP-7702 path (specs 15 and 16) | Experimental | `packages/policy-scheme/`; `apps/web/src/features/policy/*`; `apps/web/src/App.tsx` routes `policy` only when `VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1` (default off) | main; PRs #541 and #528 (policy locks, drafts) | FA: policy-scheme 60 tests; forge 411 includes policy contracts (081b76b0) | EIP-7702 path and recovery unimplemented. CONFLICT with FA text (see Conflicts) |
| P8 | Fiat pricing, feeds, expanded chain and token matrix (specs 03 and 09) | Partially implemented | `apps/web/src/lib/pay.ts` (quote interface, fails closed); `packages/chain-adapters/src/quote.ts` `FEEDS` table has entries (Sepolia ETH/USD at line 52) | main; PR #592 (spec 03 feed qualification, draft); PR #566 (F13 offline quote terms, draft) | FA: web 737 pass / 1 skip (081b76b0); no live feed freshness or accuracy run | CONFLICT with FA text (see Conflicts). Feed verification and token-list provenance still open. #592 unmerged |
| P9 | Passphrase protection (COMPLETION_PLAN 2a) | Partially implemented | Passphrase invoice envelope in `packages/invoice-schema/src/envelope.ts`; passphrase prompt in Pay (FA); Sweep checks vault passphrase (FA); lock timeout setting in `apps/web/src/views/Settings.tsx` | main; PR #577 (sole-signer recovery after idle, draft) | FA: Playwright passphrase-vault reload and wrong-passphrase flow (081b76b0) | Tracker's "spending gate" and idle auto-lock scope not verified against source |

## C. COMPLETION_PLAN phase items

| ID | Item (tracker name) | Status | Implementation evidence | Branch | Test evidence | Remaining work |
|---|---|---|---|---|---|---|
| K1 | Phase 0: stabilise in-flight work | Partially implemented | CONSOLIDATION_STATUS: migration complete 2026-10-22, main promoted by PR #20 (merge `5795857d`, present in clone) | main | CI run `39768643775` recorded 2026-10-22 (historical, not re-queried) | Uncancelled green run on one commit not re-checked. Open PR check states not queried |
| K2 | Phase 1: security work (P0 verification, P1 items) | Partially implemented | Sub-items not individually checked. CONSOLIDATION_STATUS cites an AI audit on draft PR #37 (not in the open list, state not verified) | main; open PRs such as #468 (Mythril evidence summary, draft) | none recorded in sources read | Each P0 and P1 item (PayJoin, paymaster, relayer caps, Solana memo, release chain, TRON protobuf). External audit is a human gate |
| K3 | Phase 2b: QR everywhere (per-screen wiring) | Partially implemented | Same as C8 | main | Same as C8 | Per-screen wiring list and physical scanning |
| K4 | Phase 2c: receipts, bills, printing, invoice matching | Partially implemented | Printing merged `0d3d804b`; receipts as C9; late-payment matching in PR #635 (open) | main; PR #635 (open, ready) | none recorded beyond C9 | CONFLICT: tracker says "Not built" (see Conflicts). Matching not yet merged |
| K5 | Phase 3: mobile, accessibility, translations | Partially implemented | Same as C13 | main; PRs #583, #588, #623, #627, #633 (drafts) | FA Playwright mobile width (081b76b0) | Responsive base on every screen, WCAG pass, machine-translation review, native review |
| K6 | Phase 4: multi-chain completion | Partially implemented | 7 testnets enabled, mainnets disabled (`chains.ts`); Solana, Tron, BTC as C14 to C16 | main | per C14 to C16 | Token and feed verification from issuers, Solana fee-payer sponsor, ERC-4337 path, Tron ADR-0019 |
| K7 | Phase 5: adopt reusable open-source code | Specification-only | `docs/research/reuse/milestone-escrow.md` (research notes) | main | none recorded | Per-module adoption and provenance not checked |
| K8 | Phase 6: testnet readiness | Blocked | `deployments/` has no qualified manifest (README) | main | none recorded | Funded throwaway deployer key (H), testnet deploys, real-wallet and phone runs (H), relayer against a real provider |
| K9 | Phase 7: launch gates | Blocked | COMPLETION_PLAN Phase 7 list; README "No real money" | main | none recorded | Independent audit, release-key ceremony, dedicated hosting origin, licence and legal review, capped first launch |

## Conflicts

1. **COMPLETION_PLAN 2c says "Not built."** Source on main has receipts (`apps/web/src/lib/receipts.ts`, `apps/web/src/components/ReceiptPanel.tsx`) and merged receipt and bill printing (`0d3d804b`). The tracker is stale. Matching remains open (PR #635).
2. **Roadmap Feature 4 annotation (2026-10-21) and FA say tag export and key rotation are absent.** Source has `apps/web/src/lib/tagArchive.ts`, `apps/web/src/components/TagArchive.tsx` (used by `BackupPanel.tsx`) and a key-generation field on tag records (`apps/web/src/lib/tags.ts`). Tracker and assessment are outdated for P4.
3. **FA says policy accounts have "No product integration; app routes absent" (snapshot `87285f34`).** Main has `apps/web/src/features/policy/*` routed by `App.tsx` behind `VITE_GHOSTPAY_EXPERIMENTAL_POLICY`, default off. Status is Experimental, not unwired.
4. **FA says "No usable verified feed inventory; Create disables fiat quotes when FEEDS is empty" (cites `CreateInvoice.tsx:12-14`).** The cited path has no `FEEDS` reference on main. `FEEDS` is defined in `packages/chain-adapters/src/quote.ts` and contains at least one entry (Sepolia ETH/USD). Whether that entry is verified was not checked.
5. **README Status says active scope is static Pages only and non-Pages work is "paused".** Open PRs include non-Pages work (e.g. #638 POS terminal lifecycle, #622 P0-KEYS export and recovery, #635 P1-LATE reconciliation, #617 and #616 multi-package integrations). The README and the open-PR set disagree about scope.
6. **README cites PRs #137, #138, #141, #142, #143, #144, #145, #150 and #135 as the current Pages drafts.** None appears in the 92 open PRs (open numbers run 455 to 638). None appears in `origin/main` history (grep returned no matches). Their state is unverified. Treat README claims about them as unverified.
7. **MASTER_BLUEPRINT header says "Concept and architecture baseline. No production protocol or security guarantees are implemented yet."** This is a 2026-10-21 statement. The core stealth, invoice, scan, sweep and relayer paths now exist on main. Outdated, not a current status.
8. **FA launch-gate and implementation scores** are explicitly not carried forward here. No conflict with source was found in the rows checked, other than items 3 and 4.

## Duplicates

- **Milestone escrow:** roadmap Feature 3 = COMPLETION_PLAN Phase 4 "milestone escrow (Feature 3)" = FA "Milestone escrow (roadmap 3/spec 17)" = P3.
- **Light indexer, PIR, blinded scanning:** roadmap Feature 5 = COMPLETION_PLAN Phase 4 "light indexer/PIR (Feature 5)" = FA "Blinded scanning, light indexing, PIR (roadmap 5/spec 10/12)" = P5a to P5c.
- **Encrypted client tags:** roadmap Feature 4 = FA "Encrypted client tags and key rotation (roadmap 4/spec 08)" = P4.
- **Fiat and feeds:** COMPLETION_PLAN Phase 4 "Tokens and feeds" = FA "Fiat pricing, feeds (specs 03/09)" = P8.
- **Gas buffer:** roadmap Feature 1 = FA "EVM checkout, fees and gas buffer" (C3). Two rows for one feature; P1 and C3 are kept separate here.
- **QR:** COMPLETION_PLAN 2b = FA "QR display, device exchange and camera import" = C8 = K3.
- **Receipts:** COMPLETION_PLAN 2c = FA "Receipts and payer receipt import" = C9 = K4.
- **Passphrase:** COMPLETION_PLAN 2a (P9) overlaps FA "Invoice create/open, signature, encryption" (C2) on the passphrase envelope.
- **Localization and mobile:** COMPLETION_PLAN Phase 3 = FA "Localization and accessibility" = C13 = K5.
- **Relayer hardening:** COMPLETION_PLAN Phase 1 (P1 relayer items) overlaps FA relayer row (C6) and Phase 4.
- **Consolidation:** `docs/CONSOLIDATION_STATUS.md` and `docs/CONSOLIDATION_PROGRESS.md` state the same migration result (PR #20, merge `5795857d`, 2026-10-22) in duplicate.
- **ID namespace collision:** roadmap "Feature 4" (tags) and PR titles with "F04" (merchant dashboard: #579, #535, #460) use the same short ID for different items. Roadmap "Feature 1" and FA "Feature 1 v2" also differ in scope.

## Outdated references

- **`docs/ai/HANDOFF.md`** is an unfilled template ("TO BE VERIFIED", "None claimed"). CLAUDE.md tells agents to read "the latest handoff". The real handoff is `docs/HANDOFF.md` (exists); the link in CLAUDE.md should be checked.
- **`docs/COMPLETION_PLAN.md`** was written 2026-10-22 against commit `3519171` (exists in clone). Its Phase 0 "three workflows still editing the tree" and its CI-red statements are stale. Its "~80% build / ~50% launch-ready" figures are author estimates that FA says it does not adopt.
- **`docs/MASTER_BLUEPRINT.md`** status header and "Phase 0 to 4" plan date from 2026-10-21 and are superseded (see Conflicts 7).
- **`docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`** implementation annotation (2026-10-21) is stale for Feature 4 (see Conflicts 2).
- **`docs/FEATURE-ASSESSMENT-2026-10-23.md`** is pinned to snapshot `87285f34706e31e622e99c9e08e7b2f5139d6b8d`. That full SHA is not in this clone (`git cat-file` fails). Source line references have drifted (Conflicts 3 and 4). Its test logs cite `/workspace/ghostpay-*.log`, which are outside the repository and cannot be re-read here.
- **README "Status"** is dated 2026-11-14 and cites PRs #137 to #150 (Conflicts 5 and 6). Its "most recent fully qualified staged candidate" (#145) cannot be confirmed here.
- **`docs/CONSOLIDATION_STATUS.md`** and **`docs/CONSOLIDATION_PROGRESS.md`** state "COMPLETE" as of 2026-10-22. The tests count (630) is older than the FA count (737). Both are historical.

## Items you could not verify and why

- **CI and check status for any open PR:** bodies and check runs were not requested (per instructions). Draft and ready state is from the PR list only.
- **State of PRs #137 to #150 cited by README:** not in the open list, not in main history. Closed or merged state was not queried.
- **Test results:** none were re-run. FA results are at commit `081b76b0` (present in clone), with logs in `/workspace/` (absent from repository). Recorded results are cited, not confirmed.
- **FA snapshot `87285f34`:** not present in this clone, so FA's own claims at that snapshot cannot be re-derived.
- **`docs/audits/` contents** (including audit 08 and audit 24): not read. Gate text is cited only through trackers.
- **`docs/ai/ACTIVE_WORK.md`:** 3,174 lines with 94 headings. Listed only, per instructions. Ownership entries exist and are not reconciled. Commit `d4288414` on this branch adds 8 lines.
- **COMPLETION_PLAN P0 and P1 sub-items** (PayJoin trust, paymaster caps, Solana memo, release-chain pins, TRON protobuf): not checked one by one.
- **Feature 1 "permit plus buffer" absence and Feature 2 iframe absence:** taken from roadmap annotation and the embed header comment. Not confirmed by search.
- **Phase 5 adoption:** only the research note was checked.
- **P8 feed verification:** whether the Sepolia ETH/USD entry is verified against its source was not checked.
- **Mainnet entries in `chains.ts`:** only the seven enabled entries were checked. The disabled entries were not enumerated.

## Engineering defects noticed (for the engineering worker)

1. `docs/ai/HANDOFF.md` is a template, yet CLAUDE.md directs agents to the "latest handoff". Agents will read no state from it. Point the entry at the real handoff or fill the template.
2. Two trackers (`CONSOLIDATION_STATUS.md`, `CONSOLIDATION_PROGRESS.md`) repeat the same content. Keep one.
3. Short-ID collision: roadmap "Feature 4" and PR labels "F04". Rename one namespace.
4. Tracker and assessment claims about tags (P4), policy integration (P7), feed inventory (P8) and receipts (K4) are stale against source. Each should be re-pinned to a current commit.
5. README points readers to PR numbers (#137 to #150) that are not in the open set, and describes a Pages-only scope while non-Pages PRs are open. Either update the README to the current PR set or mark those references as historical.
6. FA cites source line numbers and `/workspace/` logs. Neither is reproducible from the repository. Replace with commit-pinned paths and in-repo logs.
7. `docs/ai/ACTIVE_WORK.md` at 3,174 lines is hard to use as a live tracker. It should be split or archived.

## Model identity

This worker's system context names the model as Haiku 5.5 (`claude-haiku-5-5`). I cannot independently verify that identity from inside this session; I am relying on the system context.
