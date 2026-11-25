# @ghostpay/privacy-profiles: completion status

Scope: the package as a standalone library (issue 284, F18 package slice). It configures, validates and describes; it never executes a transaction, contacts a provider or enables a paid feature. Testnet proof of concept only. Nothing here is deployed or audited.

Base commit `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063` (main at start). The head commit is recorded in the pull request; a file cannot name its own commit.

## Method

30 checklist items: the 15 profile-management requirements and the 15 test categories of the completion task. Each is scored from evidence in the repository: done = 1, partial = 0.5, missing = 0. The percentage is a share of this checklist, not of the F18 module (its app layer is out of scope and not started).

## Requirements

| # | Requirement | Start (c8e131c) | End | Evidence |
|---|---|---|---|---|
| R1 | Standard, Enhanced, Shielded, Maximum definitions | partial: no Shielded (confidential-amount instead) | done (membership of Shielded is an owner proposal) | `presets.ts`, `shielded.test.ts`, snapshots |
| R2 | Individual option selection | done | done | `setOption`, `presets.test.ts` |
| R3 | Validation and normalisation | partial: lenient sanitizer only; null input threw | done | `input.ts`, `config.ts`, `hardening.test.ts`, `config.test.ts` |
| R4 | Compatibility checks | done | done (severity now pinned by an independent oracle) | R-01..R-46, `rules.test.ts`, `support.test.ts` |
| R5 | Feature dependency validation | partial: rules only, no check of the data | done | `definitions.ts`, `definitions.test.ts` |
| R6 | Unsupported network and asset handling | partial: values checked, context not | done | `normalizeContext`, `support.test.ts` |
| R7 | Accurate limitation descriptions | partial: `doesNotHide`, `honestLabel` | done | `claims.ts`, `claims.test.ts` |
| R8 | Explicit consent requirements | partial: acknowledgements only | done at package level (UI pending) | `snapshot.ts`, `snapshot.test.ts` |
| R9 | Safe defaults | done | done | PP-4, `defaultSelection`, `emptyConfig` |
| R10 | Serialisation and deserialisation | partial: v1 lenient only | done | `config.ts`, `config.test.ts` |
| R11 | Versioning and migration | missing: any other version reset to default | done | `MIGRATIONS`, `config.test.ts` |
| R12 | Backward compatibility | partial: nothing guarded | done | v1 blobs parse; `api.test.ts` |
| R13 | Immutable configuration snapshots | missing | done | `freeze.ts`, `createSnapshot`, `immutability.test.ts` |
| R14 | Clear validation errors | partial | done | `ConfigError` (code, key, path), `DefinitionIssue` |
| R15 | Never claim an unavailable or experimental capability is operational | partial: maturity gating only | done | `describeConfig`, property tests in `claims.test.ts` |

## Test categories

| # | Category | Start | End | Where |
|---|---|---|---|---|
| T1 | Invalid profile identifiers | partial | done | `hardening.test.ts`, `config.test.ts` |
| T2 | Missing and unknown fields | partial | done | `config.test.ts` |
| T3 | Duplicate selections | partial | done | `config.test.ts` (acks, consents), `definitions.test.ts` (preset order) |
| T4 | Conflicting preferences | done | done | `rules.test.ts`, `support.test.ts` (every conflict cell stays blocked) |
| T5 | Unsupported capabilities | done | done | `support.test.ts`, `claims.test.ts` |
| T6 | Invalid dependency declarations | missing | done | `definitions.test.ts` |
| T7 | Circular dependencies | missing | done | `definitions.test.ts` (including a property test) |
| T8 | Malformed serialised configurations | partial | done | `config.test.ts` (500 arbitrary inputs, text and objects) |
| T9 | Configuration migration | missing | done | `config.test.ts` |
| T10 | Unexpected runtime types | partial | done | `hardening.test.ts`, `api.test.ts` |
| T11 | Mutation of validated configurations | missing | done | `immutability.test.ts`, `snapshot.test.ts` |
| T12 | Deterministic validation | done | done | PP-3, `claims.test.ts`, `definitions.test.ts` |
| T13 | Unsupported network and asset combinations | partial | done | `support.test.ts` |
| T14 | Explicit consent enforcement | partial | done | `snapshot.test.ts` |
| T15 | Incorrect capability claims | partial | done | `claims.test.ts` |

