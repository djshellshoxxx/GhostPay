> **Coordinator update — 2026-11-20:** Current-main integration, whole-web TypeScript, scoped typed lint, module coverage, lean build and bundle validation now pass. See [COORDINATOR_VERIFICATION.md](COORDINATOR_VERIFICATION.md) and [PUBLICATION.json](PUBLICATION.json). Earlier pending/resource statements below are historical; hosted CI and full feature/UI integration remain separate.

# F04 source-pinned implementation handoff — 2026-11-20

## Latest review correction

Product correction: **`966f415e520298310efd1f03883ea69844ea5eed`**.
Independent review identified that the five new canonical-field regular
expressions used a line-ending-permissive end assertion. They now require the
end of the entire input, preserving valid canonical values and rejecting trailing
LF, CR, CRLF, U+2028 and U+2029 in references, amounts, chains, assets and hashes.

The final focused suite passes **61/61 tests**. Scoped strict TypeScript and
typed ESLint also pass, using the same temporary scoped configuration documented
below with all repository lint rules retained. All three commands ran sequentially
under the shared validation lock with a 768 MiB heap; the combined fail-fast
command exited 0. Temporary validation files were removed. No feature activation
or additional scope was introduced. The earlier source and qualification record
below remains historical provenance; independent review and broad qualification
remain coordinator-owned.

## Source and ownership

- Branch: `future/f04-merchant-dashboard`.
- Original specification head: `711e9e8f7e2b32431353b82c4e39e184d3ba0b58`.
- Main incorporated: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Main reconciliation commit: `b0cedd64`; the only conflict was the ownership
  registry, resolved by retaining both sides' records.
- Product/test milestone: **`be37f79df4d60e2d87cd845fbf8e6f0fa117b135`**.
- Owner: `future_features/f04_dashboard`, coordinated by ChatGPT root.
- Owned runtime: `apps/web/src/features/future/merchant-dashboard/` only.
- No dependency, contract, production route, wallet, storage, fee, release or
  deployment setting changed. The future module remains disconnected and disabled.

## Implemented milestone

The first projection/selector slice is implemented. See
[IMPLEMENTATION.md](IMPLEMENTATION.md) for the complete API and trust boundary.

Strict EVM-only snapshots contain claims, not imported finality. A separately
injected approved adapter supplies current canonical event assessments. Pending
and final results must bind all invoice/payment terms, including invoice expected
amount/expiry and the claimed inclusion timestamp. The provider receives no
first-arrival local evidence reference. Equal duplicate claims count once;
conflicting claims cannot contribute to either invoice. Reorg/revert evidence
removes the final contribution on rebuild and retains references for inspection.

Exact atomic totals remain separated by chain/asset and by final, pending and
late amounts. Missing fee evidence is `null`; history coverage remains explicitly
`not-evaluated`. Local query results are bounded and ordered. Rebuilds yield and
reject cancelled, superseded, expired or differently scoped contexts before
releasing decrypted results. There is no persistence or export side effect.

## Actual verification

Environment: Node 24.22.3; repository lock-matching Vitest 5.0.5, TypeScript
5.9.3 and ESLint 10.15.0. Existing package build outputs were supplied from the
coordinator's matching main source; this module imports no new package.

Commands run from `apps/web` unless stated otherwise:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run \
  src/features/future/merchant-dashboard --maxWorkers=1 --no-file-parallelism
```

**Final product source: 56 tests passed, one test file passed, no skips.** This
includes exact arithmetic above safe-number and aggregate uint256 ranges,
duplicate and conflicting evidence, exact provider binding, unverified/missing
evidence, pending/late/overpaid states, canonical reorg assessment independent of
reference order, revision/session/operation cancellation, no ambient `fetch`,
bounded filters and a 10,000-invoice/50,000-observation fixture. This is a focused
run without coverage, not a claim that whole-web coverage or browser gates passed.
The large fixture proves bounded behavior in the test environment; it does not
establish the proposed reference-device latency or memory target.

**Final scoped strict TypeScript: passed, exit 0.** A temporary
`apps/web/.f04-validation.tsconfig.json` extended the existing web tsconfig and
only replaced `include` with `src/features/future/merchant-dashboard/*.ts`:

```sh
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/tsc \
  -p .f04-validation.tsconfig.json --noEmit
```

**Final scoped typed ESLint: passed, exit 0.** A temporary config imported every
entry from the repository's `eslint.config.js` and appended only
`languageOptions.parserOptions = { projectService: false, project: <absolute
path to the temporary tsconfig> }`. All repository rules remained enabled; the
type program was limited to the owned files. The command was serialized with
the coordinator's validation lock and a 768 MiB heap:

```sh
../../node_modules/.bin/eslint --config <temporary-config> \
  src/features/future/merchant-dashboard
```

Both temporary configuration files were removed after verification. A reviewer
can reproduce them with the two settings above; they are not product changes.
`git diff --cached --check` passed before the product commit. Production entry
points contain no reference to this module.

### Earlier failed or superseded attempts

- The first Vitest attempt failed loading the existing Vite configuration because
  `@ghostpay/chain-adapters` had no local `dist` output yet. No tests ran in that
  attempt. The coordinator's existing-library build resolved that setup issue.
- Initial scoped lint reported the control-character regex style and an
  unnecessary test assertion. Both were corrected; a subsequent ordinary lint
  and 56-test run passed before the final coverage-metadata addition.
- Repeated final lint attempts using the whole web project's type service were
  killed by the environment with exit 137, including one serialized 768 MiB
  attempt. There was no TypeScript/ESLint diagnostic from those kills. The
  successful limited type-program check above does not erase those attempts or
  claim that whole-project lint succeeded.

The coordinator owns whole-web typecheck, lean artifact comparison, independent
review and remote publication. No full build, browser acceptance, remote CI,
real provider, real wallet or live-chain result is claimed by this worker.

## Acceptance mapping and next generation

| Spec criterion | Current evidence | Remaining qualification |
|---|---|---|
| F04-A01–A03 | Unverified exclusion, exact split sum, deduplication and conflicting linkage covered | Real evidence provider integration |
| F04-A04 | Provider-driven reorg/revert rebuild and retained evidence references covered | Canonical journal/chain adapter integration |
| F04-A05 | Deterministic in-memory rebuild only | Encrypted transactional persistence and crash recovery |
| F04-A06 | Abort/epoch/operation/revision checks around rebuild and selector release | UI lock clearing and export cancellation |
| F04-A07 | Stale revision selection rejected | Real cross-tab updates and export approval binding |
| F04-A08 | No export code exists in this slice | Reuse accounting sanitizers in explicit export flow |
| F04-A09 | Exact chain/asset totals, missing fees and coverage explicitly unknown | Actual fee evidence and scan-coverage adapter |
| F04-A10 | Maximum-count fixture, bounded pages and deterministic yield cancellation | Recorded browser/device latency and memory measurement |

Next independent worker should review the product commit and reproduce the
focused tests/type-aware checks. The next implementation slice should compose
P03 current canonical evidence with P05 encrypted journal revisions before any
dashboard UI is activated. A provider that merely echoes input fields is not
qualified evidence. UI/localization, recovery, cross-tab behavior, explicit
column disclosure/export consent, browser acceptance and fee evidence remain
unfinished. The overall F04 feature is **not release-ready**.
