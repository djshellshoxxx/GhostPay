# Six-diagnostic final web lint repair

Implementation: `e8e2edecd0b989a90f5afb65622df4efefeebf93`

Base: `75cc6149e2fd560f26725e806b24f859f999d647`

Qualified source tree: `477f8b25a744ba6ae9cd805776b234c1f27563f9`

The coordinator preserved an equivalent source tree remotely at `c835d2028381be162a8cf1662a51c07500134a61`. This handoff distinguishes the local commit that was tested from that published checkpoint.

## Problem and correction

The complete original web lint command actually executed on the base and failed with six errors, zero warnings, exit 1. It was not skipped or killed. The six-file correction removes an unused fee-reserve initializer, replaces an async fixture that had no await with an already-fulfilled Promise while retaining immediate abort, removes two unnecessary Storage double-casts, uses Testing Library's explicit input-element generic, and rejects a non-string test RPC body before JSON.parse.

Both native and ERC-20 branches assign the fee reserve before every use. The string-body guard strengthens the test transport's input contract. No assertion, security rule, coverage threshold, timeout, source inclusion/exclusion, manifest policy or runtime authorization boundary changed. BTC changes are confined to its existing test fixture; they do not enable BTC in the lean beta.

## Actual qualification

All results below are on the exact implementation above, with the supported Node 22.23.5 binary and source unchanged before and after each process. Third-party packages came from the fresh coordinator installation with an exact matching lock. Own @ghostpay links and source-identical copied compiled libraries avoided importing another worker's changing workspace.

| Gate | Result | Duration | Maximum child RSS |
| --- | --- | --- | --- |
| Ten affected original test files | 367 passed, 0 failed, 0 skipped; exit 0 | 125.39 s | 339,284 KiB |
| Full web `tsc -p tsconfig.json --noEmit` | Exit 0 | 40.78 s | 1,278,064 KiB |
| Full original `eslint --config ../../eslint.config.js src e2e` | Exit 0 | 91.53 s | 1,691,380 KiB |

The test invocation is a focused noncoverage regression run; it does not replace the original complete coverage gate. Typecheck and ESLint are the full original commands, with only process heap limits supplied through NODE_OPTIONS. Exact commands, source/tree identities, receipts and log hashes are in RESULTS.json; full raw logs are losslessly gzipped in evidence/.

## Independent review

The provenance reviewer approved the exact six-file delta, independently checking both fee-reserve control-flow branches, immediate abort/Promise ordering, the actual partial-Storage parameter type, string-body validation and unchanged assertions. The reviewer did not rerun these tests. Its exact receipt is included, along with the coordinator's source review when available.

## Integration and remaining gates

The root coordinator owns integration and publication. The separately recovered QR changes are disjoint and must receive fresh combined-source qualification after merging this repair. No complete web coverage, browser, Pages artifact, deployment, real-testnet, external-security-review or release readiness verdict is claimed by this handoff.

After qualification finished, only this worker's external dependency links were retargeted to the coordinator's independent normal installation. Own workspace links and compiled snapshots were kept. The retarget receipt is separate; no test result is invented for the later dependency arrangement.
