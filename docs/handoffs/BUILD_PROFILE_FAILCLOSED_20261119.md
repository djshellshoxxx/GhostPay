# Build profile runtime fail-closed regression — 2026-11-19

## Source-pinned checkpoint
- Target: GhostPay static GitHub Pages browser beta; no non-Pages implementation.
- Cycle identity: `20261119-c977`; one ChatGPT assistant ran sequential discovery, development, audit, scoped verification and documentation phases. No subordinate worker or independent approval.
- Base main `c977b5d6723f6822c3b5d86cd6b231712c53c395` (rechecked before handoff).
- Branch `automation/20261119-c977/bug/build-profile-failclosed`; source owned only at `apps/web/src/lib/buildProfile.ts`, test at `apps/web/src/lib/buildProfile.test.ts`, append-only branch ownership claim and this handoff.
- Claim commit `25c5bf88e8fa4d4c718bfb8716ca9356975f0a0b`; test-first commit `c5333bd70afbb717e93e427c5488d1072392f328`; minimal repair `c6d16c25243973a7b316b966bd86d7674e802da7`.
- Exact original `buildProfile.ts` blob `388e0a0b02e35c47b8595a57239eeb7f69334c64`; corrected blob `001fbf1105e1d28768624df6c47ccfdb16957d1a`; new test blob `315e4cc3fd4cdaa60b965bcf552aa9e3ce5b3477`.

## Defect, remediation and limits
The parser `profileFromDefine` treats unknown runtime values as the narrower `lean` profile, but the downstream `resolveProfile` treated all unrecognized runtime inputs as not `lean`; with the other values `full`, it returned `full`. The TypeScript union constrains typed callers but cannot enforce runtime input identity in JavaScript. No demonstrated payment exploit or bypass from current production callers is claimed.

The resolver now permits `full` only when the compiled build is exactly `full` and explicit/shell values are each `full` or absent. Unexpected runtime values fail closed. Existing 18 three-way valid-input cases are unchanged; no dependency, signing, custody, fee, workflow or build-profile setting changes.

The regression test was committed before the repair. It exercises invalid explicit, shell, and compiled profile values, plus the all-full control.

## Executed tests
- Reconstructed the **actual complete** baseline and fixed TypeScript modules locally; `git hash-object` of each file exactly equalled the two GitHub source blob SHAs above. For Node execution only, supplied a local minimal React `createContext`/`useContext` stub; no repository checkout, npm dependencies, or browser environment.
- Node v22.16.0 `--experimental-strip-types`: **9/9 negative acceptance assertions failed** against exact baseline source, as expected (three invalid values `'unexpected'`, `null`, `0` in three positions).
- Same 9/9 invalid cases **passed** against exact repaired source, plus **23/23 unchanged controls** (18 ordinary resolver combinations and five compile-define parse controls).
- Scoped `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext fixed.ts` completed exit 0 with a narrow local React declaration stub.
- **Not run:** committed Vitest test file against repo runner, full web typecheck/lint, browser/E2E or exact-head hosted CI. `git ls-remote` failed because `github.com` cannot be resolved from this container; this verification is not full product qualification. An independent reviewer must re-run/review final candidate.

## Sequential read-only audit (not independent)
Rotated away from prior audit 209. Source candidate list: `appLock.ts`, `duplicateAttemptJournal.ts`, `fragment.ts`, `merchantTemplate.ts`, `qrContrast.ts`, `settingsExchange.ts`. Deterministic FNV-1a32 of main SHA + prior ledger blob `bdd43ff933f2e458e121575e64cbf24c06204d68` + `rotation210` + ordered candidates = `164896609`, index 1 of 6, selecting `apps/web/src/lib/duplicateAttemptJournal.ts` (main blob `b8c2ec1915b833a5b78286b9b9caca1c247e827c`).
Read source, `duplicateAttemptJournal.test.ts` and `wallet.ts` caller: session-scoped journal writes before wallet request, unknown-broadcast retention, returning-hash journal update, explicit clearance, persistent corruption/duplicate-field failure and 128-record bounds. No independently reproducible new defect was established. No tests of these modules were executed. This review is not an independent security audit and does not certify wallet behavior. Do not publish speculative vulnerabilities; follow SECURITY.md. Existing Mythril findings and other release gates remain open. Coordinator can append the coverage entry to the shared audit ledger when lock ownership permits.

## Coordination and consolidation
- Checked ownership and path changes in active broad PRs #246, #262, #264, #278 and smaller #270/#273/#274/#276/#279/#258/#261/#269/#272/#277. None changed the two build-profile source/test paths at selection; do not overwrite their existing branches. The repository also has many other active PRs, so this is not an exhaustive branch-history comparison.
- Existing metadata-only integration lock: `refs/heads/automation/ghostpay-integration-lock`, last observed released generation 3 at commit `6408563f55081ee941c2036086c025ebf63d2c96`. No lock acquired; no shared tracking, branch integration or main merge attempted. Preserve the lock branch as metadata only.
- Prior automation lookup showed an in-progress invocation; it may be this scheduled execution, so not treated as evidence of an independent engineer or a lock grant.
- PR #279 exact head `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0`: [core CI 44527678568](https://github.com/djshellshoxxx/GhostPay/actions/runs/44527678568) still queued with matrix jobs not executed; scoped Pages/Hosting/CLI/Beta passed. PR #261 CI 44485294953 completed success, but PR remains draft and divergent with main; no merge approval.
- Main Wiki Home and Sidebar continue linking separate User Guide and Developer Guide. No Wiki publication attempted. `.github/workflows/pages.yml` documents validation on pull requests and a separate explicit `workflow_dispatch` with `deploy=true` for deployment; no automatic deployment inferred from normal PR validation. Check all downstream triggers and settings anew before any future main merge.
- No Codex, paid API, runtime Caveman, real-funds operation, deployment, release, branch deletion, force-push or GitHub approval/merge performed.

## Next
1. Publish draft PR from this isolated branch and inspect exact-head hosted CI.
2. A separate verifier should reproduce the invalid runtime values against baseline and fixed source, run full Vitest, typed lint, web typecheck and Pages tests, and assess whether the behavior affects legitimate callers.
3. Reconcile current main, review status, stale/conflicting PRs, shared integration lock owner and deployment triggers before any merge; avoid overlap with active consolidation.
4. Update shared `docs/automation/` and audit ledgers only under coordinator lock and valid ownership, preserving historical records.
