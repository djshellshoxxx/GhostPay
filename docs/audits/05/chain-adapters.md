# Audit 05: chain-adapters + policy-scheme

AI-assisted review, not an independent professional audit. Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree). All `file:line` refs are `packages/...` in that snapshot unless prefixed `apps/`.

## Summary

Scope: `packages/chain-adapters`, `packages/policy-scheme` (+ callers in `apps/web`, `apps/relayer`, `packages/ops-monitor` where they decide trust).

Prior items S3-01 (manifest root of trust) and the "no signature/read-back" part of CA-01 are now implemented in code (`deploymentsSignature.ts`, `deploymentsVerify.ts`), but wiring is partial (see -03, -04). Fee maths, calldata encode/decode, typed-data digests and ABI argument orders match the Solidity (checked by reading; not by differential execution).

No critical or high finding. 12 findings: 5 medium (01-05), 6 low (06-11), 1 info (12).

Top issues:
1. CHAIN-ADAPTERS-01 (medium): one block range with more than 2 MiB of announcement logs permanently halts the scanner (cheap, permissionless).
2. CHAIN-ADAPTERS-02 (medium): a lying RPC can poison the persisted scan checkpoint past the real head; recovery only by manual clear.
3. CHAIN-ADAPTERS-03 (medium): payments seen as `pending` near head are never surfaced again after a resume (checkpoint ignores finality depth).
4. CHAIN-ADAPTERS-04 (medium): `verifyReceipt` returns `verified` for non-allowlisted attacker tokens.
5. CHAIN-ADAPTERS-05 (medium): manifest read-back is wired only into Scan, not Pay/relayer/ops-monitor.

## Method

- Read every non-test source file in both packages, the contract sources they mirror (`GhostPayRouter.sol`, `GhostPaySweepRelayer.sol`, `GhostPayPolicyRouter.sol`, `PolicyAccount.sol`, `PolicyAccountFactory.sol`), and the callers (`apps/web/src/lib/{manifest,pay,scanClient}.ts`, `views/Scan.tsx`, `apps/relayer/src/config.ts`, `packages/ops-monitor/src/cli.ts`).
- Read prior reports: `docs/audits/03` (S3-01, S3-02, S3-14), `docs/audits/01` (G-04, G-05, G-21), `docs/remote/round-audits/chain-adapters.md` (CA-01..CA-19) and re-checked each CA item against the snapshot (section "Prior items").
- Checked: ABI argument order vs Solidity for router and policy router, EIP-712 type strings vs contract constants, CREATE2 clone prediction vs factory, Merkle leaf format vs `PolicyAccount.requestWithdraw`, fee floor/limits vs router.
- Ran one trivial `node -e` (`Date.parse`) to confirm -10. No repo code executed, no forge PoC written: every finding below is by static reasoning with the exact code path cited. Confidence is stated per finding.

## Findings

### CHAIN-ADAPTERS-01 (medium, DoS) Scanner halts forever on an oversize `eth_getLogs` window

- `chain-adapters/src/logs.ts:196-203`: only JSON-RPC errors `-32602`/`-32005` halve the window. A `RESPONSE_TOO_LARGE` from the transport (`rpc.ts:117-120`, default cap 2 MiB, `rpc.ts:206`, not configurable in the app: `apps/web/src/lib/defaultServices.ts:28` calls `createClient(chain, url)`) matches neither, so `throw e`.
- `logs.test.ts:189` asserts this throw as intended behaviour.
- Exploit: `announce()` on the canonical shared announcer is permissionless. One spam contract calling `announce(1, x, R, meta)` in a loop emits ~3-4k scheme-1 logs per block (about 1 KB JSON each). Any single block (or any 1000-block window) with more than ~2000 such logs makes every `fetchAnnouncements` call whose window covers it throw, including at window size 1 (halving never triggers). The cursor never advances past it; every seller using the web scanner stops detecting payments at that block. Cost is a few dollars on L2s. Switching RPC provider does not help (cap is client side).
- Fix: treat `RESPONSE_TOO_LARGE` like a range error (halve down to 1 block), and at window 1 fall back to a split by topic/page or a raised cap with streaming parse; expose `maxResponseBytes`.
- Confidence: high (code path traced; not executed).

