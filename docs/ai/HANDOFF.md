# AI development handoff

Source-pinned coordinator handoff. Facts were read on 2026-11-26 UTC. Re-verify heads before acting; this file is a point-in-time snapshot and goes stale quickly.

- Repository: djshellshoxxx/GhostPay
- Target: GitHub Pages browser beta, with the owner stop-work scope in [STOP_WORK_20261125.md](STOP_WORK_20261125.md) binding. F01, F09 and F13 are permanently archived. F02, F04 and P07 are stopped and archived indefinitely. F08, F11, F12 and F14 are deferred beyond v1.0. All ten are excluded from beta and v1.0.
- Base SHA (origin/main): `194e225cc115f894650b2e9ef3390854241e4143` (merge of #695, privacy-minimal invoice links and exports).
- Task branch: `nodata/brave-clarke-nwzz0s`. It contains origin/main and this docs refresh. Check with `git log origin/main..HEAD`.
- Main CI at base SHA, all `success`: `CI` run 45785341113, `Hosting kit` run 45785341189, `Push on main` run 45785342671.
- Recently landed on main (verified by ancestry or GitHub PR state): #695 (`194e225c`); #703 (`6c3acdd5`); #697 and #698 merged 2026-11-26 06:35Z and 06:36Z; #699 (`019d5d18`); #694 (`a9d2a033`); #693 (`0afab048`).
- Previous PR for this handoff: #702 was closed without merging on 2026-11-26 08:44Z. Its branch was kept and this file was regenerated as a new commit on that branch. No new PR was opened.

## Where to find current PR state

This file does not carry an open-PR census. It goes stale as soon as a PR changes state. Read the live list before choosing work:

- Open PRs: `gh pr list --state open` or the GitHub PR list for djshellshoxxx/GhostPay.
- Claims: [ACTIVE_WORK.md](ACTIVE_WORK.md). Its entries record the worker, branch, base and owned paths. A claim is active until its PR closes or the owner says otherwise.
- Held PRs and stopped-product PRs: listed in [STOP_WORK_20261125.md](STOP_WORK_20261125.md). Do not merge them as-is to promote stopped features.
- Owner-deferred work: persistent vault timestamp retention (#383, #587, #609) needs new owner approval. See the "Owner decision: persistent vault timestamp retention deferred" entry in ACTIVE_WORK.md.

## Implemented changes

- Docs only on this branch: `docs/ai/HANDOFF.md` (regenerated from the current base) and a claim entry in `docs/ai/ACTIVE_WORK.md`.
- No code, test, workflow or dependency change.

## Checks actually run (read-only, no `npm ci`, on base `194e225c`)

- Markdown relative-link scan over all `*.md`: 1505 relative links checked, 9 flagged. All 9 are non-defects. Five are in the vendored `packages/contracts/lib/openzeppelin-contracts/README.md`, which are upstream links. Four are a math-notation string inside backticks, in `packages/chain-solana` (two in `DEVIATIONS.md`, one in `README.md`) and in the previous revision of this file. The naive scanner does not skip code spans, so it reports them. The current revision of this file no longer contains that string.
- `node scripts/i18n/check.mjs`: 4 catalogs, 0 errors, 919 warnings. Warnings are `identical to English` (untranslated keys). The count rose from 898 at the previous base because new keys were added since then. Warnings are translation work and are not assigned, because translations must not be invented.
- Relative-import scan of `scripts/`, `apps/web/scripts/`, `test-vectors/` and `tools/`: 8 flags, all valid. They are imports of `packages/*/dist` that exist after `npm run build:libs`, and a string literal inside generated test code.
- Not run: `npm ci`, `npm run build:libs`, typecheck, lint, unit, e2e, Foundry, browser or Pages checks. `node_modules` was absent at read time.

## Remaining work

- No suitable unclaimed microtask was found after screening on `194e225c`. Documentation links, command references and relative imports checked clean. The i18n backlog is translation-only. Ordinary UI and bounded code fixes need a built toolchain first.
- Screened and excluded: stopped products (F01, F02, F04, F08, F09, F11, F12, F13, F14, P07); amount parser and payment-state fixes (protected); invoice-timestamp vault retention (owner-deferred); CI, dependency and cryptography changes (protected).

## Blockers

- None asserted for this handoff.
- For any future code task: build the toolchain first (`npm ci --ignore-scripts && npm run build:libs`), then run the affected checks listed in [CLAUDE.md](../../CLAUDE.md).

## Next action

Read the live open-PR list and main CI first. Then assign only a microtask that has a source-verified defect, an existing pattern and an objective acceptance command, and that is not held by an open claim.
