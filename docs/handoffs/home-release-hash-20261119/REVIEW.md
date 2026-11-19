# Home relative-entry release hash repair

## Source and hosted failure

Base: coordinator candidate `5dd63d651384a4712615e237bb09da3afcd40afb`.
Implementation: `9bc9f1a19abedfc667db7931c9892d6cee1190d0`.

The read-only qualification sweep inspected PR #251 head `3ae0b4f642a8941592fad48c26e9ed1bbec327f4`, Pages Anvil job [135409317152](https://github.com/djshellshoxxx/GhostPay/actions/runs/44479895738/job/135409317152). Dependency installation, library compilation, Foundry and browser installation succeeded. Step 9, `Pages artifact journey on anvil`, passed 14 of 16 tests. The Home test failed at `apps/web/e2e/pages-devnet.spec.ts:834` because the expected entry-script SHA256 text was absent after five seconds.

The Home code returned a raw `./assets/index-*.js` module attribute and passed it to the production network authority. The authority intentionally accepts absolute endpoint URLs. Its `new URL(raw)` refused this relative input before `computeReleaseHash`, which already knows how to resolve a relative URL, could run. The same source defect remained in the combined candidate.

The second #251 failure and sole #256 Pages Anvil failure were the invoice-expiry fixture: a one-hour browser clock jump also triggered the independent 15-minute idle lock. The combined candidate already isolates this test by mounting its payer context at expiry minus 60 seconds, then advancing only 90 seconds. This patch does not alter that fixture or payment behavior.

## Correction and regression

Home now resolves the module attribute once against `document.baseURI`, within the existing refusal handler, then passes the identical absolute URL to both `network.authorize` and `computeReleaseHash`. The strict authority parser, same-window-origin rule, exact endpoint binding, response bounds and cleanup remain unchanged. Invalid resolution or refused authorization still displays the existing unavailable state.

The new component regression uses the real production network authority. The observation wrapper calls through to its real authorization function; only the transport is an in-memory response fixture. Cases cover the normal `/GhostPay/` relative entry, an explicit same-origin `<base>` path, a foreign script that must not fall back to an unguarded fetch, and unmount revocation with a late noncooperative response.

On the unchanged candidate Home implementation: **3 failed, 1 control passed**. The two path failures show the exact expected absolute authorization endpoint versus the actual relative attribute; the lifecycle case confirms no request reached the fixture. On the fix: **30 passed** across the new four cases, existing eight About/Home cases and existing eighteen release-hash cases. SHA256 for the fixed public `abc` fixture is asserted; grants and fetches must use the exact same URL and forbidden-origin fetch count remains zero.

## Qualification and independent review

Executed serially with Node 24.22.3, Vitest 5.1.0 and `NODE_OPTIONS=--max-old-space-size=384`:

`vitest run --config vitest.privacy-local.config.ts src/views/Home.authorization.test.tsx src/views/About.test.tsx src/lib/release.test.ts --coverage.enabled=false`

The temporary untracked config maps workspace exports to this checkout's own source and uses one worker. It was not committed. The passing run took 13.00 seconds. Raw baseline/green output and hashes of the two changed files plus unchanged authority are in `evidence/`. No tracked configuration, assertion, deadline, coverage threshold or security gate changed. `git diff --check` passed. No broad build, lint, full-web or browser pass is claimed.

The recovery worker independently reviewed the runtime delta and regression, finding no blocker: resolution occurs before authority, the same resolved URL binds digest dispatch, and strict origin matching plus finally/unmount disposal remain. The coordinator must retain this review against the exact implementation SHA and obtain fresh combined-source hosted/browser qualification. No push, main merge, deployment or release occurred in this worker.
