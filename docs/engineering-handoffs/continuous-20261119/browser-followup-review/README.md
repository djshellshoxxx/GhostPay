# Independent browser failure follow-up — 2026-11-20

This is a continuing independent review turn by `qa_review_gen3`, not a newly spawned fresh agent. The prior Generation 3 review and its worktree remain intact. This follow-up uses a new isolated worktree and branch, `review/ghostpay-browser-followup-20261120`, with ownership claim `e5395624`.

## Verdict

**Approve exact `89e163fcc24f72830c0a5876486a72178a9365e7` for integration/publication and a hosted rerun. No production defect or assertion weakening was found.** The independent controlled replay reproduces the early snapshot's exact 9-to-15 failure, while the correctly timed observation and a reviewer-added late-success response case pass. Hosted browser acceptance on the repaired combined source remains outstanding.

## Source and hosted failure

The checkout starts at local `3dc86fbc49e919e664230b63dae372ff79430fc5`, tree `e76c03d9dba595ff1171577139c1628c4ad45f5b`. The root publication verifier maps that source to published `d74af79ebabdc8cead843361c3497b46d8c421f9` and records synthetic CI merge `a7ceff94269cddfbc725677dd03737d96a449039` with an identical tree. This reviewer independently checked the local tree and inspected the root publication receipt; no independent remote publication operation was performed here.

Both supplied hosted job logs fail the same final assertion in `network-authorization.spec.ts`, in the test for invoice replacement while a renewed preflight request is held:

| Profile | Job | Result | Failure |
| --- | --- | --- | --- |
| Lean | `135981022990` | 115 passed, 1 failed, 5 skipped | Foreign request count expected 9, received 15. |
| Full | `135981023128` | 128 passed, 1 failed, 2 skipped | Foreign request count expected 9, received 15. |

The existing exactly-two observed `eth_chainId` assertion precedes the failing line and passed. The error context shows the replacement invoice's payment amounts and enabled Continue control by the time of failure. The logs and page snapshot contain no per-request method/owner trace, so they cannot alone identify each of the six later requests.

[Hosted input receipt](evidence/hosted-input-receipt.json) records full raw-log hashes and sizes; failure excerpts with trailing whitespace normalized and the byte-exact supplied page snapshot (gzip) are retained beside it.

## Source analysis

The old test observes the replacement invoice description and waits on `page.waitForLoadState('networkidle')` before taking its request-count snapshot. Invoice description visibility only establishes that the signed invoice was parsed. It does not establish completion of the authorized chain and manifest checks.

The installed Playwright `1.65.1` implementation checks whether the requested load state has already fired and may return immediately. Its same-document navigation handler changes the frame URL and emits navigation without clearing lifecycle state. The installed source excerpts and source hash are retained in [the Playwright receipt](evidence/playwright-source-receipt.json). A previously satisfied load state is therefore insufficient to establish completion of a new application-level preflight after fragment navigation.

For the fixture's deployment, one normal preflight dispatches:

1. One `eth_chainId` during `createClient`.
2. Three sequential `eth_call` reads for `FEE_RECIPIENT()`, `ANNOUNCER()`, and `FEE_BPS()`.
3. Three `eth_getCode` reads for the router, sweep relayer, and announcer.

The count of nine can therefore represent seven completed original-invoice requests, one held renewed request, and only the replacement chain check. Completing the replacement's six manifest reads brings that count to fifteen without any stale-grant retry reaching the network. This is a source-derived explanation to be checked by the independent execution below, not a claim that the hosted logs themselves captured those request identities.

`Pay` clears its payment context during invoice replacement and scopes parsed invoice trust to the current fragment. Continue remains disabled until `refreshContext` has obtained the current RPC client, completed `verifyManifestForFlow`, created the payment context, and passed its current-invoice checks. Waiting for the replacement description and then an enabled Continue button is an application-state completion boundary tied to the current invoice. The same completion boundary is appropriate before the initial cancellation.

The cancelled fetch and replacement readback must be tested separately. The real network authority rejects its dispatch promise on cancellation even if an injected fetch ignores the abort signal. The fetch transport can normalize that failure into a retryable transport error. Before a retry can dispatch, the production `defaultServices` transport checks the grant again and refuses the revoked capability with nonretryable `RPC_URL_REJECTED`. Waiting for the renewed real `createRpc` operation to settle covers that potential backoff/denied retry before its separately held fetch is released.

