# GhostPay — GP-QR-SVG-01 stable QR matrix before SVG serialization

Cycle: 2026-11-22 UTC. Root/implementer: one sequential ChatGPT worker; no native subordinate or independent reviewer was available. Scope: static Pages browser QR export correctness only. This is a new isolated repair, not a consolidation of another worker's source.

## Source and ownership

- Repository and default branch: `djshellshoxxx/GhostPay`, `main` at `eb59d93cffed7848c4aac37d0e9650b87239c6da` during discovery.
- Original `apps/web/src/lib/qr.ts` Git blob: `fbdc330a993b4cc8459a5d9455217c08652503fa`.
- Branch: `automation/20261122T1440Z/bug/qr-svg-matrix-snapshot`, based on the exact main SHA above. Before editing, ownership was claimed in `docs/ai/ACTIVE_WORK.md` at `b3fab53f827d836c71d9597e25f36efe84264594`.
- Regression-first commit: `deaec623bc6810e8ebcb21b3cb060d1c75eb4386` — new `apps/web/src/lib/qrSnapshot.test.ts` with mutable geometry and module regression cases.
- Production commit: `edbb9e43a2f0a672dcf81293734814b5e877ba6c` — snapshot of bounded matrix size and boolean modules before interpolating the standalone SVG; preserve existing `makeQr`, `qrPath`, `qrViewSize` and QR payload format.
- Files intentionally not modified: wallet, keys, invoices, recovery, contracts, relayers, workflows, dependencies, deployment, publish and origin configuration.

## Finding, reproduction and impact bound

`qrSvgText` originally evaluated `qrViewSize(m)` into the SVG viewBox/width/height **before** `qrPath(m)` validated matrix geometry. A getter-backed `QrMatrix` could return a string on its first `size` read and numeric `1` on later reads. Source-equivalent Node 22 reproduction against the unchanged QR path and SVG helpers produced an SVG with a caller-controlled extra attribute and `NaN` dimensions. A getter-backed `dark` array could change between iteration for validation and subsequent drawing. This is a **confirmed runtime helper correctness defect**, but no externally reachable path passing such an attacker-crafted object into `qrSvgText` has been demonstrated. Do not report remote exploitability or fund risk as established.

The production repair reads `size` once, bounds it to a safe integer 1..177, reads exactly `size * size` modules once, rejects non-booleans and mismatched lengths, then renders exclusively from the validated copied values. No untrusted geometry is interpolated. Legitimate generated matrices and SVG bytes are unchanged.

## Tests actually executed

- Baseline reproduced using standalone `node` with the nine-line source-equivalent `assertQrMatrix`/`qrPath`/`qrViewSize`/`qrSvgText`: a crafted getter yielded a standalone SVG containing an unvalidated attribute. This is **not** a repository Vitest run.
- Post-fix standalone Node 22 source-equivalent replay: **8/8 passed** (adversarial size, one-read size, one-read module, stable normal SVG, zero/oversized/mismatched/nonboolean inputs). This is **not** a repository Vitest run.
- Committed four Vitest regressions have **not** been executed in a local checkout. `git ls-remote` failed: `Could not resolve host: github.com`. Actual repository Vitest, TypeScript, lint, build, browser/Pages, full security checks and independent reviewer approval are pending hosted execution.
- No Caveman runtime, native subworkers, Mythril rerun, real keys/funds, contract testing, branch rewrites, force-push, deployment or release.

## Integration and next action

- Checked changed-file lists for #278, #262, #264, #372, #293, and several contemporaneous focused PRs including QR classifier #447; none in that bounded sample owns `apps/web/src/lib/qr.ts`. This is not a claim of exhaustively checking every open PR or historical branch. Recheck conflicts and current SHAs before integration.
- Integration lock ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` is **HELD** by `994a0d214fb9-root-r3`, generation 11. Expiry alone does not authorize takeover. Do not merge into shared or main.
- The Pages workflow has `pull_request` validation-only jobs. Deployment requires separate `workflow_dispatch` on `main` with `deploy=true`; no publication was requested or performed.
- Next cycle must inspect exact final PR-head CI (including `apps/web/src/lib/qrSnapshot.test.ts`), repair real failures on a separately claimed branch if needed, have a genuinely independent reviewer check final source and test strength, confirm policy/lock/merge protection and no deployment trigger, then integrate only if authorized and fully qualified.

Do not count this small defensive fix as resolution of the separately owned P0 recovery/privacy work, Mythril findings or open beta clearance gates.
