# Wave 2 report (2026-10-30)

Companion to `WAVE-2-STATUS-2026-10-30.md`, which has the full Step 2 table and file:line evidence.

## Identity

- Frontier `FRONTIER`: `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2` (PR #41 head, `codex/ghostpay-consolidation-20261030`). Contains PR #37 head `b6a0871`.
- Frontier CI: run `41047381180` (`ci.yml`), `success`.
- Wave branch: `claude/haiku-wave-2-handoff-qepfoe`, created from `FRONTIER`. The handoff doc named `claude/haiku-wave-2-2026-10-30`; the session's assigned branch was used instead.
- Wave branch commits on top of `FRONTIER`:
  - `95373ba` docs: record wave 2 frontier status checks
  - `d03124e` docs: mark fixed handoff items superseded on frontier
  - this report commit (the branch head)
- Code changed: none. All wave commits are docs.
- PR: draft, base `codex/ghostpay-consolidation-20261030`, head `claude/haiku-wave-2-handoff-qepfoe`.

## Baseline (before any edit)

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | pass, 746 packages. Engine warnings: runner is Node v22.22.0; `jsdom` and `w3c-xmlserializer` want `^22.22.2`. |
| `npm run build:libs` | pass |
| `npm run typecheck` | pass |
| `scripts/dev/local-ci.sh --only build-libs,typecheck,lint` | pass: build-libs, typecheck, lint, `DONE fail=0` |
| `scripts/repro-check.sh --head` | pass: `REPRODUCIBLE`, both builds byte-identical |

## Step 2: status

Full table in `WAVE-2-STATUS-2026-10-30.md`. Summary:

- Already fixed on the frontier: P2 `paymentsOnly`, P2 `requireSession` removal, P2 single idle-lock signal, P1 AR2 window reset.
- Partly fixed: P1 BR (first bullet only), policy send (approve-tx check present; caller-side session guard unknown).
- Open: W-09 (`Scan.tsx:392` still says "paid directly" on non-router rows).

## Per task

| Task | Result | Commit | Tests |
|---|---|---|---|
| T1 `paymentsOnly` plumbing | skipped: already fixed on frontier (`RegistryView.tsx:247`, `PolicyCreate.tsx:102`) | none | none |
| T2 remove `requireSession` | skipped: already removed (no match under `apps/web/src`) | none | none |
| T3 one idle-lock signal | skipped: already one signal (`subscribeAppLock` everywhere, no session copy) | none | none |
| T4 docs drift | done: five superseded markers in `HANDOFF_FOR_NEXT_AGENT_2026-10-29.md` (AR2, `paymentsOnly`, `requireSession`, idle-lock; BR partly). Original text kept. | `d03124e` | docs only; no test applies |
| T5 nightly diagnosis | done, diagnostic only; no dependency, lockfile, or pin changed | none | `repro-check` pass (see below) |
| T6 Sonar report | done, read-only; bot comments only | none | none |

### T5: nightly failure diagnosis

Latest nightly on `main` (`edb0051`): run `41038072839`, two failed jobs.

**`reproducibility`: cause in main lock only; fixed on frontier.**
- Failure: `npm error code ESBOMPROBLEMS`, `invalid: zod@4.6.7, ^3 >=3.22.0 required by abitype@1.0.8`.
- Cause on main: nested `node_modules/@0xbow/privacy-pools-core-sdk/node_modules/viem/node_modules/abitype@1.0.8` (`package-lock.json` line 249 on `edb0051`). Its optional peer `zod ^3` is not met by the hoisted `zod@4.6.7`.
- Frontier: that nested entry is gone. The frontier lock diff from main is `1 file changed, 4 insertions(+), 149 deletions(-)`. Root `abitype` is `1.2.3`; `zod` is `4.6.7`.
- Verified on frontier: release-style `npm sbom --sbom-format cyclonedx --omit dev --sbom-type application` exits 0; `scripts/repro-check.sh --head` reports both artifacts byte-identical.
- Owner decision: the frontier lock change is the fix. Main stays red until it lands. Confirm the lockfile change is acceptable under the dependency review rules.

**`mythril`: fix on frontier only.**
- Failure: `pip install mythril==0.24.8` on the runner's default `python3` (3.14). `coincurve` has no 3.14 wheel; its sdist build fails with `Expected exactly one LICENSE file in cffi distribution, got 0`.
- Main's `.github/workflows/nightly.yml` has no `setup-python` step (0 matches). Frontier's has one pinned to `3.12` (1 match).
- So the pin takes effect on `main` only after the frontier merges.
- Not run here: the mythril job needs Python 3.12 and solc 0.8.28, and it is a CI-only job. Result on frontier: unknown until the nightly runs.
- Owner decision: merge path, as above.

### T6: Sonar (bot comments only)

| PR | Head | Quality gate | Detail |
|---|---|---|---|
| #37 | earlier head (comment at 08:30 UTC) | **failed** | D Security Rating on new code, D Reliability Rating on new code (both required A) |
| #41 | `70d8bf6` (comment at 11:27 UTC) | passed | 0 new issues, 0 accepted, 0 security hotspots, 0 new dependency risks; "0.0% coverage on new code" shown as-is |
| #42 | not checked against a SHA (comment at 13:06 UTC) | passed | 0 new issues |

What is not known: the bot comments do not show the rating details for PR #41, and the PR #37 failure is at an earlier head. Do not claim the D ratings are fixed on the frontier. PR #41's gate passed at the latest comment; that is the only evidence.

## Tests run

- Baseline set above: all pass.
- `scripts/repro-check.sh --head`: pass.
- No code changed on the wave branch, so no focused package tests were run.
- Full web coverage not run (per handoff; known flakes in small containers).

## Not run, and why

- Mythril job: CI-only (see T5).
- Focused package tests: no code touched.
- Full web test suite and coverage: per handoff.
- CI on the wave branch's new docs commits: not available until the PR's CI runs.

## Deferred (not done)

- W-09 `Scan.tsx:392` "paid directly" label: UI/receipt correctness. Owner or Opus.
- P1 BR bullets 2 and 3 (`Sweep.tsx:300`; inconclusive final look): sweep logic. Opus.
- Policy send caller session guard (`features/policy/send.ts:16`): unknown. Owner or Opus review.
- Recovered-tree port P1a (`fac0fbd` / `405c168` on `codex/ghostpay-recovered-lean-checkpoint-20261028`, 13 known conflicts): Opus.
- Qodo follow-on on AR2: a second transient `-32005` in one fetch can leave the scan window at half size (`logs.ts:475` area). Scanner logic: Opus.
- Qodo Medium on PR #41 (open): `scripts/audit/gen-audit24-report.py:319-323` writes the regenerated report through `NamedTemporaryFile` + `os.replace`, so the file ends up owner-only (0600). Other users of a shared checkout lose read access. Bot-suggested fix: copy the existing report's mode, or a umask-based default, onto the staged file before replace. Not in the wave task list: owner or follow-up.
- Any relayer, sweep, contract, deployment, or dependency change: out of Haiku scope.

## Owner decisions

1. Merge path for the frontier to `main`. This fixes the nightly `reproducibility` and `mythril` failures on `main`. Nothing here merges.
2. Accept the frontier lockfile change that removed the nested `abitype@1.0.8` (149 deletions). This is the reproducibility fix.
3. Decide on the Qodo Medium in `gen-audit24-report.py` (permissions on regenerated report).
4. Keep PR #37 and PR #41 as drafts until owner decides.

## Notes

- Wave commits contain no model identifier. The attribution trailers are `Co-Authored-By: Claude <noreply@anthropic.com>` and the session `Claude-Session` link.
- No pushes to `main`, `gh-pages`, or any existing PR branch. No force-push, rebase, amend, or empty commit.
- No secrets, RPC keys, deploy, publish, or release actions taken.
