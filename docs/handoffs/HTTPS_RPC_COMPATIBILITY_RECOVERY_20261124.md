# HTTPS/RPC browser compatibility recovery — 2026-11-24

## Selected source

| Item | Immutable source |
| --- | --- |
| Branch | `integration/https-rpc-compatibility-recovery-20261124` |
| Base | `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` |
| Base tree | `8add357748674afb128926a797982badb54bac6b` |
| Additive claim before integration | `d216ce4e2e8ffbdd99685cad59ebf0b0afc5ce99` |
| Original #578 donor, retained as merge parent | `20733b6a8ebc6a2598d5baff2eed62d58a0a7675` |
| Qualified source merge | `e2401baa939359b67b5f0541cdb92edcc8c6bd1f` |
| Qualified tree | `2cbd6aa5a1f7989fa4521c353b2a601b4d886fb5` |

The donor is one commit above `f76904301cff0b24d65ea4e31cbf37d470db4d95`,
which is already an ancestor of the selected base. Its entire three-path unit
could therefore be merged without restoring an unrelated historical stack.
Only `docs/ai/ACTIVE_WORK.md` conflicted. The union preserves both parents'
ordered nonblank lines and their multiplicities.

The 85-line `apps/web/e2e/https-rpc-compatibility.spec.ts` and the 36-line
`docs/pages/tor-rpc-compatibility.md` are byte-for-byte donor additions, with
unchanged modes. Their blobs are respectively
`e21f24efec4eaf8bea121adceb3f188d8c6f2521` and
`f1692ab905b527f7665c34b11a184da234b56664`. The transport note retains its
explicit historical source pin. All baseline application implementation,
existing tests, package manifests, lockfile, workflows and browser settings
are unchanged. This handoff and its receipts are subsequent documentation.

## Test contract and compatibility review

The test generates an ephemeral self-signed certificate with the normally
available OpenSSL executable and serves the existing Vite-built site over real
loopback TLS at an ephemeral port under `/GhostPay/`. Only that browser test
context accepts the synthetic certificate. Service workers are blocked.
Cleanup closes the context and server and removes the temporary certificate
directory through the original nested `finally` blocks.

The current shared `generateKeys`, `createPagesInvoice`, `openFresh` and
`configureRpc` helpers still supply the tested UI operations. The ordinary
signed invoice, selected Base Sepolia RPC, scan preference, saved-state message
and RPC status labels remain compatible. The test asserts a secure Web Crypto
context, a valid signed invoice and visible review, no RPC during the local
invoice and preference steps, persistence of the Tor Browser preference,
exactly one selected `eth_chainId` health request, a wrong-chain refusal, and
no unexpected routed request or WebSocket.

The RPC endpoint is a synthetic intercepted fixture. No live provider, wallet,
Tor circuit or payment is involved. The test expressly does not certify Tor
routing; saving that preference in ordinary Chromium only establishes the
application's declaration and selected-RPC behavior.

## Qualification on the exact source merge

| Check | Actual result |
| --- | --- |
| Full web TypeScript check | Passed |
| Full web typed lint | Passed |
| Existing Settings, scan-privacy and invoice-create suites | **70 tests in 7 files passed**, zero skips |
| Full desktop native-test collection | Exactly this one test listed |
| Lean desktop native-test collection | Exactly this one test listed |
| Donor blob/mode, ancestry and baseline preservation | Passed |
| Source diff whitespace | Passed |

The focused suites are `Settings.test.tsx`, `Settings.race.test.tsx`,
`Settings.scanPrivacy.test.tsx`, `scanPrivacy.test.ts`,
`scanPrivacy.transport.test.ts`, `scanPrivacy.clients.test.ts`, and
`invoiceCreate.test.ts`. Vitest used one worker without a coverage run; no
complete-web coverage result is claimed by this unit.

The unchanged commands are recorded verbatim with exit codes, elapsed times
and log hashes in `https-rpc-compatibility-recovery-20261124/QUALIFICATION.json`.
Node was `v24.22.3`; OpenSSL was `3.5.7`. The 68 local workspace links and
existing external dependencies were reused. All package sources match the
previously qualified export checkout, so no package output or installation
was changed. The earlier individual-export branch remains at
`7331ee05ad2d77e9fe86e538a8820f4b819e9dcc`.

## Historical donor native evidence

CI run [45334840342](https://github.com/djshellshoxxx/GhostPay/actions/runs/45334840342)
checked out PR merge `b608fefcb27d8f72e27372d936a5080c12582b8f`, combining
exact donor `20733b6a8ebc6a2598d5baff2eed62d58a0a7675` with
`f76904301cff0b24d65ea4e31cbf37d470db4d95`. Both decoded job logs identify
that checkout and explicitly show this spec passing, rather than merely a
green aggregate or skipped test:

| Historical native job | This spec | Whole job |
| --- | --- | --- |
| [Full, 138275203455](https://github.com/djshellshoxxx/GhostPay/actions/runs/45334840342/job/138275203455) | Passed, 1.3 seconds | 83 passed; 1 other test skipped |
| [Lean, 138275203494](https://github.com/djshellshoxxx/GhostPay/actions/runs/45334840342/job/138275203494) | Passed, 1.1 seconds | 71 passed; 3 other tests skipped |

The original donor CI, Pages and Beta acceptance workflows all completed
successfully at observation. This is historical donor qualification, not a
native pass of the recovered source or eventual final composition. The receipt
JSON retains source pins, job links, selected log lines and saved-log hashes.

## Remaining acceptance

Both existing full/lean CI matrix legs run the original web Playwright command.
The new file matches neither desktop ignore rules nor lean's embed-only
exclusion. The two successful `--list` commands confirm registration without
launching a browser, starting TLS or executing assertions. No workflow or gate
modification is needed.

The known local Chromium Unix-socket restriction was not retried. No browser
was installed or launched, and no workaround was attempted. Fresh combined
full/lean hosted builds and native execution remain mandatory. Application
bundle inputs are unchanged; this worker did not repeat a production build or
claim a new local bundle result for this test-only addition.

The coordinator owns independent final source review, publication, fresh
hosted acceptance and integration. No root worktree, donor ref or remote state
was changed. The separately handed-off 698-row branch index remains frozen at
its bda2af source and 12:24 ref observation; this later recovery belongs in a
separate publication/qualification appendix.
