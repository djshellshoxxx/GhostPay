# Bounded CodeQL reconciliation — 2026-11-19

## Source and ownership

- Base: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`.
- Implementation: `f65d547c4d514e339c6579600cc1cd22bbeb47cc`.
- Implementation tree: `40f656ca4d5f348fa3aa2ad09900adeb30c3b4bc`.
- Branch: `integration/ghostpay-codeql-reconciled-20261118`.
- Owner: independent CI/release reviewer; Caveman investigate-first.
- Owned code: PIR HTTP normalization and regression tests; the Settings persisted-RPC fixture; the ACTIVE_WORK claim.

The starting [CodeQL check 135014939758](https://github.com/djshellshoxxx/GhostPay/runs/135014939758) reported two high alerts: polynomial processing at `packages/pir-two-server/src/client.ts:79`, and cleartext sensitive storage at `apps/web/src/views/Settings.test.tsx:47`.

## Cause and changes

The trailing-slash expression could retry its match from each slash in a long interior run followed by a non-slash. The regression uses 100,000 interior slashes followed by `replica/`; the final slash also catches an incomplete guard that only checks whether the URL ends in a slash before executing the same expression. The original implementation spent 34,679.425 ms normalizing that input, exceeding the generous 2,000 ms budget without any network request.

The implementation now walks backward only through terminal slashes and slices once. Existing chain and URL validation still run first. No hostname, protocol, path encoding, timeout, request or response policy changed. A separate regression checks exact origin bytes and both endpoint paths with zero, one and multiple terminal slashes while preserving an interior double slash.

The Settings alert pointed at direct localStorage seeding with a deliberately key-shaped public fixture on the reserved `rpc.example` domain. The fixture and its `SECRET` identifier remain unchanged. The test now saves through the actual UI, checks the full persisted value, unmounts, clears session-only state, remounts, and checks both the saved-key warning and exact input/storage value. Existing session-only and ordinary explicit-persistence tests remain. This strengthens the reload boundary test; it does not rename a value to evade the analyzer or change runtime persistence behavior.

## Actual validation

Commands ran from the isolated CodeQL worktree. Node was v24.22.3 and Vitest v5.1.0; hosted CI uses its existing pinned environment.

| Check | Actual outcome |
|---|---|
| Before product fix: `node ../../node_modules/vitest/vitest.mjs run src/client.test.ts -t 'repeated path separators' --coverage=false` from `packages/pir-two-server` | Failed: 34,679.425 ms versus 2,000 ms budget; one selected failure, 23 deliberately unselected tests |
| After fix: `node ../../node_modules/vitest/vitest.mjs run --coverage` from `packages/pir-two-server` | Passed: four files, 62 tests; original coverage gates passed |
| PIR statement / branch / function / line coverage | 99.15% / 93.33% / 98.76% / 99.74%; original thresholds 95 / 90 / 95 / 95 unchanged |
| `git diff --check` | Passed |
| Independent source review | Separate recovery reviewer inspected all three code/test diffs and found no blocker; this was source review, not an independent test rerun |
| Settings test, typecheck and lint | Pending; not claimed passed |
| Hosted CodeQL and complete combined-head qualification | Pending; neither alert is claimed closed |

Local dependencies were temporarily linked to the coordinator's master worktree. Early runs encountered a missing nested Noble dependency or missing built workspace dist; those were setup failures. A combined type/lint attempt was killed with exit 137, and a later typecheck retry encountered a missing TypeScript executable during installation repair. The coordinator subsequently reported repeated installation OOM failures and explicitly stopped heavy local checks. These attempts establish no successful typecheck, lint or Settings result and are not evidence of a newly reproduced runtime defect. No dependency manifest, lockfile or workspace installation was committed by this workstream.

The preserved local logs are `audit-data/pir-codeql-red.log` and `audit-data/pir-codeql-green-3.log` in the consolidation workspace. Source and regression contents are pinned by the implementation commit above. This handoff is a documentation-only follow-up to that source.

## Integration boundary

Integrate the implementation into the combined candidate, retain both ownership claims if ACTIVE_WORK conflicts, and run the unchanged hosted scanner and complete existing checks on that exact candidate. Settings, typecheck and lint must be qualified there. Independent review and a passing PIR package do not qualify the whole recovery/privacy candidate.

No scanner suppression, exclusion, coverage threshold, workflow gate, dependency, crypto primitive, production contract, release or deployment setting changed. No remote ref, pull request, branch protection, release or deployment was changed by this workstream. The separately observed strict Mythril release failure remains open.
