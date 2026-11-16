# Worker C: wallet/privacy web wiring audit

Experimental, unaudited. No deploy, no mainnet, no real funds. Branch `work/c-wallet`. Scope: apps/web/src and the owned packages.

## Findings

| # | Finding | Location | Status | Evidence / test |
|---|---------|----------|--------|-----------------|
| C-1 | Full-screen ("Show larger") QR dialog dropped the kind's `rules.warning` (bearer: "Anyone who sees this code can read the invoice."; secret: no-screenshot; caution). Warning showed only in the inline frame, so it vanished in the mode most likely to be shown to others. | apps/web/src/components/QrFrame.tsx (large dialog, after `largeDescId` paragraph) | FIXED | New `QrFrame.largeWarning.test.tsx` RED (3 failed) before, GREEN after; `src/components/QrFrame*` 32 passed. |

## Checked and wired (no defect found, by reading code)

- Wallet create/import/recovery, keystore export, verify-backup, vault save/unlock/delete, wipe confirmations: views/SellerKeys.tsx, BackupGate, AppShell backup banners. All handlers real, errors surfaced via `fail`, typed secrets cleared on lock and key change.
- Encrypted backup of Solana/TRON/BTC keys: SecretBackup used in the three chain views. Tag/receipt archive: BackupPanel mounted in App.tsx (full profile).
- Bearer-QR warning: CreateInvoice (Notice plus `bearer` frame for key-embedding links), PrintableBill (`bearerWarning` independent of QR length, QR omitted over 500 chars but warning kept), Pay -> PrintBillButton. Only gap was C-1.
- Device pairing (SellerPairing) and settings exchange (Settings): QR kind `device`, export disabled-states each carry an explanation (`nothingSaved`, `includedNothing`). Pairing import is preview-only by design (no apply path); not changed.
- Receipt panel: every disabled control has a matching Notice (keysChanged, verifiedOnly, metadataMissing, hashMissing).
- i18n: no hard-coded English literals found in tsx by grep.
- Silent catches: all remaining empty catches are commented best-effort cleanup (wake lock, worker postMessage, hostile-provider guards).

## Not verified / limits

- `ux-*` packages other than `ux-vault` are not dependencies of apps/web (0 imports). Not treated as a wiring defect without checking the consolidation docs (docs/audits/16, 22).
- Playwright: NOT RUN (no browser run attempted offline).
- Full web suite and package suites not run; only neighbouring tests (PrintableBill, CreateInvoice, SellerPairing, QrFrame*, QrView.i18n, src/i18n: 14 files, 121 passed).
- Review was read-heavy and sampled; Scan.tsx, Settings apply flow, Pay confirmation flow and idbStore persistence were not read line by line.
