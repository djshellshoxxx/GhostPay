# UX-Schedule — template edit clock rollback (2026-11-24 UTC)

## Scope and provenance

BUG ONLY, one sequential coordinator. Main inspected at `f76904301cff0b24d65ea4e31cbf37d470db4d95` (merge #537). Read AGENTS.md, WORKFLOW.md, HANDOFF.md and ACTIVE_WORK.md; integration lease observed at `4d130107dc2d92b73c6ec73d902ed5a925dc37a6`, generation 15 released; not acquired. No writes to other owners' branches or main.

Branch: `automation/20261124/bug/template-clock-rollback-r11`.
- Ownership claim: `c2a6ceb82ed16f921930910ed988ff53b689e6e9`.
- Regression-first commit: `4bab8efe8f3c8fa549cc5f2c096ed35f1ff5475e`.
- Production repair: `cb6adad6591d71345b66ee9141bd1893aa1196a8`.

314 open PR changed-file inventories checked for template/schedule paths, no errors and no owner of template.ts or the new dedicated clock-rollback test. Existing template.test.ts is owned by #224/#238/#262/#264/#278/#372; unchanged. Refresh before integration. Other candidate defects were deferred due to active ownership (#504 on export time/cache/search; #372 on i18n formatting). Main and latest PR page rechecked before branch creation; no newer PR numbers appeared.

## Observed failure and repair

Create a valid synthetic template at 1000 ms, update it at 900 ms. Baseline returns success with createdAtMs=1000 and updatedAtMs=900; parseTemplates([updated]) returns {ok:false,error:{code:'bad_time',message:'invalid template timestamps'}}. Valid local wall-clock corrections can therefore cause an edited template to fail its own import/restore validator. No live payment or wallet operation was performed.

Root cause: updateTemplate directly assigns readClock(clock) while parseTemplates requires updatedAtMs >= createdAtMs. Minimal repair uses Math.max(t.updatedAtMs, readClock(clock)) for valid existing templates, so edit metadata cannot regress and normal forward updates still use the current clock. Preserve readClock validation, patch and import checks; no behavior change to scheduling or execution.

## Executed verification

Full Git checkout unavailable: git ls-remote failed DNS resolution (github.com). Node v22.16.0 and TypeScript 5.8.3 available. Full source files retrieved via GitHub connector and reconstructed locally; git hash-object matched each exact blob:
- baseline template.ts: db09490a55bb53ff8dbf8e5144da22b628d1eccb
- repaired template.ts: ffaf6827ff814f40303a5127490caba98ea4c554
- result.ts: 0bfd142f44e06b3acf832a5b27ab3d0bddc98db8
- validate.ts: cb9b63207586651282ad8bf46237e58431cfdd98

Compiled each isolated three-file production set with tsc --strict --target ES2022 --module commonjs --outDir out *.ts. Executed a Node assert/strict harness with 14 checks against each compiled set. Baseline 11/14; three timestamp assertions failed (900 vs 1000, 1500 vs 2000, 0 vs 1000). Separate direct baseline call confirmed the bad_time parse failure. Repaired 14/14. Tests cover rollback before creation and after a previous edit, epoch rollback, forward/equal timestamps, preserved creation, valid patch/memo, import roundtrip, bad persisted time, bad amount, NaN/negative clocks, immutable id and input immutability. Actual runtime dependencies, no doubles. Added dedicated Vitest regression before the production commit; not run under full repository Vitest locally. No browser execution, full repo typecheck/lint/build or independent verifier locally.

## Outstanding gates

Keep draft until full exact-head required CI, applicable browser checks, independent review, ownership/dependency reconciliation and legitimate integration authority. No deployment, release, contract interaction, real traffic, real funds or new dependencies. Do not claim independent review from a sequential self-check.

PR #390 rechecked: exact head b655bc273a6704c9c140287b8adcdf4085b91882, 39 checks (36 success, 3 skipped), Snyk success, five normal workflow groups completed successfully, no submitted reviews, open non-draft and nonmergeable. Owner branch untouched. Prior draft #557 exact head 5f280cab9c252cf57a68e2c2d156c07b36d2b018: hosted CI still in progress and no independent review; left untouched. No merge in this round.

Final draft head and hosted CI observation will be recorded in PR conversation after creation, rather than editing this handoff and invalidating its qualification head.