### CHAIN-ADAPTERS-02 (medium, RPC trust) Lying head poisons the persisted checkpoint

- `logs.ts:187-188` takes `head = blockNumber()` unbounded (`parseQuantity` allows 256 bits); `logs.ts:224-235` stores `getBlock(doneThrough)` hash as truth; `apps/web/src/lib/scanClient.ts:197` saves it to localStorage.
- Exploit: a malicious or compromised RPC answers `eth_blockNumber = real + 1_000_000` and fabricates `eth_getBlockByNumber` (any hash with the right number) and empty logs. `runScan` loops up to 10 000 pages x 50 requests and saves `nextBlock = real+1_000_000`. After switching to an honest RPC: `getBlock(last.number)` is `null` so `logs.ts:178-183` rolls back only `finalityDepth` blocks (still far above the real head), `head < next`, nothing is scanned, the new cursor (no `last`) is saved. All payments in the skipped range are invisible until the user manually clicks "Clear checkpoint" and rescans from the right block (UI text shows only "A checkpoint exists at block N").
- Fix: reject `head` below `cursor.last.number - finalityDepth` and above a plausible bound (wall-clock x blockTime), refuse cursors above head on resume (rewind to the last verified), require two-provider agreement on head before saving a checkpoint.
- Confidence: high for the logic; medium for practicality (needs a hostile provider once).
- Related prior: CA-03, CA-14 (still open).

### CHAIN-ADAPTERS-03 (medium, completeness) Pending payments are lost on resume; reorg result ignored by `runScan`

- `scanClient.ts:197` persists `cursor.nextBlock = head + 1`; `verifyReceipt` (`scanVerify.ts:72-73`) returns `pending` for matches within `finalityDepth` of head. The match exists only in the in-memory list (`app.setMatches`). On the next session "Resume from checkpoint" starts after those blocks, so they are never re-listed or re-verified. The reorg rollback (`logs.ts:178-183`) only triggers when the stored hash changed.
- Same function: `res.reorg` is used only for `pageFrom`; previously found matches with `blockNumber >= rolledBackTo` stay in `all` (`logs.ts` docs require the caller to drop them).
- Exploit: seller scans seconds after a payment (status `pending`), closes the tab, later resumes; the payment never appears again; payer disputes, or seller releases goods based on an out-of-band claim. Conversely a match from an orphaned block stays listed.
- Fix: persist checkpoint at `max(0, head - finalityDepth)` (re-scan the tail every time, dedupe by id), prune `all` on `reorg`, re-run `verifyReceipt` for retained matches.
- Confidence: high.
- Related prior: CA-02 (adapter.scan path, see Prior items).

### CHAIN-ADAPTERS-04 (medium, fake receipt) `verifyReceipt` says `verified` for any token, including attacker-deployed ones

- `scanVerify.ts:72-80`: `viaRouter` returns `verified` with no allowlist check; direct announcements are verified by calling `balanceOf` on `claim.token` (`scanVerify.ts:35-41`), an attacker-chosen contract.
- The router does not allowlist tokens (`contracts/src/GhostPayRouter.sol:_pull`): a custom ERC-20 that satisfies the exact-delta check passes, so the router announces it. A direct announcement with a lying `balanceOf` also passes.
- Exploit: attacker deploys `FakeUSDC` (or just a normal token with no value), pays 1 unit via the router or announces directly with `amount = 10^12`; `ScanMatch.receipt === 'verified'`. UI (`apps/web/src/views/Scan.tsx:155-159,205`) prints the amount in bold without the "Claimed" prefix and with "units of unlisted token 0x..."; the only guard is that sentence. A seller skimming the list may release goods. This weakens the S3-02 fix: `verified` means "funds exist", not "funds of a token I accept".
- Fix: `verifyReceipt` takes the chain id (or allowlist fn) and returns `claimed` (or a new `unlisted`) for any ERC-20 not in `config/tokens.ts`; never call `balanceOf` on non-allowlisted addresses (also avoids a gas/DoS call into an arbitrary contract).
- Confidence: high.
- Also note: replay of a genuine announcement by a direct call produces a second `verified` entry for the same stealth address (different `blockHash:logIndex` id). Dedupe by stealth address (S3-02 replay half, still open).

