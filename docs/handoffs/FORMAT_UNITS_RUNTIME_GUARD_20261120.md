# Browser base-unit parser runtime boundary — 2026-11-20

## Ownership, scope, and source
Cycle started 2026-11-20T02:43Z; single ChatGPT sequential implementation/audit/coordinator, zero independent native workers available. Isolated branch `automation/20261120T0243Z/worker/format-units-validation` from main `c977b5d6723f6822c3b5d86cd6b231712c53c395`. No shared integration lock acquired. A different owner holds generation 6 for issue #286 / PR #293.

Claim: `790d56fa7474dfdf04c3237efe452073dd126e8e` (branch-local additive `docs/ai/ACTIVE_WORK.md`). Regression first: `1e90047b17627f3f18446b2d9bcc0d73e345d4ce`. Repair: `f49cd29b27766afe6cb42c07ab5cfd2d8b2e6f51`. Only production/test paths: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`. Source baseline blob `18dad7e4235c922bb7f197312317cc86557a12c2`; corrected blob `9ba8ea7b418eab5cf18e900923572cf3e255aedd`.

## Observed correctness defect (GP-BUG-20261120-FORMAT-01, Low)
The exported `parseUnits` promises undefined for unexpected input, but checked neither runtime type nor precision. On the exact baseline source, `parseUnits('1', 37)` returned `10000000000000000000000000000000000000n`, while decimals `1.5` or `NaN` raised native `RangeError` and non-string runtime input raised `TypeError`. A malformed parameter can therefore cause an unexpected exception or out-of-contract amount scale. Normal typed callers have not been shown to exploit this; no fund-loss, private-key or security bypass claim.

Regression tests committed first check illegal precision `-1, 1.5, 37, NaN, Infinity, -Infinity, undefined, '2'`, and untyped amount inputs `null, undefined, number, boolean, object, array`. They retain controls for 0 and 36 decimal places and existing whitespace/strict behavior. The minimal guard returns undefined for non-string input or precision outside the same 0..36 integer domain as `formatUnits`. Normal numeric parsing and transaction logic are unchanged.

## Executed checks and limitations
- `git hash-object format.ts`: original isolated local copy matches GitHub blob `18dad7e4235c922bb7f197312317cc86557a12c2`. Repaired local copy matches published `9ba8ea7b418eab5cf18e900923572cf3e255aedd`.
- Node v22.16.0, `node --experimental-strip-types regression.mjs` on exact original module: **7 passed / 14 failed** with exit 1 as expected. After the correction: **21 passed / 0 failed** with exit 0. The standalone harness is not the repository Vitest runner.
- Node exact-source deterministic roundtrip: **1,500 passing** decimal/base-unit assertions across supported precisions 0..36.
- `tsc --target ES2022 --module nodenext --moduleResolution nodenext --strict --skipLibCheck --noEmit format.ts` with TypeScript 5.8.3: **pass, exit 0** on isolated source.
- Repository checkout via `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed: `Could not resolve host: github.com`. No full workspace Vitest, lint, CI, Pages browser, build or independent code review has been executed for this branch.
- Local regression harness and exact-source module are execution scratch, **not committed**; the relevant repository Vitest regression cases are committed in `format.test.ts`.

## Integration/audit observations
At last refresh main remained `c977b5d6723f6822c3b5d86cd6b231712c53c395`. PR #278 (`417f7c71daf8645e1432f2ec8f070110879b80bd`) does not change the two owned format paths. #297 and #298 contain independently reviewed clipboard fixture and receipt correlation corrections; neither touches them. #293 still has failing exact-head lint and full/lean browser jobs; #297 addresses its test lint issues separately and current manual coordinator owns the required privacy continuation. Do not copy or supersede that work.

PR #278 core CI still has uncompleted browser/Slither jobs; exact-head contract-analysis has successful Echidna and failed strict Mythril (finding count must come from exact artifact). A prior durable handoff records unresolved High CodeQL alerts; no security disposition or waiver is made here. No autonomous external reviewer or contract review executed this cycle. The bounded audit focused on the public amount-parser trust boundary, and missing-implementation review leaves issue #286 assigned to its current owner. This is not a whole-repository security audit or exhaustive branch census.

No branch merge, release, deployment, production change, fee/transaction action, real funds, agent credit, paid API, source deletion, forced ref update or lock mutation.

## Next
Run committed `format.test.ts` under repository Vitest, full project TypeScript/ESLint, Pages build and browser gates on the exact final head. Obtain a separate native reviewer. Refresh main/PR ownership and CI; coordinate this small PR with the active #278 integration owner before any integration, keeping issue #286 and security gates blocked until independently qualified.
