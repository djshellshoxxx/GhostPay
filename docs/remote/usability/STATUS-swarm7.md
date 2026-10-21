# Swarm 7 status: usability + growth packages

Date 2026-10-21, branch `claude/remote-extensions-7`. All packages: pure TS logic, no UI/network/analytics, no new deps, vitest thresholds 95/90/95/95 untouched. Numbers below were run locally (typecheck, lint, vitest) and re-run by the coordinator before each commit. Nothing is wired into `apps/web` (swarm 4: see `wiring/`). Self-audits are AI-assisted self-reviews, not independent audits.

| Package | Tests | Stmts/Br/Fn/Ln % | Spec ids (features.md / growth) | Wiring | Audit |
|---|---|---|---|---|---|
| ux-links | 49 | 99.5/99.0/100/99.7 | quick-request, F1, F2, F3 tip page, F4 handles | wiring/ux-links.md | audit-ux-links.md |
| ux-schedule | 120 | 99.8/98.2/100/100 | templates, recurring, F12 plans | wiring/ux-schedule.md | audit-ux-schedule.md |
| ux-fiat | 48 | 100/99.3/100/100 | fiat-display, F22 | wiring/ux-fiat.md | audit-ux-fiat.md |
| ux-receipts | 117 | 99.7/98.2/98.1/99.7 | receipts (payer/shareable side), F15 | wiring/ux-receipts.md | audit-ux-receipts.md |
| ux-vault | 117 | 100/98.1/100/100 | contacts, search-filter, backup-bundle, profiles, F5, F11 | wiring/ux-vault.md | audit-ux-vault.md |
| ux-export | 134 | 99.8/98.3/100/100 | ledger-export, F21 (export part) | wiring/ux-export.md | audit-ux-export.md |
| ux-i18n | 117 | 99.7/96.4/100/100 | i18n, a11y-pass (helpers), ux-glossary | wiring/ux-i18n.md | audit-ux-i18n.md |
| ux-guide | 59 | 99.7/99.7/100/100 | onboarding, F17 checklist, privacy-profile selector | wiring/ux-guide.md | audit-ux-guide.md |
| ux-privacy | 33 | 100/99.1/100/100 | F6 hygiene coach, F13 friendly policy | wiring/ux-privacy.md | audit-ux-privacy.md |
| ux-notify | 79 | 99.8/99.2/98.9/99.7 | notify-local, pwa-offline, F9 (manifest/cache planner), F19 (partial) | wiring/ux-notify.md | audit-ux-notify.md |
| ux-fees | 50 | 98.6/98.2/98.1/99.8 | sweep-guide (timing + fee preview), cheapest-chain, fee-privacy-preview | wiring/ux-fees.md | audit-ux-fees.md |
| ux-intake | 77 | 99.7/99.4/100/99.8 | qr-scan, deep-link-share, nl-amount, share-safe (parsing half) | wiring/ux-intake.md | audit-ux-intake.md |
| ux-presets | 57 | 99.1/98.7/98.4/100 | pay-again-presets | wiring/ux-presets.md | audit-ux-presets.md |
| ux-sandbox | 59 | 100/100/100/100 | mode-guard, sandbox-mode, F17 practice mode | wiring/ux-sandbox.md | audit-ux-sandbox.md |
| ux-core | 118 | 100/97.9/100/100 | ux-errors, net-status (state machine), local-store, kbd-palette, theme-pack | wiring/ux-core.md | audit-ux-core.md |
| ux-connect | 129 | 99.6/99.3/100/100 | smart-wallet-compat, hw-signer, wallet-connect (logic only) | wiring/ux-connect.md | audit-ux-connect.md |
| ux-flow | 91 | 99.2/97.7/100/99.2 | pay-reconcile, policy-undo (generic queue), embed-snippet, embed-return, F8 (matching part) | wiring/ux-flow.md | audit-ux-flow.md |

## Not built (gaps, honest)
- share-safe: passphrase-split link, unfurl-safe wrapper, print card (only parsing side exists in ux-intake).
- net-status probe runner, local-store IndexedDB backend/unlock lifecycle/tag-vault migration (ux-core has state machine + injected store only).
- policy-undo EIP-712 cancel typed data and manifest gating (needs forge fixtures); embed-return blocked on optional `returnOrigin` schema field.
- growth: F7 visibility lens, F10 pocket wallet (key handling; needs design review), F14 vault watch, F16 escrow-lite, F18 Capacitor app, F20 offline share. F8 pay-tracker pending-payment recovery only partly covered by ux-flow.
- Receipts: seller-signed receipts spec (`specs/receipts.md`) is not implemented; ux-receipts covers payer/shareable receipts.

## Unverified across the board
No real browser, camera, hardware device, wallet, RPC, Excel/LibreOffice, screen reader or IANA-zone testing; WalletConnect/hardware constants from memory; EIP-55 checksums not verified anywhere (no keccak); scoring/threshold heuristics uncalibrated; no external security review; nothing wired into apps/web.

## CI note
`contracts` check red on the base branch too (Sweep.audit.t.sol replay test); not caused by this PR.
