> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay scanner and chain-adapter tests — round 5 completed review

## Outcome

**The exact assigned union is complete: 40 immutable path/blob versions, 33 paths, and 7,201 version-lines. No new actionable production security finding was established.** Two concrete, unranked test-quality issues are recorded below. Nothing remains from either predecessor handoff.

| Snapshot | Immutable commit |
|---|---|
| Frozen main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Primary candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |

The assignment was the union of `remaining` in `review-scanner-tests-round4.json` (24 versions / 3,867 version-lines) and `review-support-packages-round3.json` (16 versions / 3,334 version-lines). The authoritative output is `review-scanner-adapter-tests-round5.json`. Every completed row records its assigned SHA, exact blob, line count, kind, full coverage range, review method and byte identity against frozen main and candidate. The assignment contains no duplicate path/blob pairs.

Thirty-three blobs were read completely with line numbers. Seven older counterparts were reviewed through a complete newer-blob read plus the entire immutable blob-to-blob diff. All assigned `SHA:path` mappings and actual blob line counts were independently checked. An internally truncated section of candidate `Scan.test.tsx` was repaired by rereading the complete 440–570 span before any full-file credit. Initial handoff metadata truncation was also repaired with bounded reads; metadata inspection received no source-review credit.

No application, test, configuration or dependency file was changed. No target code, test, build, local EVM, proof of concept, live probe, transaction or Git mutation was executed. The only writes were this worker's two scratch reports. This is static source evidence, not an observed test pass or release approval.

## Concrete test-quality issues

### ST-Q01 — Quote conversion property treats unexpected payer exceptions as success

