> Historical handoff, subsequently completed. Use ../source-coverage.json for final state.

# Fresh worker handoff — finish BTC package review

Context closed. User explicitly requested fresh workers at that boundary. No more source investigation was performed after compaction; this checkpoint preserves exact completed coverage and candidates.

## Read first

- `/workspace/scratch/72c433175c66/btc-packages-continuation-audit.json`
- `/workspace/scratch/72c433175c66/btc-packages-continuation-findings.md`

Older multichain-packages audit/findings contain non-BTC package work and must be preserved. Root publishes repository notes; do not edit application source or refs.

## Pins

- Main: `/workspace/scratch/72c433175c66/GhostPay-bugcheck`, `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Integration: `/workspace/scratch/72c433175c66/GhostPay-latest`, `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

## Exact source remaining

One file: **`packages/btc-silent-payments/src/spend.ts` lines 261–721**, blob `60697bc4a3b2c8518f822786027049ee6d770e53` at both pins. Lines 1–260 were read. The attempted output starting around line 260 was truncated by context and is not counted.

All other 33 production BTC paths were read completely on main. All three changed integration variants—scan/headersync.ts, scan/scanner.ts, scan/state.ts—were fully reviewed against main. Other 31 BTC production paths have identical blobs. The manifest records exact per-head hashes, ranges, methods, and partial status.

Generated scan/proto/indexing_server_pb.ts received complete structural review, without regeneration or encoded descriptor equivalence verification. Do not imply stronger validation.

## Remaining candidate decisions

No tests executed by this worker. Five candidates are recorded, all unpromoted. Finish spend.ts, then use only ordinary local functional fixtures to resolve scanner post-verifier cancellation and seenKeys semantics, headersync cancellation, legacy HTTP deadline cleanup, and previewSweep validation as necessary. No exploit reproduction, live network/funds, application edits, or broad optional suites. Parent already installed exact-lock dependencies and built production packages.

Coordinate browser reachability with `/root/btc_views_continuation`. Its latest qualification is included in candidate notes: scanWorkerClient terminates worker on abort and web scan.ts checks abort before return; sweep.ts validates destination network before preview; oracleBridge bounds legacy HTTP requests independently. No browser consequence has been demonstrated for these package API candidates. Header sync clone/adoption behavior still needs their qualification. BTC is optional full-profile functionality excluded from lean Pages.

Deduplicate main-to-integration spentness/anchor fixes with root's feature notes; they are fixed dispositions, not new open issues.

## Helpful normal fixtures

scan/scanner.test.ts first 160 lines were inspected. It imports generateSilentPaymentKeys and seededRng from rng.testutil.ts; makeBlock, p2wpkhInput, p2trInput, blockHashOf from fixtures.testutil.ts. A normal in-memory block consists of makeBlock(height,[{inputs:[p2wpkhInput(seed)],recipients:[silentPaymentAddress(keys,'mainnet')]}]). Earlier inspected cancellation tests cover pre-abort, between yields, and pending tweak request, not deferred verifier. Do not assume the rest of test file is reviewed.

No test session is running from this worker. Main dist built production output is present, but test utilities may require the repository's installed test loader. Prefer existing parent QA tooling.

## Last attempted but unread adjacent material

- spend.ts 260–525 (unread except line 260 overlap).
- apps/web/src/features/btc/sweep.ts 1–125 (unread by this worker; browser worker now qualified its guards).
- Search for previewSweep and millisat fee rounding in spend tests/package markdown (output lost).

## Output

Save final BTC coverage/findings or update these artifacts with explicit new reviewer attribution. Report actual confirmed/dismissed outcomes to root. Do not mark all source complete until spend.ts 261–721 is read.
