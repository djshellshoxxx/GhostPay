# Completion gates

Status at final consolidation (2026-10-22): **source migration, validation, and promotion to `main` are complete; product and release readiness remain incomplete**. Audit 22 records the final candidate, promotion commit, ancestry and clean-tree comparisons, successful uncancelled hosted CI and Integration runs, and the final verification results. Earlier notes below that say candidate CI, full web coverage, browser verification, owner checks, or migration closure are pending have been superseded by that report. Historical security findings remain limited to their stated trigger and evidence; closing a finding does not certify the broader system.

## Current product-code gaps and completed flows

### Implemented in the promoted tree

- **Passphrase-protected invoices and seller vault.** Invoice creation/opening, encrypted IndexedDB key storage, passphrase-gated sweep actions, and idle session lock are implemented and covered by web and browser tests. Audit 22 records the final 17/17 Playwright pass, including passphrase invoices and vault reload/unlock.
- **QR display and limited camera import.** QR display is wired in invoice creation, SellerKeys, BTC and opt-in seller receipt output. Camera/text import is wired in Sweep, BTC and Pay seller receipts. Receipt QR output checks capacity and uses the same strict JSON format accepted by Pay. Seller-key/device exchange, Settings and Registry QR flows remain absent.
- **Seller-signed receipt issuance and Pay-side import.** Scan can issue a signed seller receipt for an eligible verified match. Pay bounds and verifies imported JSON, binds it to the open invoice and available payment facts, and rejects stale async imports. The receipt is a seller-key attestation, not independent proof of payment. Audit 21 records the focused 86/86 security regression pass; audit 22 records the browser, web coverage, and hosted validation results.
- **Local seller reconciliation.** Scan offers an opt-in local ledger for selected verified router-scan observations, scoped to seller keys and chain. It persists across reloads, supports search, scoped export/delete and global disable/erase, and invalidates affected historical entries on detected reorgs. Records are plain text, locally editable and non-authoritative. Optional invoice digest links are manual assertions; no private keys, customer tags, invoice contents or signed receipts are stored. See audit 23 for this subsequent change and its validation boundaries.
- **Settings localization.** The provider and language picker are mounted; catalog-backed Settings strings, English fallback, and document `lang`/`dir` updates work. Other production screens remain English. Existing Spanish, Japanese and Arabic catalogs are machine-drafted and still need native-speaker review.
- **Payment and scan safety.** Audits 20 and 21 record the reviewed fixes for stale payment preparation/import, provider disagreement and checkpoint handling, transaction/log identity, and bounded deep scans. Audit 22 provides final suite and browser results; these scoped closures do not establish independent provider truth or eliminate scan privacy disclosure.

### Confirmed product gaps

1. **Automatic seller reconciliation and receipt archival.** The local ledger provides durable searchable scan observations with manual invoice digest associations. It does not open/validate the associated invoice, automatically reconcile invoices against payments, or archive seller receipts. Those features need explicit privacy and data-lifecycle decisions; a receipt signature alone must never count as payment evidence.
2. **QR/device exchange beyond current screens.** Pay now accepts bounded receipt JSON through camera/text or files, and Scan can show a signed receipt QR. Seller-key/device pairing, Settings and Registry exchange remain unimplemented. These need explicit schemas, sensitivity disclosures and lifecycle handling before camera input is enabled there.
3. **Application-wide localization.** `useI18n` currently covers Settings and its picker; invoice, payment, scan, seller keys, sweep, registry, BTC and shared security disclosures remain English literals. Catalog coverage and native-speaker review are required before claiming those screens localized.
4. **Policy-account/scheme-2 end-to-end path.** The policy package and contracts contain experimental support, but the web app lacks scheme-2 create/pay/withdraw flows and the standard router/scanner remains scheme 1. Keep this functionality experimental until UI, scanner, recovery, vectors, tests, deployment and readback are designed and validated.

These are current code and product-scope gaps, distinct from migration completeness. The completion-plan percentage is an older estimate and is not a current completeness measure.

## Migration and automated-validation gates

