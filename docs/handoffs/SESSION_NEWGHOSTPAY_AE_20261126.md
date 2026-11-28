# Session handoff: newghostpay-ae (privacy features), 2026-11-26 UTC

Claude Code session `newghostpay-ae`, worktree `C:\Users\new\Desktop\newghostpay\GhostPay-smallfix`.
Main at stop: `019d5d18`. Lock at stop: released (gen 41, ghostpay-42). This session holds nothing.

## Merged to main (all through the integration lock, exact head green)

| PR | What | Merge |
|---|---|---|
| #670 | payment-uri invoice link: reject `.` path segments, default port dropped from origin | `e6faa19b` |
| #674 | Local destination-reuse warnings, checkout and sweep (#287 item 1; consolidates #586/#610) | in `e2c11634` (batched #681) |
| #677 | Wallet disclosure gate in `lib/wallet.ts` + `lib/walletDisclosure.ts`, `walletCallSummary.ts` (PR A) | in `f007ec7c` |
| #679 | Wallet disclosure dialog `components/WalletDisclosure.tsx`, wired in Pay/Registry/Policy (PR B) | `f007ec7c` |

Each had an independent AI review (not a professional audit); findings were fixed with regression tests and
mutation checks. Donor PRs #584, #586, #589, #606, #610 got "consolidated onto main" comments, left open for the owner.

## Open: #696 cover lookups for matched router payments (DRAFT, do not merge yet)

Branch `claude/w-match-cover-20261125`, head `4e71030c` (contains main `019d5d18`). Owner approved this as a new
capability, off by default. Design and limits: `docs/handoffs/MATCH_COVER_20261125.md`.

- v1 failed review (decoys changed between scans; order leak; silent decoys). v2 at this head fixes those:
  keyed per-announcement selection on tx hash + ephemeral key, chain-order lookups, `sendsLookups` pre-network
  filter, key zeroized on stop, honest wording.
- Local at this head: typecheck and ESLint clean; `matchCover.test.ts` 7/7, `scanDisclosure.cover.test.ts` 9/9,
  scan/Settings/Scan-privacy/i18n suites pass; mutation checks (stable id, chain order, token filter) each fail tests.
- **Still owed:** (1) a second independent review of v2 (was started, stopped unfinished); (2) a green hosted CI run
  on the exact head (the old head's only failure was the LanguagePicker flake, fixed in this PR); (3) mark ready,
  queue for the lock, merge.
- Known remaining exposure, already disclosed: page-level "a match happened" and rough count; the single-payment
  re-check in `Scan.tsx` (late accept) is uncovered; checkpoint replay after a failed verification
  (call-graph item 6). Possible follow-ups: route the late-accept re-check through the planner; round the replay
  checkpoint down to the cover window.

## Coordination protocol (peers on this machine)

- Lock: branch `automation/ghostpay-integration-lock`, file `integration-lock.json`. Acquire/release with a
  non-force push (`git commit-tree` on the lock branch, `status` held/released, `generation`+1, `base_sha`, 45-min
  `expires_at`). Never take over a held lock. Merge with `gh pr merge --merge --match-head-commit <tested head>`.
- Queue rule: green first goes; message peers with the release commit and new main SHA after each release.
  Docs-only drift on main does not need requalification (peer convention). Merge main into PRs with `--no-ff`.
- Peers seen: `ghostpay-42` (FC round-1 follow-ups, FC-05b #669 next), `ghostpay-b7` (W3, provider privacy),
  `ghostpay-backup-60` (now W4, privacy-minimal invoices #695). Check `ListAgents` first; names change.

## Owner decisions recorded by peers

- Persistent vault timestamp retention (#383/#587/#609) DEFERRED until after the v1.0 beta (#699). Do not claim.
- Stop-work products (AGENTS.md) stay dormant; shared-core privacy is in scope.

## Environment gotchas

- This PC is very low on RAM (often 0.1-0.5 GB free). Background long test runs get killed by the harness. Run
  tests one file or folder at a time in the foreground: `npx vitest run <file> --coverage=false --maxWorkers=1`
  from `apps/web`. The full web suite, builds and e2e run only in hosted CI.
- Local Node is 26, CI is Node 22: Node 22 has no `navigator.locks`; node-environment tests that use the durable
  journal must call `installTestLocks()` (jsdom suites get it from `src/test/setup.ts`).
- After merging main, rebuild changed libraries (`npm run build -w <pkg>` or `npm run build:libs`); stale `dist`
  gives false typecheck errors in `apps/web`.
- Long Python heredocs in Bash can fail to parse; write scripts to the scratchpad and run them. Preserve CRLF/LF when
  editing locale JSON (a mixed ending turns the diff into a full-file rewrite).
- `CodeQL` "dynamic" runs cannot be re-run via the API (HTTP 500); a new push restarts them.

## Suggested next work

1. Finish #696 (review, CI, merge).
2. When #569 global privacy masking lands, call `allowPresentation(!masked)` in `WalletDisclosureProvider`.
3. Optional wallet-disclosure nit left open: no activation delay on "Continue to wallet" (network-switch double click).
