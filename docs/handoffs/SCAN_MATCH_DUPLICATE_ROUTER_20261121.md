# Scan shared-address warning — duplicate router callback checkpoint

Date: 2026-11-21 UTC. Cycle: `20261121T0033Z-root`. Status: **isolated implementation committed; NOT independently verified or merged**.

## Immutable source and ownership

- Base: `main` `aec179910c39081d820396409ff3139ff2264132` (observed before work). Branch: `automation/20261121T0033Z/bug/router-duplicate-warning`; all writes are confined to this task branch.
- Ownership recorded **before source edits** in `docs/ai/ACTIVE_WORK.md`, commit `41ac2a91f8106649e1a61471cf0ba65898c6ff80`.
- Test-first regression commit `89975a6923d2c1eb8c0f003aefecc98f9f471488`: `apps/web/src/lib/scanMatches.test.ts`, new blob `0e11f5d427345a594b0e3354b664d23903070830`.
- Product correction commit `94f25311b22fe4da6366d20eef5043bc03c6dc85`: `apps/web/src/lib/scanMatches.ts`, prior blob `48da43b4c870fc9d3debaf46b00e19951d012ba5`, resulting blob `f82c8a31dfc162e7187ac61e49ee072caab29637`.
- Handoff is this file, added as the final documentation commit. Do not infer a test pass from these GitHub writes.
- One assistant carried out sequential repository discovery, source audit, implementation and self-check; **no native subordinate worker, Caveman runtime or independent reviewer** was available.

## Finding and source audit

Potential P3 / low severity defensive correctness gap, **not an established funds-loss, exploit or current UI bug**. `sharedRouterAddresses` in `apps/web/src/lib/scanMatches.ts` previously considered every received router match as a separate record. Two callbacks for the same `announcement.id` and one stealth address triggered the warning that multiple router records share an address. A receipt-status refresh or repeated delivery should not produce that warning. Existing `placeScanMatch` ordinarily deduplicates these entries in the live Scan UI, limiting direct reachability; the changed function is a defense-in-depth boundary.

The implementation compares distinct router announcement IDs for each lowercased one-time address using a per-address `Map`. Non-router public replay entries are ignored. A truly different router announcement ID for the same address must still trigger the warning; valid scan, payment, cryptography, account and chain identity logic are unchanged. No dependencies, contracts, RPC behavior, keys or transaction logic changed.

Tests in `scanMatches.test.ts` cover repeated identical announcement ID with changed receipt state, a genuinely distinct announcement on the same address, and both input orders. Existing F1 tests for router replacement, late public replays and differing ephemeral keys remain intact.

## Evidence and limitations

- GitHub branch, code, base, original tests, existing scan and audit guidance inspected through connected GitHub API. Bounded recent pull-request changed-path checks (including #278, #307, #317/#318, #341/#345, #262/#264 and #302) did not show direct ownership of either modified source/test file. This is **not** full semantic coverage of historical branches.
- Original regression's source-equivalent JS reproduction returned a false positive for two same-ID router callbacks. A separate **source-equivalent** five-scenario logic check after repair passed: duplicate ID, distinct ID, distinct ID first, public replay, different address. These are NOT repository Vitest results and do not independently qualify the product.
- **NOT executed:** original repository Vitest, full/lean browser, typecheck, ESLint, build, coverage, security scanning. Earlier runtime could not resolve `github.com` for git checkout. Exact-head hosted CI must be checked on the final PR source; tests not run must not be marked successful.
- **Independent verification:** NOT performed. A fresh reviewer must check actual loaded `ScanMatch` identity, ordering, duplicate callbacks, prior scan semantics and all changed tests.
- **Security:** no newly established vulnerability, no public security disclosure issue. Relevant SECURITY.md pre-audit constraints remain open.

## Integration and conflict gates

The integration lock at `automation/ghostpay-integration-lock/integration-lock.json` was observed **HELD, generation 11**, owner `994a0d214fb9-root-r3`, acquired 2026-11-20T23:16:57.174Z, expires 2026-11-21T00:16:57.174Z. Expiry does not imply takeover. This task did not acquire, overwrite or release the lock and must not modify main or any shared integration target. Re-read the live lock and coordinator work before attempting integration.

Current broad #307 (head observed `5a745d4b5fba69b66a9779f88aefc63c253a4f27`) and #278 are separate active ownerships. This small branch must not overwrite their Scan UI, QR, privacy, wallet, recovery or other feature work. Recheck fresh heads, changed files and ancestry before selectively integrating. No main merge, release, tag, Pages deployment, production settings, real-funds action, force-push or gate bypass.

## Next cycle acceptance

1. Fetch fresh PR head and `main`, confirm unchanged source/test blob SHAs and no overlapping active writer.
2. Execute `npm run test -w @ghostpay/web -- src/lib/scanMatches.test.ts` (or the workspace's documented equivalent) and all relevant Scan component, full-web typecheck/lint/build and browser suites. Keep unchanged assertions, thresholds, timeout and regression coverage.
3. Have a fresh independent verifier inspect exact final changes; reject if duplicate-ID handling changes valid distinct router entries or masks payment warnings.
4. Check fresh required hosted CI and all downstream workflow triggers, reconcile integration lock ownership and release policy, and only then consider a qualified merge. Otherwise leave the draft PR and branch intact.

Do not create a competing shared status ledger while another coordinator owns shared integration state. The task claim and this source-pinned handoff are the durable checkpoint; see `AGENTS.md`, `docs/ai/WORKFLOW.md` and legacy handoffs for additional policy.
