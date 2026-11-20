# Executed validation and limits

## Environment and source integrity

All work used isolated checkouts of the pinned source. `npm ci --ignore-scripts --no-audit --no-fund` completed with each checkout's own lockfile on main, integration and privacy. No substituted dependency versions or application edits were used. Node was `v24.22.3`; main Vitest was `5.0.5`, integration Vitest `5.1.0`.

An initial offline installation attempt failed because a required tarball was not cached; the later exact-lock network installation succeeded. This was a setup issue, not a product finding. Runtime checks used synthetic local data and mock adapters. No live wallet, funded transaction, chain deployment or published site was used.

## Existing main package suites

Each suite used its pinned main package and bounded `vitest run --maxWorkers=2`. Logs are retained under [evidence](evidence/INDEX.md).

| Package | Passing tests | Other result |
|---|---:|---|
| address-safety | 76 | Passed |
| core-crypto | 74 | **One timeout failure** |
| invoice-schema | 728 | Passed |
| payment-uri | 199 | Passed |
| qr-exchange | 233 | Passed |
| secret-box | 47 | Passed |
| tx-review | 160 | Passed |
| ux-vault | 284 | Passed |
| net-transport | 193 | Passed |
| scan-source | 57 | Passed |
| **Total** | **2,051** | **One failed test; 2,052 total** |

The existing `core-crypto/src/independent.test.ts:126` 150-case bigint differential test exceeded its 60-second timeout; the observed test duration was approximately 71 seconds. The log reported no assertion mismatch. It remains a failed qualification result. No timeout increase or replacement test was used to turn it green.

These are main results. Source comparison of integration changes is recorded separately; the main passes are not presented as integration suite results.

## Browser build checks

Both pinned main and integration ultimately passed:

```text
GHOSTPAY_LOCAL_BUILD_PROFILE=lean NODE_OPTIONS=--max-old-space-size=3072 npm run build --workspace @ghostpay/web
```

This includes TypeScript checking, the Vite build, and each checkout's declared post-build checks. Integration also ran the CSP application step. Both bundle scans passed with 17 output files. See [main final build](evidence/build-main-web-retry.log.txt) and [integration final build](evidence/build-latest-web.log.txt). Ordinary chunk-size/dynamic-import warnings remain visible in the logs; they did not fail these builds. The integration build used the default broad connect-src because a custom origin list was not configured.

Earlier scoped dependency builds stopped web typechecking because web test fixtures import the separately built `@ghostpay/relayer-guard`. Building that existing dependency resolved the setup problem. An earlier main web build exited 137; its cause was not established. The sequential final builds above passed without modifying source or weakening a gate. Initial logs are retained to keep that history explicit.

The privacy snapshot and the two isolated newer fix heads were not independently built in this audit. Foundry was unavailable, so Solidity received source review, not a new Foundry/analyzer qualification.

## Focused defect checks

| Check | Observed result | Meaning |
|---|---|---|
| Main chain-tag/settings comparison | 1 pass, 1 expected-behavior failure | Settings partial-import control passes; chain tag scope fails. |
| Integration chain-tag/settings comparison | 2 expected-behavior failures | Confirms stale tag display and loss of unrelated settings draft. |
| Integration receipt regeneration/archive | 1 expected-behavior failure | Real signed receipt B inherits archived state although only A was passed to the local archive stub. |
| Integration destination advisory | 2 controls pass, 5 expected-behavior failures | Ledger works for Ethereum/Base Sepolia; fails for the other five supported testnets. |
| Integration policy import/send state | 2 expected-behavior failures | Confirms seller-record dedupe and pending-send review invalidation defects using local mocks. |
| Payment URI builder/parser checks | Accepted inputs produce 2,749/2,106/2,088-character outputs rejected with `TOO_LONG` | Confirms aggregate encoding-length mismatch. |
| Address-book lock during password change | Lock state later becomes false while `getBook()` remains `LOCKED` | Confirms asynchronous key-context publication after lock. |
| Metadata fee floor | 0.8 returned with minimum 1 and cap 0.8; normal controls pass | Confirms contradictory floor/cap contract. |
| TRON cancellation, both pins | Second buffered payment yielded after abort | Confirms iterator API defect; browser consequence remains timing-dependent. |
| Bitcoin preview, main | Strict decoder rejects wrong-network public address; preview accepts it | Confirms package preview mismatch; current browser validates before preview. |

Expected-behavior failures are evidence of defects, not passing regression qualifications. Test source and output are indexed under [evidence](evidence/INDEX.md). Some small direct-function checks are recorded in the specialist report and its machine-readable ledger instead of a separate test-suite log.

## Source-only and incomplete checks

Receipt printing, privacy wallet-history wiring, hygiene evidence binding and the embed popup title were confirmed from source/specification rather than a new browser run. Independent review corrected the print import trace to **AppShell → Pay → PrintableBill** and verified all wallet-history call sites.

A local Playwright popup fixture was attempted, but Chromium stopped at startup because socket creation was denied (`Operation not permitted`). No browser observation is claimed. No controls were bypassed to retry it.

The existing integration component/i18n suite was launched with two workers, but its retained log has no final suite summary and a completed exit status was not obtained. It is **incomplete**, not passing. The separately completed receipt regression and exact catalog checks remain usable evidence.

All four catalogs parsed on both baseline pins. Main had 2,253 classified source keys and 9,012 parsed messages; integration had 2,520 keys and 10,080 parsed messages. These checks establish catalog syntax/classification, not native-language translation quality.

No full repository test suite, full-profile browser journey, privacy browser run, live-provider interoperability test, formal cryptographic proof or production deployment qualification is claimed. Source-review completeness is recorded independently in [COVERAGE.md](COVERAGE.md).
