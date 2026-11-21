# TRON integration fixture repair

## Source and scope

- Branch: `codex/ghostpay-tron-integration-repair-20261119`.
- Base: `e76451ad56ba1634eed9d03468961900433fd130`.
- Claim: `21366d25`, recorded before implementation in `docs/ai/ACTIVE_WORK.md`.
- Tested and independently reviewed product: `5b85a0e542cb067d595de89c6b1a0c6445aec7aa`.
- Product delta: two test files, seven insertions and six deletions.

The coordinator's original-selection web run exposed a common TRON failure
across localized outcomes, endpoint-authority edits, normal view flows and
chain hardening. The current adapter requires a requested block range to be
complete, contiguous and ordered. The shared `mockTron` fixture returned only
genesis height 0 and funded height 500 even when callers requested the full
range through its advertised tip of 600. Strict parsing therefore rejected
the fixture before the tests reached their intended assertions.

`apps/web/src/features/tron/fixtures.testutil.ts` now returns each existing
requested height using `startNum <= height < endNum`, bounded by tip 600.
Only height 500 contains the existing funded transaction; all other returned
heights are empty. The exact 0-to-1 genesis response override is unchanged.

The missing-genesis case in `chain.hardening.test.ts` now asserts the adapter's
exact `INVALID_RESPONSE` code. The strict range parser refuses the empty
response before the view's old `first block` message can be reached. The
uppercase-mainnet rejection assertion in the same case is unchanged.

There are no production changes. Provider parsing, complete-range validation,
genesis identity handling, transaction/receipt checks, account/memo disclosure,
cancellation, endpoint authority and broadcast outcome behavior remain intact.
No other test assertion, timeout, configuration, coverage exclusion or
threshold was changed. The shared localization test file was not edited.

## Build inputs and focused execution

The isolated checkout used the coordinator's rebuilt library artifacts only
after byte comparison of each package's source, package manifest and TypeScript
configuration, plus the shared base configuration. All 18 runtime workspace
packages matched; 762 dist files were copied into this worker's checkout.
The comparison/copy receipt is `evidence/build-input-copy.json`. No build,
source or dist mutation was performed in the coordinator's checkout.

Environment: Node 22.23.4, TypeScript 5.9.3, Vitest 5.1.0. Original
`apps/web/vite.config.ts`, one worker, no file parallelism, no coverage flag.
The existing 60-second test timeout and production validation remained active.

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' \
  /home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node \
  node_modules/vitest/vitest.mjs run --root apps/web \
  src/features/tron/chain.hardening.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

Before the repair this reproduced **7 failures and 24 passes**, exit 1, in
2.95 seconds. The failures traced to strict `getBlockRange` rejection and the
obsolete missing-genesis prose assertion. See `evidence/chain-red.log`.

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' \
  /home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node \
  node_modules/vitest/vitest.mjs run --root apps/web \
  src/features/tron src/features/chainViews.i18n.test.tsx \
  --maxWorkers=1 --no-file-parallelism
```

After the repair **all 5 files and 69 tests passed**, exit 0, in 74.33 seconds:
the four TRON test files and the complete shared Bitcoin/Solana/TRON localized
outcome and authority suite. See `evidence/focused-green.log`.

Both logs retain the managed environment's existing experimental proxy
warning. No proxy or transport configuration was changed. No broad compile,
lint, browser or full-coverage result is claimed here; combined qualification
remains the coordinator's responsibility.

## Independent source review

Reviewer: `/root/privacy_completion`, read-only review pinned to
`5b85a0e542cb067d595de89c6b1a0c6445aec7aa`.

The reviewer found no introduced blocker and independently confirmed:

- The inclusive adapter API sends exclusive `endNum = to + 1`; the fixture's
  loop supplies unique ordered heights through the advertised tip.
- The payment remains exclusive to height 500, and the special-case genesis
  substitution plus uppercase-mainnet rejection are preserved.
- Missing genesis still fails closed; the exact adapter error-code assertion
  reflects the earlier strict validation boundary.
- Runtime adapter, web RPC, scan, `TronView` and network-authority files are
  blob-identical to the base. The delta does not relax provider or receipt
  checks, authority scope, cancellation or outcome assertions.

The reviewer did not independently rerun the tests. The RED/GREEN execution
above is attributed to the implementing worker, and the terminal green result
was sent to the reviewer with the unchanged product SHA. No remote mutation
or integration into main was performed by this worker.
