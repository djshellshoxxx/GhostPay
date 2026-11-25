# GhostPay BUG-ONLY R11 — strict base64url decoder rejects untyped runtime values

**Date:** 2026-11-22 UTC. **Target:** static GitHub Pages beta; one pre-existing exported package function. **Base main:** `eb59d93cffed7848c4aac37d0e9650b87239c6da`.

## Exact source and root cause

- Original `packages/ux-flow/src/base64url.ts` Git blob: `619e46e7db73be17896943db1be0031e18a82a95`.
- Original `packages/ux-flow/src/errors.ts` Git blob: `1539db553c5609a85170d8f9d3e75b3d00c5b65a`.
- Repaired decoder blob: `14c44006b8cf0a238a8141f93ddae0b83216f48b`.
- `b64urlDecode(s: string)` is exported from the public `ux-flow` barrel and documented as a strict canonical decoder. At runtime it accessed `s.length` without a type guard. Values with no `length` (e.g. `42`, `Symbol(...)`, `false`) silently decoded to an **empty successful result**; an object exposing `length=2` and `charAt() => 'Q'` decoded to byte `0x41`; `null` and `undefined` leaked native `TypeError` rather than `FlowError('PROOF_ENCODING')`. These are existing decoder-contract correctness defects, not a claim of a demonstrated funds exploit.
- Existing package `decodeProof` has its own non-string guard, so no claim is made that its callers already reach the low-level defect. The exported decoder itself is independently callable and promises canonical-only decoding and typed errors.
- Smallest correction: short-circuit `typeof s !== 'string'` before reading `s.length`. No valid-string logic or accepted canonical encodings change.

## Ownership / sequencing

- Isolated branch: `automation/20261122T1426Z/bug/ux-flow-b64url-runtime-types`.
- Additive claim first: `204ff24ae940d2ceefe36a4e66e56647c9fa0739`.
- Failing regression committed before the fix: `2807083262d496c426e092309bd54b74bab33bfc`, new `packages/ux-flow/src/base64url.runtime.test.ts`.
- Minimal production fix: `1fa4b3cc1475797672f8ff2cc8d9ad5c71d75df0`, only `packages/ux-flow/src/base64url.ts`.
- Targeted open-PR file inventories included the major consolidation donors #278, #262, #264, #238, #307, #372, #246, #371, #380 and relevant #289, #407, #220, #470, #467, #465, #461, #453, #454, #434 and #471. No collision found with these two owned paths. This is not a claim of exhaustive changed-file scanning for every open PR. Recheck all claims before any integration.
- The externally held generation-11 integration lease is not owned by this task; no lock manipulation or main merge is permitted.

## Reproduction and actual qualification

- Execution environment: Node.js **22.16.0**, installed standalone `tsc` (TypeScript), `--target es2022 --module nodenext --moduleResolution nodenext --strict`. No repository checkout or npm workspace dependencies were available because container DNS cannot resolve `github.com`.
- Source-equivalent test harness compiled actual source files whose `git hash-object` **exactly matched the original GitHub blobs** above. Before fix: **10 failing of 86 checks** (two native TypeError, eight wrong accepts), 76 passing. The 86 checks included 11 non-string runtime objects, 65 byte round trips, three canonical vectors and seven noncanonical strings.
- The one-condition repaired decoder file was independently hash-matched to the published repaired blob `14c44006b8cf0a238a8141f93ddae0b83216f48b`. Standalone TypeScript compilation succeeded. After repair: **86/86 passed**, zero failures on the exact same check harness.
- Committed Vitest regression file exists but **full repository Vitest, full-workspace lint/typecheck, build, native browser testing, and hosted GitHub CI were not yet run / qualified** at the time this handoff file was written. Do not equate the standalone Node harness with repository tests.
- PR #390 preflight at `b655bc273a6704c9c140287b8adcdf4085b91882`: CI, Pages, Hosting kit, Beta acceptance and CLI qualification all completed successful, 39 check-run records (non-deployment jobs passed, deployment jobs skipped), and the independent GitHub reviews list was empty. Its branch was not modified.

## Next gates

- Open a narrow draft PR on `main`; inspect exact published head and hosted check conclusions, not previous SHA results.
- Require separate independent reviewer if available; a single-worker self-audit is not an independent review.
- Check overlapping heads/active claims again immediately before integration and keep any other worker's files untouched.
- Require full exact-head hosted CI, Pages, Hosting kit, Beta acceptance, CLI, applicable native browser checks and independent review before promotion; respect genuinely released integration lease ownership.
- Remain draft and unmerged if any gate is missing. No deploy, contract/funds interaction or release.
