# Pages invoice expiry: preserve the clock origin — 2026-11-26

Status: local type, lint, collection and preservation checks completed. Root
independently approved the exact source. Final evidence review and corrected-source
hosted browser execution remain gates. This worker made no remote writes.

## Exact source

| Role | Commit |
| --- | --- |
| Canonical PR #689 base | `4af78c8cd3eafe12b20170ccfd3a0313bf0c9fc5` |
| Claim before edits | `230bea3ad721f2249ebe7bcf99563fa6a4a9ed73` |
| Reviewed fixture source | `cb2e5c5ce81b895817ca8da3b1590f2bf04f46a1` |
| Current main adopted normally | `1bea3df3448569254774747d694e71e155c3eb98` |
| Composed source | `97f026a7fe92062e97e86ab5a8ae633377cf0b64` |
| Unchanged reviewed/composed source tree | `ef5f6462918ca57f50d5b6af4fc492d107565f91` |

Worker `/root/help_review`, branch `fix/pages-expiry-clock-origin-20261126`, owns
only the Pages expiry fixture and this additive handoff/ownership record. Root
handed off the failure; the prior fixture worker independently checked the diagnosis
read-only. Current main merged without conflict or any tree change. Privacy/account
and policy work remain separately owned.

## Hosted evidence and correction

[Pages run 45741328280, job 139646779828](https://github.com/djshellshoxxx/GhostPay/actions/runs/45741328280/job/139646779828)
tested merge `11fd6dcb3fa6f041d7eccccdcc1a153f4b58fc03` (head `4af78c8c`
into then-main `84b80260b9c16b928e440dd81750d9bfb6cdb2b4`). Sixteen cases
passed; invoice expiry failed at the Send click after `setSystemTime(past)`. The
click log records a Gross details row intercepting the pointer, followed by an
unstable and detached button. The expiry-message assertion was not reached; the
240-minute saved-setting assertion had already passed.

Unlike the passing core fixture, Pages first invoked the clock API after both
views mounted. Installed Playwright 1.64.1's `setSystemTime` invokes its clock
installation when needed, replacing `performance` with a clock whose ticks start
at zero. AppShell correctly treats backwards monotonic time as revocation,
independently of the idle duration. The fixture therefore reset the clock origin
inside an existing lease. This diagnosis combines source inspection and the clock
diagnostic below; the hosted log itself reports a click failure, not clock samples.

Four additive source lines initialize the context clock before `quickSeller` and
assert that `performance.now()` does not decrease across the existing wall jump.
The real Settings save, 240-minute limit, ordinary pointer click, expiry checks,
independent lagging payer and on-chain refusal remain unchanged. All 1,173 original
Pages source lines are retained in order. Core journey, all 14 idle cases and the
wallet-disclosure helper are byte-identical. No runtime, timeout, dependency,
workflow, manifest, contract, utility or excluded-product change was made.

Both mocked browser profiles passed on the failing Pages base: full job
`139647098316` had 182 passed / two skipped; lean `139647098302` had 170 passed /
four skipped, in run `45741328279`. Both passed invoice expiry and all 14 idle
cases. These base results do not qualify the new fixture source.

## Executed local checks

`npm ci --ignore-scripts --no-audit --no-fund` completed (722 packages). The 65
compiled library directories were copied from the privacy worktree after verifying
its committed and working package sources match this canonical base. No dependency
or lockfile changed. The subsequent main merge retained the exact tested tree.

| Check | Actual result |
| --- | --- |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` | Exit 0 |
| `./node_modules/.bin/eslint --config eslint.config.js apps/web/e2e/pages-devnet.spec.ts` | Exit 0 |
| Pages config `playwright test --config=playwright.pages-devnet.config.ts --list` | 17 collected, exit 0 |
| `playwright test e2e/idle-session.spec.ts --project=desktop --list` | 14 collected, exit 0 |
| Original-line order and unchanged-fixture comparisons | Passed |
| Whitespace and committed-secret scan | Passed |

Pages collection used temporary synthetic public metadata solely for configuration
parsing. It did not build Pages, start a chain, launch a browser or execute test
bodies. The local browser is unavailable; no repeat install or launch probe ran.
No generated/property, fuzz or mutation campaign was run.

A temporary Node VM diagnostic used the actual installed Playwright injected-clock
implementation. Late installation changed synthetic monotonic time from 7,500 ms
to zero and failed the nondecrease assertion; early installation preserved 7,500
to 7,500 and passed for the same 3,900,000 ms wall jump. This checks the clock-origin
mechanism, not browser click/layout or application acceptance. An initial diagnostic
loader setup error was corrected before these measured runs and is not regression
evidence.

Root owns final evidence review, publication, fresh hosted Pages and applicable CI,
ownership refresh and integration. The runtime rollback protection remains enabled.
No corrected-source browser pass is claimed locally.
