# FC-05b: Bitcoin retained-sweep current-scan guard and session pending-spend guard (#254 recovery)

Full profile only. Testnet/proof of concept. Fund-safety area (sweep signing path): independent review required.

## Provenance
- Base: `claude/fc05a-t-btc-text-20261125` head `22c3cb1d7a5c973f0ebc6b34cd0f36f6ed377ffa` (contains FC-05a `8e7b1915`). Merge main with `git merge --no-ff origin/main` once #664 lands.
- Donor: PR #254 `chatgpt/btc-spentness-private-scan-20261118`, head `2b4b1e912350cb18c630a68b5c1990426e29dbc0`. NOT merged; changes ported test-first with `Recovered-from:` trailers.
- Commits: `d40e301f` (current-scan guard + pending-spend guard), `8d7e608d` (duplicate-spend validation + ported regression tests).

## What changed
1. `ba588c82` (gap in FC-05a), `apps/web/src/features/btc/BtcView.tsx`:
   - `inputsChecked` reads `scanRef.current`, the live header chain and the live pending-spend set (not the render closure); requires `spentStatus` `provider`, or `local` with `toHeight >= live.tipHeight`; each input must be in the current scan with `height <= live.tipHeight` and `live.hashAt(height) === blockHash`.
   - `clearSigning` calls `invalidate()` only when no scan is running.
2. NEW pending-spend guard (FC-05a reviewer L3): outputs ("txid:vout" -> block height) of a transaction this session asked the server to broadcast stay unsweepable (also excluded from `inputsChecked`). Marked when the broadcast request may reach the server (any outcome). Released only by: a later complete local scan that covers the output's height and no longer lists it; a reorganization that cuts the scan (`applyChainToScan` with `toHeight` lower or scan discarded; a tip advance does not release); lock or importing a wallet. Memory only. Status text key `btc.scan.pendingSpend` in en/es/ja/ar (English copy in all four, like the neighbouring spentness keys) and in the security-classified key list in `apps/web/src/i18n/securityKeys.ts`.
3. `78e50547` gap in FC-05a, `packages/btc-silent-payments/src/scan/scanner.ts`: conflicting `spentBy` entries for one outpoint inside a single block's spend list are rejected with `INVALID_RESPONSE`, watched or not (identical duplicates still tolerated).

## Red to green evidence (heavy-run on this host)
- New `BtcView.pendingSpend.test.tsx`, test 1 (rescan after broadcast lists the swept input as sweepable): RED on 22c3cb1d (`AssertionError: expected false to be true`), GREEN with the fix.
- New `BtcView.retainedSweep.test.tsx`, "does not restore old sweep authority when a fee edit occurs during an advanced-header save" (ba588c82 test): RED (`expected false to be true`), GREEN.
- New `BtcView.retainedSweep.test.tsx`, "refuses a retained Sign handler after a later provider scan reports the input spent" (my own test for the case #254's tests do not reach): RED (`expected "signSweep" to not be called at all, but actually been called 1 times`), GREEN.
- #254's two retained Sign/Broadcast handler tests (same chain prefix gains a spending block) PASSED on FC-05a before the fix (the closure's `toHeight` no longer equals the live tip), so they are regression coverage only. Their real guarded case is the provider scan at an unchanged tip (test above).
- Ported `scanner.test.ts` "reports the first spend once across blocks and still validates later duplicate lists": RED (`promise resolved instead of rejecting`), GREEN after the scanner change.
- Ported regression coverage that passed unchanged on FC-05a (behavior already present): `state.test.ts` duplicate-consumer, no-overwrite and replay cases (replay keeps FC-05a's `INVALID_INPUT`, which an existing FC-05a test expects; #254 used `INVALID_RESPONSE`, assertion adapted with a comment); `scan.spends.test.ts` oversized resume (524215eb); `scan-secrets.hardening.test.ts` bounded output identities (524215eb); `scanWorker.test.ts` and `scanWorkerSource.test.ts` matched-proof cases (4281fce1).
- New `BtcView.pendingSpend.test.tsx` tests 2 and 3 (release on confirmed spend; lock then re-import) pass; they are regression coverage for the release rules (test 3 was vacuous before the guard existed).

## Local commands and results (Windows host under memory pressure)
- Built `solana-stealth`, `tron-adapter`, `tx-review`, `scan-source` (exit 0) so web tests can resolve imports. `build:libs` was not run in full.
- `btc-silent-payments`: typecheck exit 0; lint exit 0 (one pre-existing unused-eslint-disable warning in generated `scan/proto/indexing_server_pb.ts`); `npm test`: after the final changes 549 passed, 9 failed of 558. The 9 are environment-related: 7 CRLF-sensitive `adapter-types.test.ts`, `bip32.test.ts` (vectors parsed as empty on this checkout) and `headerchain.test.ts`, which passed (27/27) on rerun. I did not verify the CRLF cause on an LF checkout. The coverage summary was not captured in a readable form (the final coverage run printed no summary lines and no threshold error); coverage thresholds are therefore unverified locally.
- `apps/web`: `npx vitest run src/features/btc --coverage=false`: 267 passed, 1 failed, 1 skipped; the failure (`BtcView.persistence.test.tsx` restart test) and one `LanguagePicker.test.tsx` failure in `src/i18n` (83 passed) did not reproduce on rerun (8/8 passed, both with my changes and at base), so they were load flakes. Web typecheck exit 0. ESLint on `src/features/btc src/i18n` exit 0.
- `git diff --check`: see PR. No Playwright run locally.

## Limitations
- The pending-spend guard is session memory only: it does not survive a page reload (default local scans cannot see mempool spends). A reorg that cuts the scan releases the guard by design, which reintroduces the mempool blind spot after such a reorg until a later confirmed scan.
- The guard keys on outpoints the app itself broadcast; spends by other software are invisible to local scans (existing limitation, stated in the spentness text).
- es/ja/ar catalogs carry the English security text for the new key.
- Hosted CI is the qualifying gate; independent review of the sweep signing path is required.
