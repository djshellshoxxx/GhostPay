# Round 4b: chain-adapters and btc-silent-payments (follow-up to fixes-round4.md)

Branch `claude/remote-extensions-4`. Sources: `docs/remote/round-audits/{chain-adapters,btc}.md`, `stress/scanners.md`, `assurance/{fuzz-parsers,chaos,static-analysis}.md`, `docs/audits/03` (S3-14). Not touched: `chain-adapters/src/sweep.ts` and its tests. Nothing committed. Each fix has tests in `packages/chain-adapters/src/audit-fixes-r4b.test.ts` or `packages/btc-silent-payments/src/audit-fixes-r4b.test.ts` (new files, no existing test changed).

## Final runs

| Package | Tests before -> after | tsc / lint | Coverage after (stmts / br / funcs / lines) | Baseline |
|---|---|---|---|---|
| chain-adapters | 243 (sweep agent's tests included) -> 274 | clean / clean | 98.85 / 98.31 / 96.61 / 99.73 | 98.58 / 97.96 / 96 / 99.7 |
| btc-silent-payments | 313 -> 346 | clean / clean | 97.58 / 96.33 / 96.62 / 99.47 | 97.44 / 95.65 / 96.45 / 99.44 |

No threshold lowered, no test weakened. `npm run build -w @ghostpay/chain-adapters` re-run. Dependents spot-checked: `apps/web` scan tests (Scan.test, scanClient.test) pass; `ops-monitor` 52 pass. Not run: relayer full suite, real RPC/oracle.

## Items

### 1. Hostile head / deep reorg / cross-call retraction (CA-02, CA-03, CA-14, S-9, C-3)
| Sub-item | Status | Tests |
|---|---|---|
| Head absurdly high (2^200) drove ~1000 getLogs | VERIFIED by reading + FIXED: `MAX_PLAUSIBLE_HEAD = 10^10` (RPC_FAILURE `implausible chain head`) | `item 1: hostile head` (2 tests) |
| Head behind the verified checkpoint | FIXED: RPC_FAILURE when the checkpoint hash matched but head < checkpoint. A head that simply lost the checkpoint block is still the (existing) reorg path | "rejects a head that moved behind..." |
| `getBlock(head)` null silently skipped the head cross-check (CA-14) | FIXED: fail closed | "fails closed when the head block itself is unavailable" |
| Reorg deeper than `finalityDepth` (S-9, C-3) | PARTLY FIXED, opt-in: `FetchOptions.historySize` (0..64, default 0) keeps older checkpoints in `ScanCursor.history`; resume rewinds to the newest still-canonical checkpoint, or below the oldest when none is. Default cursor shape is unchanged (existing tests pin it). Limit pinned by a test: without history a 25-block reorg rolls back only `finalityDepth` | `reorg deeper than finalityDepth` (9 tests) |
| Window boundary block unavailable | covered | "fails closed when a window boundary block is unavailable" |
| Cross-call retraction | UNFIXED by design: `adapter.scan` (done in round 4) fails closed with "chain reorganised during scan; retry" when a later page finds an earlier one reorged; already yielded payments cannot be retracted from an async iterator. The consumer must restart the scan and drop `blockNumber >= rolledBackTo` (web `runScan` ignoring `reorg` is C-2, apps/web, not owned) |
| Overall scan deadline / AbortSignal into the transport (CA-03) | UNFIXED: needs `RpcTransport.send` signature change; head bound + `maxRequests` already cap the work |
| Web persists only `nextBlock`/`last`, so `history` is lost there | UNFIXED (apps/web `scanClient.ts` not owned); proposal: persist `history` too |

### 2. Log blockHash cross-check (S3-14, CA-14): VERIFIED, FIXED opt-in
`FetchOptions.verifyLogBlocks` and `EvmAdapterDeps.verifyLogBlocks` (default false): every accepted log's `blockHash` must equal the canonical hash at its height (window ends are free, other blocks cost one `eth_getBlockByNumber`). Mismatch or vanished block -> `RPC_FAILURE`. Default is off because existing fixtures (this package's adapter/logs tests) use log hashes inconsistent with `getBlock`, and changing them would alter tests; turning it on by default is a follow-up once fixtures/consumers are aligned. Tests: `item 2 (S3-14)` (4 tests, includes adapter pass-through).

