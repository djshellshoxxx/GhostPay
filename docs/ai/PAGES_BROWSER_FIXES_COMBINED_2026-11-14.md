# Pages browser boundary fixes — integration handoff

- Base: PR #157 at `c3e707ade896c5acfebdb5967f4de7c0445740e2`.
- Owner: ChatGPT isolated branch `chatgpt/pages-browser-fixes-combined-20261114`.
- Owned paths: `apps/web/src/lib/{relayerClient,scanSpam}{.ts,.test.ts}` and this handoff.
- Source #158: `9a84764e70603e5f4e0b7bac13bdb6eeec6e469b`, bounded streamed relayer responses and cancellation regression. Its source PR reports application CI 24/24 green.
- Source #159: `7b6c4983e5c0ba048edf97aaff7399bd77980234`, reject wrong-token and out-of-window Transfer logs. Source PR reported corrected-head CI pending.
- Tests were committed first on this branch, then production fixes; the isolated PRs independently documented RED reproduction. **No combined-branch tests were executed locally**, and no combined-head GREEN claim is made.
- Files copied from source PR heads only after checking corresponding files on integration base. Changes are confined to four files and this handoff.
- Acceptance: exact combined SHA CI for web unit tests, typecheck, lint, Pages build, beta acceptance and relevant browser E2E; ensure no regressions in #150 backup and idle-lock flows.
- No deployment, merge to main, audit claim, real-money use, relayer server, CLI, contract, or native changes.
