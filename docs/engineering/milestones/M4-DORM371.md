# M4-DORM371 — dormant F04/F05/F10 modules onto main

Owner: Claude coordinator `session_01Tj2YczsZkZSBgfB5BugRcS` (nifty-bohr). Branch `claude/nifty-bohr-5ra2ap-dormant-371`.

## Why

F04 merchant dashboard, F05 receipt assurance (GhostProof) and F10 recurring invoices are separate open stacks
(#397/#460/#535/#564/#579, #457, #391/#396/#456/#602) that all build on PR #371's dormant module base. Main had none
of it, so none of those children could be qualified against main. This change lands only the base.

## Source and provenance

- PR #371 head `1de6e0247e0f76afe6f1615b43e55007ece25d9b`, merged unchanged (its donors #322 `066731b4`,
  #323 `ccd1b16d`, #324 `4a48f2f0` stay ancestors).
- First merge onto main `8ddb3449` (`f63b5bee`); refreshed onto main `03695a7b` (`f0bd1472`).
- Conflicts were documentation/generated only: `docs/ai/ACTIVE_WORK.md` (main's file plus #371's 268 purely additive
  lines, applied as #371's own patch) and `PACKAGE_MAP.md` (regenerated). No source path conflicted.

## What lands (non-doc, 22 files, +2349/−3)

- `apps/web/src/features/future/{merchant-dashboard,ghostproof,private-recurring}/` model, projection, review and
  session modules and their tests. Not imported by any production entry point.
- `apps/web/package.json` / lockfile: workspace deps `@ghostpay/merchant-billing`, `@ghostpay/ux-receipts` (existing
  workspace packages; no new third-party package, THIRD_PARTY.md unchanged).
- `scripts/tests/future-module-isolation.test.mjs` (new) and a 3-line `lean-core-reachability.test.mjs` change that
  lists merchant-billing, merchant-hooks and ux-receipts as pending owner review.

## Evidence

Run on `f0bd1472` in a fresh `npm ci --ignore-scripts && npm run build:libs` worktree (Node 22.23.5):

| Check | Result |
|---|---|
| `node --test scripts/tests/future-module-isolation.test.mjs scripts/tests/lean-core-reachability.test.mjs` | 12 pass, 0 fail, 0 skip |
| `node scripts/agent/package-map.mjs --check` | current |
| `npx vitest run src/features/future --coverage=false` (apps/web) | 6 files, 227 passed |
| `npm run typecheck -w @ghostpay/web` / `npm run lint -w @ghostpay/web` | rc 0 / rc 0 |
| `npm run build -w @ghostpay/web`, full and `GHOSTPAY_LOCAL_BUILD_PROFILE=lean` | rc 0; bundle scan passed (19 / 17 files) |
| `npm test -w @ghostpay/web` | 240 files passed, 2 skipped; 3259 tests passed, 13 skipped; coverage 93.09/89.59/94.61/96.88 (thresholds 90/85/90/90 met) |

The 13 skips are the policy and registry Anvil suites (need `forge build` artifacts and solc) and one live-bitcoind
regtest case; they do not touch #371 paths. Hosted CI runs them with `REQUIRE_ANVIL=1`. A skip is not a pass.

Independent review (Worker F, on the earlier merge `f63b5bee`): APPROVE on code. Full and lean bundles were compared
with main built from the same `node_modules`: 19/19 full and all lean JS/CSS/HTML files byte-identical; no future
module, merchant-billing, merchant-hooks or ux-receipts entry in either module inventory; 0 of 43 long future-module
string literals in either bundle.

## Findings carried forward (low, not blockers)

1. The bundle-level guard is source-level only: `apps/web/scripts/localBuildProfile.mjs` rejected-module list and
   `scan-bundle.mjs` markers do not name `src/features/future/` or the three packages. Follow-up: add them.
2. `future-module-isolation.test.mjs` skips `*.testutil.*` and `src/test/` and checks only direct imports.
3. The three PENDING_OWNER_REVIEW entries in `lean-core-reachability.test.mjs` need an owner accept/remove decision.
4. Lock wording in `docs/consolidation/dormant-modules-20261121-1f782/REPORT.md` describes generation 11 as held; it is
   historical, not current lock state.

## Not claimed

No UI, persistence, issuance or browser flow for F04/F05/F10 is enabled by this change. The modules stay dormant.
