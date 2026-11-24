# POS #576 independent completion qualification

## Source and scope

Reviewed and executed on 2026-11-24 UTC by the delegated near-complete-branch
reviewer `/root/branch_inventory`, independently of the original implementation.
This is an AI-assisted engineering review, not an external audit or a submitted
GitHub approval.

- PR: https://github.com/djshellshoxxx/GhostPay/pull/576
- Frozen source: `a2c9bdf08549d53f27a1e57bd868f8c37c789ec0`.
- Frozen tree: `9379cc55337e042cbb59a5691b7ae8a3016898d6`.
- Isolated qualification branch: `finish/pos-576-20261124`.
- Parent #411: `482d36ad436f4b27b2d86ff9a2c22daf150000ad`.
- Grandparent #406: `506604288e31c195c852fa2e8896e131da34bc3b`.
- Original source base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.

Both parents are ancestors of the frozen source. The review covers the full POS
changes across #406, #411 and #576, including the original runtime guards and the
corrected 60-second parity boundary. No source, test, dependency, workflow, or
release configuration changed during this qualification. The only follow-up
changes are an additive ownership entry and this evidence document.

## Independent source review

No blocking defect was found in the reviewed POS scope.

- Start validates nonblank identity fields, positive bigint due amounts, the
  existing TTL limits, a safe nonnegative clock, and safe deadline addition before
  constructing an active state.
- An awaiting state cannot emit a successful transition with malformed monetary
  fields. Valid partial amounts remain exact bigint values in both reducers.
- Cancellation remains available with an invalid clock or deadline, preserves the
  partial total, and omits a damaged deadline from the closed state.
- A payment at the deadline returns an expired state without crediting its amount.
  The static UI applies that returned state even when `accepted` is false.
- Wrong invoice/currency, nonpositive deltas and terminal-state replays preserve
  the documented behavior. Terminal states cannot reopen themselves.
- Timer failure preserves the in-memory sale, provides a clock error, retries the
  countdown, and allows cancellation. Ending a sale removes the QR and bearer
  link. New sale resets amount fields and retains the selected currency.
- The static mirror and package implement the same transitions. The property
  suite also checks their behavior against an independent running total, so it
  does more than compare two implementations to each other.

The existing example remains a manually driven demonstration. This qualification
does not introduce payment verification, custody, refunds, a backend, or live
transactions. Its existing documentation distinguishes manual observations from
verified payment evidence.

## Native package qualification

Runtime: Node `v24.22.3`, within the repository's `>=22` requirement. Dependency
links reuse the existing local mobile qualification installation; local
`@ghostpay/*` links resolve only to this checkout. The complete lockfile SHA-256
matches that installation:
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.
Verified tool versions: TypeScript 5.9.3, Vitest/coverage-v8 5.0.5, ESLint 10.15.0,
typescript-eslint 8.73.0, fast-check 4.10.2, Playwright 1.64.1 and
qrcode-generator 2.0.4. The preliminary offline npm installation did not complete
and was cancelled; it is not claimed as a successful installation.

The following commands completed successfully with
`NODE_OPTIONS=--max-old-space-size=512`:

| Command | Result |
| --- | --- |
| `npm run build -w @ghostpay/merchant-hooks` | Invoice-schema dependency and merchant-hooks built successfully. |
| `npm run test -w @ghostpay/merchant-hooks -- --maxWorkers=1` | 42/42 tests in three files; zero skips. Coverage: 100% statements, functions and lines; 99.62% branches (264/265). Original thresholds unchanged. |
| `npm run typecheck -w @ghostpay/merchant-hooks` | Passed. |
| `npm run lint -w @ghostpay/merchant-hooks` | Passed. |
| `node --test examples/merchant-checkout/money.test.mjs examples/pos-terminal/parity.test.mjs` | 5/5 tests; zero skips. Includes 200 generated lifecycles plus 200 malformed-input cases, each against both reducers, seeds 400 and 401. |
| `bash scripts/scan-secrets.sh` | Passed: no committed environment files or key material. |
| `git diff --check` | Passed. |

No unrelated repository-wide local test run is claimed.

## Native browser qualification

All five committed cases in `apps/web/e2e/pos-terminal.spec.ts` passed together
in a single **7.3-second run**, with one worker, zero retries and zero skips:

1. Fully paid sale clears the customer view and resets for the next sale.
2. Expired sale preserves the partial total, clears the customer view, and resets.
3. Cancelled sale preserves the partial total, clears the customer view, and resets.
4. Broken clock blocks observations, countdown retries after recovery, and a late
   payment before a queued tick expires without credit.
