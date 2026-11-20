# F03 fresh-worker audit handoff

This is the preserved initial audit brief. Completed reports, repairs, published source mappings
and the successor task are recorded in `docs/future/modules/F03-private-payment-links/HANDOFF.md`
and `QUALIFICATION.md`. The original checkpoint and evidence limits below remain historical.

Implementation checkpoint: `f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.
Tree: `387690ae4248ed35da78b359e84ba09c9b7a25b4`.
Baseline: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
Branch: `future/f03-private-payment-links`.

Read AGENTS.md and docs/ai/WORKFLOW.md. Review
`git diff 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5...f472030a1d9a993db1ba7a1a33f9a208c28ebf13`.
The implementation spec is `docs/future/modules/F03-private-payment-links/SPEC.md`.
`CATALOG_RECONCILIATION.md` distinguishes this selected file-interchange feature from a concurrent
broader future program. Do not describe the latter as complete.

Fresh independent lanes:

1. Standards: documented rules, maintainability, minimal scope and test quality. Distinguish hard
   documented violations from subjective code-smell observations. Do not repeat lint findings.
2. Specification: trace every requirement to implementation and actual evidence; identify missing
   behavior, inaccurate claims, wrong behavior and scope creep.
3. Defensive privacy/security: input bounds/encoding, wrapper versus signature authority, secret
   flows, network/wallet effects, stale/cancelled operation installation, disclosure wording,
   source/profile/session boundaries and download resource cleanup. Local synthetic data only.

Reports go to distinct files under `docs/future/modules/F03-private-payment-links/audits/`.
Do not edit production source or other workers' files; coordinator repairs findings and requests
follow-up review. Cite exact files/lines and explain user impact and a minimal repair. No live
payments, third-party testing, exploit development, network scanning or remote mutation.

Existing evidence: codec 74/74; independent actual QR image interchange 3/3; combined browser DOM,
original QR and translation registry 110/110. Six Playwright fixtures collected, not executed.
Original full-package coverage first stalled and was interrupted; a bounded second attempt ended
at 180 seconds before test results. Focused codec coverage ran with original thresholds but failed
the package-wide threshold because unrelated modules were not exercised. These are not complete
coverage qualification. Actual Chromium launch is blocked before page creation by the runtime's
socket restriction. Root owns serial broad type/lint/build and current-head hosted checks.

Do not assume author tests prove correctness. Independently inspect every changed feature source
and its callers. Ask the coordinator for the heavy-check slot before launching broad tooling.
Return an explicit finding list, exact reviewed checkpoint, reviewed scope, executed commands,
remaining verification limits and a clear source-review verdict.
