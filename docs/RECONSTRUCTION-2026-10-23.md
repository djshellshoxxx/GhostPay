# Local reconstruction: 2026-10-23

This is expressly authorized reconstruction from the current remote baseline. Missing commits
`b9ac0c24bea625d69ed2857460da29b7edd3ba27` and `6b698af62278aef802f58699f8f99bf68b87aaae`
are not recovered or represented by the new changes. Earlier test claims do not count as fresh evidence.

## Verified starting state

- Repository: `djshellshoxxx/GhostPay`; clean saved checkout initially on local `work`.
- Read-only GitHub repository, branches and open-PR queries, plus `git ls-remote` and fetch on 2026-10-23:
  main remains `dbee6786c5adf97e014318f55da4dfdbc1565cfc`; no open PRs.
- Main's direct parent is PR24 merge `ca30bf821f412f0af50b2725722b0e968e6fed12`.
  Implementation `bb011134c1bf9cd0e75090fec75d85235d637281` and PR20 integration
  `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` are ancestors of main.
- All fetched source/doc branches have zero commits unique to them relative to main.
  Published `gh-pages` and prototype `claude/pages-site-1` are provenance, not integration inputs.
- Local integration branch: `integration/reconstruction-2026-10-23`, created from verified `origin/main`.
- No `AGENTS.md` in the checkout, `/workspace`, or `/` at start. Read specification index,
  scanner/payment spec 02, registry spec 06, encrypted archive spec 08, private scanning spec 10,
  relevant backup/receipt ideas, developer invariants, specification corrections, completion plan and handoff.
  Historical handoff branch and completion percentages are stale; they are not current acceptance evidence.

## Requirement-to-evidence ledger

| Requirement | Baseline evidence / gap | Work and fresh evidence |
|---|---|---|
| Encrypted reconciliation; bounded CAS; seller/chain/session binding | `lib/reconciliationLedger.ts` uses plaintext localStorage read/replace; no equivalent vault | Vault worker: new encrypted IndexedDB vault and component integration; pending review/tests |
| Preserve legacy data as untrusted read/export/delete | Existing UI writes and labels scan history | Vault worker: retire plaintext writes; pending tests |
| Encrypted backup preview/activation; persistent reorg invalidation | No encrypted ledger backup or durable tombstone | Vault worker + awaited scan reorg callback; pending tests |
| Receipt/public-meta strict bounds and consent | Existing receipt parsing and importer need recheck | QR and payment workers coordinate; pending evidence |
| Allowlisted nonsecret settings preview/apply | Existing settings QR scope needs verification | QR worker: strict exchange schema; pending tests |
| Real scrypt/AES-GCM keystore transfer; strict encrypted/decrypted metadata | Keystore accepts extra fields; metadata consistency validation absent | QR worker: tests first; pending evidence |
| Camera/decrypt lifecycle; four actual catalogs | Importer/keystore lifetimes and locale coverage need recheck | QR worker: camera/session guards and catalog evidence; pending tests |
| Wallet authority across awaits | Existing wallet/pay/registry paths need final boundary recheck | Payment worker: synchronous pre-send authority guards; pending tests |
| Tab-scoped bounded journal, hashes retained, unknown outcomes persistent | Existing duplicate handling needs reconstruction | Payment worker: journal before submission and explicit clear; pending tests |
| Scanner lifetimes, full owner/address derivation, ERC20/direct-router proof binding | Existing scan cancellation only flips flag; constructor failure can bypass wipe | Scanner worker: scan libraries and chain-adapter payment verifier; pending tests |
| Sanitized typed failures, unsupported indirect proofs unverified | Existing paths need defensive review | Scanner/payment workers; pending evidence |
| Acceptance and preservation | No fresh tests yet; no publication authorized | Integrator: freeze, inspect diff, broad checks, local commits, handoff and full-history bundle |

## Ordered implementation plan

