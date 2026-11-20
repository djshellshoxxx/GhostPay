# Qualification, hardening and maintenance observations

These supplement the seven confirmed production defects in [findings.md](findings.md). Test assertion weaknesses, maintenance errors, existing hardening changes and documented trust boundaries are distinguished below. They are not additional demonstrated browser vulnerabilities. Static source review only: no target tests, mutation campaigns, live checks or performance measurements were run.

## Contract test and operational observations

### ROOT-Q01 — Negative metadata invariant discards unexpected acceptance

Router invariant negative metadata handler reverts on unexpected success under fail_on_revert=false, instead of recording a persistent acceptance count checked by an invariant. The bad-metadata action alone therefore does not independently establish rejection. Separate unit and fuzz tests do assert metadata rejection.

**Evidence:** [packages/contracts/test/GhostPayRouter.invariant.t.sol:103–119](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/GhostPayRouter.invariant.t.sol#L103-L119); [packages/contracts/test/GhostPayRouter.invariant.t.sol:185–191](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/GhostPayRouter.invariant.t.sol#L185-L191); [packages/contracts/foundry.toml:23–26](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/foundry.toml#L23-L26).

Track unexpected acceptance in a persistent counter and assert zero, or make the handler report the failure through an invariant-compatible assertion policy. Keep explicit unit/fuzz guards.

Static source inference, no mutation/testing executed.

### ROOT-Q02 — Echidna fee-on-transfer action does not flag unexpected success

EchidnaRouter.payFotToken does not record unexpected success. Its properties check fee-on-transfer token retention at the router but not recipient accounting for that token; successful lossy forwarding without router retention would not violate those properties. Separate Foundry unit/fuzz/invariant suites do assert rejection.

**Evidence:** [packages/contracts/test/echidna/EchidnaRouter.sol:93–107](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/echidna/EchidnaRouter.sol#L93-L107); [packages/contracts/test/echidna/EchidnaRouter.sol:168–185](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/echidna/EchidnaRouter.sol#L168-L185).

Record any successful lossy-token call as a property failure, and keep a reachability measure for the negative case.

Static source review; no mutation or test run.

### ROOT-A01 — Immutable fee recipients remain an availability dependency

Immutable fee-recipient payment legs are an availability dependency: token freezing or a native-rejecting fee recipient can prevent fee-bearing payments. No rotation/admin escape is part of core router design. Validate the selected fee account, monitor token support, and keep a replacement deployment/manifest recovery plan.

**Evidence:** [packages/contracts/src/GhostPayRouter.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol); [packages/contracts/test/audit/Router.audit.t.sol:78–120](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/audit/Router.audit.t.sol#L78-L120).

Current contract source plus inspected pre-existing regression tests; not live-chain confirmation.

### ROOT-A02 — Announcements need additional payment evidence

A router announcement alone authenticates neither invoice payment intent nor token identity/curve ownership; scanner verification must retain cryptographic derivation, approved contract/token and independent transfer evidence checks. Main/candidate adapters enforce additional evidence; no bypass established.

**Evidence:** [packages/contracts/src/GhostPayRouter.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol); [packages/contracts/test/audit/Router.audit.t.sol:122–186](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/audit/Router.audit.t.sol#L122-L186).

Static review; no test run.

### ROOT-A03 — Gas-buffer and relayer sponsorship limits

Core gas-buffer forwarding is deliberately untaxed and bounded by the payer-supplied maximum rather than a protocol cap. Fee rounding and buffer semantics are not a universal levy on native value. Relayer sponsorship also remains exposed to state changes after simulation and arbitrary token execution cost. These do not establish diversion of a valid signed sweep.

**Evidence:** [packages/contracts/test/audit/Review24.audit.t.sol:182–205](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/audit/Review24.audit.t.sol#L182-L205); [packages/contracts/test/audit/Router.audit.t.sol:188–208](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/audit/Router.audit.t.sol#L188-L208); [packages/contracts/test/audit/Sweep.audit.t.sol:41–68](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/audit/Sweep.audit.t.sol#L41-L68); [packages/contracts/test/audit/Sweep.audit.t.sol:189–246](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/audit/Sweep.audit.t.sol#L189-L246).

Align fee claims with contract semantics; relayer services need a token allowlist, bounded simulation/gas spending and sponsor rate limits. Hosted service implementations are outside this audit.

Static contract and existing test review only.

ROOT-Q01 and ROOT-Q02 were independently confirmed by the final English/resource reviewer. Separate Foundry tests still supply rejection coverage; these observations concern the named harnesses.

## Browser and adapter test qualification

### BROWSER-TEST-ASSURANCE-01 — Lookup-token test does not isolate key dependence from salt dependence

The test title claims a keyed rather than plain-hash lookup token. It checks equality across repeated writes in one vault and inequality after creating a separate store with a different key. The separate-store comparison also changes the salt, explicitly acknowledged by the source comment. These assertions establish stable tokens within a profile and different tokens across these two profiles, but they do not independently establish key dependence.

**Evidence:** [apps/web/src/lib/tags.test.ts:69–80](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/lib/tags.test.ts#L69-L80).

Add a deterministic test that holds salt and normalized address constant while changing the key, with an independently derived expected token or a fixed known-answer vector. Preserve the existing cross-profile and fresh-IV assertions.

This is a bounded observation about the reviewed test. It does not assert that the production derivation is unkeyed or that the complete repository lacks additional coverage.

### BROWSER-TEST-ASSURANCE-02 — KDF preflight test infers zero derivation work from elapsed time

The test requires invalid parameter variants to reject with the fixed validation message and requires the entire loop to finish within two seconds. Its title and trailing comment additionally claim rejection before any derivation. Elapsed time is not a direct assertion of the number of KDF calls, and it varies with the execution environment.

**Evidence:** [apps/web/src/lib/hardening.test.ts:23–31](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/lib/hardening.test.ts#L23-L31); [apps/web/src/lib/hardening.test.ts:23–31](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/src/lib/hardening.test.ts#L23-L31).

Observe the KDF boundary through an injected dependency or mock and explicitly assert zero invocations for invalid parameter variants; retain a separate bounded-work check if useful.

The actual validation ordering may already be correct. This review neither ran the tests nor re-audited the production KDF implementation.

### SWEEP-test-assertion-scope — SWEEP-test-assertion-scope

Two legacy helper test titles overstate their individual assertions. The relayed failure test titled as wiping the stealth key only asserts promise rejection and does not observe the derived buffer. The feeTo-review test passes the correct manifest fee recipient and fails because the permit RPC mock always throws, so that particular assertion does not exercise fee-recipient mismatch. A separate case at 110-134 explicitly rejects a mismatched recipient, so this is not a claim that fee-recipient protection is globally untested. Strengthen the named tests with direct zeroization/specific-refusal assertions or rename them to their actual scope. No production defect is inferred.

**Evidence:** [apps/web/src/lib/sweep.test.ts:110–134](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/src/lib/sweep.test.ts#L110-L134); [apps/web/src/lib/sweep.test.ts:233–240](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/src/lib/sweep.test.ts#L233-L240); [apps/web/src/lib/sweep.test.ts:502–525](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/src/lib/sweep.test.ts#L502-L525).

### ST-Q01 — Quote conversion property accepts unexpected payer exceptions

The property callback catches every payer fiatToTokenAmount exception and returns successfully. Its generated fiat and price are positive with fixed valid currency/precision and bounded token precision, so unexpected rejection does not fail this property. Fixed example tests elsewhere still provide some conversion evidence; this observation does not claim the complete suite would accept an always-throwing implementation.

**Evidence:** [packages/chain-adapters/src/quote.test.ts:144–154](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.test.ts#L144-L154); [packages/chain-adapters/src/quote.test.ts:140–150](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/chain-adapters/src/quote.test.ts#L140-L150).

Require successful payer conversion for this valid generated domain. Distinguish explicitly expected seller-zero rejection from unexpected exceptions, or use preconditions that describe the supported domain.

Static only; no test mutation, test execution, or mutation testing.

### ST-Q02 — Router Anvil startup timeout can leave its child process alive

startAnvil creates a local child and rejects after 20 seconds without killing it. The suite stores its outer cleanup handle only after startAnvil resolves; if a live child never emits the expected readiness text, afterAll sees no handle and cannot stop it. The source also leaves its timer uncleared on error/exit.

**Evidence:** [packages/chain-adapters/src/router.anvil.test.ts:39–58](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L39-L58); [packages/chain-adapters/src/router.anvil.test.ts:78–81](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L78-L81); [packages/chain-adapters/src/router.anvil.test.ts:106–108](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L106-L108).

Retain the child handle before readiness and use one failure cleanup path that clears the startup timer and terminates the child; bound captured startup output. The payments and quote Anvil helpers already show fail-path kill logic.

Static only; no process was spawned and no failure was reproduced.

### ST-O03 — Composite head and import-closure assertions have narrower scope than their titles

The best-head test accepts either 1500 or CHAIN_HEAD through an expectation derived from the actual returned head, so it does not enforce one best-head rule. The browser helper follows relative static from-import/export syntax only, does not inspect bare-package internals or side-effect/dynamic imports, and recognizes only a partial list of unprefixed Node built-ins. It is not a complete browser-bundle closure proof.

**Evidence:** [packages/scan-source/src/composite.test.ts:96–102](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/scan-source/src/composite.test.ts#L96-L102); [packages/net-transport/src/browser.test.ts:9–31](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/net-transport/src/browser.test.ts#L9-L31).

Assert the intended exact head rule or change the test description; retain artifact/bundler-level import graph evidence for browser closure. Do not duplicate or replace predecessor-owned BROWSER01.

### ST-O05 — Anvil integration coverage requires separate execution and artifact provenance

All three local-EVM suites skip their substantive cases when required local tools or artifacts are missing unless REQUIRE_ANVIL=1 activates a separate availability assertion. The payment fixture explicitly substitutes local mock token code, the router fee fixture builds under the Base Sepolia table while sending to local chain 31337, and the quote fixture installs compiled mock aggregator code. These sources are intentional isolated integration definitions, not proof of live-token/feed behavior, current artifact/source identity, a particular CI setting or an observed passing run.

**Evidence:** [packages/chain-adapters/src/payments.anvil.test.ts:17–60](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.anvil.test.ts#L17-L60); [packages/chain-adapters/src/payments.anvil.test.ts:97–120](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.anvil.test.ts#L97-L120); [packages/chain-adapters/src/payments.anvil.test.ts:123–228](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.anvil.test.ts#L123-L228); [packages/chain-adapters/src/router.anvil.test.ts:13–28](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L13-L28); [packages/chain-adapters/src/router.anvil.test.ts:61–66](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L61-L66); [packages/chain-adapters/src/router.anvil.test.ts:110–155](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/router.anvil.test.ts#L110-L155); [packages/chain-adapters/src/quote.anvil.test.ts:10–35](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.anvil.test.ts#L10-L35); [packages/chain-adapters/src/quote.anvil.test.ts:40–108](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.anvil.test.ts#L40-L108).

## Browser journey qualification

### E2E-Q01 — Non-Pages devnet RPC proxy always returns HTTP 200

**Disposition:** main: present; same chain.ts blob; candidate: present; same chain.ts blob; pages_proxy: Separate PagesNetwork path preserves status and has an explicit source-level acceptance test.

The generic devnet post helper resolves only response-body text and discards the upstream HTTP status. DevnetNetwork.forward then fulfills every completed upstream response with status 200. A non-2xx response therefore reaches the application with a different transport status in this harness. PagesNetwork carries status and body and has a test asserting propagation of an upstream failure status.

The generic devnet journeys cannot establish HTTP-status handling fidelity for the deployed application. This is a test-harness defect, not evidence that the application mishandles production HTTP errors.

**Evidence:** [apps/web/e2e/devnet/chain.ts:48–58](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/devnet/chain.ts#L48-L58); [apps/web/e2e/devnet/chain.ts:125–131](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/devnet/chain.ts#L125-L131); [apps/web/e2e/devnet/pages.ts:24–34](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/devnet/pages.ts#L24-L34); [apps/web/e2e/devnet/pages.ts:121–127](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/devnet/pages.ts#L121-L127); [apps/web/e2e/pages-devnet.spec.ts:135–165](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/pages-devnet.spec.ts#L135-L165).

Use a shared status-preserving response representation for both devnet proxy helpers and retain a focused transport-fidelity assertion.

Static source inspection only. No harness, test, server, RPC request or transaction was executed.

### E2E-G01 — Pages qualification explicitly excludes a successful real-chain ERC-20 payment path

**Disposition:** main: present in assigned Pages suite; candidate: present in assigned Pages suite

The Pages c2 test expressly asserts that the local deployment tokens are absent from the compiled token choices and the allowlisted token addresses have no code on that chain. Its real-chain checkout journey uses the native asset. Separate ERC-20 scan/sweep tests rely on authored RPC fixtures.

A successful Pages/devnet run of these tests would provide native-asset journey evidence; it would not qualify successful ERC-20 checkout, approval/permit, or real token-transfer behavior through the same browser artifact.

**Evidence:** [apps/web/e2e/pages-devnet.spec.ts:427–445](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/pages-devnet.spec.ts#L427-L445); [apps/web/e2e/devnet-journey.spec.ts:71–131](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/devnet-journey.spec.ts#L71-L131); [apps/web/e2e/sweep.spec.ts:53–102](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/sweep.spec.ts#L53-L102).

Track native and ERC-20 qualification separately, and add independently reviewable local real-chain ERC-20 acceptance evidence using a fixture deployment aligned with the compiled token configuration. No execution was performed in this review.

### E2E-G02 — Export leak guard samples persistent storage at the end of the journey

**Disposition:** main: stealth-export suite absent at pinned main; candidate: present

recordLeaks records request/console/error/download events as they occur, but its URL/history/storage/IndexedDB/cache inspection is performed by snapshot(). The secret-leak scenario calls that snapshot once after completing multiple export and recovery actions.

The assertions establish absence of the selected synthetic secret markers at that sampled state. They do not establish that no transient plaintext storage write occurred and was removed earlier. No transient write or application leakage was established by this source review.

**Evidence:** [apps/web/e2e/stealthExportFixtures.ts:264–339](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/stealthExportFixtures.ts#L264-L339); [apps/web/e2e/stealth-export.spec.ts:359–416](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/stealth-export.spec.ts#L359-L416).

If continuous absence is part of the intended acceptance claim, observe sensitive storage writes using synthetic fixture markers or add checks at the individual credential/export transitions. Keep the reported evidence limited to the channels and moments actually inspected.

### E2E-H01 — Older network-authorization fixture uses quantity-shaped balance results

**Disposition:** main: test file absent; candidate: corrected with ABI-encoded uint256 results; older_supplemental: present in blob e072d3cbf199ea53c9f8bd26bd43ed390153b2e3

The older network-authorization test supplied short quantity-style results for ERC-20 balanceOf calls. The newer 19055300 variant uses encodeAbiParameters for both the stale and replacement balance results and documents the distinction from eth_chainId. This is not a current candidate defect.

**Evidence:** [apps/web/e2e/network-authorization.spec.ts:275–293](https://github.com/djshellshoxxx/GhostPay/blob/e4d54a6829fcc861de7af1669c0e0f64f62aa137/apps/web/e2e/network-authorization.spec.ts#L275-L293); [apps/web/e2e/network-authorization.spec.ts:279–298](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/e2e/network-authorization.spec.ts#L279-L298).

Both complete diffs in the variant chain were inspected; no test was run.

## Secondary scan work budget — AP-Q1

The secondary provider comparison has no total request, retained-log or elapsed-work budget of its own. Primary fetch limits do not directly bound secondary range splitting and accumulation over the same page. Processing remains bounded by the supplied block range; no infinite loop or measured amplification is asserted. The candidate wraps both providers with per-call cancellation/current-context checks, so the package API alone is not evidence of a remaining candidate cancellation failure.

Add explicit aggregate budgets and a clear incomplete/disagreement result when exhausted. Preserve candidate cancellation checks. This is an unranked availability-hardening follow-up; the separate main cancellation defect is SN-K01.

**Evidence:** [packages/chain-adapters/src/scanVerify.ts:75–165](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/scanVerify.ts#L75-L165); [apps/web/src/lib/scanClient.ts:185–214](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L185-L214); [apps/web/src/lib/scanPrivacy.ts:548–564](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L548-L564).

## Documentation maintenance

### CP-O6 — Address-safety docs contain stale dependency statements

README/DEVIATIONS describe Node-only node:crypto hashing, while actual implementation uses noble SHA-256. Documentation maintenance only; do not use this stale text to exclude package from browser scope.

**Evidence:** [packages/address-safety/README.md:13–13](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/address-safety/README.md#L13); [packages/address-safety/DEVIATIONS.md:4–4](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/address-safety/DEVIATIONS.md#L4); [packages/address-safety/src/meta.ts:1–2](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/address-safety/src/meta.ts#L1-L2).

### AP-O3 — Chain adapter verification TODO trails current token/feed tables

TODO-VERIFY still describes two listed USDC entries and an empty FEEDS table, while runtime lists more sourced testnet tokens and four feed entries. External address/source correctness was not independently verified in this source-only batch.

**Evidence:** [packages/chain-adapters/TODO-VERIFY.md:9–12](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/TODO-VERIFY.md#L9-L12); [packages/chain-adapters/TODO-VERIFY.md:29–36](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/TODO-VERIFY.md#L29-L36); [packages/chain-adapters/src/config/tokens.ts:18–42](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/config/tokens.ts#L18-L42); [packages/chain-adapters/src/quote.ts:46–93](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/quote.ts#L46-L93).

### SP-O4 — Package integration notes lag current browser imports

**Disposition:** documentation maintenance; unranked

payment-uri DEVIATIONS.md line 3 says app parsers are unused, while candidate qrClassify.ts invokes parseInvoiceLink and parsePaymentUri. metadata-hardening README line 3 says it is not wired into apps/web, while relayerClient imports padBody and calls it for padded request bodies. Its README dependency text also says viem 2.57.7 while reviewed candidate manifest pins 2.57.19. Treat these as stale package notes, not a reason to claim all hardening menu features are live.

**Evidence:** [packages/payment-uri/DEVIATIONS.md:3–3](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/DEVIATIONS.md#L3); [apps/web/src/lib/qrClassify.ts:234–258](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/qrClassify.ts#L234-L258); [packages/metadata-hardening/README.md:3–3](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/metadata-hardening/README.md#L3); [packages/metadata-hardening/README.md:50–50](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/metadata-hardening/README.md#L50); [apps/web/src/lib/relayerClient.ts:1–5](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/relayerClient.ts#L1-L5); [apps/web/src/lib/relayerClient.ts:104–116](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/relayerClient.ts#L104-L116); [packages/metadata-hardening/package.json:37–40](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/metadata-hardening/package.json#L37-L40).

## Existing hardening and intentional changes

These were already represented in the recent branch set. A sibling branch is an independent snapshot; a correction in #302 does not make every other branch corrected. These items do not increase the seven-finding total.

### PN-H01 — parseUnits runtime type and precision validation

**Disposition:** main: missing helper guard; candidate: missing helper guard; supplemental_303: fixed

A caller violates the TypeScript contract by supplying a non-string amount or invalid precision. The helper can throw instead of returning undefined. Reviewed production callers supply strings and compiled or fixed valid precisions; an externally reachable misuse was not established.

Helper API robustness and error predictability; not a confirmed production security exploit.

**Evidence:** [apps/web/src/lib/format.ts:16–24](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/format.ts#L16-L24); [apps/web/src/lib/format.ts:16–25](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/src/lib/format.ts#L16-L25).

Keep #303's typeof and integer-range guard.

### CP-K1 — Base64url runtime type guard

**Disposition:** fixed-on-candidate

Non-string programmatic input now yields fixed Base64UrlError. Fragment entry already checks string type.

**Evidence:** [packages/invoice-schema/src/base64url.ts:52–55](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/base64url.ts#L52-L55).

### CP-K2 — Dense data-array canonicalization

**Disposition:** fixed-on-candidate

Rejects sparse/decorated/accessor arrays and snapshots data properties before recursion. Imported strict JSON cannot encode JavaScript getters/proxies, so no external payload reachability established.

**Evidence:** [packages/invoice-schema/src/json.ts:200–222](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/json.ts#L200-L222).

### CP-K3 — Merchant-profile invalid-clock rejection

**Disposition:** fixed-on-candidate

Non-finite and negative injected clocks no longer bypass expiry comparison. No externally controlled clock path established.

**Evidence:** [packages/invoice-schema/src/merchantProfile.ts:156–158](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/merchantProfile.ts#L156-L158).

### CP-K4 — Rejected QR conflict preserves inactivity deadline

**Disposition:** fixed-on-candidate

Rejected conflicting input no longer refreshes partial-session activity. It did not bypass final payload integrity; web conflict path resets assembly.

**Evidence:** [packages/qr-exchange/src/assembler.ts:75–87](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/assembler.ts#L75-L87).

### CP-K5 — Precise verification failure classes

**Disposition:** present-on-candidate

Missing signatures, unsupported versions and unavailable local crypto are classified separately; no relaxed success path observed.

**Evidence:** [packages/invoice-schema/src/envelope.ts:162–203](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L162-L203); [packages/invoice-schema/src/envelope.ts:312–330](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L312-L330); [packages/invoice-schema/src/envelope.ts:356–365](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L356-L365).

### CP-K6 — Minimal receipts

**Disposition:** present-on-candidate

Allows signed receipts omitting one-time address; conditional recipient binding is explicit in tests and must remain explicit in UI.

**Evidence:** [packages/invoice-schema/src/receipts.ts:24–25](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L24-L25); [packages/invoice-schema/src/receipts.ts:66–108](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L66-L108); [packages/invoice-schema/src/receipts.ts:147–167](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L147-L167).

### AP-K1 — Deployment dates now reject impossible calendar days

Candidate compares parsed calendar components instead of relying only on Date.parse. Tests add impossible dates. No direct payment or manifest-signature bypass established.

**Evidence:** [packages/chain-adapters/src/deployments.ts:71–79](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/deployments.ts#L71-L79).

### AP-K2 — RPC transport explicitly suppresses browser ambient metadata

Candidate sets credentials omit, no-referrer, and no-store. Main does not set these options. Browser egress integration reviewer owns route reachability and wider deployment policy; this is not independently ranked here.

**Evidence:** [packages/chain-adapters/src/rpc.ts:103–113](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/rpc.ts#L103-L113).

### AP-K3 — Nonfinite retry counts are clamped to zero

Main Math.min/Math.max preserves NaN, making the retry termination comparison ineffective. Candidate guards Number.isFinite. No externally controlled browser path to the retry option was established.

**Evidence:** [packages/chain-adapters/src/rpc.ts:227–229](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/rpc.ts#L227-L229).

### AP-K4 — Bulk router evidence can avoid per-match followup reads

Candidate selects matched plus cover transactions and supports batch verification without live fallback for missing entries. Canceled batches discard partial evidence and stop new calls; dispatched RPCs keep the client timeout/retry policy. All requested include entries can exceed the nominal cover-selection cap by design. Integration privacy claims need the app-level batching and scan-disclosure context.

**Evidence:** [packages/chain-adapters/src/payments.ts:186–221](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.ts#L186-L221); [packages/chain-adapters/src/payments.ts:236–318](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.ts#L236-L318); [packages/chain-adapters/src/payments.ts:335–348](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.ts#L335-L348).

### CUSTODY-OBS-01 — Candidate keystore KDF wipes owned passphrase bytes in success and failure paths

Main creates an unnamed UTF-8 passphrase buffer for scrypt and only wipes derived bytes after successful scrypt; the candidate captures and wipes both owned buffers in finally. No exploit or runtime execution performed; not a new candidate finding.

**Evidence:** [packages/ux-vault/src/keystore-portable.ts:74–84](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/ux-vault/src/keystore-portable.ts#L74-L84); [packages/ux-vault/src/keystore-portable.ts:74–81](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/keystore-portable.ts#L74-L81).

### CUSTODY-OBS-02 — Candidate export UI adds a synchronous session deadline check at final result acceptance

The earlier bc18fbc StealthExportCommon version only checks mounted state, controller cancellation, and selection identity. Candidate adds captureSessionVersionGuard and rechecks it inside current(), covering an expired result before browser event delivery. Candidate expiry tests explicitly inspect both empty/loaded sessions and final raw-key UI handoff. This is a verified source change and regression-test intent; tests were not executed. It is not a new remaining candidate finding.

**Evidence:** [apps/web/src/components/StealthExportCommon.tsx:147–182](https://github.com/djshellshoxxx/GhostPay/blob/e4d54a6829fcc861de7af1669c0e0f64f62aa137/apps/web/src/components/StealthExportCommon.tsx#L147-L182); [apps/web/src/components/StealthExportCommon.tsx:153–194](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/StealthExportCommon.tsx#L153-L194); [apps/web/src/components/StealthExportCommon.expiry.test.tsx:34–89](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/StealthExportCommon.expiry.test.tsx#L34-L89).

### SN-O04 — SN-O04

**Disposition:** known-candidate-hardening

Candidate scanSpam marks the 30-day privacy-set count partial when fewer than the available 30 days were scanned; main checked only the 7-day span. Existing heuristic labels remain approximate; not a new candidate security finding.

**Evidence:** [apps/web/src/lib/scanSpam.ts:187–197](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanSpam.ts#L187-L197); [apps/web/src/lib/scanSpam.ts:187–197](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanSpam.ts#L187-L197).

## Trust boundaries and interpretation limits

### CP-O1 — Secret storage APIs are best-effort guardrails

copyOf copies then zeroes source by default on successful return; take transfers ownership without zeroing. Validation failures before copy do not consume input. Same-realm isolation and guaranteed zeroization are not claimed.

**Evidence:** [packages/secret-box/src/secretBox.ts:47–57](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/secret-box/src/secretBox.ts#L47-L57); [packages/secret-box/src/secretBox.ts:72–109](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/secret-box/src/secretBox.ts#L72-L109); [packages/secret-box/src/secretBox.ts:156–212](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/secret-box/src/secretBox.ts#L156-L212).

### CP-O2 — Known key-compartment relationship is explicitly recorded

Viewing-key delegation combined with one-time private-key export has a documented master-spend confidentiality consequence. It is already known/tested in candidate, not a newly discovered primitive break. Custody lane notified. No recovery steps supplied.

**Evidence:** [packages/core-crypto/src/viewing-key-boundary.test.ts:1–4](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/core-crypto/src/viewing-key-boundary.test.ts#L1-L4).

### CP-O3 — Invoice verification and seller identity are separate

Default parsed result can carry invalid signature; policy gate must reject it. Required-pin mode rejects invalid/unpinned results; caller supplies intended seller pin set. Passphrase prompt header is unauthenticated.

**Evidence:** [packages/invoice-schema/src/envelope.ts:440–467](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L440-L467); [packages/invoice-schema/src/envelope.ts:470–488](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L470-L488); [packages/invoice-schema/README.md:24–53](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/README.md#L24-L53).

### CP-O4 — Minimal receipt recipient binding is conditional

Receipt is a seller attestation and field-consistency check, not independent payment proof. New optional stealthAddress means an absent address does not assert recipient binding even when caller supplies expectation. Intentional tested semantics; payments lane notified to assess UI claims.

**Evidence:** [packages/invoice-schema/src/receipts.ts:143–167](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L143-L167); [packages/invoice-schema/src/receipts.test.ts:68–94](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.test.ts#L68-L94).

### CP-O5 — QR integrity does not authenticate sender

Bounded single-session reassembly validates canonical data and digest prefix; sender trust comes from decoded application payload. Accepted duplicates intentionally refresh inactivity timer. No integrity bypass established.

**Evidence:** [packages/qr-exchange/README.md:14–23](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/README.md#L14-L23); [packages/qr-exchange/src/assembler.ts:63–134](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/assembler.ts#L63-L134); [packages/qr-exchange/src/assembler.test.ts:117–128](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/assembler.test.ts#L117-L128).

### AP-O1 — Receipt evidence relies on configured providers and verified deployment inputs

Received status binds canonical block/receipt/transaction/calldata and exact announcement, plus payer-to-recipient Transfer for supported ERC20. Secondary evidence must agree when configured; provider independence and manifest authenticity are caller obligations. Registry/announcer presence and behavioral probes are documented as not runtime-code pins.

**Evidence:** [packages/chain-adapters/src/payments.ts:320–430](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.ts#L320-L430); [packages/chain-adapters/src/payments.ts:465–504](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/payments.ts#L465-L504); [packages/chain-adapters/src/verify.ts:104–133](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/verify.ts#L104-L133); [packages/chain-adapters/src/verify.ts:184–238](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/verify.ts#L184-L238); [packages/chain-adapters/src/rpc.ts:419–428](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/rpc.ts#L419-L428); [packages/chain-adapters/src/rpc.ts:461–491](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/rpc.ts#L461-L491).

### AP-O2 — Pre-sign review depends on independent expected intent and policy

Decoder uses closed selectors, canonical reencoding, exact typed-data fields, and rejects authorizationList. Reviewer binds policy and expected intent, with direct-sweep gas caps and allowance limits. Buffer router method is deliberately refused in tx-review though the adapter builder supports it. Policy/expected intent authenticity and immediately-before-sign use are caller duties.

**Evidence:** [packages/tx-review/src/decode.ts:103–125](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/tx-review/src/decode.ts#L103-L125); [packages/tx-review/src/decode.ts:200–233](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/tx-review/src/decode.ts#L200-L233); [packages/tx-review/src/review.ts:85–127](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/tx-review/src/review.ts#L85-L127); [packages/tx-review/src/review.ts:152–173](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/tx-review/src/review.ts#L152-L173).

### SP-O1 — Hygiene derivation and local ledger enforcement

**Disposition:** boundary; unranked

Destination derivation domain-separates HKDF by index, uses the core stealth derivation, and wipes key-material copies and retained stream seeds in finally. Recovery checks the derived address. Ledger prevents reuse by another source unless the caller explicitly invokes acknowledged reuse; protocol/zero/own-source checks remain. Index uniqueness depends on recorded ledger state and is local to each HopAddressSource instance; source documentation requires persistence across restarts. No externally reachable violation was established.

**Evidence:** [packages/hygiene/src/destination.ts:59–81](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/destination.ts#L59-L81); [packages/hygiene/src/destination.ts:100–154](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/destination.ts#L100-L154); [packages/hygiene/src/ledger.ts:49–54](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/ledger.ts#L49-L54); [packages/hygiene/src/ledger.ts:70–134](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/ledger.ts#L70-L134); [packages/hygiene/src/ledger.ts:151–195](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/ledger.ts#L151-L195); [packages/hygiene/src/hop-source.ts:19–59](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/hop-source.ts#L19-L59).

### SP-O2 — Older hygiene log helpers rely on RPC filtering

**Disposition:** trust-boundary observation; unranked and not browser-reachable on searched refs

parseTransferLogs validates log shape but does not retain or check emitter, logIndex, or blockHash; transferLogs forwards token/range constraints to RPC without revalidating returned emitter/range. spentCheck adds each returned matching outflow without deduplicating it. These helpers therefore must not be substituted for the stronger chain-adapter payment proof. Exact helper-name searches of main and primary-candidate apps/web/src found no calls to addressFreeReceipt, sweepConfirmed, spentCheck, batchedRead or pickDecoys. Search is reachability evidence only, not file coverage or proof about aliases in every branch. No live behavior, exploitability or severity claimed.

**Evidence:** [packages/hygiene/src/verify.ts:46–101](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/verify.ts#L46-L101); [packages/hygiene/src/verify.ts:115–155](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/verify.ts#L115-L155); [packages/hygiene/src/verify.ts:177–216](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/hygiene/src/verify.ts#L177-L216).

### SP-O3 — Payment URI validation is structural, with bounded exact amounts

**Disposition:** boundary; unranked

EIP-681 accepts native transfer or ERC-20 transfer only, rejects duplicate/unknown parameters and token-transfer value, and parses amounts exactly into positive uint256 values. Generic URIs are capped at 2,048 characters; invoice links at 22,200. Display text rejects control/bidi/default-ignorable/surrogate and non-NFC text. Invoice-link payload is explicitly unauthenticated and must be opened by invoice-schema; structural host validation is not signer authentication. Optional non-EVM parsers were read only because the static source closure includes them, without broadening the lean UI scope.

**Evidence:** [packages/payment-uri/src/eip681.ts:14–26](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/src/eip681.ts#L14-L26); [packages/payment-uri/src/eip681.ts:75–134](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/src/eip681.ts#L75-L134); [packages/payment-uri/src/query.ts:67–111](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/src/query.ts#L67-L111); [packages/payment-uri/src/invoice-link.ts:3–25](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/src/invoice-link.ts#L3-L25); [packages/payment-uri/src/invoice-link.ts:44–69](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/src/invoice-link.ts#L44-L69); [packages/payment-uri/src/text.ts:3–27](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/payment-uri/src/text.ts#L3-L27).

## Final review supplements

### E2E-G03 — Camera lifecycle assertions lose visibility when video elements are removed

**Disposition:** main: present; same reviewed test blobs; candidate: present; same reviewed test blobs

The single-camera liveTracks observer enumerates document.querySelectorAll(video) and counts only live tracks on those current elements' srcObject streams. The multipart test uses the same current-DOM strategy. Zero live tracks is therefore also returned when the relevant video is removed or its srcObject is cleared; the assertions retain no reference to previously acquired streams. The navigation, stop and completion assertions cannot independently establish that all earlier capture tracks reached ended.

These assertions establish that no live track remains reachable through the currently queried video elements. They do not fully qualify capture teardown after navigation or preview completion. A future regression that detaches a video while retaining a live stream could escape this particular observation. No actual application camera leak, failed stop operation, unauthorized capture or production vulnerability was established.

**Evidence:** [apps/web/e2e/qr-camera.spec.ts:23–27](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/qr-camera.spec.ts#L23-L27); [apps/web/e2e/qr-camera.spec.ts:33–54](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/qr-camera.spec.ts#L33-L54); [apps/web/e2e/qr-camera-multipart.spec.ts:35–43](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/qr-camera-multipart.spec.ts#L35-L43).

In the test harness, retain observational references to streams returned by the real mediaDevices.getUserMedia call, establish successful acquisition on the successful path, and assert that every acquired video track reaches ended after explicit stop, route teardown and successful completion. Preserve the separate explicit-click and denied-permission checks.

Static source inspection only. No browser, media device, test or application execution was performed.

### UI-RECEIPT-TEST-ASSURANCE-01 — Optional Anvil availability check treats bare command names as installed

Resolve a bare executable name against PATH, or use an explicit capability check before selecting the suite; keep REQUIRE_ANVIL as the explicit fail-if-missing gate. Preserve clear distinction between skipped and executed integration coverage.

### UI-RECEIPT-TEST-ASSURANCE-02 — Final RegistryView negative case does not isolate malformed registry-entry handling

Split the route cases and supply a malformed registry result after a valid deployment/typehash response for a valid address; assert the intended refusal and absence of usable lookup data. Narrow the current title to its actual assertions if no additional route case is intended.

### UI-REMAINING-TEST-ASSURANCE-01 — Existing mount can satisfy the rejected-release-hash fallback assertion

This particular assertion does not independently establish the rejected entry-script-fetch fallback. It does not establish an application defect, a runtime test failure, or a repository-wide absence of release-hash coverage.

**Evidence:** [apps/web/src/views/About.test.tsx:79–91](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/views/About.test.tsx#L79-L91); [apps/web/src/test/render.tsx:1–13](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/test/render.tsx#L1-L13); [apps/web/src/test/render.tsx:39–45](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/test/render.tsx#L39-L45).

Unmount the first App before the rejecting-fetch case, split the cases, or retain the second RenderResult and scope the awaited fallback assertion with within(second.container). Also observe the rejecting fetch call so that the intended path is exercised.

### FINAL-H01 — Payment-URI builders enforce the aggregate encoded-wire length

The recent payment-uri branch adds the parser-equivalent 2048-character aggregate limit to Bitcoin, Solana and TRON builders. Individual text-field byte bounds could previously combine into a returned link that its parser refused. These non-EVM builders were conservatively read as part of the shared package closure; this is not a demonstrated lean EVM route vulnerability. New boundary tests assert exact limit, shorter, over-limit and ordinary round trips. No tests were run.

**Evidence:** [packages/payment-uri/src/query.ts:3–10](https://github.com/djshellshoxxx/GhostPay/blob/0fa33f7101f3c9ac4d685673aece16eda6e98366/packages/payment-uri/src/query.ts#L3-L10); [packages/payment-uri/src/query.ts:103–117](https://github.com/djshellshoxxx/GhostPay/blob/0fa33f7101f3c9ac4d685673aece16eda6e98366/packages/payment-uri/src/query.ts#L103-L117); [packages/payment-uri/src/builder-length.test.ts:45–141](https://github.com/djshellshoxxx/GhostPay/blob/0fa33f7101f3c9ac4d685673aece16eda6e98366/packages/payment-uri/src/builder-length.test.ts#L45-L141).

Retain the aggregate builder limit while preserving parser rejection of oversized inputs.

### FINAL-H02 — Recovered-fixes build script applies the artifact integrity gate before promotion

The newly observed integration branch keeps its own earlier build-script variant and appends independent artifact/source validation before promoting site/evidence. It does not imply every later #302 origin/key hardening change is included. Its imported verifier blob was already covered by the earlier source review. No build or publication was performed.

**Evidence:** [scripts/pages/build-pages.sh:205–214](https://github.com/djshellshoxxx/GhostPay/blob/0e926f8b4cf7f307c3174f3a03298ff310cb1808/scripts/pages/build-pages.sh#L205-L214).

### H8-DOC-01 — Generated archive guide still includes subpath in its origin-isolation claim

operatorGuide emits an OPERATOR.md statement that includes subpath alongside clearnet/onion/I2P in a sentence asserting separate browser storage, sessions and wallet permissions. A subpath alone does not create a distinct origin. The actual CLI and Tor recipe correctly retain dedicated-origin checks and warnings, so this is a surviving documentation inconsistency, not a demonstrated isolation bypass. OPERATOR.md is archive metadata, not part of the exported website.

May mislead an operator reading the archive guide in isolation; no changed browser origin policy, key disclosure, authorization bypass or tested runtime impact is established.

**Evidence:** [tools/portable-hosting-kit/src/package-docs.mjs:46–55](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/package-docs.mjs#L46-L55); [tools/portable-hosting-kit/src/cli.mjs:641–646](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/cli.mjs#L641-L646); [tools/portable-hosting-kit/src/cli.mjs:757–777](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/cli.mjs#L757-L777); [deploy/tor-static/prepare.mjs:82–87](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L82-L87); [deploy/tor-static/README.md:59–61](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/README.md#L59-L61).

Describe storage and permission separation in terms of distinct origins (scheme, hostname and port). State explicitly that paths on the same origin share origin storage, and align OPERATOR.md with the current CLI and Tor runbook.

### H9-TQ-01 — Differential helper checks HEAD bodylessness only for status 200

requestCases includes HEAD requests for missing, hidden, malformed and conditional cases. compareServers checks the length of both HEAD bodies only inside its n.status === 200 block. For a non-200 HEAD response, the helper checks status, interim responses and selected headers but makes no assertion that either body is empty.

This is an assertion-coverage gap in the differential helper. It does not establish that either production server emits a body on a non-200 HEAD response. Dedicated tests elsewhere may provide additional coverage, and none were executed in this review.

The existing differential caller also includes explicit normative spot checks and requires observed status coverage; this observation is scoped to the helper assertion and does not claim the whole test suite has no independent oracle.

**Evidence:** [tools/portable-hosting-kit/test/profiles/compare.mjs:45–64](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/compare.mjs#L45-L64); [tools/portable-hosting-kit/test/profiles/compare.mjs:109–120](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/compare.mjs#L109-L120); [tools/portable-hosting-kit/test/profiles/differential.test.mjs:70–125](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/test/profiles/differential.test.mjs#L70-L125).

Apply the HEAD body-length assertion to all completed HEAD responses independently of status, retaining status and header comparisons. Keep this as a test-quality improvement, separate from production vulnerabilities.

## Validation and scope limits

Unit/UI sources use synthetic RPCs, jsdom, inline workers, in-memory stores, controlled clocks and captured downloads. Assertions establish intended behavior, not a passing result, native Worker scheduling, actual download behavior, storage durability, independent provider ownership or deployed-chain truth. Browser/E2E qualification is recorded separately in the final reviewer reports.

RPC agreement, header continuity and record integrity do not prove provider independence or log completeness. Release-key trust and authentic deployment inputs remain trust anchors. Static artifact, CSP, build-profile and publication-gate review does not establish the state of a published site.

Quick-hide is a display control. Best-effort clipboard ownership checks and byte wiping do not provide atomic control of the system clipboard or guaranteed erasure of all runtime copies. The documented viewing-key/export relationship remains a key-compartment limitation.

An incidental full-profile SecretBackup observation is retained in the historical browser report: main/#302 cleanup can erase subsequently copied clipboard content, and #300 adds ownership checks. That component has no established lean route caller and is outside this production finding count. Full-profile, non-EVM, hosted backend, CLI, native/proxy and third-party internals are excluded.

Historical reviewer checkpoints contain then-pending lists. Final reconciled coverage and README are authoritative. Later Pay.test.tsx review supersedes early BROWSER-01 wording implying missing Pay route regression coverage; see findings.md.