**Closed for the promoted source tree.** Audit 22 records candidate `c206655ebfa747b3dd56b1dc9f4e7f16e641a833`, promotion merge `5795857d9e366cc9a4304c6afa9b03365e7c1844`, successful uncancelled CI and Integration runs, zero candidate/worktree and promoted runtime-tree differences, and every authored remote source tip as an ancestor of `main`. Audit 19 and the source inventory/ledger provide path-level dispositions; generated `gh-pages` output and historical `.source` harnesses are not product source or current test evidence.

Audit 22 records the final gates: hosted workspace typecheck, lint, dependency-ordered build and production dependency audit; 630 web tests and web coverage at 92.29% statements / 87.24% branches / 91.45% functions / 95.46% lines; Playwright 17/17; all 29 imported package suites (2,253 tests / 128 files); invoice/core/BTC/chain adapter counts of 626/55/353/332; relayer/guard counts of 248/146; main/pool/payer contract counts of 411/86/108; confidential contract suite 46; EVM, Bitcoin and Solana integration results; local Bitcoin regtest and PayJoin checks; and 13 operator-script tests. The ordinary web suite skips one live-Bitcoin test; audit 22 records its independent real-regtest execution. The stopped duplicate local coverage run is not counted as a pass. Optional upstream research-pool integrations retain explicit contract/circuit fixture gates.

## Security and release gates

Audits 09, 17, 20 and 21 document scoped findings, fixes and regressions. Audit 17 closes the reviewed PayJoin prevout-trust, duplicate Solana memo, bounded paymaster-field, pool relayer gas-grief, scanner availability/checkpoint, post-broadcast duplicate-send and other specific triggers. Audits 20 and 21 close the named scan-evidence and stale payment/receipt races. Audit 22 records final security review and hosted gates. These reviews are extensive automated and AI-assisted checks, not an independent professional audit or a security guarantee.

### Before any real or valuable testnet funds

- [ ] Establish deployer and fee-recipient custody, deploy and verify testnet contracts, publish verified manifests and source, select independent RPC/provider arrangements, and complete an operator rehearsal. Repository tests do not establish these external facts.
- [ ] Supply the production release-signing trust root and real release/deployment evidence. The code checks bundled manifest signatures and reads deployments back on-chain before sensitive use; real production keys, deployments and source verification remain external prerequisites.
- [ ] Complete funded wallet and device workflows against the intended deployments, including supported mobile/browser combinations. Local regression and browser suites do not replace operating with funded keys on target devices.

### Before mainnet or public launch

- [ ] Obtain an independent professional security audit of contracts, cryptography and web code; triage and close its findings. AI-assisted reviews are not a substitute.
- [ ] Complete the real trusted-setup ceremony and verify resulting artifacts before any verifier holds value. Development-ceremony pool artifacts must never secure valuable funds.
- [ ] Address or explicitly accept the remaining provider privacy disclosures: Bitcoin spentness checks reveal matched outpoints to the configured Esplora provider; EVM token and receipt queries can reveal matched recipients/transactions to configured RPC providers. Current UI disclosures do not provide unlinkability. See audit 17.
- [ ] Run and report any release-required tools that are not current evidence. Audit 22 explicitly does not claim Mythril or mutation-testing success; historical outputs are not current results. Apply any applicable tool to the promoted snapshot and document limits.
- [ ] Verify chain, token and feed data from authoritative sources with dated evidence; populate feeds only after verification and keep unready mainnets disabled.
- [ ] Complete human review for accessibility, native-language quality, cross-browser/device behavior, and launch scope/legal decisions.

## Scope boundaries

Solana, Tron, Bitcoin and experimental EVM extensions require their own deployment, privacy and adversarial-use gates. Optional research-pool integrations remain fixture-gated. Signed receipts establish control of a key and consistency of signed fields, not seller identity or independent on-chain payment. A green hosted build or merged source does not satisfy deployment, custody, trusted setup, professional audit or user-device gates.

## Evidence standard

For each future gate, record the promoted commit, relevant implementation and test paths, command and result, skipped or unavailable coverage, and reviewer/owner. Security fixes need regressions for the reported exploit mechanism. Deployment or external gates need verifiable chain, release, audit or accountable sign-off evidence. Do not infer closure from ancestry, merged filenames, partial jobs, or reports against older snapshots.
