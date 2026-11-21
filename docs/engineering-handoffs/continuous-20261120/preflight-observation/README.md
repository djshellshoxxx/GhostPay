# Replacement preflight observation follow-up

**Classification: browser-fixture synchronization defect. No production change was required.**

Worker: `/root/qa_bug_gen1`; branch `fix/ghostpay-preflight-observation-20261120`; base `3dc86fbc49e919e664230b63dae372ff79430fc5`; claim `996f5544`. The two-file repair is **`89e163fcc24f72830c0a5876486a72178a9365e7`**, tree `960868c6caec402ac38ca4d801fe519151fa190b`.

## Observed failure and diagnosis

Hosted lean job `135981022990`, run `44643709383`, reported 115 passed, one failed, five skipped. The invoice-replacement scenario passed its original two-chain-check assertion, then compared nine observed foreign requests with fifteen after releasing a held old request. Its associated PR head was `d74af79ebabdc8cead843361c3497b46d8c421f9`; the executed synthetic merge was `a7ceff94269cddfbc725677dd03737d96a449039` into main `c977b5d6723f6822c3b5d86cd6b231712c53c395`.

Artifact `14588585398` was downloaded through the GitHub connector. Its SHA-256 matches the upload log: `9260510914385222ec3ab558f9b61baa00c2f21a41d82bdb59a0541284355c8d`. It contains 47 files and no request trace. Its failure context shows the replacement invoice's completed net amounts and enabled Continue button. Exact request identities below are established by the deterministic component reproduction, not a nonexistent hosted trace.

The test used `waitForLoadState('networkidle')` after same-document invoice navigation. A previously reached lifecycle state can satisfy that wait; it does not establish that the current invoice's asynchronous preflight finished. Installed Playwright 1.65.1 checks its existing lifecycle-state set, while its same-document navigation path does not clear the document lifecycle. Pay's replacement description appears before the RPC checks finish. Continue stays disabled until the current context has completed those checks.

## Deterministic request and authority proof

The new regression renders Pay/AppShell with encrypted native-coin invoices and the real `createDefaultServices` RPC client, transport and frozen network authority. Only the synthetic fetch endpoint and timing of the verified replacement client's delivery are controlled. A transparent client wrapper records which real grant owns each manifest read.

| Boundary | Actual fetch count | State |
| --- | ---: | --- |
| Original invoice context ready | 7 | One chain check and six manifest reads |
| Explicit renewed action held | 8 | Old renewal's chain request is held |
| Replacement chain verified, client delivery paused | 9 | Continue disabled; old grant aborted; old real RPC operation already settled, including any guarded retry/backoff |
| Replacement context ready, old fetch still held | 15 | Six reads all belong to the replacement grant; Continue enabled |
| Old held fetch released as a failure | 15 | No extra request, unchanged complete method/body list, exactly two successful chain checks and three issued grants |

The six reads are `eth_call` for `FEE_RECIPIENT()`, `ANNOUNCER()` and `FEE_BPS()` on the router, followed by `eth_getCode` for the router, sweep relayer and announcer, all at `latest`. The test checks their exact IDs, selectors, targets and parameters against actual fetch bodies.

The old operation's settled state matters: transport failure can enter the client's bounded retry path, but the production service checks the revoked grant before another dispatch. Waiting for that real operation to finish prevents an unfinished backoff from being mistaken for proof of cancellation. Its independently held underlying fetch can then fail without creating further requests.

## Repair and verification

The browser scenario now waits for **Continue enabled before initial cancellation and before the replacement request-count snapshot**. All existing assertions and timeouts remain. It additionally checks the complete method list is unchanged after old-response release and repeats the exact two-chain-check assertion. The final `expect(foreign).toHaveLength(before)`, no-raw-transaction and no-unexpected-method assertions remain intact.

- Original-config, single-worker source tests: **10 passed, four files, exit 0, 16.77 seconds**. Includes the new completion regression, prior Pay network regression, manifest ownership regressions and default-service authorization guards.
- Controlled premature-snapshot variant: **expected RED, nine versus fifteen**, while the real production pipeline remained unchanged. The committed snapshot was restored. Explicit TypeScript annotations were added after this diagnostic run; the final source is pinned to the passing run. `premature-snapshot.patch` reproduces the observation change on the committed test.
- Full web TypeScript check: **PASS**, exit 0.
- Changed-file ESLint: **PASS**, exit 0.

Node 22.23.4, Vitest 5.1.0, project Playwright 1.65.1. Web source was read from this worktree; package imports used the coordinator's built dependency graph through a temporary symlink. Exact commands, source blobs, output hashes and import paths are in `RECEIPT.json` and `runtime.json`. No coverage, configuration, production, dependency, contract or fee changes were made.

**Remaining gate:** original hosted browser execution in both profiles on the combined new head. The previously observed local Chromium startup restriction was not probed again; no browser was launched and no local browser-pass claim is made. The coordinator's independent reviewer separately replayed the exact-source probe and an old-fetch late-success variation; that independent evidence is pinned at `97fd030ac9d06d62073e489603174d4a22d47024` under `docs/engineering-handoffs/continuous-20261119/browser-followup-review/`.