**Unranked test-quality issue; present on both frozen main and candidate.** The `fiatToTokenAmount` property catches any exception from the payer conversion and immediately returns from the property callback. That converts an unexpected rejection into a successful generated case. The generated inputs are positive and bounded, with fixed valid currency/precision and token decimals from 0 through 18. The separate fixed-example tests still provide some conversion coverage; this is specifically a weakness in the property and is not a claim that the whole suite would accept an always-throwing implementation. Sources: [candidate quote.test.ts:144–154](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.test.ts#L144-L154); [main quote.test.ts:140–150](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/quote.test.ts#L140-L150).

The improvement is to require the payer conversion to succeed for that valid domain. The seller path can explicitly distinguish its expected zero-result refusal from unexpected errors. No test mutation or execution was used to assess this issue; it follows directly from the callback's control flow.

### ST-Q02 — Router Anvil startup timeout lacks child cleanup

**Unranked test-harness issue; present on both frozen main and candidate.** `startAnvil` creates a child process, but its 20-second startup timer only rejects the promise. The outer `proc` handle is assigned after that promise resolves, and `afterAll` only kills the outer handle. A live child that never emits the expected readiness text can therefore survive failed setup. The error and exit paths also do not clear the startup timer. Sources: [router.anvil.test.ts:39–58](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L39-L58); [router.anvil.test.ts:78–81](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L78-L81); [router.anvil.test.ts:106–108](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L106-L108).

Retain the child handle before waiting for readiness and use one failure-cleanup path that clears the timer and terminates the process. Bound captured startup output as well. The other reviewed Anvil helpers already contain explicit failure-path termination. Sources: [payments.anvil.test.ts:39–52](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.anvil.test.ts#L39-L52); [quote.anvil.test.ts:48–60](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.anvil.test.ts#L48-L60). No process was spawned and no timeout was reproduced.

## Defensive evidence and its limits

### Scan, receipt and export lifecycle

The UI tests specify clearing actionable matches after chain/session changes, withholding receipt signing for unverified claims, omitting the one-time address from the default receipt, quarantine before confirmed reorg handling, tombstoning changed observations, retaining unchanged observations, and preventing post-cancellation history writes. They also exercise cancellation of an inline worker and same-key reimport during setup and active scanning. Sources: [Scan.test.tsx:175–274](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.test.tsx#L175-L274); [Scan.test.tsx:325–467](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.test.tsx#L325-L467); [Scan.test.tsx:599–703](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.test.tsx#L599-L703).

Payment-export tests use the real network authority around synthetic RPCs. Their assertions require a fresh export grant after a cancelled or expired scan grant, keep public-record export offline, refuse wrong vault credentials before new authority, and reject settings/policy changes before their storage event. The related UI file checks that discovering a payment does not download it, labels key ownership separately from payment verification, refuses private-key export for code-bearing addresses, and clears export panels after key changes. Sources: [Scan.stealthExport.authorization.test.tsx:45–172](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.stealthExport.authorization.test.tsx#L45-L172); [Scan.stealthExport.test.tsx:40–124](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.stealthExport.test.tsx#L40-L124).

These tests use jsdom, `InlineWorker`, captured downloads, and in-memory vault stores. The automatic-recheck suite replaces the production delay with a short delay and changes a synthetic visibility property. They do not establish native Worker isolation/termination, real-browser downloads, IndexedDB durability, cross-tab scheduling or background behavior. Sources: [Scan.test.tsx:1–44](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.test.tsx#L1-L44); [Scan.autoRescan.test.tsx:19–56](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.autoRescan.test.tsx#L19-L56); [Scan.autoRescan.test.tsx:92–157](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.autoRescan.test.tsx#L92-L157).

### Cancellation and bounded scan processing

Candidate privacy tests assert that both primary and secondary padded requests stop after cancellation. Package tests additionally specify pre-dispatch refusal, disposal of a late head/window response, no later requests, and fixed cancellation text. These support the already-established SN-K01 correction; this worker does not re-own or re-rank it. Sources: [Scan.privacy.test.tsx:32–56](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.privacy.test.tsx#L32-L56); [padded.test.ts:100–134](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/padded.test.ts#L100-L134); [range.test.ts:109–142](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/range.test.ts#L109-L142).

Adapter tests specify capped requests, partial-window resumption, log caps, canonical-block read caps, router-only coverage notices and refusal to advance through a router lane that still exceeds its limits. A source test explicitly documents the remaining ambiguity between an ordinary block affected by rate limiting and a response-size refusal, with router-only coverage reported. That is existing design-limit evidence, not a new candidate regression. Sources: [logs.test.ts:179–212](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/logs.test.ts#L179-L212); [scanHardening.test.ts:82–155](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/scanHardening.test.ts#L82-L155); [scanHardening.test.ts:309–331](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/scanHardening.test.ts#L309-L331).

The scan-source fixtures use fabricated block hashes, deterministic announcement data, in-memory indexer responses and in-process PIR servers. The candidate PIR tests explicitly require experimental opt-in. Those fixtures exercise comparison and parsing logic; they do not prove real operator independence, honest inclusion of every record, or deployed service behavior. Sources: [testutil.ts:6–133](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/testutil.ts#L6-L133); [indexer.test.ts:24–97](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/indexer.test.ts#L24-L97); [pir2.test.ts:28–119](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/pir2.test.ts#L28-L119).

### Narrow assertions should not be promoted into broader assurance

The composite-source test titled “best head wins” accepts either the lower head or `CHAIN_HEAD`, because its expected value branches on the returned value. It therefore does not enforce one exact best-head rule. Its intended rule should be asserted precisely or the test description narrowed. Source: [composite.test.ts:96–102](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/composite.test.ts#L96-L102).

The net-transport browser helper follows only relative static `from` imports/exports. It does not traverse bare-package internals, side-effect imports or dynamic imports, and its unprefixed built-in list is partial. This test cannot independently establish the complete browser bundle's dependency closure. It remains a narrow source check; predecessor-owned BROWSER01 and artifact evidence retain their separate meaning. Source: [browser.test.ts:9–31](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/net-transport/src/browser.test.ts#L9-L31).

### Cryptographic, registry and local-chain evidence

The cryptographic tests contain fixed EIP-712 example constants, manual-versus-viem digest comparisons, domain/nonce changes, and signature recovery checks. Registry tests cover exact calldata, malformed addresses, bounded opaque signatures, explicit verifier success, frozen callback inputs and refusal to fetch ENS offchain gateways. These add useful source-defined checks beyond self-round-trips. This worker did not externally revalidate published vectors, protocol addresses or library independence. Sources: [eip712.independent.test.ts:44–98](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/eip712.independent.test.ts#L44-L98); [sweep.test.ts:92–165](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/sweep.test.ts#L92-L165); [registryDelegation.test.ts:78–183](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/registryDelegation.test.ts#L78-L183); [registryEns.test.ts:21–87](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/registryEns.test.ts#L21-L87).

The three Anvil files skip substantive integration cases when required tools/artifacts are absent. A separate availability assertion becomes mandatory only when `REQUIRE_ANVIL=1`. The payment suite substitutes mock token code locally; the router fee suite builds with the Base Sepolia table while sending to a local chain; the quote suite installs compiled mock aggregator code. Their presence does not establish a passing integration run, current compiled-artifact/source identity, live token/feed behavior or a particular CI setting. Sources: [payments.anvil.test.ts:17–60](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.anvil.test.ts#L17-L60); [payments.anvil.test.ts:97–120](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.anvil.test.ts#L97-L120); [router.anvil.test.ts:61–66](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L61-L66); [router.anvil.test.ts:110–124](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L110-L124); [quote.anvil.test.ts:10–65](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.anvil.test.ts#L10-L65).

## Completed immutable coverage

All rows below have full coverage for every listed version. The JSON carries the exact blobs and assigned SHAs. Version-lines repeat unchanged lines between distinct blobs; they are not unique source-line counts.

| Path | Versions | Version line counts |
|---|---:|---|
| `apps/web/src/views/Scan.autoRescan.test.tsx` | 1 | 157 |
| `apps/web/src/views/Scan.i18n.test.tsx` | 1 | 94 |
| `apps/web/src/views/Scan.privacy.test.tsx` | 2 | 92, 117 |
| `apps/web/src/views/Scan.test.tsx` | 2 | 696, 703 |
| `apps/web/src/views/ScanPrivacy.i18n.test.tsx` | 1 | 216 |
| `apps/web/src/views/Home.authorization.test.tsx` | 1 | 85 |
| `apps/web/src/views/Scan.stealthExport.authorization.test.tsx` | 1 | 172 |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | 1 | 124 |
| `packages/net-transport/src/browser.test.ts` | 2 | 43, 50 |
| `packages/net-transport/src/selection.test.ts` | 1 | 75 |
| `packages/scan-source/src/composite.test.ts` | 2 | 145, 145 |
| `packages/scan-source/src/indexer.test.ts` | 1 | 109 |
| `packages/scan-source/src/pir2.test.ts` | 2 | 113, 121 |
| `packages/scan-source/src/range.test.ts` | 2 | 100, 142 |
| `packages/scan-source/src/testutil.ts` | 1 | 133 |
| `packages/scan-source/src/validate.test.ts` | 1 | 60 |
| `packages/scan-source/src/window.test.ts` | 1 | 41 |
| `packages/scan-source/src/padded.test.ts` | 1 | 134 |
| `packages/chain-adapters/src/eip712.independent.test.ts` | 1 | 99 |
| `packages/chain-adapters/src/logs.test.ts` | 1 | 466 |
| `packages/chain-adapters/src/payments.anvil.test.ts` | 1 | 230 |
| `packages/chain-adapters/src/permit.test.ts` | 1 | 197 |
| `packages/chain-adapters/src/quote.anvil.test.ts` | 1 | 111 |
| `packages/chain-adapters/src/quote.guards.test.ts` | 1 | 148 |
| `packages/chain-adapters/src/quote.test.ts` | 2 | 207, 211 |
| `packages/chain-adapters/src/registry.compat.test.ts` | 1 | 114 |
| `packages/chain-adapters/src/registry.test.ts` | 1 | 111 |
| `packages/chain-adapters/src/registryDelegation.test.ts` | 1 | 184 |
| `packages/chain-adapters/src/registryEns.test.ts` | 1 | 88 |
| `packages/chain-adapters/src/router.anvil.test.ts` | 1 | 159 |
| `packages/chain-adapters/src/router.test.ts` | 1 | 304 |
| `packages/chain-adapters/src/scanHardening.test.ts` | 1 | 493 |
| `packages/chain-adapters/src/sweep.test.ts` | 1 | 212 |
| **Total** | **40** | **7,201** |

## Remaining work and ownership

**Exact remaining assigned work: zero versions / zero lines.** There are no partial source reads in this assignment. Imported helpers and production implementations do not receive new full-file credit merely because these tests import them.

Preserve predecessor ownership of SN-K01, AP-Q1, PN01–05 and BROWSER01. SN-K01 remains an issue on frozen main with its correction in the primary candidate; AP-Q1 remains unranked. This report adds no new production-security ranking and does not reassess those findings. Root owns integration into audit notes and any repository commits.
