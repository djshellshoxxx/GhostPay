# @ghostpay/privacy-profiles: completion status

Scope: the package as a standalone library (issue 284, F18 package slice). It configures, validates and describes; it never executes a transaction, contacts a provider or enables a paid feature. Testnet proof of concept only. Nothing here is deployed or audited.

Base commit `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063` (main at start). The head commit is recorded in the pull request; a file cannot name its own commit.

## Method

30 checklist items: the 15 profile-management requirements and the 15 test categories of the completion task. Each is scored from evidence in the repository: done = 1, partial = 0.5, missing = 0. The percentage is a share of this checklist, not of the F18 module (its app layer is out of scope and not started).

## Requirements

| # | Requirement | Start (c8e131c) | End | Evidence |
|---|---|---|---|---|
| R1 | Standard, Enhanced, Shielded, Maximum definitions | partial: no Shielded (confidential-amount instead) | done (D04/D05 policy selected; D05 buffer-only preference implemented) | `presets.ts`, `shielded.test.ts`, snapshots; [decision record](../../docs/handoffs/PR644_CONFIGURATION_DECISIONS_20261124.md) |
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

## Original #644 results (historical)

Recorded by the original package completion at #644 head `94ab256e5285f4009f915be18415bf0146a1242f`, from `packages/privacy-profiles` on Node 22 and vitest 5.0.5. These counts, benchmarks and mutation checks are historical; the D05 verification is recorded separately below.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass |
| Build | `npm run build` (also `node scripts/gen-matrix.mjs` and `--chain`) | pass |
| Tests | `npx vitest run --coverage --maxWorkers=1` | 15 files, 547 tests: 547 passed, 0 failed, 0 skipped (60 s with coverage, about 25 s without) |
| Secret scan | `bash scripts/scan-secrets.sh` | OK |
| Affected workspaces | `node scripts/agent/affected.mjs --checks typecheck,lint,test` | only this workspace; no dependents, so no dependent regression tests exist to run |

Baseline at `c8e131c`: 5 files, 176 tests, all passed (32 s).

Performance (PP-19, informational, one run in a shared sandbox, built output, median of 2000 calls): `evaluate` of a full Maximum selection 0.13 ms (target under 1 ms), `reviewConfig` 0.15 ms, `parseConfig` of a stored config 0.01 ms, `applyPreset('maximum')` 12 ms. These are not benchmarks of a target device.

Coverage (thresholds 95 / 90 / 95 / 95, unchanged):

| | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Baseline | 97.07 | 93.93 | 98.95 | 98.66 |
| Now | 97.07 | 93.12 | 98.52 | 98.81 |

Branch coverage is 0.8 points lower than the baseline because the new modules carry defensive branches that cannot be reached with shipped data (for example the `requiresAny` path: the evaluator supports it but no catalogue value uses it). Every threshold still passes and none was changed.

Mutation checks (manual script, 30 deliberate breaks of the safeguards added here and of existing rules, each must fail a test): 30 of 30 killed. Two rounds found weak tests that were then strengthened: a conflict rule demoted to a warning passed `rules.test.ts` (it accepted either bucket), and a "junk config" test was refused for the wrong reason (a different label) rather than for being invalid.

Independent review: one read-only reviewer agent was given the diff and the spec, not my conclusions. It reported 16 findings (6 medium, 10 low). I reproduced each as a failing test first (34 of 43 new tests failed against the reviewed code), then fixed 15; the 16th (move `definitions.ts` out of the bundle) is declined with reasons in DEVIATIONS.md item 17. The most important finding: `createSnapshot` reviewed the raw input but stored a differently normalised config (inherited properties and over-long lists were read one way and dropped the other), so the accept step could approve one thing and store another. That is now one code path. This is an AI-assisted review, not an independent professional audit.

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
10. During development: a capability claim listed `missing-capability` with an empty `missing` list when the capability came from a rule rather than the value definition; and a look-alike object claiming to be a `Set` granted every capability. Both fixed with tests.
11. Found by the independent review (all with regression tests in `review-findings.test.ts`):
    - Inputs were read through the prototype chain by the evaluator but own-only by the config code; a polluted `Object.prototype.acks` acknowledged everything.
    - `createSnapshot` evaluated the raw input but stored a normalised config; invalid entries, lists over 64 entries and a preset label that did not match the values were accepted or silently reshaped, and `snapshotIsCurrent` called refused input current.
    - Guard lists were mutable (`TESTNET_CHAIN_IDS.push(1)` removed the chain guard for chain 1; `ACK_KEYS.push(...)` made `sanitizeSelection` accept a forged acknowledgement). The sweep for this also found `STEP_ASSETS`.
    - A description marked a value `asserted` with no hint that acknowledgements or consents were missing; capability members were never validated (a symbol made `createSnapshot` throw); `missing` for rule-derived capabilities was a hand-copied table; `honestLabel` of garbage looked like an empty real label; a repaired selection could still freeze a caller's nested object; the Shielded preset was described as having no sponsors although its exit-gas preference can rely on a pool relayer.

