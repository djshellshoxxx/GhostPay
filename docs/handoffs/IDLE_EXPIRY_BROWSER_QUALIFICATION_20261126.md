# Idle candidate: invoice-expiry browser qualification — 2026-11-26

Status: the two bounded browser fixture corrections and normal adoption of reviewed
shared utilities are locally qualified. Fresh hosted execution and independent final
composition review remain integration gates. This worker made no remote writes.

## Exact source

| Role | Commit |
| --- | --- |
| Published idle base, PR #689 | `2a70c04124cba1d8c2d5145ef5a4ba4bcb6c2911` |
| Claim before fixture edits | `360db494` |
| Two-fixture correction | `a20782cb2d140f39e239053edfba57a814dfa2d2` |
| Reviewed shared utilities, PR #690 | `62d8ff681b3ce3916d7aa4639c73437856ef8e48` |
| Combined qualified source | `18bfb7f937013af77736e5c80a8310d9114b5ffd` |
| Combined source tree | `40923721a273d5d390749e6f240ab7a8b300cb06` |

Branch: `fix/idle-expiry-fixture-20261126`. Original local branch
`finish/idle-recovery-core-20261126` remains at `6e7147d1`; all donor refs survive.
The composition is an ordinary merge with parents `4864589d` and `62d8ff68`.
Only `ACTIVE_WORK.md` conflicted; every line from both parents is retained in order.

## Hosted evidence and correction

Fresh job logs for the published base show:

| Hosted job | Original result |
| --- | --- |
| Pages `139639540011`, run `45739135189` | 16 passed, one invoice-expiry failure; new fresh-profile sole-signer recovery passed |
| Full browser `139639592599` | 181 passed, two skipped, one invoice-expiry failure; all 14 idle cases passed |
| Lean browser `139639592697` | 169 passed, four skipped, one invoice-expiry failure; all 14 idle cases passed |

Each failure expected `This invoice has expired. Nothing was sent.` after a browser
clock jump of more than an hour. Source inspection identifies two competing gates:
the default idle limit is 15 minutes, and AppShell now checks elapsed wall time in
capture-phase input and synchronous session guards. It revokes the prepared flow
before the ordinary Send handler can report invoice expiry. The hosted error logs
show the missing expected message; this ordering diagnosis comes from the source.

The supported idle setting is 1–240 minutes, with no off value. Only these two
invoice-expiry cases now choose 240 minutes through the actual Settings form and
assert the persisted value. Their one-hour invoice expiry and original clock jumps
remain unchanged, so the invoice expires while the chosen idle deadline has not.

- Core journey configures the setting after `openFresh`, before any payment consent
  or preparation. Its existing helper has one optional argument used by this case
  only. The fixture otherwise resets settings on every document load; setting them
  before navigation would not isolate the expiry guard. It returns through Pay and
  repeats all existing review/consent/preparation assertions.
- Pages uses the existing `presetRpc: false` option and real `configureRpc` helper,
  then saves the idle limit in the seller page before creating the invoice. This
  preserves it across payer loads and protects both pages sharing the context clock.
  The independent lagging payer and real-chain expiry refusal remain unchanged.

No production guard, default setting, timeout, invoice validity, existing assertion,
idle acceptance case, wallet refusal, journal refusal or on-chain refusal changed.
Every existing assertion/clock/timeout source line remains in order: 131 in core and
354 in Pages. The 14-case idle fixture and all idle runtime/catalog blobs are exact
to the published base. The two fixture corrections change no runtime, dependency,
workflow, contract or activation. Reviewed utility runtime changes are adopted
unchanged from #690.

## Executed local checks

The independent locked installation and prerequisite builds from the idle worktree
were reused. No dependency or lockfile changed; no further installation was needed.

| Check on combined source `18bfb7f9` | Actual result |
| --- | --- |
| `npm run typecheck --workspace=@ghostpay/web` | Completed, exit 0 |
| Typed ESLint on `e2e/core-journey.spec.ts` and `e2e/pages-devnet.spec.ts` | Completed, exit 0 |
| Playwright desktop collection: core invoice expiry plus all idle cases | 15 collected, exit 0 |
| Playwright Pages collection: invoice expiry | One collected, exit 0 |
| Utility adoption | All seven source/test blobs equal canonical #690 and their three original donors; every incoming file except the ownership log equals #690 |
| Preservation | Both ownership histories retained; idle source, catalogs, idle fixture, manifests, workflow and contracts unchanged |
| Full-diff whitespace and committed-secret scan | Passed |

Collection did not launch a browser, build Pages or run a chain. The Pages config
used temporary synthetic public metadata solely to collect its one selected case.
No local browser execution, native-suite rerun, generated/property, fuzz, mutation,
exploit campaign, live wallet or real-fund operation is claimed by this correction.

Root owns independent final review, exact-tree nonforce publication preserving
canonical `2a70c041` and `62d8ff68` ancestry, fresh full/lean/Pages and applicable CI
gates, donor/ownership refresh and the cooperative integration lock. #690 is the
explicit prerequisite for #689. Account/privacy work remains separately owned;
this correction makes no claim of combined privacy acceptance or full-backlog completion.
