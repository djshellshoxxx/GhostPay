# Resumed package qualification: PRs #565 and #568

Observed **2026-11-24 08:36 UTC**. This continues two interrupted qualification handoffs. It does not change their implementations or supersede their original branches.

## Source and independent review

| PR | Exact reviewed and tested head | Result |
| --- | --- | --- |
| [#565](https://github.com/djshellshoxxx/GhostPay/pull/565) | `68a4e9596062b2144ca5d9da3ff817b73644e2e1` | No blocking findings in the minimal template timestamp repair or its regression tests. |
| [#568](https://github.com/djshellshoxxx/GhostPay/pull/568) | `c6817a2e46a684cc29450fc0bc18d48fc6e9f500` | No blocking findings in the existing fiat output bound or its regression tests. |

The reviewer, `resume_package_qualification`, is separate from the original implementation worker. This is an independent AI engineering review, not a formal GitHub approval. Both PRs remained open, draft and unmerged, with zero submitted GitHub reviews and no review threads at inspection.

For #565, `Math.max` retains the previous valid update timestamp when the wall clock moves backward. `readClock` is still evaluated and retains invalid-clock errors. Newly created and imported templates use the existing validation paths. For #568, the existing magnitude validator runs after integer rounding; accepted signed values retain their exact arithmetic and out-of-range results use the existing `overflow` result. Neither change enables scheduling, changes custody or introduces financial interactions.

## Native package verification completed

Both isolated worktrees were checked out at their exact PR commits, and their tracked files remained unchanged. All commands exited 0:

| Check | #565: ux-schedule | #568: ux-fiat |
| --- | --- | --- |
| Complete package tests with coverage | **137 passed**, 6 files | **54 passed**, 2 files |
| Statements / branches | 99.54% / 97.95% | 100% / 99.31% |
| Functions / lines | 100% / 100% | 100% / 100% |
| Package typecheck | Passed | Passed |
| Package build | Passed | Passed |
| Package lint with pinned versions | Passed | Passed |

Commands were `npm test --workspace=@ghostpay/ux-schedule -- --maxWorkers=2` and the equivalent `ux-fiat` command, followed by each package's `npm run typecheck`, `npm run build` and `npm run lint` workspace scripts. Existing coverage thresholds were unchanged. Command summaries, captured output and job-level results are preserved in `docs/qa/resumed-packages-20261124/qualification.json`.

Runtime: Node 24.22.3; Vitest and coverage-v8 5.0.5; TypeScript 5.9.3; fast-check 4.10.2; ESLint 10.15.0 and typescript-eslint 8.73.0. The latter two were installed separately at their exact repository pins because the reusable dependency donor had older versions. Existing matching dependencies were reused through isolated links. This is not a clean full-repository `npm ci`, a local Node 22 run, or a local whole-repository test/build claim.

## Hosted qualification and remaining work

- **#565:** [CI run 45326703602](https://github.com/djshellshoxxx/GhostPay/actions/runs/45326703602) completed successfully at the reviewed head; all 24 jobs succeeded. The final workflow status was reread after an earlier summary still reported queued. Pages, Beta acceptance, Hosting kit and CLI operator qualification also succeeded. Hosted CI includes both full and lean browser jobs. Engineering qualification of this bounded fix is complete; shared integration still requires the coordinator's current ownership and merge checks.
- **#568:** [CI run 45333644284](https://github.com/djshellshoxxx/GhostPay/actions/runs/45333644284) still reports queued. All 22 substantive jobs succeeded, including full and lean browser jobs, but the aggregate `contracts` and `typescript` jobs remain queued. Pages, Beta acceptance, Hosting kit and CLI operator qualification succeeded. Do not call the central workflow passed until its terminal successful state is observed.

Neither package is imported directly by `apps/web` at the reviewed source. Package behavior was tested natively; hosted browser evidence is recorded separately. No local browser run is claimed by this qualification.

Before integration, reread each PR head and current main, reconcile active ownership and overlaps, and observe the final #568 aggregate checks. Preserve both source histories. No original branch, production file, shared integration lock, release gate or deployment setting was changed. No merge or deployment occurred in this qualification.
