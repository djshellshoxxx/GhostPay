# GhostPay Pages jitter expiry rollback — 2026-11-19 UTC

## Cycle and ownership
- Cycle: `20261119T104800Z`; observed execution 10:48–10:54 UTC.
- Base main: `14ded337a10c140d7a9f9a9238ec038587d925bb`.
- Branch: `automation/20261119T104800Z/bug/jitter-expiry-rollback`.
- Worker: one ChatGPT assistant doing sequential discovery, test-first repair, read-only review and documentation. No second independent reviewer/subagent was available or used.
- Owned: `apps/web/src/lib/jitter.ts`, `apps/web/src/lib/jitter.test.ts`, this handoff and this branch's `docs/ai/ACTIVE_WORK.md` claim. Other owners' branches and shared automation ledgers were not changed.

## Defect and repair
The local announcement scheduler used `performance.now()` for delay but only wall-clock Unix seconds for expiry. A backward wall-clock adjustment let an invoice whose original time allowance had elapsed remain `waiting`, or `sendNow()` could return `ready`. This is a local scheduling correctness issue: neither a broadcast nor a real-funds bypass was demonstrated; payment has separate review guards.

- Claim commit: `436f406cf0483c3cee30b6a5b4dc3c9a5dd2c656`.
- Test-first commit: `2b7cedbd238f03296f4dd71cd66ddb217c03ca6a`.
- Minimal repair commit: `dbe6e9759cfa711eeb0c345d122bc8bb79eceed4`.
- Original main source blob: `f4d6fefe892130d70bfa9cea5113f611ccea8b02`.
- Repaired source blob: `9845576adfb522c17db145b1772276f66523180c`.
- Added regression test blob: `ff652c1d81720c9e45157479058e6b7b0edcaad2`.

The repair records start wall/monotonic samples and checks expiry against the later of the current wall clock and the monotonic elapsed-time floor. It also fails closed on nonfinite clock readings. Existing state semantics, random jitter generation, chain/network, key custody and transaction handling are untouched.

## Executed checks (specific scope)
- Reconstructed and checked byte-identical Git source blobs for both baseline and fixed `jitter.ts` with `git hash-object`; hashes above matched GitHub's immutable blobs.
- Node 22.16.0, `--experimental-transform-types`: actual baseline and patched TypeScript module imports (not transcribed predicates). Two new rollback scenarios: baseline `waiting` and `ready` (defect reproduced); repaired source `expired` and `expired`. Seven unchanged scheduling/randomness controls also passed against the repaired source.
- `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM --skipLibCheck /tmp/ghostpay-jitter.ts`: exit 0. This checks the isolated source only.
- Preliminary stand-alone scheduling-predicate reproduction passed.
- **Not run:** repository Vitest (including the two committed tests), workspace typecheck/lint/build, browser/full/lean E2E, cross-package coverage or hosted exact-head CI. Repository checkout failed DNS resolution for github.com; ESLint CLI not present in native container. The TypeScript source check above does not replace these gates.
- Source self-review checks monotonic rollback, normal waiting/ready, forward expiry, cancellation, immediate send, and existing CSPRNG sampling. No independent approval claimed.

## Coordination, outstanding work and release gates
- Last checked main: `14ded337a10c140d7a9f9a9238ec038587d925bb`; no main changes by this cycle.
- Latest metadata-only lock state last observed: released generation 2, owner `20261119T100000Z-11e5ddb9da60-root`, released 10:39:09 UTC. Lock was not acquired; no shared integration or merge was attempted. Never merge the lock control ref into source.
- Active PRs #262/#264 and recent #269–#272 were checked; their changed-file inventories do not own `jitter.ts` or its tests. PR #270 includes canonical-array and merchant-clock corrections from #265/#268 on a stack: preserve those isolated PRs and let their owners deduplicate after qualification.
- PR #258 hosting-kit targeted retry succeeded, but its full CI remained queued. #261 lock source CI, #265/#268 and #270/271/272 core CI were queued at latest inspection.
- Relevant Mythril/contract findings, signing policy and external acceptance remain active independent gates; this narrow fix does not resolve them.
- Main Wiki Home and Sidebar already link separate User Guide and Developer Guide. Their source-pinned “latest” text remains older than live main; docs PR #215 owns Wiki documentation, so no overlapping Wiki edit or live publication occurred.
- No deployment, release, production settings, real funds, tag publication, branch deletion, forced ref update, Codex or paid API.

## Next cycle
1. Read fresh main, this PR's exact head and Actions checks; execute new Vitest cases, full relevant TypeScript/lint/build and browser gates when available.
2. Obtain a **separate** verifier's source/test review; review whether monotonic elapsed seconds and UI expiry policy match maintained requirements.
3. Reconcile active branch ownership, security findings, integration-lock generation and Pages deployment trigger before any protected merge. Do not merge based on isolated Node controls alone.
4. Continue independent in-scope work while global CI queue remains unexecuted; avoid duplicating #270 or existing recovery/scan owners.
