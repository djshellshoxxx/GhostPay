# GP-BUG: imported profile extras incorrectly treated as standard settings

Date: 2026-11-22 UTC. **BUG ONLY; isolated; not merged or released.**

## Source provenance

- Repository: `djshellshoxxx/GhostPay`.
- Live `main` at selection: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Task branch: `automation/20261122-r6/bug/ux-guide-detect-exact-settings`, created from that exact baseline; no other branch touched.
- Claimed scope: `packages/ux-guide/src/profiles.ts`, new `packages/ux-guide/src/profiles.exact.test.ts`, additive `docs/ai/ACTIVE_WORK.md`, and this handoff.
- Original source Git blob: `b6a18547cd19ec2c4a624e4d08cc55393fd359e3`. Repaired source blob: `ce98bf8bb8d8e57f01388c3f3b3968cefd84267e`.
- Ownership claim commit: `24fa3df0125b295a6ca07e3361b96e3473d9f6c4`.
- RED regression commit (before production change): `134cff0df21359dbe4a9dcaa6d1dfe127223d258`.
- Minimal production fix commit: `4cd141dbdaa4a348c4a894afa9a032abc2c670f2`.

## Observed defect and root cause

`detectProfile` promises a built-in profile only when settings match exactly, otherwise `custom`. The original function loops through the eight known fields with `diffSettings` and ignores extra own enumerable properties. Therefore an imported JSON object such as `{ ...settingsFor('everyday'), unknownImportedSetting: true }` incorrectly returns `everyday` instead of `custom`. The only changed production line checks own enumerable property count before testing known values, preserving the existing known-field comparison. No default setting, questionnaire, or policy was modified.

## Reproduction and checks

- Node.js v22.16.0 source-equivalent local harness using the exact original `detectProfile` and `diffSettings` control flow and the matching baseline profile settings returned `everyday` for the additional-key fixture; an assertion expecting `custom` failed with exit 1. This was **not** a repository Vitest run.
- The **same** source-equivalent harness with the one-line fix passed (exit 0): three unmodified built-in profiles, three extra-key variants, one modified-known-field variant and one missing-key variant. No network, wallet or live funds used.
- Committed dedicated Vitest regression covers extra JSON-imported field for all three profiles, unchanged built-ins and a changed known field. Vitest, workspace lint, typecheck, build and native browser suites were **not run locally**; container cannot resolve github.com to clone the repository. Await exact-head hosted GitHub Actions and, if required, native browser verification.

## Ownership and integration gates

- Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, and `docs/ai/ACTIVE_WORK.md` at live main. The main active-work registry had no prior `profiles.ts` claim. Checked the changed-file inventories of all 209 open PRs at task selection, including broad consolidation and recovery PRs; no PR changed the two task source/test paths. Recheck for new PRs/head changes before integration.
- PR #390 (`b655bc273a6704c9c140287b8adcdf4085b91882`) retained exact-head CI, Hosting kit, Pages, Beta acceptance and CLI workflow success; zero submitted GitHub reviews. Its owner-controlled branch was not changed.
- Metadata-only `automation/ghostpay-integration-lock` branch SHA `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` reports `status: held`, generation 11, by `994a0d214fb9-root-r3`. Although recorded expiry is in the past, this worker has **not** treated that as authorization to seize it. No merge into main or lock mutation.
- Required before promotion: published focused draft PR; exact-head all-required CI GREEN; separate independent verifier/review (none available here); no ownership/dependency conflicts; applicable browser qualification; and legitimate released or held integration lease transfer. Do not waive any gate. Preserve draft otherwise.
