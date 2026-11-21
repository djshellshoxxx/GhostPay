# GhostPay clipboard privacy guard — source-pinned cycle 2026-11-20 00:45 UTC

Status: **isolated implementation, NOT an integrated or completed issue #286 release feature**.
Worker/concurrency: one ChatGPT worker acting in sequential implementation and verification phases; no independent second worker or human review. Other integration coordinator holds generation 5; no lock acquired.
Branch: `automation/20261120T004531Z/feature/clipboard-guard`; base is PR #278 head `d74af79ebabdc8cead843361c3497b46d8c421f9`; observed main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Task: issue [#286](https://github.com/djshellshoxxx/GhostPay/issues/286), clipboard protection, one bounded primitive. No claim that global masking, settings UI, lock privacy, private history, or privacy-safe exports are complete.

## Owned changes and implementation
- Claim `7e5bd01fb06aab94ba7787e0e83e78a9fabc28ed` in `docs/ai/ACTIVE_WORK.md`.
- Test-first new `apps/web/src/lib/clipboardPrivacy.test.ts` at `408d7d9e`; `Common.test.tsx` opt-in regression at `8c1da586`.
- New pure helper `apps/web/src/lib/clipboardPrivacy.ts` at `b2118a8e`: `recordClipboardCopy` invalidates older timers after each successful app copy; optionally schedules 1 s through 5 min cleanup; compares clipboard before clearing; catches denied reads/writes.
- Bounded `CopyButton` optional `autoClearAfterMs` at `6b491dc1`; default remains disabled and existing copy behavior remains unchanged.
- A standalone Node probe exposed a second asynchronous read-staleness race (first seven scenarios pass, eighth fails). The regression was committed **before** the correction in `f52c6e3d87a2362ee2046ba1f940d3fafde1c794`. The helper was corrected in `f9dc414bf3094a61c27bec8d00ea9c667af491ae`; Common regression expectation updated in `cd96a83adf6ebea6715f5e504b518fd8845a775e`.
- Final source blob `apps/web/src/lib/clipboardPrivacy.ts`: `5e55f2ca693ef3112e8d12409572b29d96ef86a8` (confirmed Git blob identity with local `git hash-object`).
- Only owned source/test files and this handoff change; no network policy, custody, wallet, contract, fee, workflow or shared release state changed.

## Executed verification, with limits
- Local Node 22.16.0: exact-source blob `git hash-object` matched GitHub; standalone strict `tsc --strict --target es2022 --module commonjs` transpilation **PASS**.
- Node assert probes for disabled/invalid delay; matching content; externally changed content; identical repeated copy; second copy during pending read; denied reads; denied writes; and stale snapshot after another application changes clipboard: **8/8 passed after fix**, 7/8 prior to stale-read correction.
- These probes are a standalone harness against the exact helper blob, **not** execution of the committed Vitest tests, React component or browser/real clipboard. Node harness stayed outside the repository and is not durable test execution by CI. The committed TypeScript Vitest tests and UI test require exact-head GitHub CI, typed ESLint and independent verification.
- Web Clipboard API read-then-write is never atomic: the second read narrows but does not eliminate a between-read-and-write race with another application. Clipboard read permission may be denied, clipboard history cannot be erased, and this helper does not zeroize sensitive JS memory. No unsupported security guarantee is claimed.
- Option is a component prop only; user-facing Settings control, storage policy, translation and end-to-end coverage remain **unimplemented**. This is partial engineering for #286, not beta release approval.

## Integration and external gates
- At inspection, PR #278 exact head `d74af79e`: Pages, Beta, Integration, CLI, Hosting passed; core CI [44643709383](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709383) has **both lean and full browser failures** in `e2e/network-authorization.spec.ts:133`: expected 9 observed requests, received 15. This is a separate coordinator-owned issue. Contract analysis [44643709093](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709093) had passed Echidna and Mythril was still running. No attempt to weaken assertions or change coordinator-owned source.
- The metadata lock state is `held`, generation 5, owner `20261119-continuous-followup-0a7bc3583588-root`. No lease acquisition, merge, deployment, release, tag, real funds, fee, paid API, external Codex or other worker claimed.
- Checked `.github/workflows/pages.yml` at blob `552e4221da41f57b47a2f1dd816f6f3aa45b52ee`; publishing requires a manual dispatch on main with deploy=true. Creating a draft PR for validation does not dispatch publishing.
- Repository git clone unavailable locally because github.com DNS resolution failed; connector-backed source reads and writes succeeded.

## Next steps
1. Run newly committed `clipboardPrivacy.test.ts` and focused `Common.test.tsx` under repository Vitest; run exact-head typed lint/build and hosted CI and get genuinely independent review. Resolve any failures without weakening tests.
2. Build a distinct user-configurable Settings control, source-English/i18n translation coverage and persistence (separate ownership), then opt in sensitive CopyButton call sites and test multi-copy, denied permissions and screen-share behaviors.
3. Compare to newest #278 before integration; never cherry-pick blindly across a moving release branch. Only the lock-holding coordinator may integrate after mandatory checks and no-deployment verification.
4. Verify the coordinator's separate full/lean network-authorization browser failure; do not add duplicate repair work while another owner is active.