### CHAIN-ADAPTERS-05 (medium, trust wiring) Manifest on-chain read-back is only called in Scan; Pay and other consumers only validate

- `apps/web/src/views/Scan.tsx:66` is the only caller of `verifyManifestState`. The Pay path (`apps/web/src/lib/pay.ts:93-137`, `createPayContext`, `assertReadyToSend`) trusts whatever `loadManifest` returned: `router` and `feeRecipient` shown to the payer come from a same-origin JSON file, never read back from the chain (`assertReadyToSend` compares against the same manifest, so it is circular).
- `RELEASE_KEY` is `undefined` (`deploymentsSignature.ts:19`), so every enabled testnet manifest loads as `unsigned-dev`. Anyone able to alter `deployments/<id>.json` at the origin (host, CDN, mirror) redirects testnet payments to an attacker router; no signature, no read-back. Mainnets stay refused only inside `apps/web` (`verifyManifestSignature` fail-closed).
- `apps/relayer/src/config.ts:211` and `packages/ops-monitor/src/cli.ts:91` call `loadDeployment` only: no signature, no read-back, and the relayer allows mainnet (`ALLOW_MAINNET=1`) with an unsigned manifest. `DeploymentManifest` is one type for unauthenticated and verified manifests, so a caller can skip the checks silently.
- The read-back (`deploymentsVerify.ts:37-60`) is a consistency check through ONE client at `latest` (3 `eth_call` + 3 `eth_getCode` separate requests, no block pin, no second provider). A lying RPC answers whatever the manifest says. It authenticates nothing; only the signature does.
- Fix: make `createEvmAdapter` accept only a branded `VerifiedManifest` (signature or unsigned-dev flag plus read-back done), call read-back at pay time with two providers (`requestWithFallbackCheck` is still unused), apply `verifyManifestSignature` in relayer/ops-monitor.
- Confidence: high. Severity limited to medium because only testnets are enabled and the UI labels the manifest unsigned.

### CHAIN-ADAPTERS-06 (low) `scan` checkpoint vs "disagree" semantics: later pages persist a checkpoint past a disputed page; second provider is never wired

- `scanClient.ts:176-197`: after a discrepancy the in-memory `cursor` still advances and the next agreeing page calls `checkpoints.save(cursor)` with `nextBlock` beyond the disputed page. The UI text `Scan.tsx:94` ("checkpoints were not advanced") is wrong. A payment omitted by the primary in that page is never re-scanned (G-21 intent broken).
- `Scan.tsx:78-90` never passes `secondaryClient`, so in production the cross-provider completeness check never runs; omission by a single RPC is undetectable (inherent S3-14, but G-21 is documented as implemented).
- Fix: stop the scan (or pin `cursor` to the disputed range) on discrepancy; wire a second provider.
- Confidence: high.

### CHAIN-ADAPTERS-07 (low) Signed-manifest freshness/rollback and API footguns