## D05 verification — November 25, 2026 Pacific (November 26 UTC)

This follow-up is based on integration candidate `04b1a5acf6b48313178af85a3217512e57453dd5`, with normal merges preserving #644 `94ab256e5285f4009f915be18415bf0146a1242f` and the selected #651 decision record `be04d1167aeb24025f5a4970833ebb2dbb98af70`. Its only production behavior change is Shielded's `sweep.exitGas` preference list, now `['buffer']`. The final source commit and handoff are recorded in `docs/handoffs/PRIVACY_PROFILES_D05_COMPLETION_20261125.md`.

Fresh local checks used Node `24.22.3` and Vitest `5.0.5`, with dependencies installed by `npm ci --ignore-scripts --workspace @ghostpay/privacy-profiles --include-workspace-root=false --no-audit --no-fund`. No dependency or lockfile changed.

| Check | Command or comparison | Result |
| --- | --- | --- |
| Focused regression | `npm exec --workspace @ghostpay/privacy-profiles -- vitest run src/shielded.test.ts --maxWorkers=1` | Original 10 tests passed; the expanded 19 tests first had 3 expected D05 failures, then all 19 passed after the preset change. |
| Typecheck | `npm run typecheck --workspace @ghostpay/privacy-profiles` | pass |
| Lint | `npm run lint --workspace @ghostpay/privacy-profiles` | pass |
| Build | `npm run build --workspace @ghostpay/privacy-profiles` | pass |
| Full package tests and coverage | `npm run test --workspace @ghostpay/privacy-profiles -- --maxWorkers=1` | 15 files, 556 tests passed; 0 failed or skipped; 98.54 seconds. |
| Coverage | Existing 95/90/95/95 thresholds | pass: 97.07% statements, 93.12% branches, 98.52% functions, 98.81% lines. |
| Preserved snapshots | Compare all 20 entries with the donor merge | Exactly 4 Shielded entries changed, removing only the old advanced gas value or gas downgrade; all 16 other entries are byte-identical. |
| Scope and whitespace | Donor ancestry, changed paths, `git diff --check` | pass; only the directly affected package files differ from #644. |
| Secret scan | `bash scripts/scan-secrets.sh` | pass |

The focused additions preserve the exact Maximum gas order, pool exit/source/amount-plan equality, explicit advanced edits and their capability/asset/conflict checks, EIP-7702 warning, pool-relayer consent, empty preset acknowledgements, unqualified descriptions, and v1/v2 saved values with truthful snapshot labels. An independent read-only source review found no functional or assertion blocker. These are standalone-library checks; no full repository suite, live provider/transaction test, deployment, new mutation campaign or remote CI run is claimed here. The coordinator must qualify the eventual combined head before integration.

## Remaining integration requirements

- App layer (F18 section 10, slices 2 to 5): `apps/web/src/features/privacy-modes/` review reducer, accessible dependency and cost UI, saved variants, tab conflict handling. Not started; not in this package.
- FEE01 quotes and consent for paid modules; this package has none and cannot grant it.
- Live capability observations, expiry and re-checks at action time (F18 AC11, AC12): the caller supplies capabilities; nothing is verified here.
- `@ghostpay/privacy-pipeline` keeps its own copy of the rules; run its PL-7 check against `RULES`.
- Exact-context end-to-end evidence for Shielded and Maximum (F18 AC06). Until it exists both are `unqualified`.
- Vitest 5.1.0 (draft PR 278 bumps the devDependencies): tests here ran on 5.0.5.

## Selected policy and remaining work

The [configuration decision record](../../docs/handoffs/PR644_CONFIGURATION_DECISIONS_20261124.md) selects Shielded membership, trust-party consent, cycle validation, persistence/import policy and Q1-Q6's technical policy. This completion implements D05's buffer-only automatic Shielded gas preference and preserves the existing Maximum, advanced-edit, consent and migration behavior. The remaining application, capability, fee, qualification and release requirements above are unchanged; the standalone package does not implement them.
