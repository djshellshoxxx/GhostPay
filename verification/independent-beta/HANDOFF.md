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
| H6 | after a browser restart both tabs sit on `about:blank` (origin `null`), so I4 looked at no app storage | N11 flagged I4 at the restart step; the hash was visible on the next app load | I4 judged only from tabs on the app origin (self-test regression added) |

The `0c274c1` run was stopped before minimization (harness-defect artifacts); its log is not committed as evidence.

## Harness audit (milestone 1)

- `node --test verification/independent-beta/harness/selftest.test.mjs` → **11 pass, 0 fail**: 300 seeded random
  chain-operation sequences (canonical linkage, receipt iff mined, canonical quantities, nonce ordering), reorg
  semantics, RPC fixture answers, and oracle sensitivity to planted I1/I2/I3/I4/I5a/I5b/I7/I8 violations.
- End-to-end positive control **P1** (fresh browser profile, outside the accepted guarantee R26): the real app sends
  X again, as it legitimately may there, and the oracle detected **I2, I3, I4**. A run whose control is not detected is
  a harness error, so a green run cannot come from a blind oracle.
- Vacuity guard: a scenario in which nothing reaches the wallet is a harness error (caught H4).
- Coverage reached in `m1-d3edbdb` (computed from the trace): 87 retries refused with zero wallet requests, 40 control
  payments reaching the wallet once, 14 X handoffs whose reply never reached a live page, 9 returned hashes followed by
  reload/close, 6 explicit status checks after a reorg, 4 dismissed and 3 accepted clears (each accepted clear followed
  by one further permitted send), 26 success displays all judged against canonical truth.

## Runs (actual results)

All from the repository root, bundle `cae30f5d…` (lean, built from unmodified main), Chromium 158.0.8127.36,
node v22.23.5, linux x64, 4 CPUs. Wallet, RPC and chain are synthetic; no traffic left the machine
(`blockedOffOrigin` empty in every run).

| Record | Harness SHA | Command | Scenarios | Handoffs | Violations | Harness errors | Ambiguities |
|---|---|---|---|---|---|---|---|
| `results/m1-d3edbdb/` | `d3edbdb` | `run.mjs --named --seeds 1-30 --concurrency 3` | 40 (N1–N10, G-1…G-30) | 83 | **0** | 0 | 1 (A1, N8) |
| `results/m1b-9e7f7c4/` | `9e7f7c4` | `run.mjs --only P1…,N11…,N12… --seeds 31-50 --concurrency 3 --minimize` | 23 (P1, N11, N12, G-31…G-50) | 48 | **0** (P1 control detected as required) | 0 | 0 |

Seeds are tied to the harness SHA (the generator's alphabet gained `restart` at `16c3593`); every record also stores
each scenario's exact steps, so any sequence can be replayed without the generator.

What the unmodified candidate did, per requirement (black-box evidence in the traces):

- R3/R5/R12 interrupted before a hash (N1, N12, tab close or browser restart): the `Outcome unknown` record survived
  and blocked every repeat in both tabs; the late reply to a dead page was lost; the control still paid once.
- R3/R19 hash returned then reload, tab close or browser restart (N2, N6, N11): the hash stayed in the wallet-attempt
  list across tabs and restarts; retries were refused before the wallet was asked.
- R13 error after broadcast, transaction mined (N3): never shown as success; no automatic or manual resend.
- R25 deliberate override (N4, N10): a dismissed clear kept the block; one accepted clear permitted exactly one further
  wallet request across both tabs.
- R28/R29 stale authority (N5, N7, N9): a late hash after an account switch stayed X evidence and did not unblock X for
  the new account; a chain switch after the final check was refused with "The wallet network changed. Reconnect and
  review again." and nothing reached the wallet; an in-page switch to C while X waited in the wallet kept the late X
  hash as an X record and C paid once.
- R14/R36/R41 RPC down and reorg (N2, N6, N8): explicit checks returned `Outcome unknown` with the RPC down and
  `Pending` after the inclusion was reorged out; the hash was retained.

## Findings routed (no production code changed here)

Routing assumes the owner's W2 = payer checkout / attempt-journal UI and W3 = transaction status / reconciliation
split; reassign if W1's coordination says otherwise.

| Id | Class | Owner | Finding | Evidence | Suggested remedy |
|---|---|---|---|---|---|
| F1 | product, low (wording) | W2 | A tab blocked by an existing journal record shows "The wallet request failed with an unknown outcome and may already have been submitted…" before the correct "A previous wallet attempt for this action already exists…". For that click **no** wallet request was made, so the first sentence is inaccurate and may lead a payer to think a second payment might exist. Safe (nothing sent) but misleading. | 138 of the 141 refused send clicks across both runs (the other 3 show the chain/account-change refusal), e.g. `m1-d3edbdb` N2 step 14; `apps/web/src/views/Pay.tsx:136` wraps the refusal (`apps/web/locales/en.json:1621`) in `transaction.walletUnknown` (`en.json:1987`, security-classified in `apps/web/src/i18n/securityKeys.ts:365`) | show only the journal-refusal message when the refusal happened before any provider call; security-key wording review |
| A1 | ambiguous requirement | W3 | After the checkout showed "Status: included in block 501 (not necessarily final yet)", a reorg and drop removed the transaction; the done panel kept the inclusion text until the payer re-checked or reloaded. The explicit check then correctly said `Outcome unknown`. No payer-side rule says whether a displayed inclusion must be withdrawn (requirements gap: payer-side reorg unspecified). | `m1-d3edbdb` N8 steps 2–3 (`truth: mempool`, then `dropped`) | decide the payer-side reorg rule; if accepted, re-verify or mark the done panel stale on new blocks |
| A2 | docs contradiction | W2 / docs | `docs/handoffs/PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:7,14` still say the payer journal is "same-tab" / "tab-scoped" and that other or closed tabs are outside it. The built app blocks across tabs, tab close and full browser restart (N1, N2, N10, N11, N12), matching `en.json:1076`. | traces above | update the Pages verification doc |
| O1 | observation (known residual JRNL-L2) | W2 | After an accepted clear, the original held wallet reply arriving later recreated a record for X (evidence kept; no extra wallet request). Consistent with R33 and the documented residual "a cleared record can still come back". | N4 step 10 (journal 1 → 2 rows) | none required; mention in the user guide's clear-step text |

No I1–I8 violation (product-defect candidate) was found in 63 scenarios on the pinned candidate.

## Not covered yet (next milestones)

1. Seller-side reconciliation (ADR-0026): announcement logs, late-payment acceptance, reorg invalidation with retained
   decision history. Needs staged announcement + Transfer evidence in the synthetic chain.
2. ERC-20 checkout (approval/permit + payment): the per-invoice request count is ambiguous (A3) and needs an owner rule.
3. Replacement linking ("Link a replacement transaction" / nonce consumed) and wallet rejection 4001 policy (A4).
4. A W1-approved candidate SHA: rerun `build.mjs` + `run.mjs --named --seeds 1-50` on it when W1 names one.
5. Real-chain full browser restart (`docs/beta/CORE_BETA_COMPLETION_TRACKER.md:151` stays unchecked: this harness
   restarts a real browser over a mocked chain only).

## Resume

```bash
npm ci --ignore-scripts && npm run build:libs
```

```bash
node verification/independent-beta/harness/build.mjs --profile lean
```

```bash
node --test verification/independent-beta/harness/selftest.test.mjs
```

```bash
node verification/independent-beta/harness/run.mjs --named --seeds 1-50 --concurrency 3 --minimize
```
