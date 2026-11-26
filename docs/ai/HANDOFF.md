# AI development handoff

Source-pinned coordinator handoff. Facts below were read on 2026-11-26 UTC; re-verify heads before acting.

- Repository: djshellshoxxx/GhostPay
- Target: GitHub Pages browser beta, with the owner stop-work scope in [STOP_WORK_20261125.md](STOP_WORK_20261125.md) binding (F01/F09/F13 permanently archived; F02/F04/F08/F11/F12/F14/P07 deferred and excluded from beta and v1.0).
- Base SHA (origin/main): `019d5d18c8992f63fe77740f75ad04d86d3d9b07` (merge of #699, defer persistent vault timestamp retention).
- Task branch: `nodata/brave-clarke-nwzz0s`, at the same base SHA before this handoff commit.
- Main CI at base SHA: `CI` run 45762973800 completed `success` on `019d5d18`; `Push on main` run 45762973794 `success`.
- Recently landed on main (ancestry verified): #693 canonical v1 seller keystore vector (`0afab048`); #694 FC round-1 FC-03/FC-05a (`a9d2a033`); #699 (`019d5d18`).

## Active PRs and owners (open, read 2026-11-26)

Treat as active until verified otherwise. Do not duplicate.

- #697 (draft): integrate #691 account privacy onto main. Branch `claude/integrate-691-20261126`.
- #698 (draft): integrate #692 policy journal lock release onto #691 integration. Branch `claude/integrate-692-20261126`.
- #700 (draft): `fix(i18n)` English fallback for unsupported formatter locales. Branch `automation/20261126/bug/i18n-unsupported-locale-fallback`.
- #701 (draft): independent verification record for the account-privacy composition. Branch `nodata/zen-dirac-vkl84j`.
- Held, do not merge as-is: #371, #614, #621 (mixed stopped-product work); #592 (held reference-rate qualification).
- Owner-deferred, untouched: #383, #587, #609 (persistent vault timestamp retention; see [ACTIVE_WORK.md](ACTIVE_WORK.md) top entry). Requires new owner approval.
- Other open PRs: a full census was not taken. Two pages of 100 were read; many are old automation drafts. Treat each as claimed.

## Implemented changes

- This commit: docs only (`docs/ai/HANDOFF.md`, claim entry in `docs/ai/ACTIVE_WORK.md`). No code, test, workflow or dependency change.

## Checks actually run (read-only, no `npm ci`)

- Markdown relative-link scan over all `*.md` in the repo: 1498 relative links checked, 8 flagged. All 8 are non-defects: 5 in the vendored `packages/contracts/lib/openzeppelin-contracts/README.md` (upstream links, not GhostPay's), and 3 where the text `[8](r·V)` sits inside backticks in `packages/chain-solana/{DEVIATIONS,README}.md` (code spans, not links).
- `node scripts/i18n/check.mjs`: 4 catalogs, 0 errors, 898 warnings (`identical to English`, i.e. untranslated keys). Warnings are translation work; not assigned, because translations must not be invented.
- `node scripts/i18n/check.mjs --strict`: exits 1 on warnings, as expected. Not a gate for this handoff.
- Relative-import scan of `scripts/`, `apps/web/scripts/`, `test-vectors/`, `tools/`: 8 flags, all valid (imports of `packages/*/dist` that exist after `npm run build:libs`, and a string literal inside generated test code).
- Not run: `npm ci`, `npm run build:libs`, typecheck, lint, unit, e2e, Foundry, browser or Pages checks. `node_modules` was absent at read time.

## Remaining work

- No suitable unclaimed microtask was found after screening. Documentation links and command references checked clean. The i18n backlog is translation-only. Ordinary UI and bounded code fixes require a built toolchain, and the open-PR backlog already claims the visible bugs.
- Screened and excluded: stopped products (F01/F02/F04/F08/F09/F11/F12/F13/F14/P07); amount parser and payment-state fixes (protected); invoice-timestamp vault retention (owner-deferred); CI, dependency and crypto changes (protected).

## Blockers

- None asserted for this handoff.
- For any future code task: build the toolchain first (`npm ci --ignore-scripts && npm run build:libs`), then run the affected checks listed in [CLAUDE.md](../../CLAUDE.md).

## Next action

Re-read open PRs and main CI before choosing work. Assign only a microtask that has a source-verified defect, an existing pattern and an objective acceptance command, and that is not held by an open claim above.