- `deploymentsSignature.ts`: signature covers all fields but there is no sequence, expiry or revocation; `date` is not checked (`deployments.ts:73`). Hosting compromise can replay an older validly signed manifest (old router/fee recipient after rotation). Latent until a key is pinned.
- `verifyManifestSignature` uses `'key' in opts ? opts.key : RELEASE_KEY` (`deploymentsSignature.ts:~79`): a caller that passes `key: undefined` on a testnet silently bypasses a pinned `RELEASE_KEY` (returns `unsigned-dev`).
- Signature is accepted when present but unchecked on testnets without a key (an invalid `signature` field does not fail).
- Confidence: high; impact conditional.

### CHAIN-ADAPTERS-08 (low) Policy section of the manifest is only partly read back; no policy router in the manifest

- `deploymentsVerify.ts:46-50`: policy `implementation` and `factory` get a code-hash check only. Not read: `factory.IMPLEMENTATION()`, `FEE_TOKEN()`, `FLAT_FEE()`, `FEE_RECIPIENT()`; policy router `FACTORY()`/`FEE_RECIPIENT()`. The manifest has no policy router field at all (`deployments.ts:34-35` key list), although `policy-scheme/src/router.ts:32` says the router comes "from the pinned manifest".
- Exploit (manifest error or malicious signer): list an `implementation` address `X'` that holds identical runtime code to the real implementation `X` the factory clones (clone implementations carry no immutables, so code hash matches). Read-back passes; `predictAccountAddress` (`policy-scheme/src/policy.ts:128`) yields addresses no factory can ever deploy; payers fund them; funds unrecoverable (P6). Displayed fee (`policy.flatFee`, `feeToken`) can also differ from the immutable `FLAT_FEE` charged on `deploy`.
- No app uses policy-scheme yet (latent).
- Fix: read `IMPLEMENTATION()`, `FEE_TOKEN()`, `FLAT_FEE()`, `FEE_RECIPIENT()` from the factory and compare; add `policyRouter` to the schema and verify `FACTORY()`.
- Confidence: high (static).

### CHAIN-ADAPTERS-09 (low) Policy calldata decoder checks only the stealth/policy binding

- `policy-scheme/src/router.ts:166-195` `decodePolicyPaymentCalldata`: no check of router address, gross/net/fee, metadata layout and net, token, `value`, canonical encoding, deadline; the scheme-1 equivalent (`chain-adapters/src/router.ts:226-300`) does all of these. `buildPolicyPaymentTx` has no token allowlist and no chain binding. A tampered metadata `net` or token still "passes" the documented pre-wallet gate ("a tampered stealth or owner is detected here").
- Impact: a tampered tx can mislead the seller's scanner (metadata is what the seller reads) but the router itself enforces metadata == (token, net), so no fund loss; gap is defence in depth.
- Confidence: high.

### CHAIN-ADAPTERS-10 (low/info) Validator and helper gaps (carry-overs from CA-11, CA-13, CA-16)

- `deployments.ts:71-73`: `isRealDate` accepts `2026-02-30T00:00:00Z` (confirmed: `Date.parse` returns 1772409600000), contradicting `DEVIATIONS.md` item 8.
- `quote.ts:fiatToTokenAmount` does not bound `price.decimals` (`10n ** BigInt(p.price.decimals)`); `readPrice` bounds it to 0..30, direct callers do not.
- `router.ts` builder: when `now` is omitted there is no deadline check and any deadline up to 2^256-1 is accepted; `adapter.ts` `BuildOptions.now` optional; pay.ts passes it.
- `rpc.ts:~206`: `retries: NaN` gives an unbounded retry loop (`Math.min(Math.max(NaN,0),5)` is `NaN`, `attempt >= NaN` never true). `validateRpcUrl` allows private/loopback hosts over https (relayer SSRF-class only if URL becomes untrusted input).
- `fetchTransport` sets `redirect: 'error'` but no `referrerPolicy`/`credentials`/`cache`, so the provider can receive the app origin as Referer in browsers.

### CHAIN-ADAPTERS-11 (low) Quote and staleness