**Goal:** rebuild the specified safeguards in testable local increments without claiming launch completion.
**Architecture:** reuse existing crypto, payment verifier, session and QR components. Add narrow persistence
and journal modules; keep proof authority at existing verified chain and wallet boundaries.
**Tech stack:** npm workspaces, TypeScript, React, Web Crypto, IndexedDB, Vitest, Playwright, viem.

Global constraints: no real funds or live transactions, no production deployment, no external scans, no
new credentials or paid infrastructure. No pushes, PR mutations or release publication. Preserve OSS notices.
Do not reduce coverage thresholds or skip failures. Browser mocks do not establish device/audit acceptance.

Review focus: stale callbacks after scope changes; malformed/oversized data before expensive work; ambiguous
wallet outcomes; reorg evidence revived by backup; apparent proofs lacking exact chain/transaction binding.

1. [x] Verify remote state and ancestry, preserve checkout, create local integration branch.
2. [ ] Observe failing regressions, then implement disjoint thin slices with four workers and one integrator.
   - Vault: `reconciliationVault`, legacy ledger, ledger component and Scan view.
   - QR: CameraImporter, keystore/session, SellerKeys, Settings, exchange parsing and four catalogs.
   - Wallet: Pay/payExec/wallet/txGuard, registry feature and duplicate-attempt journal.
   - Scanner: scanner core/client/worker and chain-adapters payment verifier.
3. [ ] Integrator inspects each diff and targeted evidence; commit verified tranches locally with handoff notes.
4. [ ] Freeze source edits. Run library builds, workspace typecheck/lint/tests with existing thresholds,
   web build/bundle scan, local browser tests and defensive secret/action checks. Report every failure and
   unavailable capability. Fix only understood failures; repeat affected checks after changes.
5. [ ] Review the final frozen delta for security and functional regressions. Retain external acceptance gates.
6. [ ] Record exact branch/HEAD, commands, results, unresolved failures and next task in a handoff;
   create/verify complete-history bundle and SHA-256 manifest. Parent arranges authorized durable persistence.

## Execution notes

- Exactly four implementation workers plus this integrator in one active environment. Source ownership
  is disjoint; only the integrator commits. Broad tests wait for a source freeze.
- Node `v24.19.0`, npm `11.9.0`, Git and system Chromium are available. Foundry/anvil/solc are not on PATH.
- Initial `npm ci --ignore-scripts` failed because its default cache `/home/agent/.npm/_cacache`
  cannot be created. Retrying with a writable `/workspace/.npm-cache`; lockfile and integrity unchanged.
- The parent owns the continuation check for this same task, now every 30 minutes per the later user instruction.
  No extra environment task, migration or saved-setup deletion is authorized or needed.
- Later user steering assigns two existing workers to `/workspace/p2p-offramp` and two to GhostPay, with this
  shared integrator. QR/scanner workers finished their GhostPay slices and froze writes before transitioning.
- Separate recovery inspection of the other saved GhostPay setup found all 2,929 tracked files identical to
  remote main and no unique unfinished source. No recovery branch or upload was created. Reconstruction continues.

## Verified tranche: QR, settings and keystore

Integrator independently reran the worker's focused command: ten files and 78 tests passed, zero failures.
Command from `apps/web`: `npx vitest run src/views/Settings.test.tsx src/views/SellerKeys.test.tsx
src/lib/keystore.test.ts src/lib/session.test.ts src/lib/keyVault.test.ts src/components/CameraImporter.test.tsx
src/lib/settingsExchange.test.ts src/lib/qrPayload.test.ts src/i18n/catalog.test.ts
src/i18n/settings.integration.test.tsx --maxWorkers=1`.

Changes: duplicate-safe bounded keystore envelopes, decrypted-key/public-metadata consistency, independent
signing scalar, abort-aware session/key-vault import; camera/paste scope, close and disclosure cancellation;
strict public-meta parser; five allowlisted settings with preview and explicit apply. Four actual catalogs
en/es/ja/ar updated; no claim that all registered languages are translated. Broad coverage/browser gates
remain pending. Physical camera, native translation and independent audit acceptance are not established.
