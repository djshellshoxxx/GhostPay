# AI development handoff

Source-pinned coordinator handoff. Facts were read on 2026-11-28 UTC. This is a point-in-time snapshot. Re-verify heads, CI and PR state before acting. Procedure: [prompts/HANDOFF_EXECUTION.md](prompts/HANDOFF_EXECUTION.md).

- Repository: djshellshoxxx/GhostPay
- Target: GitHub Pages browser beta, with the owner stop-work scope in [STOP_WORK_20261125.md](STOP_WORK_20261125.md) binding. F01, F09 and F13 are permanently archived. F02, F04 and P07 are stopped and archived indefinitely. F08, F11, F12 and F14 are deferred beyond v1.0. All ten are excluded from beta and v1.0.
- Base SHA (origin/main): `0934ea094cb1db90293b74d2d1e9d9324e09a883` (merge of #768, keyboard navigation on the no-JavaScript entry and static guides).
- Main CI at base SHA: `CI` run 46136039738, `Hosting kit` run 46136039735 and `Push on main` run 46136039661 were all **queued** when read. They are not yet green. Re-check before relying on this base.
- Last fully green main head read: `70458ebe` (#762): `CI` 46119185573, `Hosting kit` 46119185634, `Push on main` 46119185160, all `success`.
- Recently landed on main, verified from main's history and GitHub: #768 (`0934ea09`), #762 (`70458ebe`), #759 (`b890a766`), #758 (`fd5e5911`), #695 (`194e225c`), #697 and #698 (merged 2026-11-26 06:35Z and 06:36Z), #703 (`6c3acdd5`).
- Known red run: scheduled or dispatched `Nightly` run `46068598296` on `fd5e5911` (#758) failed in the `contract-analysis / mythril` job. The Mythril analyzer step exited non-zero (`ANALYSIS_OUTCOME: failure`). This is a security-analyzer result in CI/security gates, which are protected. It is not a screen target. Open PR #763 ("Disposition Mythril PC 2272") appears related by title. That relation is unverified.
- The previous handoff PR #702 was closed without merging on 2026-11-26 08:44Z. Its branch was kept and reused for this refresh. This refresh will be merged to main through a new draft PR (#788), as the owner requested. It is not on main until that merge.

## Where to find current PR state

This file does not carry an open-PR census. It goes stale as soon as a PR changes state. Read the live list before choosing work:

- Open PRs: the GitHub PR list for djshellshoxxx/GhostPay, sorted by `updated`. Many draft PRs were updated within hours of this snapshot, so treat them as active.
- Claims: [ACTIVE_WORK.md](ACTIVE_WORK.md). Each entry records the worker, branch, base and owned paths. A claim is active until its PR closes or the owner says otherwise.
- Held and stopped-product PRs: listed in [STOP_WORK_20261125.md](STOP_WORK_20261125.md). Do not merge them as-is to promote stopped features.
- Owner-deferred work: persistent vault timestamp retention (#383, #587, #609) needs new owner approval. See the "Owner decision: persistent vault timestamp retention deferred" entry in ACTIVE_WORK.md.

## Implemented changes (this refresh)

- Docs only: `docs/ai/HANDOFF.md` (this file), `docs/ai/prompts/HANDOFF_EXECUTION.md` (the execution prompt), and a claim entry in `docs/ai/ACTIVE_WORK.md`.
- No code, test, workflow or dependency change.

## Checks actually run (read-only, no `npm ci`, on base `0934ea09`)

- Markdown relative-link scan over all `*.md`: 1536 relative links checked, 8 flagged. All 8 are non-defects. Five are upstream links in the vendored `packages/contracts/lib/openzeppelin-contracts/README.md`. Three are a math-notation string inside backticks in `packages/chain-solana/{DEVIATIONS,README}.md`. The naive scanner does not skip code spans.
- `node scripts/i18n/check.mjs`: 4 catalogs, 0 errors, 995 warnings (`identical to English`, i.e. untranslated keys). Warnings are translation work and are not assigned, because translations must not be invented.
- Relative-import scan of `scripts/`, `apps/web/scripts/`, `test-vectors/` and `tools/`: 8 flags, all valid. They are imports of `packages/*/dist` that exist after `npm run build:libs`, and a string literal inside generated test code.
- Not run: `npm ci`, `npm run build:libs`, typecheck, lint, unit, e2e, Foundry, browser or Pages checks. `node_modules` is not installed on this runner.

## Screen outcome

- Eligible unclaimed microtasks: **none**. The screen criteria are in the execution prompt.
- Why nothing qualified: the only remaining candidates were either owned by open PRs updated within hours, or in protected areas (CI and security gates, cryptography, payment state, stopped products, owner-deferred vault retention). The remaining items are translation work and an analyzer result.
- No worker was spawned for implementation, because there was no task to give one.

## Remaining work

- Not assigned: 995 untranslated i18n warnings (translation-only, needs human or translator input).
- Not assigned: the Mythril `Nightly` failure on `fd5e5911`, which needs the owner of the Mythril disposition work (PR #763 by title, unverified).
- Screened and excluded: stopped products (F01, F02, F04, F08, F09, F11, F12, F13, F14, P07); amount parser and payment-state fixes (protected); invoice-timestamp vault retention (owner-deferred); CI, dependency and cryptography changes (protected).

## Blockers

- None asserted for this handoff.
- For any future code task: build the toolchain first (`npm ci --ignore-scripts && npm run build:libs`), then run the affected checks listed in [CLAUDE.md](../../CLAUDE.md).

## Next action

1. Confirm the queued main CI runs above are green. If any fail, record them here and do not assume the base is good.
2. Re-run the execution prompt's discovery and screen steps against the then-current main.
3. Assign only a microtask that meets every criterion in the prompt. Otherwise record that none qualified.