- `apps/web/src/lib/pay.ts:~149-153`: `maxAgeSeconds` = seller-controlled `quote.expiresAt - quote.timestamp` clamped to 60..86 400. A seller can make the payer accept a Chainlink answer up to 24 h old, longer than typical heartbeats.
- `quote.ts`: single RPC, `latest`, no min/max-answer, no L2 sequencer-uptime check (CA-07 still open). `FEEDS` is empty, so fiat invoices are currently unpayable; latent.
- `finalityDepth` in `config/chains.ts` are blocks, not time; Arbitrum Sepolia 250 x 250 ms is about a minute, Polygon 128 blocks is below the 157-block reorg seen on mainnet in Feb 2023. The file says these are unverified engineering defaults; they gate `verified`.

### CHAIN-ADAPTERS-12 (info) Other observations

- Unlimited retention: `compareProviders` compares only the primary range it was given, `missing_in_primary` results are discarded after reporting (matches from the secondary are never surfaced).
- Sweep/permit signing builders (`sweep.ts`) still cap neither fee nor deadline (CA-06); app guards with `assertSponsorFeeAcceptable`.
- `adapter.ts` `scan()` still ignores `res.reorg`, has no total deadline and no abort in transport (CA-02, CA-03); it has no caller in apps (grep), so dead in production.
- Announcer is only checked for "has code" (`deploymentsVerify.ts:62`); no code-hash pin even for the canonical announcer.
- `deployTx` hashes are never verified against the chain.

## Positive controls verified

- Manifest validator: strict key sets, EIP-55 enforcement, role-collision checks, size cap, `__proto__` rejection; canonical signing bytes include domain tag and cover every key, so no smuggled extension fields; JSON.parse used for both validation and signature (no parser differential).
- `routerFee`/`grossForNet`/`MAX_ROUTER_GROSS` match `GhostPayRouter._validate` (`gross*25/10000`, overflow bound `max/25`); ABI arg orders for all four router and four policy-router entry points match the Solidity; sweep type string, policy `Withdraw`/`CancelWithdraw`/`ProposeDestination`/`CancelDestination` strings, Merkle double-hash leaf and CREATE2 clone init-code hash match the contracts; digests double-checked via viem and by hand; signatures self-recovered.
- Log validation separates provider faults (throw) from content faults (skip); chain id checked at connect; response size, id and envelope checks; `redirect: 'error'`.
- Chain/token allowlists fail closed (`requireEnabledChain`, `findToken`); mainnets disabled and no mainnet tokens.

## Prior items (status in this snapshot)

- S3-01 / CA-01: signature verification and read-back exist; wiring partial (-05); no key pinned.
- S3-02 / CA-05: `verifyReceipt` exists; remaining gaps in -04.
- S3-14: chain id still verified once; `requestWithFallbackCheck` still unused (CA-15 open).
- CA-02, CA-03: open on the unused `adapter.scan`; CA-04: `assertReadyToSend` now compares against manifest router (`pay.ts`), but the manifest is the same unverified source (-05).
- CA-08, CA-09, CA-10, CA-11, CA-13 (dates), CA-16: still open (-10).
- No regression from a previously fixed item was found.

## Not reviewed

- No execution of any test suite, no forge/anvil differential for fee parity or calldata (static equivalence only).
- `abi/*.ts` generated files beyond argument order of payment functions; `scripts/gen-abi.sh`; `config/tokens.ts` addresses against issuer docs (cannot verify offline); `deployments/schema.json` content.
- `core-crypto` internals (stealth math, `parseMetadata`), `invoice-schema`, relayer HTTP surface, web worker (`scannerCore`), vault storage.
- Contract correctness of `PolicyAccount` beyond the parts mirrored by TS (limits window logic, timelocks, tests under `contracts/test/audit05`).
- Dependency/supply-chain review (viem, noble versions, lockfile).
- Live network behaviour (provider quirks, real log sizes, block times).
