# GhostPay BUG-ONLY R11 — merchant button nonstring label error contract

Date: 2026-11-23. Target: existing static Pages browser-beta merchant payment-button functionality only. No new feature, interface redesign, dependency, contract or fund interaction.

## Source-pinned basis and ownership

- Main `8ddb344973e80b8e1eda6821e970ee6a2b808b29` read live before the task branch was created; source `packages/merchant-hooks/src/button.ts` blob `386adf476b05b9010b3e757ff960489107d80258`.
- Isolated task branch: `automation/20261123-r11/bug/merchant-button-invalid-label`. Ownership/acceptance recorded first in `docs/ai/ACTIVE_WORK.md` by commit `3deaf09b56b686c960501ec83fd525f7702eca9e`.
- Dedicated failing regression committed before the fix as `416a73de8fdc79d78d8f48495c9c0ad626fca376`, new `packages/merchant-hooks/src/button.runtime-label.test.ts`.
- Minimal production correction committed next as `898d28754d87d545a60914a7bf6417b0a6435764`; resulting production blob `0c55d8ecffa01eb2bfb40511fa812dcd1b23eac0`.
- All 267 open PR changed-file lists were inspected in the snapshot through PR #512 (pages 1–3, 2026-11-23); zero direct collisions on production or new dedicated regression file. PRs #398 and #504 edit adjacent preexisting `packages/merchant-hooks/src/hooks.test.ts`; that file and all other worker branches remain untouched. Refresh ownership before integration, as new PRs can arrive.

## Observed pre-fix error and root cause

The existing `buildPaymentButton(url, label)` API documents `HooksError('bad-label')` for invalid untrusted button text. Its body invoked `label.replace(...)` without checking the runtime type; a nonstring label supplied by a JavaScript caller or malformed external integration raised a native `TypeError` rather than the typed validation error. This affects error handling in existing merchant button generation, without evidence of a remote exploit.

Executable reproduction: an exact copy of `button.ts` from main was locally reconstructed with `git hash-object` matching GitHub source blob `386adf476b05b9010b3e757ff960489107d80258`. Node.js `v22.16.0` and TypeScript `5.8.3` transpiled that source; the existing link assertion and invoice-fragment functions were injected as dependency doubles, so only the actual source-body label path was exercised. On original source, five invalid labels (null, undefined, number, boolean, array) each threw native `TypeError` instead of the expected typed `bad-label` (5/10 checks passed, 5/10 failed). Normal link/valid label, escaping, 40-codepoint cap, empty-string error and malformed-link precedence all passed.

The one-line repair checks `typeof label !== 'string'` *after* link validation and throws `HooksError('bad-label')`. After correction the same ten directed/neighboring checks passed (10/10); local source `git hash-object` matches the repaired GitHub blob `0c55d8ecffa01eb2bfb40511fa812dcd1b23eac0`. These are **source-body-exact isolated probes with link dependency doubles**, not full Vitest, package typecheck/lint/build or native-browser checks. The committed focused Vitest file could not execute locally because full GitHub checkout was blocked by DNS resolution. Hosted exact-head CI and applicable browser checks are still required.

## Preflight and release gates

- PR #390 (display text expansion bound): exact head `b655bc273a6704c9c140287b8adcdf4085b91882`; five hosted workflow groups (CI, Pages, Beta acceptance, Hosting kit, CLI qualification) completed success, Snyk success, zero submitted independent reviews and `mergeable=false` against current main. Its changed-source patch was inspected; no demonstrated new defect or CI failure required an owner-branch edit. Its branch is open, **not** draft; leave owner branch alone.
- Integration metadata branch `automation/ghostpay-integration-lock`, file `integration-lock.json` currently has generation 12, `status=released`, SHA of that metadata file blob `5004209200c97ae989d721c9ee6a8266aeed2329`. This worker did **not** acquire or transfer the lease. Released state does not confer integration authorization.
- This is a single coordinator's reproduction and repair, **not** an independent review by a genuine second verifier.
- Leave focused PR **draft/unmerged** until all required CI on its exact final head is green, applicable native browser tests pass, an independent submitted review exists, PR/file ownership and dependency collisions are rechecked, and the legitimate integration-lock holder authorizes the merge. No deployment, release, RPC probe, wallet/contract/fund action or live traffic testing.
