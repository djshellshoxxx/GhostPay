# Tor qualification repair — November 20, 2026

## Scope and source

This continuation repairs two qualification failures on PR #308 at
`e60c69f32dbbd9edf7e81ed8866144d665e3de9a`. It changes one test assertion and
the dependency preparation in the validation-only Tor workflow. No production
Tor, hosting, browser, dependency-version, contract or relayer-runtime source changes.

Local repair commit: `b0809be0`; reviewed workflow blob:
`56a7423decd27d84e123ad3cf7f911c2e7061aae`; reviewed test blob:
`c41becdbc6099757a9fbbe1996698374f43c8f44`.

Current main `aa3df1cb37274fae73af0ca957183c15c51b62d3` was merged locally at
`0b9a3239`. Only `docs/ai/ACTIVE_WORK.md` conflicted. Both complete sets of
ownership lines were retained. The two repaired files remain byte-identical
to the independently reviewed versions. Main is a parent of the published
candidate so hosted pull-request checks can qualify a conflict-free merge.

## Established failures and corrections

1. [Static Tor job 136129634424](https://github.com/djshellshoxxx/GhostPay/actions/runs/44688876092/job/136129634424)
   stopped during the original whole-web TypeScript build because
   `@ghostpay/relayer-guard` declarations were missing. Existing web tests import
   the relayer test harness, while the workflow installed only the web workspace
   and built only its runtime dependency closure. The workflow now uses the
   repository's existing `npm ci --ignore-scripts` and `npm run build:libs`
   preparation. It then runs `npm run build --workspace @ghostpay/web`, retaining
   TypeScript, Vite, postbuild scans, and the lean profile. Building libraries for
   typechecking does not add a relayer to the generated static hosting stack.
2. CodeQL check `136166715165` reported an incomplete-URL-substring check at the
   generated README assertion in `tools/portable-hosting-kit/test/adapters/tor.test.mjs`.
   That test now requires exactly one complete expected `Onion origin` line.
   No CodeQL exclusion, suppression or runtime validation change was added.

All existing browser, static-byte, configuration, compiled-container, no-bootstrap,
and cleanup steps remain in the Tor workflow. Its permissions remain read-only.

## Executed validation

| Check | Actual result |
| --- | --- |
| Native Tor recipe, host-config, adapter and response-header selection | 55 passed, 0 failed, 1 skipped: Docker Compose unavailable |
| Hosting-kit original ESLint configuration | Passed, exit 0 |
| Hosting-kit original TypeScript configuration | Passed, exit 0 |
| Existing workflow regression suite | 5 passed, 0 failed |
| Pinned Actions check | All 114 references pinned, passed |
| Whitespace and staged secret checks | Passed |
| Independent source review | `integration_review` found no introduced blocker at the exact blobs above; reviewer did not rerun tests |

Commands:

```sh
node --test --test-concurrency=1 scripts/tor/hosting-config.test.mjs \
  tools/portable-hosting-kit/test/config/host-config.test.mjs \
  tools/portable-hosting-kit/test/adapters/tor.test.mjs \
  tools/portable-hosting-kit/test/serve/headers.test.mjs
node --test scripts/tests/workflows.test.mjs
bash scripts/check-actions-pinned.sh
# From tools/portable-hosting-kit, using the lock-matching shared tool binaries:
node <toolchain>/eslint/bin/eslint.js --config eslint.config.mjs .
node <toolchain>/typescript/bin/tsc -p tsconfig.json
```

The lint/typecheck commands used a 512 MiB Node heap and this worktree's own kit
source. Only external tool dependencies and Node type declarations were shared;
no application workspace build output was used for this validation.

## Remaining acceptance

Fresh hosted CodeQL and the complete static Tor job must pass on the published
repair and on the coordinator's combined candidate. This local repair did not
execute the full dependency install/library build, whole-web build, browser
runner, Docker build or Tor runtime/configuration stages. Their success is not
inferred from the configuration correction or native test results.

No onion service was started. Actual Tor Browser, operator-host and live-onion
acceptance remain separately recorded requirements in the original Tor handoff.
The new isolated PR is a qualification candidate; root owns main integration.
