# GitHub Pages beta: continuation run 2026-11-14

Branch `claude/vigilant-johnson-yjgq94`, started from the PR #145 head `c483fcad` (= #137 `ac08062` + #143 + #144 + #145, which contain #135 and #121). Draft PR targets `chatgpt/zero-codex/pages-reconciliation-idb-retry-20261113` (the #145 branch) so the diff shows only this run's work. Nothing was deployed; no real-funds path was enabled.

## Frontier used

| Candidate | Why not |
|---|---|
| `main` `bd2652bf` | docs only; no implementation |
| #98 / #121 / #135 | contained in #137's stack |
| #137 `ac08062` (owner Pages branch) | contained in #143–#145; #141/#142/#138 code is already in #145's history |
| **#145 `c483fcad`** | most advanced; every open Pages PR except docs-only #139/#140/#146 is an ancestor |

Open docs-only Pages PRs (#139 audit rotation, #140 wiki, #146 ancestry) stay separate; they are other workers' ledgers.

## Features

| Feature | Start | End | Tests |
|---|---|---|---|
| A. Encrypted backup and recovery (GP-PAGES-02) | Download counted as a verified backup; no verification step; restore in a fresh profile already covered by `pages-devnet.spec.ts` f | **Done.** Download = unverified copy (gate lifts; banner, checklist, wipe and unlock confirmations say "not verified"). "Verify backup" decrypts the downloaded file, compares meta-address, signer, spending and viewing keys, loads nothing, wipes every secret, refuses abort and key changes. Only an exact match makes the keys recoverable (`loadedKeysRecoverable`, wipe without confirmation, unlock-replace). `signerOnly` unchanged (C-R10). en/es/ja/ar texts, classified in `securityKeys.ts` | `session.test.ts` (+4), `keyVault.test.ts`, `SellerKeys.test.tsx` (+2, 1 extended), `BackupPanel.test.tsx`, `App.test.tsx` (+1); e2e `backup-panel.spec.ts`, `core-journey.spec.ts`, `pages-devnet.spec.ts` (real chain: damaged copy, wrong passphrase, exact file) |
| A'. Sleep-aware idle lock (GP-PAGES-04) | One `setTimeout`; device sleep delayed the lock | **Done.** Wall-clock deadline on `visibilitychange`, `focus`, `pageshow`, 20 s interval, first activity after the deadline; one lock per idle period; cleanup on unmount and timeout change | `App.test.tsx` (+2) |
| B. QR and cross-device exchange | Complete in #117/#121: classifier, multipart (order, duplicates, mixed sessions, integrity, expiry), camera lifecycle, image limits, fuzz | **No change needed**; existing suites cover every listed requirement | existing `CameraImporter*.test.tsx`, `qr-exchange` suites, `qr-camera*.spec.ts` |
| C. Payment reliability | Covered by `payExec.test.ts` (60+), `Pay.test.tsx` (70+), `transactionOutcome.test.ts`: rejection, duplicates, pending/unknown, replaced phase, wrong chain, mutated wallet tx, RPC failures fail closed, reload during pending | **No new defect confirmed**; not changed | existing |
| D. IndexedDB resilience | #145 fixed failed/blocked opens for reconciliation only; the seller key vault cached a failed open forever and ignored `versionchange`; neither store survived a browser-closed connection; quota errors were generic | **Done.** Both stores: retry after failed/blocked open, late blocked success closed, `versionchange`/`close` drop the connection, `InvalidStateError` retries once on a fresh open, `QuotaExceededError` named ("storage is full", nothing written). CAS and session guards unchanged | `keyVault.idb.test.ts` (new, 5), `reconciliationVault.idb.test.ts` (+3), fake in `src/test/fakeIndexedDb.ts` |
| E. Fee manifest and payment configuration | #144 fail-closed on rejected lookup; `useManifest` guards stale chain; deployment read back on-chain before payments | **No new defect confirmed**; not changed | existing `manifest.test.ts`, `Pay.test.tsx` ("payments disabled on a chain with no manifest") |
| F. Scanning and receipts | Covered by #114/#119/#121 (F1/F1b/F2, 450 chain-adapter tests, scan client reorg tests) | Not worked in this run | existing |
| G. Browser security and transaction review | Audits 17–27 on the stack | Not worked in this run | existing |
| H. Pages build and release verification | #137–#145 verifier, smoke, acceptance | **Re-qualified locally** on this head (see below); no code change | `scripts/pages/*.test.mjs`, Pages devnet acceptance |

## Local qualification on this head

Recorded in the PR description with exact commands and counts: web typecheck and lint, `scripts/i18n/check.mjs` (0 errors), web unit suite with coverage and Anvil, `node --test scripts/pages scripts/tests scripts/testnet scripts/regtest` (176 tests, 0 failed), `BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh` (15 passed), lean e2e, release-mode `build-pages.sh` + `verify-pages-site.mjs` + `smoke.mjs`.

## Incorporated or superseded PRs

None merged or closed by this run. Superseded by content: nothing (this run adds to #145; it supersedes no open PR). The GP-PAGES-02/04 lane that `GITHUB_PAGES_CONTINUATION_PROMPT.md` T1 describes is implemented here.

## Blockers (owner)

Unchanged from `GITHUB_PAGES_RELEASE_2026-11-12.md`: ADR-0029 decision; dedicated serving origin (GP-PAGES-01); Pages source/environment settings and the merge of the stack to `main`; authorized testnet deployment, release-signed manifest and `GHOSTPAY_RELEASE_PUBKEYS`; SonarCloud issue export; independent security review; real wallets and devices.

## Unfinished, by priority

1. Review and integrate this branch into the Pages stack (#145 → #144 → #143 → #137), then exact-head hosted CI.
2. Feature F: a real-Anvil browser test for a replaced (same-nonce) payment transaction and for scan resumption after a full browser restart; both currently covered by unit and mocked suites only.
3. Feature G: a read-only review of `Pay.tsx` address-safety and `errors.ts` redaction against the new texts (no defect known).
4. Translations of the new en texts in es/ja/ar are machine-drafted (catalog status unchanged) and need native review like the rest.

## Next autonomous execution

Start from this branch head. Run the hosted workflows on it, fix only root causes, then take item 2 above with `BROWSER_DEVNET_MODE=pages` (anvil `evm_setAutomine`/`anvil_dropTransaction` for the replacement case). Do not touch #139/#140/#146 or `CHATGPT_ZERO_CODEX_LATEST.md`.