### 3. Manifest signature / on-chain read-back (CA-01, S3-01)
- Wording check: `deployments/README.md` defines `bytecodeHashes` as keccak256 of runtime code (`cast codehash`); the audit and ops-monitor W1 name `FEE_RECIPIENT()/FEE_BPS()/ANNOUNCER()` on the router. Clear enough: FIXED (helper). The signature scheme (signed bytes, key) is NOT defined anywhere ("Detached signature over the canonical manifest (release key)"), so no verifier or trust root was invented.
- `verifyDeploymentOnChain(client, manifest, { secondary? })` (`src/readback.ts`, exported): router/sweepRelayer (and policy implementation/factory) code hash vs `bytecodeHashes`, announcer has code, router getters equal the manifest, optional second endpoint via `requestWithFallbackCheck`. Not called automatically. It binds a manifest to what is deployed; it does NOT authenticate the manifest (a forged manifest pointing at an attacker contract with its own true hash passes). Tests: `item 3: on-chain read-back helper` (6 tests incl. policy path).
- `loadDeployment(text, chainId, { verifySignature })`: optional hook, off by default; requires a `signature`, the hook must return exactly `true`, a throw/false/missing rejects with `INVALID_MANIFEST`. The hook owns canonicalisation and the pinned signer. Tests: `item 3: manifest signature hook` (3 tests).
- UNFIXED, design proposal: define canonical manifest bytes (JCS / sorted-key JSON without `signature`), sign with an EIP-191/EIP-712 or secp256k1 release key whose address is pinned in the app build and in the repo (`deployments/README.md`), then ship `verifyManifestSignature(manifest, trustedSigner)` built on the hook. Pin the signer out of band (two maintainers), and add a freshness/expiry rule for `date`.

### 4. BTC oracle unauthenticated data (M1/M2, L1, S-4/S-5/S-6, F11)
- Per-output attribution (M1): already FIXED in round 4.
- Bounds (VERIFIED, FIXED): scanner now validates txid (64 lowercase hex), vout (u32), amount (0..21e14) for ANY `TweakSource`, not only BlindBit (`INVALID_RESPONSE`); fromHeight/toHeight above u32 and spans above `maxBlocks` (default 2,000,000) -> `INVALID_INPUT`; BlindBit `/info` and tip heights above u32 -> `INVALID_RESPONSE`.
- Cross-check (FIXED, optional): `ScanBlocksParams.crossCheck` (second `TweakSource`: block hash and every found output must match, else `REORG_DETECTED` / `INVALID_RESPONSE`; asked only for blocks with matches; privacy cost documented) and `verifyOutput` hook (own-node lookup; must return exactly `true`; throw -> `TRANSPORT_FAILURE`). Defaults unchanged, no extra requests (tested).
- UNFIXED: omission by the oracle is undetectable without a second full source for every block; PoW/header verification not implemented. Tests: `item 1: hostile tip height`, `item 4` (3 groups, 21 tests).

### 5. BlindBit and parsers
- Static F1 / R2 byte cap: VERIFIED already done (stream cap, content-length precheck). New tests: no content-length header, lying small content-length, non-numeric header, Response without `.body` (oversized header rejected). Documented limit: a json()-only Response without header has no cap (fakes only; real `fetch` always has `.body`).
- Timeout is a `Promise.race` and does not abort the request: UNFIXED. Aborting needs a signal in `init`, which existing tests pin (`init` equals `{method:'GET'}`, caller signal identity); proposal: add an opt-in `abortOnTimeout`.
- Quadratic regex (F2): the only one in these packages was `/\/+$/` in `BlindBitClient.normalizeBase`: FIXED (loop trim, URL length cap 2048, non-string rejected). `units.ts` `/0+$/` runs on an 8-char string, `ecc.ts` hex patterns are linear and length-checked first: REJECTED. Test: 300,000-slash URL rejected in <1 s.
- Untyped throws in `scan/` and `uri.ts`: VERIFIED none found (URIError fixed in round 4). Added tests: 400 deterministic hostile URIs plus wrong-typed inputs (Symbol, null, lone surrogates) only raise `SilentPaymentError`.
- `uri.ts` unsanitised label/message (I3), trailing-zero amounts: UNFIXED/design (display concern; UI must use sanitizeDisplayText).

### 6. Other confirmed items for these packages
- Option validation `maxRequests: NaN` (S-10) was not re-tested here beyond round 4: `fetchAnnouncements` still does not validate `maxRequests`/`maxLogs`: VERIFIED by reading (`requests >= NaN` is false), UNFIXED in this round (not in the item list; one-line follow-up).
- S-8 livelock when `maxRequests` is smaller than the halvings needed: VERIFIED by reading, UNFIXED (persisting the learned window needs a cursor/result change).
- C-4 (provider silently drops logs): UNFIXED, single-provider trust; `requestWithFallbackCheck` remains unwired.
- L4/L5/L6/L8 spend items (B2 done, B6 pinned in round 4); L6 (false INSUFFICIENT_FUNDS just below dust) and L8 (post-sign output check) are VERIFIED by the audit but not re-run and not changed here (`spend.ts` untouched this round).
