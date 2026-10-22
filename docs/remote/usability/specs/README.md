# Usability specs: index and build order

31 specs, one per feature. Package = new workspace `packages/<name>` (logic, storage, formatting; no UI). UI wiring = the only edits to `apps/web`, collected per spec so one session can apply them serially.

## Build order (waves)
Within a wave every package can be built in parallel (disjoint directories). A wave starts when all packages it depends on are merged.

### Wave 0
- **ux-errors** (S, score 4) -> `packages/ux-errors`
- **ux-glossary** (S, score 4) -> `packages/ux-glossary`
- **quick-request** (S, score 4) -> `packages/request-kit`
- **net-status** (S, score 3) -> `packages/net-status`
- **mode-guard** (S, score 3) -> `packages/mode-guard`
- **local-store** (M, score 2.5) -> `packages/local-store`
- **sweep-guide** (M, score 2.5) -> `packages/sweep-guide`
- **share-safe** (M, score 2) -> `packages/share-safe`
- **fiat-display** (M, score 2) -> `packages/fiat-display`
- **pwa-offline** (M, score 2) -> `packages/pwa-shell`
- **a11y-pass** (M, score 2) -> `packages/a11y-kit`
- **embed-snippet** (S, score 3) -> `packages/embed-kit`
- **smart-wallet-compat** (M, score 1.5) -> `packages/wallet-compat`
- **hw-signer** (L, score 0.5) -> `packages/signer-abstraction`

### Wave 1
- **ledger-export** (S, score 4) -> `packages/ledger-export`; needs local-store
- **backup-bundle** (M, score 2.5) -> `packages/backup-bundle`; needs local-store
- **onboarding** (M, score 2.5) -> `packages/onboarding`; needs ux-glossary, net-status
- **pay-reconcile** (M, score 2.5) -> `packages/pay-reconcile`; needs local-store
- **templates** (M, score 2) -> `packages/invoice-templates`; needs local-store
- **search-filter** (S, score 3) -> `packages/ledger-query`; needs local-store
- **contacts** (S, score 3) -> `packages/contacts`; needs local-store
- **notify-local** (M, score 1.5) -> `packages/notify-local`; needs local-store
- **kbd-palette** (S, score 2) -> `packages/command-palette`; needs ux-glossary
- **theme-pack** (S, score 2) -> `packages/theme-pack`; needs a11y-pass
- **i18n** (L, score 1) -> `packages/i18n-core`; needs ux-glossary, ux-errors
- **wallet-connect** (L, score 1) -> `packages/wallet-connect-adapter`; needs mode-guard
- **policy-undo** (L, score 0.5) -> `packages/policy-ui-kit`; needs sweep-guide

### Wave 2
- **receipts** (M, score 2) -> `packages/receipts`; needs local-store, pay-reconcile
- **recurring** (M, score 1.5) -> `packages/recurring-invoices`; needs templates, local-store
- **embed-return** (M, score 1) -> `packages/embed-return`; needs embed-snippet, pay-reconcile
- **profiles** (L, score 0.8) -> `packages/profiles`; needs local-store, backup-bundle

## Flat build order (feature ids)
1. quick-request
2. ux-errors
3. ux-glossary
4. embed-snippet
5. mode-guard
6. net-status
7. local-store
8. sweep-guide
9. a11y-pass
10. fiat-display
11. pwa-offline
12. share-safe
13. smart-wallet-compat
14. hw-signer
15. ledger-export
16. contacts
17. search-filter
18. backup-bundle
19. onboarding
20. pay-reconcile
21. kbd-palette
22. templates
23. theme-pack
24. notify-local
25. i18n
26. wallet-connect
27. policy-undo
28. receipts
29. recurring
30. embed-return
31. profiles

## Parallel packages vs serial UI wiring
- **Packages (parallel):** any two specs in the same wave touch only their own `packages/<name>`. Root `package.json` workspaces globbing already covers `packages/*`; the lockfile update is a single follow-up commit by the wiring session.
- **UI wiring (serial, one session):** apply in this order to minimise conflicts in shared files (`state.tsx`, `App.tsx`, `services.ts`, `defaultServices.ts`, `settings.ts`, `Common.tsx`, `CreateInvoice.tsx`, `Scan.tsx`, `Pay.tsx`, `Sweep.tsx`, `Settings.tsx`):
  1. Shared plumbing first: local-store (services), ux-errors (Common/errors), ux-glossary (Common, Help view, ViewId), a11y-pass (settings fields, css), mode-guard (App header).
  2. Views by file, one pass per file: CreateInvoice (quick-request, templates, share-safe, embed-snippet), Scan (ledger-export, search-filter, pay-reconcile, receipts, notify-local), Pay (pay-reconcile, smart-wallet-compat, wallet-connect, embed-return), Sweep (sweep-guide, contacts, policy-undo), Settings (backup-bundle, net-status link, theme-pack, pwa-offline, notify webhook), Home/Onboarding (onboarding), App.tsx (kbd-palette, profiles).
  3. i18n last: it rewrites strings in every view.

## Conflicts and cautions
- `profiles` changes `session.ts` and checkpoint keys: do it before any release that persists user data, or ship the migration.
- `embed-return` needs an optional invoice-schema field owned by the schema maintainers: feature-flag off until that lands.
- `theme-pack`, `pwa-offline`: need `scan-bundle.mjs` allowlist edits; review as security changes.
- `wallet-connect` and `hw-signer` phase 2 need explicit security review before build.
- Everything privacy-relevant defers to `docs/remote/privacy-specs/*` (hygiene, network-privacy) where they overlap: sweep-guide (hygiene HY-*), fiat-display and notify-local (network-privacy transport), contacts (address-safety).

## Files
- [ux-errors.md](ux-errors.md)
- [ux-glossary.md](ux-glossary.md)
- [quick-request.md](quick-request.md)
- [net-status.md](net-status.md)
- [mode-guard.md](mode-guard.md)
- [local-store.md](local-store.md)
- [ledger-export.md](ledger-export.md)
- [backup-bundle.md](backup-bundle.md)
- [onboarding.md](onboarding.md)
- [pay-reconcile.md](pay-reconcile.md)
- [sweep-guide.md](sweep-guide.md)
- [share-safe.md](share-safe.md)
- [receipts.md](receipts.md)
- [templates.md](templates.md)
- [recurring.md](recurring.md)
- [fiat-display.md](fiat-display.md)
- [pwa-offline.md](pwa-offline.md)
- [search-filter.md](search-filter.md)
- [contacts.md](contacts.md)
- [a11y-pass.md](a11y-pass.md)
- [notify-local.md](notify-local.md)
- [embed-snippet.md](embed-snippet.md)
- [embed-return.md](embed-return.md)
- [kbd-palette.md](kbd-palette.md)
- [theme-pack.md](theme-pack.md)
- [i18n.md](i18n.md)
- [wallet-connect.md](wallet-connect.md)
- [smart-wallet-compat.md](smart-wallet-compat.md)
- [hw-signer.md](hw-signer.md)
- [profiles.md](profiles.md)
- [policy-undo.md](policy-undo.md)
