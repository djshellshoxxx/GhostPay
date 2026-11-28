# Template import epoch-bound repair — 2026-11-25 UTC

## Source and ownership

- Live main at discovery: `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
- Task branch: `automation/20261125/bug/template-import-epoch-bound`.
- Ownership claim commit: `27e3feec8031b862179f1547132f2f1a299097b4`.
- Regression-first commit: `565939e532a13c73fb01434912c562c8eec81a29`.
- Production fix commit: `9dee6e6d4979b794fc44d2282cbdca74882c3a4a`.
- Enumerated 249 open PRs via disjoint creation-date searches and inspected all returned changed-file inventories. No owner found for the production or new regression path. Prior overlapping clock-rollback #565 was confirmed merged; its behavior is preserved. Existing template.test.ts is untouched.
- Integration lease `automation/ghostpay-integration-lock` at `4fe0656517a03cb7a39d4e248187c76ffaa3238a`, generation 20 released; not acquired.

## Defect and smallest correction

`parseTemplates` accepts safe integer timestamps beyond the maximum supported by the package's own `readClock` (8,640,000,000,000,000 ms). Exact-source reproduction accepted a record whose creation and update timestamps are both 8,640,000,000,000,001, for which JavaScript Date is invalid. An update-only overflow and an invalid second entry in a list also passed. The parser checked nonnegativity, integer safety and ordering but omitted the upper limit. One additional upper-bound comparison on updatedAtMs covers both fields because createdAtMs must not exceed updatedAtMs. Existing error code and message are unchanged. No actual Pages caller or funds impact was established.

## Reproducible evidence

Git blob SHA-1 computed over Git blob header and original bytes from base64 retrieval:
- result.ts: `0bfd142f44e06b3acf832a5b27ab3d0bddc98db8`
- validate.ts: `4524f052280fdaf7961379c1e44b8517b334af52`
- template.ts baseline: `ffaf6827ff814f40303a5127490caba98ea4c554`
- template.ts repaired: `aeaf80c2761120ae98bd37e07b46e31b025fe1dc`
- new regression file: `ac64039dd737651424caa0eed147f2da98ab8ec4` (verified on repaired commit).

Executed all four committed regression bodies in an isolated V8 harness with TypeScript annotations/imports/exports removed and assertion shims. Baseline: 1/4 passed, 3/4 failed (both timestamps overflow, update-only overflow, and invalid second list entry). Repaired exact commit: 4/4 passed. Ten neighboring checks passed, including negative, fractional, nonfinite and maximum-safe-integer timestamps, inclusive epoch boundaries, equal timestamps and preservation of the already-merged clock-rollback fix. No native Vitest or full repository suite claimed: Node 22.16.0 and git were available, but git ls-remote failed DNS resolution for github.com. The source-hash-matched V8 harness is not a native repository build, test runner, browser or independent review.

## Gates

Draft only. Await hosted exact-final-head workflows, applicable native browser verification, independent reviewer, fresh path/dependency check and legitimate integration lease before any merge. No deployment, contract interactions, real funds, release, dependency changes or modification of other workers' branches. Next independent action: continue bug-only discovery in a different unowned function after checking this draft's hosted CI.