## Independent execution

The implementation commit is `89e163fcc24f72830c0a5876486a72178a9365e7` (tree `960868c6caec402ac38ca4d801fe519151fa190b`). It changes only the browser fixture and adds `Pay.preflightCompletion.test.tsx`. It was cherry-picked into this isolated review checkout as `47ae5380`. No production file, timeout, coverage threshold, filter, or configuration changes in that patch.

The new probe uses the real `createDefaultServices().createRpc`, network authority, fetch transport, chain client, AppShell, and Pay flow. Authored provider replies and a local manifest fixture isolate the network. A pass-through client request wrapper records its originating grant while delegating the actual request unchanged; the real frozen authority is not replaced or modified. The invoice uses native currency and encrypted fields, matching the browser journey's invoice family.

The probe pauses delivery of the replacement client after its successful chain check. At that point the replacement invoice description is visible, Continue is disabled, the old grant and fetch signal are aborted, the old real RPC-creation operation has settled, and nine fetches have been recorded. Releasing only the replacement delivery produces exactly the six manifest method/selector/target reads, all associated with the replacement grant. Continue then enables. The old fetch remains separately held during those six requests.

| Independent execution | Result | Interpretation |
| --- | --- | --- |
| Controlled early-snapshot replay | 1 expected failure, exit 1: expected 9, got 15 | Uses the pre-context counter for the final unchanged-count assertion, reproducing the hosted symptom without changing production behavior. |
| Exact committed preflight probe | 1 passed | The six later requests belong to the replacement operation; releasing the old failed fetch afterward adds no request. |
| Reviewer-only late-success response variation | 1 passed | Resolving the old ignored-abort fetch with valid chain-ID JSON after its operation settles also adds no request or context change. |
| Existing manifest freshness cases | 3 passed | Same-chain/service generation ownership remains correct. |
| Existing Pay network replacement case | 1 passed | Replacement revokes the renewed grant and does not open provisional preflight against the prior manifest. |
| Existing default-services authorization cases | 5 passed | Production authorization integration remains passing. |

The clean run is **11 passed, 0 failed, 0 skipped across five files**, using Node `v22.23.4`, the original Vite/Vitest configuration, and `--maxWorkers=1`. This is a component/integration probe, not local browser execution. The replay mutates only the test observation, not the product runtime: `beforeOldRelease` is temporarily taken from `beforeContextReady`. The exact committed test was restored before the clean run. The reviewer-only late-success file was removed afterward. Commands, durations, hashes, and raw outputs are retained:

- [Independent command receipt](evidence/independent-receipt.json).
- [Early observation RED result](evidence/premature-observation-red.json) and [log](evidence/premature-observation-red.log).
- [Clean 11-case GREEN result](evidence/independent-green.json) and [log](evidence/independent-green.log).
- [Exact early-observation replay source](evidence/premature-observation-probe.test.tsx.txt).
- [Exact reviewer late-success source](evidence/late-success-probe.test.tsx.txt).
- [Reviewed source and configuration receipt](evidence/source-receipt.json).

The repaired browser fixture waits for enabled Continue before cancelling the original invoice and before sampling the replacement's completed request count. It preserves the prior no-growth assertion after the old route is released and both empty raw/unexpected-call assertions. It additionally requires the recorded method list to remain identical and repeats the exactly-two chain-check assertion after release. No arbitrary delay or longer timeout was added.

The controlled request ownership evidence rules out a stale-grant retry as the cause of the replay's six additional fetches. The hosted logs are consistent with that same ordering and the installed Playwright implementation explains how the early sample was possible. Because the hosted artifacts do not include a method-level trace, this conclusion does not pretend those original requests were individually tagged in CI; final confirmation remains the repaired hosted run.

## Scope and remaining gate

No production edit was required by the reviewed repair. Hosted lean and full browser qualification must run again on the repaired combined head. This review does not claim local Chromium, independent lint/typecheck, or hosted repaired-source acceptance. No remote operation was performed by this reviewer.
