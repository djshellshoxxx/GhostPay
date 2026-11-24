# BUG-ONLY: independent duplicate-group warnings (2026-11-24 UTC)

Base main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Task branch: `automation/20261124/bug/vault-duplicate-group-kind-r11`.

## Evidence and root cause
`packages/ux-vault/src/confusables.ts` documents a whole-book scan that reports exact-address, edge-matching address, and label collisions. Its final suppression stage pools exact-address and duplicate-label membership into one set. A pair of contacts with equal labels and distinct edge-matching addresses loses the address warning. A pair with identical addresses and distinct confusable labels loses its label warning. This is a false negative in the package result, not a demonstrated deployed browser defect or an external attack. The wiring specification identifies this API for DuplicatesReview; the live Pages UI was not tested.

The repair keys redundancy by corresponding exact kind AND identical member list. The existing ordering and same-kind suppression remain intact. No payment, wallet, custody or contract behavior changes.

## Exact history and tests
- Ownership: 29840498a0bd0b9ccb331d095aa71213a4747839.
- Failing regression first: 78918905e0fb33158046657e4ce461193ff3b908.
- Production correction: 6c3d7b60a6d408a72f32ce74e26de97d6881996c.
- Original source blob: 98d53a5d14138399769d361d9f8eb4ea99ef8c97; repaired source blob: df5d856b6d2385199674873b3c365f88d4075547. Both verified locally with git hash-object.
- Actual contacts.ts dependency matched f27397d1e880ee0b53308db6c8c4d7408601ba3a. Transitive bytes.ts/errors.ts were copied from returned source but did not match the connector-reported blob hashes; the exercised paths do not invoke those modules' functions. Do not represent the reproduction as an all-dependency hash-matched checkout.
- Node v22.16.0, TypeScript 5.8.3: tsc --noCheck --target es2022 --module commonjs --outDir out *.ts; node check.cjs before/after. Nine isolated assertions: baseline 7/9; repaired 9/9. Baseline failed on both cross-kind suppressions; neighboring true redundancy, dual distinct warnings, network separation, unrelated/empty book, partial subgroup and individual candidate warning cases passed. The committed Vitest test adds five targeted cases, not yet executed by repository Vitest.
- Full checkout failed DNS resolution for github.com. Repository Vitest, coverage, lint, typecheck, build and native browser tests NOT run locally; hosted exact-head results required.

## Coordination and integration
Main was rechecked before ownership claim. All 292 open PR changed-file inventories from snapshot through #537 were checked (one duplicate inventory read; no confusables source/new test collision). Registry contains no claim on the selected source. Reinspect live inventory before integration. PR #390 exact head b655bc273a6704c9c140287b8adcdf4085b91882: CI, Hosting kit, Pages, Beta acceptance and CLI operator qualification succeeded; Snyk succeeded; hosted Pages and beta browser jobs succeeded; no submitted review, mergeable=false. GitHub reports non-draft despite earlier description. Owner's branch untouched. Integration lease generation 12 released at 082e754f44944ebb4be283f89176b966bf8f7b4f, not acquired.

Keep draft until independent verifier, all required exact-head CI, applicable native browser evidence, dependency/ownership clearance and legitimate integration lease are satisfied. No deployment, release, contract/fund interaction or other branch edits. Continue next round with a separate unowned source path.
