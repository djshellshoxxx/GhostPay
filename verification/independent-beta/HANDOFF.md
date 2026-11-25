# W5 handoff — independent payment-state verifier

Status: milestone 1 delivered (model + harness + recorded runs). Coordination: this file, draft PR
[djshellshoxxx/GhostPay#665](https://github.com/djshellshoxxx/GhostPay/pull/665), branch `nodata/elegant-tesla-kpeojx`.

## Pins

| Item | Value |
|---|---|
| Pinned main | `aaa71a112d90fd39f59b40de9f139e9cfdc62d61` (Merge PR #635, P1-LATE) |
| Candidate under test | main (unmodified). No W1-approved candidate and no W1 coordination handoff were found in PRs, issues or branches at start (2026-11-25 ~10:40 UTC). #664 head `d4bdd0224aec5b35b41483830b65006f146de7cd` was observed only, not tested. |
| Production diff vs pinned main | none (each run record verifies `git diff aaa71a11 HEAD -- apps packages package.json package-lock.json` is empty) |
| Bundle | lean (Pages) profile, built by `harness/build.mjs` exactly as `apps/web/playwright.config.ts` does; dist sha256 `cae30f5d6a2c1f389d545adeec84143f993ea20281f6eec4997f86b1227721b4` (18 files) |

## Capabilities in this session

| Capability | State |
|---|---|
| Checkout, git push to own branch, draft PR | available |
| Node / npm | node v22.23.5, npm 10.9.9; `npm ci --ignore-scripts && npm run build:libs` passed |
| Browser | pre-installed Chromium 158.0.8127.36 via repo-pinned `playwright-core` 1.64.1, headless; persistent profiles for restart |
| GitHub | built-in GitHub MCP + `gh api` search available; the `plugin:github` MCP server failed to connect (authorization header error) |
| Context7 docs | needs claude.ai connector authorization; not used (no library API was in doubt: harness uses Node built-ins, Playwright and `@noble/hashes` already in the lockfile) |
| Home computer, live wallets, funds, Foundry/anvil | not used / not needed for milestone 1 |
| Ordinary CI | does **not** run this harness; PR CI only proves the repo's own suites |

## Harness defects found and fixed (all in `harness/`)

| Id | Defect | Evidence | Fix |
|---|---|---|---|
| H1 | build set `GP_COMMIT`, making a release build that correctly refused the public test key | first build failed in `parseReleaseKeys` | build like `playwright.config.ts` (no `GP_COMMIT`); identity recorded separately |
| H2 | seller keys without backup in a payer tab: leave-page guard aborted navigation/reload | `ERR_ABORTED at about:blank`, `page.reload` timeout | seller role in its own tab, closed before payer tabs act; `beforeunload` accepted on deliberate leave |
| H3 | undelivered wallet hashes used to select journal rows | `check` found `no-row` for a hash the app never received | only hashes delivered to a live document select rows |
| H4 | checkout `Continue` is disabled while deployment checks run; RPC-down notices not read | vacuous N9 run (0 handoffs); empty status text | wait for enable, report blocked checkout, read whole row result; **vacuity guard**: zero handoffs ⇒ harness error |
| H5 | a held wallet reply released after the tab navigated counted as delivered (only `close` was tracked) | I4 candidates in seeds 2, 13, 19, 20, 22 of the `0c274c1` run, each with a navigation of tab A between hang and release | delivery requires the requesting document to be current; I4 window measured to the end of that document |

The `0c274c1` run was stopped before minimization (harness-defect artifacts); its log is not committed as evidence.
