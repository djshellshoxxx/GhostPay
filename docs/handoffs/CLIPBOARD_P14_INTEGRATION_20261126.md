# Clipboard and P14 integration handoff — 2026-11-26

Status: local composition, focused qualification and independent AI source review complete. Publication, fresh hosted CI, final review and the integration lock remain with the lead coordinator. No remote branch was changed by this delegate.

## Source pins

| Role | Exact commit |
| --- | --- |
| Published #685 base | `db544fa5e2e28129d6e8e53bb293d72dc08b8c02` |
| Coordinator claim before integration | `2cd4b426b3693658cda3094e2d5c9f660aadec07` |
| #668 delivered W4 clipboard source | `74e0c61dd0edddc7bcbc1a963d7f4e2481cdcda1` |
| #658 P14 evidence source | `9aed3886693270524beb118685e5947469899c43` |
| Qualified composed source | `222d0708d4a05fb94e4b7b94f14e0811a1ad9b76` |
| Qualified source tree | `1ce5d98a9b977982ea01e31d09eca519db85e320` |

Branch: `finish/clipboard-p14-20261126`. Both donors were merged normally with their ancestry intact; #553 and #580 are also ancestors through #668. The claim and this handoff are additive coordinator records. The handoff commit changes documentation only after the qualified source above.

## Scope and ownership

[W4's handoff](W4_CLIPBOARD_MAIN_20261125.md) says the clipboard implementation is delivered to W1 and no integration lock was taken. Its next privacy-minimal-invoice continuation remains separate. The current owner instruction permits completion of shared-core clipboard privacy, and current repository instructions reserve integration for the lead worker; no human-only approval gate was found. This branch follows the lead's explicit integration delegation and leaves original worker branches untouched.

[W1's review of #658](https://github.com/djshellshoxxx/GhostPay/pull/658#pullrequestreview-6056792786) approved its scope and source, subject to the then-held generation-25 integration lock and refreshed checks. That historical lock is not a continuing ownership claim. A new lock and current remote-state check are still required for any final integration.

W4 minimal invoices, W5's active `verification/independent-beta/**` work, excluded products, dependency versions, workflows and #685's privacy-profile choices are unchanged. Current `AGENTS.md`, `CLAUDE.md` and the stop-work directive remain byte-identical to the base.

## Reconciliation

- #668 conflicted only in `docs/ai/ACTIVE_WORK.md` and `docs/handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md`; #658 conflicted only in the registry. Both sides' complete line sequences were retained in order, with no dropped source records.
- All production and test files merged automatically. The 40 uncontested donor paths are byte-identical to their source blobs. The composed source has exactly the 52-path union expected above the base.
- The 12 overlapping paths are the four catalogs, AppShell, Common and its test, security-key classification, CreateInvoice, Settings, and the two coordination documents. They retain the current wallet disclosure provider, settings revision guard, neutral download names and fixed errors, invoice retention and address-reuse notices, and Settings retention and scan-privacy behavior.
- Each catalog retains all 2,491 base message keys, adds ten clipboard keys, and changes only the two intended backup-copy messages (`btc.seed.copyWarning`, `btc.seed.copied`). The latest payer-export warnings and every other base value survive.
- Clipboard cleanup remains default-off for ordinary copies. Existing backup Hide/Lock/leave checks remain active, with checked clearing and an explicit fallback notice. The documented limits of separate browser read/write operations, clipboard history and synced copies remain.
- P14 adds a pure descriptive evidence export and synthetic test instrumentation. No application module imports the instrumentation. Inclusion and interval completeness remain unverified; this change does not alter scan behavior, repair the pre-existing F1–F4 findings, or claim anonymity or an audit.

## Executed qualification

All checks below used the qualified source pin above. Installation used an independent `npm ci --offline --ignore-scripts --no-audit --no-fund` (722 packages; exit 0), with no dependency or lockfile edit.

| Check | Result |
| --- | --- |
| Focused web command below | 10 files, 170 tests passed; exit 0 |
| Deterministic evidence command below | 11 passed; four randomized property tests deliberately unrun; exit 0 |
| Web and scan-source TypeScript checks | Both passed |
| `npm run lint -w @ghostpay/web -w @ghostpay/scan-source` | Passed; exit 0 |
| `node scripts/i18n/check.mjs` | Four catalogs, zero errors, 808 untranslated/draft warnings; exit 0 |
| `bash scripts/scan-secrets.sh` | Passed; exit 0 |
| `git diff --check db544fa5e2e28129d6e8e53bb293d72dc08b8c02 HEAD` | Passed |

From `apps/web`:

```sh
npx vitest run src/lib/clipboardPrivacy.test.ts src/components/SensitiveClipboard.test.tsx src/components/SecretBackup.test.tsx src/components/SecretBackup.views.test.tsx src/components/Common.test.tsx src/lib/settings.test.ts src/lib/settingsExchange.test.ts src/i18n/securityKeys.test.ts src/components/SharedComponents.i18n.test.tsx src/test/rpcDisclosure.test.ts --coverage=false
```

From `packages/scan-source`:

```sh
npx vitest run src/evidence.test.ts --coverage=false -t 'describeScanEvidence table|intervalCompleteness is never verified|is pure'
```

The affected-check command built its 17 selected prerequisite libraries. Its first TypeScript run exposed an environment gap: web e2e source imports an unchanged relayer module, whose `@ghostpay/relayer-guard` declarations were not in that build selection. Scan-source typecheck passed in that run. After `npm run build -w @ghostpay/relayer-guard`, `npm run typecheck -w @ghostpay/web` passed. Lint then passed for both affected workspaces. No source fix was needed.

Independent reviewer `help_review` approved source/composition at the exact source/tree above after checking the donor blobs, all overlapping controls, locale values, line-preserving record union, #685 preservation and whitespace. This is an AI source review, not an audit or a new hosted qualification.

## Remaining gates and limits

The full suite, browser runs, fuzz/property campaigns, mutation testing and security-reproduction cases were not run in this bounded local qualification. Existing donor tests and research were preserved unchanged. The two expected-failure checkpoint cases and documented P14 findings remain owner follow-ups; no scan-runtime repair is included.

Root should publish the reviewed candidate, qualify its exact head on hosted CI, recheck live donor/base heads and ownership, and integrate through the shared lock. Any later request-file/camera completion is a separately owned continuation and needs its own evidence. No local source blocker was found for this delivered clipboard/P14 slice.
