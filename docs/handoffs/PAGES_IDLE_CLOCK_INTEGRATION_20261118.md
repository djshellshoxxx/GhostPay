# Pages idle-clock integration — 2026-11-18

## Source and scope

Base main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`.
Local test-only RED commit: `a84928a3` (full hash available in this branch history before connector publication).
The source patch is the independently reviewed change from `20266feedc24aedf3681d931bd3cc313a459d498`.
Only AppShell idle-deadline behavior changes. PR #209 frame and unload changes are not included.

## Finding GP-PAGES-04-CLOCK

The old shell used Date.now() alone. With suspended timers, a clock rollback could leave recoverable keys loaded
and let the first input extend the timeout. The shell now checks both wall and monotonic elapsed time before
rearming. Either expiry or a backwards clock observation triggers locking. Wall time still detects sleep on
platforms where performance.now() pauses. The existing protection against erasing a sole unbacked-up key copy
remains in force. This is a local lifecycle defect, not a demonstrated remote key-extraction exploit.

## Verification

Runtime: Linux, Node v24.22.1, Vitest 5.0.5; synthetic keys and jsdom lifecycle events.

- Imported regression on current main, before source fix:
  `../../node_modules/.bin/vitest run src/AppShell.idleClock.test.tsx --coverage.enabled=false --maxWorkers=1`
  from apps/web: **9 failed, 1 passed**, confirming the defect on canonical main.
- After fix:
  `../../node_modules/.bin/vitest run src/AppShell.idleClock.test.tsx src/App.test.tsx src/AppLean.test.tsx src/AppShell.i18n.test.tsx --coverage.enabled=false --maxWorkers=1`
  from apps/web: **4 files, 44 tests passed**, zero skips.
- Independent implementation lane on PR #209: **6 files, 52 tests passed**, including its frame/unload suites;
  whole-web TypeScript and scoped ESLint passed there. Those results are supplemental, not substituted for this head.
- Coordinator reviewed the source change and ran the canonical-main RED and GREEN tests above.
- `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web`: exit 0 on this integration source.
- Scoped ESLint and `git diff --check`: exit 0. Hosted CI remains pending at publication.

The ten new regressions cover rollback on focus/pageshow/visibility/first input, monotonic-only expiry,
wall-only expiry after sleep, rollback relative to a later observation, activity resets, and preserving the sole
unbacked-up key copy. Real operating-system sleep, browser restoration and Tor Browser are not qualified by jsdom.

## Integration

Require exact-head hosted CI before merge. Do not treat a pending check as success. No release, deployment,
mainnet enablement, custody change, dependency change or release-gate modification is included.