5. Cancellation works with a failed clock; reload opens an empty terminal without
   local/session storage entries.

Runtime: **Chrome for Testing headless shell 156.0.8078.4**. The initial attempt
with system Chromium 156.0.8078.79 could not launch because the execution host
refused its process-singleton socket. No browser assertion ran in that failed
attempt. The available headless-shell runtime completed the five original cases
without changing any assertion or production code.

The standalone Playwright configuration used the existing test file unchanged,
`testDir: apps/web/e2e`, `testMatch: pos-terminal.spec.ts`, `timeout: 60000`,
`expect.timeout: 10000`, `workers: 1`, `retries: 0`, `fullyParallel: false`,
`baseURL: http://127.0.0.1:4196`, and `serviceWorkers: block`. The committed test's
route handler supplied the actual example HTML, CSS and JavaScript plus the
installed pinned QR renderer. No application web server or unrelated web build
was needed. This exercises the real static terminal controls and browser clock;
it does not mock the reducer or QR generation.

## Independently checked hosted evidence

CI run: https://github.com/djshellshoxxx/GhostPay/actions/runs/45334601011

The logs identify checkout
`7be4fbbafa0451b23d4ad07e8123e16c9229b685`, merging the exact #576 source into
its exact #411 parent. Locally,
`git merge-tree --write-tree 482d36ad436f4b27b2d86ff9a2c22daf150000ad a2c9bdf08549d53f27a1e57bd868f8c37c789ec0`
produces the frozen tree `9379cc55337e042cbb59a5691b7ae8a3016898d6`.

| Hosted job | Verified result |
| --- | --- |
| Lean browser, `138271089160` | 75 passed, three profile skips. All five POS tests explicitly passed. |
| Full browser, `138271089229` | 87 passed, one profile skip. All five POS tests explicitly passed. |
| TypeScript lint, `138271089117` | Success. |
| Typecheck, `138271089245` | Success. |
| Build/checks, `138271089303` | Success. |
| Web unit tests, `138271089454` | Success. |

At the final read, all **22 substantive jobs** in that CI run had succeeded.
The aggregate `contracts` job `138310273353` and aggregate `typescript` job
`138317357853` remained queued. The Pages, Beta acceptance, Hosting kit and CLI
operator qualification workflows also reported success for this source.
Do not describe the entire CI workflow as completed until the aggregates finish.

## Source and output identity

| Path | Git blob |
| --- | --- |
| `packages/merchant-hooks/src/pos.ts` | `778be290cef8b7f942b4469136ae76add14b9a10` |
| `packages/merchant-hooks/src/pos.runtime.test.ts` | `f1c47956b21634816b7f86b475952da57021bbd7` |
| `examples/pos-terminal/pos-logic.js` | `f27ae58949caa2ea3d6e16d0f1f3da8b9c1864b8` |
| `examples/pos-terminal/pos.js` | `edd17375f44e92e02ffe8c1f1e8c961682f30b3e` |
| `examples/pos-terminal/parity.test.mjs` | `0c34b45aa23c9b405216093f65fe024c9eb3164e` |
| `apps/web/e2e/pos-terminal.spec.ts` | `7fa8ef84b6ffa29f2207e918a4b0e1961a7b25c1` |

Local logs in the coordinator's scratch directory were hashed after completion:

| Log | SHA-256 |
| --- | --- |
| `pos-build.log` | `e6cac137af61a4108f7fbb93dc128e0e3e09076b412db7fab1184d710d4c4b94` |
| `pos-tests.log` | `fae8aea2371f75c043694bef64fb00a19c06c32a1dd9eb253f6ed35a53f40e13` |
| `pos-typecheck.log` | `9ffc476a5c1af47e3da0ac6ae6bd4a9700155594f62e8f69a0b51c1383b39c36` |
| `pos-lint.log` | `bdbc843d5ccd989f2d237c2c52f5d24cd3df17de124e50a4719db0df6390851d` |
| `pos-parity.log` | `c39560ce6184726e5971d20e514d19a33b98f068785c84ef347d9f5f85c6de06` |
| `pos-browser-headless.log` | `d72e250228a28e278bf51b477307efe8ccd25348d6a0e705b3f71a278848fa92` |

## Integration handoff

The implementation and its five browser acceptance scenarios are independently
qualified on the exact existing #576 source. No product repair was needed.
Preserve #406 and #411 ancestry; the coordinator owns remote publication and
integration. Recheck the head, target, ownership and final aggregate checks before
promotion. This evidence qualifies the pinned parent stack, not an untested
composition with a newer main. No remote update, merge, release or deployment
was performed by this reviewer.
