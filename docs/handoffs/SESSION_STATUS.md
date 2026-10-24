# GhostPay session status

Session: https://claude.ai/code/session_01EbGTtcoBsDXy3sEKqwpGUD — date 2026-10-24.
Owner: this session owns djshellshoxxx/GhostPay only. Sibling session owns p2p-offramp (not touched here).
Work branch: `claude/adoring-wozniak-850ue6`.

## Baseline (verified by ancestry, this session)

- `origin/main` = `dbee6786c5adf97e014318f55da4dfdbc1565cfc`.
- Linear chain: main < `work/local-reconstruction-2026-10-24` (`bd320d5`) < PR26 head `claude/cool-albattani-xopr89` (`06f1426`) < `work/ghostpay-pr26-qa-2026-10-24` (`77e7d7b6dd21da1995259c8950141db0d34bcb6e`).
- Baseline for this session: `77e7d7b` (most complete; contains all of the above).
- `68ea4b735df7a295c7d620e6794d8bbab0c08a1b` reported local checkpoint: NOT present on remote; not recovered, nothing credited from it.
- Open PRs at start: #26 (draft, head 06f1426). No PR for pr26-qa branch.
- No other active GhostPay worker observed (latest remote push 2026-10-24 15:19 UTC by Sheldon Davidson).

## Status

In progress — see ledger below. Prior handoff: `docs/HANDOFF-2026-10-24-PR26-CAS.md`.

## Ledger (this session)

| # | Requirement | Change | Tests (rerun this session) |
|---|---|---|---|
| 1 | Configured second RPC fails closed (WEB-APP-04, Settings contract) | `views/Scan.tsx`: secondary-RPC open failure (unreachable, wrong chain) previously swallowed via `.catch(() => undefined)` so scan ran single-provider silently; now blocks with error. | New `Scan.test.tsx` case reproduced the bug (failed before fix), passes after; Scan 22/22. |
| 2 | Spec 13 gas buffer v2 client: TTL 60 s | `BUFFER_QUOTE_TTL_SECONDS` 120 -> 60. | pay.test |
| 3 | Spec 13: token-specific sweep simulation, fail closed | `quoteBuffer(rpc, now, sweep?)`: `eth_estimateGas` of ERC-20 `transfer` from payer, +25 % margin, floor 100k default table, rejects 0 / >500k / failure. Pay confirm path passes the sweep; toggle preview labelled "default table value". `BufferQuote.gasSource`. | pay.test (simulation, margin, floor, 4 fail-closed cases); Pay.test buffer flow asserts estimateGas; new UI fail-closed test. |
| 4 | Spec 13: re-estimate before send | `assertBufferStillSufficient` in `sendPayment` before simulation/wallet: fresh gas price at quoted gas limit must not exceed built buffer value; no RPC -> refuse. | pay.test + payExec.test (gas spike blocks send with zero wallet contact; no-RPC refusal). Would fail without guard. |
| 5 | Spec 04 payer permit pre-flight | `classifyPayerPermit` (payExec): `already_allowed` skips signature, `unsupported_token` (domain unreadable/mismatch) falls back to exact approval path, never signs. Wired in Pay prepare. | payExec.test classifier matrix; 2 Pay UI tests (both fail pre-fix: permit build error). |

| 6 | Spec 13 send-time recheck tolerance | Recheck compares margin-free requirement so drift within the 20 % safety margin does not force re-prepare loops. | pay.test boundary 1.2 gwei pass / +1 wei block. |
| 7 | Spec 11/12 BTC foundation: block integrity | `packages/btc-silent-payments/src/header.ts` (header parse, nBits target w/ Core negative/overflow rules, PoW vs per-network powLimit, CVE-2012-2459-safe Merkle root, `verifyBlockData`). Esplora: txid recomputed from JSON (version/locktime/sequence required), header hash = served hash, PoW, Merkle root, height linkage to pinned genesis (both directions), genesis never downloaded. Regtest shim serves `/block/:hash/header` + txid fields. | header.test 16 (mainnet/regtest genesis, block 170 Merkle); esplora.test tamper matrix (omit/inject/edit/wrong header/weak PoW on testnet4/fork below/above/genesis mismatch) + txid edits vs independent @scure/btc-signer txids; BtcView flows green; btc pkg 369 tests, coverage 97.56/96.41/96.91/99.29; shim `node --test` 4/4. |

BTC limits (do not overclaim): NO difficulty retarget, chain work, MTP or best-chain selection; test-network PoW cheap; witness + prevout scripts not txid-bound (can hide, not forge, payments); `isUnspent` is server's word. Live bitcoind regtest e2e NOT run locally (no bitcoind); GitHub Integration workflow runs it on PR when btc paths change — check its result.

Blocked: TRON Nile/Shasta positive genesis pinning — trongrid hosts 403 via network policy; not pinned from memory. Spec 13 fiat buffer estimate — `FEEDS` registry is empty (no verified feed addresses). Spec 05 lanes/budget redesign deferred (existing per-run budget + resumable `limitReached` already avoids silent drops).

Not done from spec 13 (needs schema version + ADR / feed work): invoice `bufferPolicy` (`maxWei/minWei`), fiat estimate of buffer, permit+buffer contract path (deferred, audit). Spec 04 relayer side (grief reserve, failure counter, sweep fallback ladder) not touched.

### Verification log (this session, exact commands)

- `npm ci` exit 0; `npm run build:libs` exit 0.
- `GHOSTPAY_CHROMIUM=/opt/pw-browsers/chromium node apps/web/scripts/test-tags-concurrency.mjs` exit 0: 11/11 native two-tab CAS/rotate/wipe/lifetime scenarios PASS (rerun of 2751517 work, unchanged code).
- `npm run typecheck` (all workspaces, background, ran while edits in progress) exit 2: only `payExec.test.ts:342` missing `gasSource` from my in-flight change; fixed. Then `apps/web: npx tsc -p tsconfig.json --noEmit` exit 0.
- `apps/web: npx eslint` on all changed files exit 0.
- Focused: `apps/web: npx vitest run src/lib/pay.test.ts src/lib/payExec src/views/Pay src/views/Scan.test.tsx` all pass.
- `npm run ci:scan-secrets` OK.
- Full web coverage + all-workspace lint: see below once finished.
