# Privacy profiles stress QA

## Scope

The only code change is the timeout for PP-10's deterministic preset grid in `packages/privacy-profiles/src/presets.test.ts`. The grid still covers every planned context: four presets, three environments, three chain IDs, and 40 capability sets (empty, full, and each of the 38 individual capabilities), for 1,440 `applyPreset` evaluations. No property cases were removed or reduced.

## Finding and disposition

The baseline QA log records this case at 75.813 seconds against the package's 60-second default, while the full run was about 159.9 seconds. This is an intentionally broad deterministic property grid, not an accidental Cartesian product: each axis and single-capability case is explicitly part of PP-10. The focused run without coverage completed in 48.23 seconds.

In the first coverage run, a 90-second test timeout was still exceeded: the `presets.test.ts` file reported 141.936 seconds. At that time another workspace test process (`hardhat test`) consumed a full CPU core. The subsequent package suite passed with the PP-10-only timeout set to 180 seconds while other QA/build jobs were active. This is a narrowly scoped stress-test allowance; the global Vitest timeout remains 60 seconds. Production evaluator code was not changed because isolated non-coverage execution is substantially faster and the measured slowdown coincided with CPU contention. No planned property coverage was reduced.

## Verification

Command: `npm test -- --maxWorkers=1 --pool=threads` from `packages/privacy-profiles`.

- 5 test files passed; 176 tests passed, none skipped.
- Total duration: 183.60 seconds under concurrent workspace QA.
- Coverage: statements 97.07%, branches 93.93%, functions 98.95%, lines 98.66%; all configured thresholds passed.
- Focused PP-10 run without coverage: 1 passed, 35 skipped, 48.23 seconds.

The run emitted npm's existing `Unknown env config "http-proxy"` warning; it did not affect the result.