Start: 8.5 of 15 requirements and 7.0 of 15 test categories = 15.5 / 30 = **51.7%**.
End: 15 / 15 and 15 / 15 = 30 / 30 = **100% of this checklist** (package scope). See "Remaining" for what that does not cover.

## Results

Run from `packages/privacy-profiles` on Node 22, vitest 5.0.5, at the head of the pull request.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass |
| Build | `npm run build` (also `node scripts/gen-matrix.mjs` and `--chain`) | pass |
| Tests | `npx vitest run --coverage --maxWorkers=1` | 14 files, 502 tests: 502 passed, 0 failed, 0 skipped (55 s with coverage, 22 s without) |
| Secret scan | `bash scripts/scan-secrets.sh` | OK |
| Affected workspaces | `node scripts/agent/affected.mjs --checks typecheck,lint,test` | only this workspace; no dependents, so no dependent regression tests exist to run |

Baseline at `c8e131c`: 5 files, 176 tests, all passed (32 s).

Performance (PP-19, informational, one run in a shared sandbox, built output, median of 2000 calls): `evaluate` of a full Maximum selection 0.13 ms (target under 1 ms), `reviewConfig` 0.15 ms, `parseConfig` of a stored config 0.01 ms, `applyPreset('maximum')` 12 ms. These are not benchmarks of a target device.

Coverage (thresholds 95 / 90 / 95 / 95, unchanged):

| | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Baseline | 97.07 | 93.93 | 98.95 | 98.66 |
| Now | 96.99 | 93.49 | 98.39 | 98.99 |

Aggregate statement, branch and function coverage is slightly lower than the baseline because the new modules carry defensive branches that cannot be reached with shipped data (for example the `requiresAny` path: the evaluator supports it but no catalogue value uses it). Every threshold still passes.

Mutation checks (manual script, 18 deliberate breaks, each must fail a test): 18 of 18 killed. The first run killed 17; the survivor (a conflict rule demoted to a warning) exposed that `rules.test.ts` accepted either bucket, and the test was strengthened.

Not run: the full repository suite, anvil-backed tests, Foundry, web e2e and the CI workflows. They do not exercise this package (nothing imports it) and CI runs them on the pull request.

### Defects corrected

1. `evaluate`, `applyPreset`, `setOption`, `acknowledge` and `serializeSelection` threw on a non-object selection or context.
2. A string in `Selection.acks` matched acknowledgement keys by substring, so `acks: 'privacy.ack.hopsWeak'` acknowledged the hops warning without consent.
3. An unknown `ctx.action` put every option out of scope, so a conflicting selection evaluated as ok.
4. Unknown environment or asset, a non-integer chain id and non-`Set` capabilities were accepted silently; an object that only claimed to be a `Set` granted every capability.
5. The catalogue, rules, presets, chain rules, step data and every result were mutable at run time.
6. `setOption` froze and shared the caller's `acks` array, `acknowledge` kept the caller's `values` object in its frozen result, and the `setOption` result was not frozen (found by the new immutability suite, which failed first).
7. `honestLabel` and `valueDef` threw on malformed arguments (found by the public-API totality sweep).
8. Any stored version other than 1 reset silently to the default; the strict path now refuses it with an error.
9. Rule severity was untested (see mutation checks).
10. During development: a capability claim listed `missing-capability` with an empty `missing` list when the capability came from a rule rather than the value definition. Fixed before the first commit that contained it; covered by `claims.test.ts`.

## Remaining integration requirements

- App layer (F18 section 10, slices 2 to 5): `apps/web/src/features/privacy-modes/` review reducer, accessible dependency and cost UI, saved variants, tab conflict handling. Not started; not in this package.
- FEE01 quotes and consent for paid modules; this package has none and cannot grant it.
- Live capability observations, expiry and re-checks at action time (F18 AC11, AC12): the caller supplies capabilities; nothing is verified here.
- `@ghostpay/privacy-pipeline` keeps its own copy of the rules; run its PL-7 check against `RULES`.
- Exact-context end-to-end evidence for Shielded and Maximum (F18 AC06). Until it exists both are `unqualified`.
- Vitest 5.1.0 (draft PR 278 bumps the devDependencies): tests here ran on 5.0.5.

## Owner decisions outstanding

See DEVIATIONS.md (section "Completion work, 2026-11-25"): Shielded membership; whether every trust party (including GhostPay's own unaudited code) needs consent; whether cycles in `requires` rules are errors; whether `sanitizeSelection` should keep silently resetting other versions; plus the earlier open questions Q1 to Q6.
