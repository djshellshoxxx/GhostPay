# Privacy spec: Metadata hardening menu (`MH-*`)

Status: spec only, nothing built. Date 2026-10-21. Branch `claude/remote-extensions-1`. Scope: testnet PoC (Ethereum Sepolia 11155111, Base Sepolia 84532, local anvil). Legal questions deferred by the owner (ADR-0006); noted once, not a blocker.

Evidence tags: [R] repo file/line read this session; [P] primary source fetched 2026-10-21 (URL given); [U] unverified, from memory or inference; verify before relying. W3C and MDN hosts were unreachable from this session (DNS failure), so Referrer-Policy and SRI claims are [U].

Read: `README.md`, `docs/CONTRACTS_SPEC.md`, `docs/remote/anonymization-research.md` (L1..L14, 4.4, 4.5, 4.8, 9.x, 10.1), `docs/remote/security-specs/privacy-ops.md` (PO-*), `docs/remote/privacy-specs/hygiene.md` (HY-*), `payer-hiding.md` (PH-*, headings only), and code cited per row.

## 1. How to read this document

Every hardening below is an independently SELECTABLE optional feature with a stable id `MH-<AREA>-<n>`. Each has: default (ON/OFF), what it hides, what it does NOT hide, cost, dependencies/conflicts, build owner dir, testable requirements, PoC acceptance. Selection is a settings key (web, `ghostpay.settings.v1`, [R] `apps/web/src/lib/settings.ts:27`), an operator config key (relayer, [R] `apps/relayer/src/config.ts`), or a build flag (contract/deployment). "Default ON" means the repo already behaves this way or the PoC ships it on; "OFF" means opt-in. Nothing here yields anonymity: payer, gross/net amount, token, time and use of the router remain public ([R] README "Security limitations"). Each feature reduces one named leak and must say so in UI copy (PO-COR-4 style: no "unlinkable" wording).

Leak ids L1..L14 are from `anonymization-research.md` 1.1. New leaks introduced here:

| ID | Leak | Observer |
|---|---|---|
| M1 | Fee transfer to a known recipient reconstructs gross exactly; `FeeCollected(token, amount)` also states the fee | Everyone |
| M2 | `Announcement.caller` topic = router address, so every router payment is enumerable by one topic filter | Everyone |
| M3 | Wallet/estimator fingerprint in tx type, gas limit, tip | Everyone |
| M4 | Relayer tx pattern (gas limit estimate+20%, legacy gasPrice, serial lane order) | Everyone |
| M5 | Scan start block and request pattern | RPC provider |
| M6 | Invoice link ciphertext length, plaintext `quote.timestamp`/`expiresAt`/fiat/token/chain/`signer` | Anyone who sees the link |
| M7 | One meta-address and one invoice `signer` for every invoice | Anyone holding two invoices |
| M8 | Same meta-address and signer on every chain | Anyone holding invoices from two chains |
| M9 | Bitcoin tx structure fingerprints (section 5) | Chain analysts |

## 2. Catalogue

Summary table, then one subsection per feature. "Owner dir" is where the build happens; writers must touch only those dirs.

| ID | Feature | Default | Effort | Owner dir |
|---|---|---|---|---|
| MH-FEE-1 | Direct-pay no-fee mode (payer calls standard announcer, no router) | OFF | S-M | `apps/web`, `packages/chain-adapters` |
| MH-FEE-2 | Fee accrual: router keeps fee, recipient pulls in batches | OFF | M (new router) | `packages/contracts` |
| MH-ANN-1 | Standard shared ERC-5564 announcer, scheme id 1 | ON | done | `packages/contracts` |
| MH-ANN-2 | GhostPay-specific scheme id | OFF, discouraged | S | `packages/contracts`, `packages/core-crypto` |
| MH-ANN-3 | Minimal metadata (1-byte view tag only) on direct announcements | OFF | S | `packages/core-crypto`, `packages/chain-adapters` |
| MH-TAG-1 | Keep view tag | ON | done | n/a |
| MH-TAG-2 | Drop / mask view tag (constant or k-bit) | OFF | S | `packages/core-crypto` |
| MH-AMT-1 | Round quote-derived token amounts to a coarse grid | ON for `fiat_quote` | S | `packages/chain-adapters`, `apps/web` |
| MH-AMT-2 | Payer-side amount noise (overpay up to d%) | OFF | S | `apps/web` |
| MH-WAL-1 | Gas-limit bucketing / do not set wallet-chosen fields | OFF (wallet default) | S | `apps/web` |
| MH-WAL-2 | Relayer gas-limit bucketing | OFF | S | `apps/relayer` |
| MH-REL-1 | Private submission path for relayer tx | OFF | S-M | `apps/relayer` |
| MH-REL-2 | Release batching with random delay and random order (still one tx per sweep) | OFF | S | `apps/relayer` |
| MH-REL-3 | Request/response size padding | OFF | S | `apps/relayer`, `apps/web` |
| MH-REL-4 | Multi-relayer client selection | OFF | M | `apps/web` |
| MH-REL-5 | Zero-log relayer mode | OFF | S | `apps/relayer` |
| MH-NET-1 | Private/user-chosen RPC with endpoint separation | OFF (single URL today) | S | `apps/web`, `packages/chain-adapters` |
| MH-NET-2 | Own node | OFF | doc | `docs/operators` |
| MH-NET-3 | Light client (integrity only) | OFF | M-L | `packages/chain-adapters` |
| MH-SCAN-1 | Full range fetch (no per-address query) | ON | done | n/a |
| MH-SCAN-2 | Aligned scan ranges | OFF | S | `packages/chain-adapters`, `apps/web` |
| MH-SCAN-3 | PIR scanning | OFF, research | L | new package |
| MH-INV-1 | Memo/line-item padding before encryption | OFF | S | `packages/invoice-schema` |
| MH-INV-2 | Encrypt private part by default | OFF today (`encrypt=false`) | S | `apps/web` |
| MH-INV-3 | Coarse timestamps/expiry, no sub-hour times | OFF | S | `apps/web`, `packages/invoice-schema` |
| MH-WEB-1 | Strict referrer policy, no outbound links with referrer | ON | done (gaps) | `apps/web` |
| MH-WEB-2 | No third party; `connect-src` generated from configured origins | ON / OFF | S | `apps/web` |
| MH-WEB-3 | SRI for embed SDK and assets | OFF | S | `apps/web` |
| MH-ID-1 | Per-invoice meta-address and per-invoice signer | OFF | M | `packages/core-crypto`, `apps/web`, `packages/invoice-schema` |
| MH-ID-2 | Per-chain key derivation | OFF | M | `packages/core-crypto`, `apps/web` |
| MH-BTC-1..6 | Bitcoin: change, fee rate, locktime, RBF, input/output order, PSBT | mixed | S-M | `packages/btc-silent-payments` |

Recommended PoC preset ("hardened"): MH-ANN-1, TAG-1, AMT-1, INV-2, INV-3, WEB-1, WEB-2, SCAN-1, SCAN-2, NET-1, REL-2, REL-5, BTC-1..5. Everything else stays selectable but off.

---

### MH-FEE-1 Direct-pay no-fee mode

- Default OFF. Facts [R]: README states paying the stealth address directly costs no GhostPay fee; `Scan.tsx:198` labels such payments "paid directly, no GhostPay fee"; `adapter.ts:225` / `scanClient.ts:125` compute `viaRouter` from `caller == router`. No payer-side builder for a direct announcement exists: `grep announce(` in `chain-adapters/src` and `apps/web/src` finds only UI announcements (checked).
- Mechanism: payer sends the asset to the stealth address in one tx and calls the canonical ERC-5564 announcer `announce(1, stealth, ephemeralPubKey, metadata)` ([R] CONTRACTS_SPEC header: announcer `0x55649E01B5Df198D18D95b5cc5051630cfD45564`). Two txs or one via a payer wallet batch (EIP-5792, [U]); the PoC may ship two txs.
- Hides: M1 (no fee transfer, no `FeeCollected`), M2 (caller is the payer, not the router, so no router-topic enumeration). GhostPay use stops being a one-topic filter.
- Does NOT hide: payer, amount, token (the token `Transfer` log carries them), time. A scanner cannot cryptographically check the amount (S3-02, README: unverified payer-supplied amounts for non-router announcements). Payer can omit or lie in metadata.
- Cost: revenue: zero fee (owner decision, FEE_SCHEDULE; forks can already do this). Two txs unless batched, so announcement and transfer can be separated in time (an observer may link by payer). No router `minNet`/deadline protections: funds go to a stealth address with no on-chain slippage check; no fee-on-transfer guard.
- Dependencies/conflicts: needs scanner to treat `viaRouter=false` amounts as unverified until a balance check (HY-VER). Conflicts with MH-FEE-2 (router unused). Pairs with MH-ANN-3 (but then the scanner must read the amount from `Transfer`, not metadata).
- Requirements: MH-FEE-1-R1 `buildDirectPayment()` returns exactly the transfer call(s) plus `announce` to the manifest announcer, never to the router; R2 the app shows "no fee, no router protection, amount unverified" before signing; R3 `caller` topic of the resulting log equals the payer address (anvil test); R4 scanner marks `viaRouter=false` and does not display metadata amount as verified; R5 setting off by default and absent from invoice links (payer chooses, not the seller; the invoice may carry no hint).
- PoC acceptance: on anvil, direct-pay a token and native payment; seller scan finds both; log filter `topic3 == router` returns neither; fee recipient balance unchanged.

### MH-FEE-2 Fee accrual (pull fees in batches)

- Default OFF. Fact [R]: today `_payERC20` does `safeTransferFrom(msg.sender, FEE_RECIPIENT, fee)` (`GhostPayRouter.sol:185`) and native `_sendNative(FEE_RECIPIENT, fee)` (line 122), plus `emit FeeCollected` (line 124); fee is `gross*25/10000` (line 216). So a known recipient receives a transfer of exactly 0.25 % of gross per payment, linking each payment tx to the fee address and stating gross (M1).
- Honest value: net is already in announcement metadata (`metadata[25:57]`), so gross is derivable from public data today; hiding the fee address alone removes no information. It only matters combined with MH-ANN-3 (no amount in metadata) and a router that does not log the fee.
- Mechanism (new immutable router version, not an upgrade): router pulls `gross`, forwards `net`, accrues `fee` in a storage mapping, `withdrawFees(token)` callable by anyone pays `FEE_RECIPIENT` periodically; drop `FeeCollected` or emit only on withdrawal.
- Hides: per-payment link to the fee address; per-payment fee event. Does NOT hide: the `Transfer(payer -> router, gross)` log still states gross; token and payer unchanged. Fee address is still linked in aggregate on withdrawal.
- Cost: new contract and audit; router holds token balances between withdrawals (breaks current invariant "router holds zero tokens", CONTRACTS_SPEC section 5): custody risk, token-blacklist risk moves from payment time to withdrawal time (an improvement for README D5/M-01 liveness).
- Conflicts: invalidates current router audit; conflicts with MH-FEE-1. Owner dir `packages/contracts` only; manifest/adapters changes via `packages/chain-adapters` follow-up.
- Requirements: R1 invariant `routerBalance(token) == sum(accrued[token])`; R2 `net` receipt equals metadata amount (kept); R3 `withdrawFees` pays only `FEE_RECIPIENT`; R4 no `FeeCollected` per payment; R5 fuzz: `fee + net == gross` still holds.
- PoC acceptance: forge fuzz 10 000 runs and invariants pass; anvil flow shows no payment tx touches the fee recipient.

### MH-ANN-1 Standard shared announcer (scheme id 1)

- Default ON [R]: router uses `ANNOUNCER.announce(SCHEME_ID, ...)` with `SCHEME_ID = 1` (`GhostPayRouter.sol:38, 80`). ERC-5564 introduces schemeId 1 for secp256k1 with view tags [P] https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md (retrieved 2026-10-21); the event is `Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)` [P], matching `chain-adapters/src/abi/announcer.ts` (three `indexed: true` inputs, checked).
- Hides: the scheme id does not fingerprint GhostPay: every ERC-5564 user shares id 1 and the same event. Keeps the anonymity set as the whole ERC-5564 population on that announcer, for that field.
- Does NOT hide: M2 (`caller` = router) and the fixed 57-byte metadata layout `tag|0xa9059cbb|token|net` ([R] `metadata.ts:13`). The layout mirrors ERC-5564's recommended ERC-20 metadata layout [U: only the view-tag clause was quoted in this session], so it is also not GhostPay-unique, but the pair (router caller, 57 bytes) is.
- Requirements: R1 manifest validation rejects any announcer other than the canonical address on mainnet-class chains and requires explicit config on testnets; R2 a test asserts `schemeId == 1` in every router `announce` call; R3 scanner filters `topic1 == schemeTopic(1)` ([R] `logs.ts:207`).
- PoC acceptance: existing tests keep passing; anvil log shows `topic1 == 1`.

### MH-ANN-2 GhostPay-specific scheme id

- Default OFF; discouraged. Fact [R]: the experimental policy scheme already uses `0x47500002` ("GP"+2, CONTRACTS_SPEC section 4); that id is a pure GhostPay fingerprint. ERC-5564 permits "arbitrary or meaningful `schemeId`s" [P].
- Hides: nothing. It would only make GhostPay payments filterable by topic1 without the router address. Listed so the menu is complete and so reviewers can reject it explicitly.
- Cost: loses interoperability with generic ERC-5564 scanners; shrinks the anonymity set to GhostPay users.
- Requirements: R1 the build flag exists only behind `--unsafe-fingerprint-scheme` and the UI says "makes your payments easier to find"; R2 scanner accepts scheme 1 and the configured id only.
- PoC acceptance: none required (negative option); test that default build never emits other than 1 for scheme-1 invoices.

### MH-ANN-3 Minimal metadata on direct announcements

- Default OFF. ERC-5564 requires only the first metadata byte to be the view tag [P]; the router's 57-byte rule is enforced only by the router ([R] `GhostPayRouter.sol:_checkMetadata`).
- Hides: amount and token from the announcement log (they remain in the token `Transfer` log, so this hides only from consumers who read just announcements, and removes the GhostPay-specific 57-byte shape).
- Does NOT hide: any ERC-20 `Transfer` or native value transfer; amount recoverable from the transfer itself.
- Cost: scanner must derive amount from transfers (address-free log method, hygiene HY-VER); native transfers have no log, needing a balance read.
- Dependencies: only meaningful with MH-FEE-1 (the router forces 57 bytes). Conflicts with scanner code path that calls `parseMetadata` ([R] `metadata.ts:95` rejects length != 57).
- Requirements: R1 `buildMinimalMetadata(tag)` returns 1 byte; R2 scanner accepts length-1 metadata only when `viaRouter=false` and shows amount "unverified until read"; R3 never accepted for router payments.
- PoC acceptance: direct-pay on anvil with 1-byte metadata is found by scanner and its amount is confirmed through a `Transfer` log.

### MH-TAG-1 Keep the view tag (default ON)

- [R] `stealth.ts:168` early-rejects on tag mismatch; tag = `keccak256(S)[0]` (`stealth.ts:71`). ERC-5564: the tag "reveals one byte of the shared secret, the security margin is reduced from 128 bits to 124 bits" [P].
- Hides/does not: tag is noise to anyone without the viewing key; the 4-bit margin loss affects secrecy of shared secret, not an observed metadata link [U about practical exploitability]. Cost: none. Keep.

### MH-TAG-2 Drop or mask the view tag

- Default OFF. The router does not constrain `metadata[0]` ([R] CONTRACTS_SPEC section 1), so a sender may write any byte.
- Variants: (a) constant `0x00`; (b) k-bit mask: write `tag & mask | random low bits` and scan with the same mask.
- Hides: removes 8 (or k) bits of shared-secret hash from public data. Benefit is marginal [U]: no known attack uses the byte. Does NOT hide anything else.
- Cost: scanner loses early reject: every announcement needs the point addition and address compare (the ECDH is needed either way). Interop break: any third-party ERC-5564 scanner that rejects on mismatched tag will never see the payment, so funds look lost in other wallets. `deriveStealthSecret` hard-fails on tag mismatch ([R] `stealth.ts:202`), so it needs a mode flag.
- Dependencies/conflicts: breaks interoperability with MH-ANN-1's population benefit; incompatible with MH-SCAN-3 designs that rely on the tag as a bucket key.
- Requirements: R1 `checkAnnouncement(..., {tagMode})` with default `'full'` unchanged (existing vector tests pass); R2 `'ignore'` and `'mask:k'` modes covered by property tests (no false negatives for payments made in the same mode); R3 UI warns that other wallets may not detect the payment.
- PoC acceptance: payer in `'ignore'` mode, seller scanning in `'ignore'` mode finds it; default scanner does not (documented behaviour); benchmark scan time vs default on 10 000 synthetic announcements recorded in the PR.

### MH-AMT-1 Round quote-derived token amounts

- Default ON when `amountPolicy.mode = 'fiat_quote'`. Note [R] README: fiat invoices are disabled in practice (no oracle feeds, ADR-0012), so the PoC exercises it with a stub quote.
- Mechanism: payer-side computation of `tokenAmount` from a fiat amount and quote yields 18-decimal-precise values ([R] analogous leak for buffers: `fees.ts:102`). Round up to 2-3 significant figures (invoice `maxSlippageBps` bounds the surplus).
- Hides: client and quote-moment fingerprint in the amount (L9-class); also reduces amount uniqueness slightly. Does NOT hide amount itself, which stays public (L1/L11), and does not change in/out amount equality across a sweep.
- Cost: payer overpays up to the rounding step; seller receives more than quoted.
- Requirements: R1 `roundGross(amount, sigFigs)` rounds up, never down, result >= input and < input*(1+10^(1-sigFigs)); R2 never exceeds invoice `maxSlippageBps`; R3 `fixed_token` amounts are never altered; R4 property test over random amounts.
- PoC acceptance: 1 000 random quotes produce amounts on the grid; invoice accepted by existing `validateInvoice`.

### MH-AMT-2 Payer-side amount noise

- Default OFF. Adds random overpayment up to d % to break exact-amount joins with other data sets (e.g., an invoice sent over e-mail).
- Hides: match between invoice amount and chain amount. Does NOT hide: the amount, or the S1 to destination link (a sweep forwards the full balance, so in/out amounts still match; the research's own conclusion 4.2: amount splitting only helps at a shared pool).
- Cost: direct loss to payer; seller reconciliation must accept a tolerance; `payer_pays` gross formula changes ([R] `adapter.ts:175`).
- Conflicts: MH-AMT-1 (use one). Requirements: R1 noise from CSPRNG, bound `d` configurable max 1 %; R2 invoice marked paid if `net >= required`; R3 UI shows the exact overpayment.
- PoC acceptance: seller scan marks a noised payment as paid; overpayment within bound over 1 000 runs.

### MH-WAL-1 Wallet/gas fingerprint normalisation (payer side)

- Default OFF. Fact [R]: `wallet.ts:178` sends `eth_sendTransaction` with only `from,to,data,value,chainId`; the wallet chooses type, gas limit, nonce and tip, so the on-chain tx exposes the wallet's estimator and defaults (M3).
- Mechanism: client sets `gas` to the next multiple of a bucket (e.g. 10 000 gas above the simulated need) and leaves fee fields to the wallet; optionally refuses wallets that pass through non-standard fields. Never sets exotic fee fields (would itself be a fingerprint).
- Hides: wallet-specific gas-estimation padding. Does NOT hide: wallet type from tx type (0/2), EIP-1559 tip pattern, nonce, or the payer address.
- Cost: higher reserved balance (unused gas refunded); extra preview-vs-submission logic: `SubmissionMismatchError` in `wallet.ts` must accept the added `gas` field.
- Requirements: R1 bucket function monotone, result >= estimate; R2 tx still passes the post-submission check (`wallet.ts` ~line 248 `eth_getTransactionByHash` compare); R3 no field beyond the existing list plus `gas`.
- PoC acceptance: anvil: payment gas limit is on the bucket grid; mismatch check passes. Effectiveness against real wallets is unverified (no real wallet run, README).

### MH-WAL-2 Relayer gas-limit bucketing

- Default OFF. Fact [R]: relayer gas limit = estimate + 20 % and legacy `gasPrice` (`chain.ts:97-98`), uniform across users (good, M4) but distinct from wallets and exposing the relayer's estimator.
- Hides: estimator-specific limit. Does not hide: single shared hot key, sweep content (L4). Cost: small gas over-reservation. Requirements: R1 limit rounded up to bucket; R2 never below estimate; R3 `gasPrice` cap semantics unchanged. PoC: relayer unit test on `chain.ts`; anvil e2e passes.

### MH-REL-1 Private submission path

- Default OFF. Mechanism: relayer sends the signed tx through a private/builder RPC instead of the public mempool. Config `chains[].submitRpcUrl` (new), separate from the simulation RPC. Unverified which target chains offer this (privacy-ops PO-RPC-8, relayer-abuse Q1).
- Hides: pre-inclusion visibility of owner/destination/amount in the public mempool and from public-RPC peers. Does NOT hide: post-inclusion chain data; the private endpoint sees everything the relayer RPC sees (`PRIVACY.md` "What other parties see").
- Cost: trust in endpoint; liveness; some endpoints drop txs. Requirements: R1 URL validated by `validateRpcUrl`; R2 if submit RPC fails, no silent fallback to public (config `fallback: 'fail' | 'public'`, default fail); R3 simulation still on the normal RPC. PoC: anvil with two RPC URLs; tx observed only on the submit URL path.

### MH-REL-2 Release batching with random delay and order

- Default OFF. Fact [R]: each chain has a serial `ChainLane` with at most one in-flight tx (`lane.ts`), so submission order equals arrival order, linking a request timestamp to the on-chain order.
- Mechanism: hold accepted sweeps for a random window (operator `releaseWindowSec`, e.g. 30-300) and release in random order, one tx per sweep.
- Hides: request arrival time and order versus chain order (against a party that sees both the relayer network edge and the chain, e.g. the RPC provider). Does NOT hide: content; the payer-knows-S1 link.
- Dependencies/conflicts: hygiene HY-CON-5 forbids multicall of several owners into one tx, so "batching" here is timing only. Must keep sweep `deadline` in the signed order: window must be less than the remaining deadline or the sweep fails with a clear error. Interacts with quote expiry.
- Requirements: R1 release time uniform in window via CSPRNG (reuse the rejection-sampling approach of `jitter.ts`, [R]); R2 never releases after `deadline`; R3 queue is memory-only (PO-LOG-2); R4 order permutation is unbiased (chi-square over N=1 000 runs in test); R5 one signature per tx.
- PoC acceptance: submit 5 sweeps in order; on-chain order differs from arrival order in a majority of runs; none exceed deadline.

### MH-REL-3 Size padding

- Default OFF. `MAX_BODY_BYTES = 16 KiB` ([R] `server.ts:12`). Mechanism: web client pads JSON bodies (extra `pad` field ignored by schema) to fixed sizes (e.g. 1, 2, 4 KiB) and relayer pads responses; strict parsers must tolerate or require `pad`.
- Hides: request length classes against a TLS-observing network adversary. Does NOT hide: IP, timing, destination host. Gain is small [U] because request shapes already vary little.
- Requirements: R1 relayer accepts `pad` only as hex of bounded length and discards it; R2 both directions fall on bucket sizes (test with a recording proxy); R3 no effect on the signed fields. PoC: proxy test shows constant sizes.

### MH-REL-4 Multi-relayer selection

- Default OFF. Fact [R]: `Settings.relayerUrl` is one string (`settings.ts:7`), and the quote token is an HMAC of the relayer's secret (stateless, `PRIVACY.md`), so quote and sweep must go to the same relayer.
- Mechanism: `relayerUrls[]`; per sweep the client picks one at random (CSPRNG), quotes and sweeps at that one, and never splits one sweep across two.
- Hides: a single relayer's view of all of a user's sweeps over time (spreads clustering across operators). Does NOT hide: any single sweep from its chosen relayer; operators may collude.
- Cost: UI and settings migration; more trust surface (each relayer is a hot key to vet).
- Requirements: R1 settings validator accepts 1..N https URLs without credentials; R2 selection unbiased; R3 failure falls back only after the user confirms (no silent resend of the same signed order to a second relayer, to avoid double submission; nonce uniqueness on-chain protects funds, [R] CONTRACTS_SPEC); R4 test that quote and sweep share a relayer.
- PoC acceptance: two local relayers; 20 sweeps distribute roughly evenly; no cross-relayer quote use.

### MH-REL-5 Zero-log relayer mode

- Default OFF; logging already allowlisted ([R] `log.ts`, `PRIVACY.md`: fields `ts, level, event, requestId, route, status, chainId, txHash, errorClass`). Mechanism: `logging: 'none'` drops even those and keeps only in-memory counters.
- Hides: operator-side retention of per-request lines (timing, txHash-to-request joins). Does NOT hide: proxy/CDN/RPC logs (operator duty, PO-LOG-6), chain data, or in-memory state during a request.
- Requirements: R1 in `none` mode stdout/stderr output on a full sweep is empty except startup and fatal lines; R2 `/metrics` has no per-user labels (AT-PO-12); R3 audit-trail loss documented in runbook (incident response needs logs, `incident-response.md`).
- PoC acceptance: e2e anvil run with `none` produces no request lines; breaker and budget still function.

### MH-NET-1 Private RPC / endpoint separation

- Default OFF (a single RPC URL per chain, user-supplied: `rpcUrls: Record<chainId,string>`, [R] `settings.ts:6`; no shipped default found, privacy-ops Q1). Mechanism: two roles per chain, `scanRpc` (bulk `eth_getLogs`) and `queryRpc` (per-address reads and broadcast), per PO-RPC-4.
- Hides: one provider seeing both "this IP scanned" and "this IP cares about address X". Does NOT hide IP from either provider; a provider that sees both IPs can still join them.
- Requirements: R1 settings accept `{scan, query}` per chain, both pass `checkRpcUrl`; R2 per-address methods never go to `scanRpc` (recording-proxy test over `sweep.ts:55,171` paths); R3 error text omits URLs (PO-RPC-6). PoC: two local mock RPCs, test asserts method partition.

### MH-NET-2 Own node

- Default OFF; docs-only (`docs/operators/local-scanner-and-rpc.md`). Hides RPC-provider visibility entirely at the cost of running a node. Does NOT hide: the node's own P2P/IP exposure when broadcasting. Requirement: runbook states broadcast should still use MH-REL-1/NET tooling. PoC: doc review.

### MH-NET-3 Light client

- Default OFF. [S, anonymization-research 9.5] Helios verifies responses but the upstream still sees requested addresses. So this is integrity (S3-14), not query privacy. Mark as such in UI. Cost: WASM dependency (supply-chain review, `supply-chain.md`), upstream must serve proofs [U]. Requirement: any light-client option must be described as "does not hide queries". PoC: research only.

### MH-SCAN-1 Full range fetch

- Default ON [R]: `logs.ts:207` calls `getLogs({address: announcer, topics:[ANNOUNCEMENT_TOPIC, schemeTopic], fromBlock, toBlock})` and matches locally, so the RPC learns the range, not which announcements matched. No per-address filter on `topic2` is used (verified by reading the call).
- Hides: which announcements are mine. Does NOT hide: scan range and timing (M5), nor matched-address verification reads (HY-VER). Cost: bandwidth (windows of `getLogsMaxRange` 1000 blocks on Sepolia, [R] `chains.ts:34`). Requirement: R1 test that `getLogs` params never contain a `topic2` or `topic3` filter set to a user address.

### MH-SCAN-2 Aligned scan ranges

- Default OFF. Mechanism: round `fromBlock` down to a grid (e.g. multiples of 10 000) and always scan from the aligned start, discarding earlier already-seen results locally; add random extra lookback.
- Hides: exact "last scanned" / wallet-creation block (M5) and request-pattern fingerprint. Does NOT hide: that this IP scans GhostPay announcements. Cost: extra requests. Requirements: R1 `fromBlock % grid == 0` in every first request; R2 no result lost (dedupe via `seen` set, [R] `logs.ts:~193`); R3 request budget (`maxRequests`, default 50, `logs.ts:41`) respected, `truncated` flag set honestly. PoC: anvil with 3 000 blocks; recorded first request aligned.

### MH-SCAN-3 PIR scanning

- Default OFF; research (anonymization-research 9.7, Feature 5 stage 2: two-server DPF-PIR, non-collusion assumption). Since MH-SCAN-1 already hides matches, PIR mainly helps verification reads and thin clients. Hides: which page/record is read from the PIR servers (assuming non-collusion). Does NOT hide: IP, existence of a query, or collusion. Cost: L. Dependency: needs operators running replicas. Requirement before any build: a measured comparison versus MH-SCAN-1 + HY-VER. PoC acceptance: none for this release; spec decision only.

### MH-INV-1 Padding before encryption

- Default OFF. Facts [R]: private part = `lineItems`, `memo` only (`schema.ts:71`); `MAX_MEMO_LENGTH = 500` (`schema.ts:10`); AES-256-GCM with AAD `GPI1` (`envelope.ts:~35, 122-127`); canonical-JSON plaintext is length-preserving, so ciphertext length reveals memo + line-item size (M6).
- Mechanism: add a canonical padding member to the private part (e.g. `"pad":"000..."`), padded so the canonical plaintext hits a bucket (256, 1 024, 4 096 bytes); parser strips and validates. Requires `validatePrivatePart` change (currently strict keys, `schema.ts:189`) and an `invoice-schema` version note (DEVIATIONS).
- Hides: memo/line-item length from anyone who sees the link ciphertext (chat apps, history). Does NOT hide: that an invoice exists, plaintext fields, or content from the holder of the link (bearer secret, PA4).
- Cost: link length up to 4 KiB base64url (limit 16 KiB, `envelope.ts:29`), QR density.
- Dependencies: only effective with MH-INV-2. Requirements: R1 `encodeFragment` output length falls on bucket set for random memos (property test); R2 round trip returns identical invoice; R3 padded and unpadded links both parse; R4 non-canonical padding rejected (existing canonical-equality check, `envelope.ts:~290`). PoC: fuzz 1 000 memos, distinct fragment lengths <= 3.

### MH-INV-2 Encrypt by default

- Default today OFF ([R] `envelope.ts:95` "Default false"; `CreateInvoice.tsx:27` `useState(false)`). Option: default ON (checkbox remains).
- Hides: line items and memo in the link from intermediaries that log URLs sent through channels with fragment loss (e.g. copying the key separately). Note the key is in the same fragment (`enc:{k,n,c}`, [R] `envelope.ts:152`), so anyone with the full link decrypts; the benefit is only against partial exposure (e.g. fragment not yet stripped) and casual storage. State this honestly in UI.
- Does NOT hide: public part (chain, token, fiat amount, expiry, meta-address, signer, nonce, quote). Cost: none material. Requirements: R1 default `true` in form; R2 e2e test of encrypted round trip; R3 About/UI wording matches the above. PoC: existing tests updated; no behaviour change for parsers.

### MH-INV-3 Coarse timestamps and expiry

- Default OFF. Facts [R]: `quote.timestamp` and `expiresAt` and `expiresAt` of the invoice sit in the unencrypted part (PRIVATE_KEYS excludes them, `schema.ts:71`), at second resolution.
- Mechanism: when creating invoices, round `expiresAt` up and `quote.timestamp` down to the hour (client-only; no schema change). For `fixed_token`, set the quote timestamp to the same coarse value.
- Hides: exact creation time and creation-to-expiry fingerprint (a stable "now + 24 h exactly" pattern). Does NOT hide: day/hour; chain payment time (public).
- Cost: expiry up to 1 h longer than requested; quote validity slightly staler (bounded by `maxSlippageBps`). Requirements: R1 `expiresAt >= requested`, `<= requested + grid`; R2 `quote.timestamp <= now`; R3 signature covers rounded values; R4 `validateInvoice` accepts. PoC: 100 invoices, all timestamps on the grid.

### MH-WEB-1 Strict referrer policy

- Default ON [R]: `Referrer-Policy: no-referrer` (`public/_headers:6`), `<meta name="referrer" content="no-referrer">` (`index.html:7`, asserted by `scan-bundle.mjs:118`), per-fetch `referrerPolicy: 'no-referrer'` (`manifest.ts:27`, `relayerClient.ts:37`, `release.ts:15`). GitHub Pages cannot set headers (`_headers:1`, `About.tsx:31`), so the meta tag is the fallback.
- Hides: current page URL (the invoice link is in the fragment; browsers omit fragments from `Referer` [U, MDN/W3C unreachable]) and origin from third parties and RPC/relayer hosts. Does NOT hide: IP, `Origin` header on CORS requests (`no-referrer` does not remove it [U]), browser-history storage of the link (audit S3-03).
- Gap: no `rel="noreferrer noopener"` policy for outbound `<a>` found in `src` (only coverage artefacts matched); a lint is missing. Requirements: R1 header snapshot test (AT-PO-6); R2 e2e: capture requests during pay flow, assert no `Referer` header; R3 ESLint rule or test: every `target=_blank` has `rel` with `noreferrer`; R4 invoice ids never in query strings (PO-TEL-4). PoC: Playwright run recording headers.

### MH-WEB-2 No third party; generated `connect-src`

- 2a No third-party resources: default ON [R]: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'` (`_headers:5`, `index.html:9`), `<link rel="icon" href="data:,">`. Keep AT-PO-1/PO-4 (egress test + bundle denylist).
- 2b Tight `connect-src`: default OFF. Today `connect-src 'self' https: wss:` (`_headers:5`) because RPC/relayer origins are user data, so a compromised bundle could exfiltrate to any https host. Option: build or runtime-generate the `connect-src` list from the user's configured origins (privacy-ops Q7), e.g. a settings screen that rewrites the meta CSP before first request, or a deployment-time list for fixed deployments.
- Hides: limits where leaked data can go. Does NOT hide: anything from a first-party bundle bug; a meta CSP cannot be tightened after load without reload [U].
- Cost: user cannot add an RPC without a reload step. Requirements: R1 CSP string in `index.html`, `_headers` and tests identical (existing `scan-bundle.mjs:128` list extended); R2 with a configured RPC `https://a.example`, a request to `https://b.example` is blocked (Playwright); R3 no `unsafe-inline`/`unsafe-eval`. PoC: e2e with two mock hosts.

### MH-WEB-3 Subresource Integrity

- Default OFF. Fact [R]: `grep integrity` over `apps/web` source/`index.html` finds none; the only cross-origin-loaded file is the embed SDK `ghostpay-embed-v1.js` (`_headers:24-26`, `Cross-Origin-Resource-Policy: cross-origin`) which merchant pages load.
- Mechanism: publish a SHA-384 in release notes and docs for `<script src=... integrity=... crossorigin>`; add build-time `integrity` to `index.html` assets (same-origin, protects against CDN-side mutation of assets but not of `index.html`).
- Hides/protects: not a metadata hide: it prevents a host/CDN from silently injecting a script that would leak metadata (PA-ADV5). Does NOT protect against a tampered `index.html` (README S3-01). SRI semantics [U: W3C unreachable].
- Cost: embed SDK URL must be immutable per version (`-v1.js` caching is 3 600 s). Requirements: R1 build emits `SHA384` of embed SDK into `SHA256SUMS`-adjacent file; R2 test: altered SDK byte fails to load in a test page with `integrity`; R3 scan-bundle verifies each `integrity` attribute matches the file. PoC: Playwright load test.

### MH-ID-1 Per-invoice meta-address and signer

- Default OFF. Verified today [R]: the session holds one key set (`session.ts:78`: `generateKeySet()` and one `randomScalar()` signing key), `summarize` returns one `metaAddress` and one `signerPublicKey` (`session.ts:54-55`), and `generateKeySet` samples spend and view independently with no seed (`keys.ts:45-58`); core-crypto contains no HKDF/HMAC/seed code (grep, empty). So every invoice carries the same `metaAddress` and the same `signer` (schema fields). Linking two invoices needs only two links (D3, L8, M7). Also `SellerKeys.tsx:160`: no ERC-6538 registration is done, so the registry link is not a current leak.
- Mechanism (requires new deterministic derivation, does not exist): master seed `m` (new keystore field) and invoice index `i`; `spend_i`, `view_i`, `signer_i` = HKDF-SHA256(m, "ghostpay/mh/id/v1", i) reduced into [1,n-1] (rejection by counter); meta-address and signer differ per invoice. Variant B (cheaper scanning): share `spend`, vary only `view_i` (still links through `spend` pubkey, so only partial; not recommended).
- Hides: invoice-to-invoice linking by meta-address/signer among holders of invoices; the registry link if registration is later added. Does NOT hide: on-chain: all payments still use router + same payer; sweeps to the same destination re-link (hygiene HY-CON); an out-of-band channel carrying both invoices; timing; the seller's IP at the host.
- Cost: scanner does one ECDH per announcement per active key, so cost grows linearly with live invoices (research 4.8); keystore export format change and recovery (seed + index range, scan up to N); signer pinning UX (buyers pin `signer`, `pinnedSigners` in settings, [R] `settings.ts:13`) breaks for new signers: needs an opt-out, i.e. per-invoice signer must be selectable separately from per-invoice meta-address.
- Dependencies/conflicts: MH-ID-2 (share the seed derivation); conflicts with `isTrustedSeller` pinned-signer trust model unless a long-lived signer is kept (then M7 persists via signer; state it).
- Requirements: R1 `deriveInvoiceKeys(seed, i)` deterministic, distinct for distinct `i`, keys pass `decodeMetaAddress` (never `KEY_REUSE`); R2 scanner finds payments for all `i < N` and misses none (property test); R3 secrets never serialised (existing `SecretScalar` redaction, `secret.ts`); R4 keystore round trip preserves seed and next index; R5 UI shows "invoices from the same seller are still linkable through X" if signer is shared.
- PoC acceptance: create 5 invoices; no two share `metaAddress` or `signer`; pay each on anvil; scanner finds all 5; destroying the session and importing seed + index recovers all.

### MH-ID-2 Per-chain key derivation

- Default OFF. Verified today [R]: `META_PREFIX = 'st:eth:0x'` is chain-agnostic (`keys.ts:23`); the same key set serves Sepolia and Base Sepolia, and the invoice's `chainId` is separate (`schema.ts:41`). So the same meta-address and signer appear on invoices for different chains (M8). Stealth addresses themselves differ (fresh `r`), so on-chain there is no direct link; the link is at the invoice/holder level and via the same key controlling both chains' sweeps if ever consolidated.
- Mechanism: domain-separated derivation `k_c = HKDF(seed, "ghostpay/mh/chain/v1" || u32be(chainId) [|| i])` (combines with MH-ID-1). Bitcoin: BIP-352 package already derives from a BIP-32 seed on `m/352'/coin'/account'/{1,0}'/0` with `coin` 0 mainnet, 1 otherwise ([R] `btc-silent-payments/src/keys.ts:88-92`), independent of EVM keys, and is not wired into the app (README), so no cross-asset key sharing exists today.
- Hides: cross-chain linking of invoices. Does NOT hide: same payer wallets across chains, same destination reuse (hygiene), bridging, same RPC provider seeing both chains.
- Cost: per-chain keystore entries; scanner loads the chain-specific key; the key-reuse replay risk (same private key valid on all EVM chains) is not a concern for stealth derivation but sweep signatures already bind `chainId` ([R] CONTRACTS_SPEC section 2 EIP-712 domain).
- Requirements: R1 `deriveChainKeys(seed, chainId)` distinct per chain; R2 meta-address for chain A cannot be used to scan chain B (cross test); R3 changing chain in the UI does not leak the previous chain's key into the invoice; R4 documented migration for existing random keys (cannot be derived retroactively: legacy mode stays selectable). PoC: two chains on anvil; invoices differ in `metaAddress` and `signer`; both scanned.

---

## 5. Bitcoin (BIP-352 package, `packages/btc-silent-payments`; not wired into app or relayer, README)

General fact [P]: BIP-69 states wallets "often have a discernible blockchain fingerprint" and leak finances via input/output order (https://raw.githubusercontent.com/bitcoin/bips/master/bip-0069.mediawiki, retrieved 2026-10-21). BIP-125 [P]: a tx signals replacement "if any of its inputs have an nSequence number less than (0xffffffff - 1)" (https://raw.githubusercontent.com/bitcoin/bips/master/bip-0125.mediawiki). BIP-352 [P]: label `m = 0` is reserved for change; "It is important that the wallet never hands out the label with m = 0" (https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki). BIP-78 [P]: sender checks that version, nLockTime and input sequences stay unchanged (https://raw.githubusercontent.com/bitcoin/bips/master/bip-0078.mediawiki). Everything about specific chain-analysis vendor capability is [U].

What the code does today [R] (`src/spend.ts`):

| Aspect | Today | Line |
|---|---|---|
| Change | optional `changeAddress` (caller supplied, regular or SP label 0); sweep mode has no change; dust leftover folded into the fee | 38-42, 200-244 |
| Fee rate | caller `feeRate`; `ceil(feeRate*vsize)` exact vsize | 160, 213-227 |
| nSequence / RBF | `0xfffffffd` (RBF) unless `rbf === false` then `0xfffffffe` | 279 |
| nLockTime | not set (default 0); weight formula only counts the 4 bytes | 84; `Transaction({version: 2, ...})` 270 |
| Version | 2 | 270 |
| Output order | destinations then change, "callers wanting shuffling must build their own" | 163 |
| Input order | as given by caller (`outputs.forEach`) | 275 |
| PSBT | built through a PSBT-capable `Transaction` object, no BIP-375 | 270 |

Hardening features (all `packages/btc-silent-payments`; tests alongside; none changes protocol compatibility):

- **MH-BTC-1 Change handling.** Default ON for sends that need change. Use an SP change address with label 0 derived per tx (`changeAddress()`, spend.ts:38-42) or a fresh address; never reuse an input address; avoid change-below-dust being burned to fees except under the existing guard (spend.ts:234). Hides: round-number-payment inference only if change amount is not distinguishable by an "is round" heuristic [U]. Does NOT hide: that one output is change by value-pattern heuristics, nor common-input ownership. Cost: none. Reqs: R1 default requires a change address when funds exceed amount + fee + dust; R2 label-0 address never exposed to payers (BIP-352 [P]). Accept: existing spend vectors pass plus new test.
- **MH-BTC-2 Fee-rate normalisation.** Default OFF. Round `feeRate` to a coarse grid or draw from a small set of standard rates so sat/vB does not reveal the wallet's estimator; never below the mempool minimum. Hides: estimator fingerprint (unverified magnitude [U]). Cost: overpay up to grid step. Reqs: R1 `normalizeFeeRate` result >= input, step configurable; R2 fee never above caller cap. Accept: 1 000 random inputs satisfy bounds.
- **MH-BTC-3 Locktime.** Default OFF (today 0). Option: set `nLockTime` to the current height (anti-fee-sniping practice used by Bitcoin Core [U: not fetched; BIP-326 not read]). Hides: stands out if 0 while the rest of the network sets height (a fingerprint). Does NOT hide anything else. Cost: needs chain height input (RPC/oracle call, leaks that you transact now: use the height already known to the scanner). Reqs: R1 lock time <= height; R2 sequence must be non-final for locktime to apply (`0xfffffffd` satisfies); R3 default off until policy decided (mixing locktime semantics with payjoin, BIP-78 requires unchanged locktime [P]). Accept: serialized tx has expected nLockTime on regtest.
- **MH-BTC-4 RBF signalling.** Default ON (today `0xfffffffd` unless `rbf=false`). Rationale [U]: most modern wallets signal RBF; opting out marks the tx as unusual. Keep default and make `rbf:false` require an explicit flag with a warning. Reqs: R1 default sequence `< 0xfffffffe` per BIP-125 [P]; R2 all inputs same sequence (BIP-78 checks equal sequence [P]). Accept: unit test on sequences.
- **MH-BTC-5 Input and output ordering.** Default ON recommended (today: caller-given input order, destinations-then-change). Options: BIP-69 lexicographic sort [P] (deterministic, shared by compliant wallets) or a CSPRNG shuffle. Caveat: BIP-352 requires sender to compute shared secrets from the smallest outpoint, which is order-independent ([R] `inputs.ts:53`), so shuffling inputs is safe, but destination order must be recomputed because SP output index `k` ordering is by recipient group [U: verify in sender.ts]. Hides: "payment first, change last" heuristic. Does NOT hide: other heuristics (amounts, script types). Reqs: R1 chosen strategy applied to inputs and outputs; R2 all 28 sending vectors (README) still pass after ordering because vectors compare outputs as sets [U: verify]; R3 deterministic mode available for reproducible tests. Accept: vectors + property test.
- **MH-BTC-6 PSBT fingerprints.** Default OFF/doc. PSBT metadata (global xpubs, proprietary fields, BIP-32 derivation paths) can leak wallet identity if the PSBT is shared with a coordinator or PayJoin counterparty. Option: strip non-essential fields before export. Hides: wallet/path hints in shared PSBTs. Does NOT hide: the tx itself once broadcast. The package uses `Transaction` objects and does not currently export PSBTs with xpubs (not verified: no `toPSBT` export found by grep of `change/locktime/psbt` terms; confirm before building). Reqs: R1 export function emits only inputs/outputs/witnessUtxo; R2 snapshot test of PSBT keys present. Accept: round trip through a PSBT parser with no unknown keys.

Dependencies/conflicts among BTC options: BTC-3 conflicts with PayJoin flows unless unchanged (BIP-78 [P]); BTC-5 shuffle conflicts with deterministic vector tests (use deterministic mode). Owner dir for all: `packages/btc-silent-payments`.

---

## 6. Cross-feature dependencies and conflicts

| Pair | Relation |
|---|---|
| MH-FEE-1 + MH-ANN-3 | Meaningful together only; scanner must read amounts from transfers |
| MH-FEE-2 vs MH-FEE-1 | Mutually exclusive per payment |
| MH-FEE-2 vs current invariants | Router holds balances: new audit scope |
| MH-TAG-2 vs MH-ANN-1 | Interop loss with other ERC-5564 scanners |
| MH-AMT-1 vs MH-AMT-2 | Pick one |
| MH-REL-2 vs hygiene HY-CON-5 | Timing batching only; no multicall of owners |
| MH-REL-4 vs stateless quote | Quote and sweep must share a relayer |
| MH-INV-1 depends on MH-INV-2 | Padding is moot without encryption |
| MH-ID-1 vs signer pinning | Per-invoice signer defeats pinned trust; keep signer long-lived or accept linking |
| MH-ID-1 + MH-ID-2 | Share one seed derivation module; build once |
| MH-NET-1 + MH-SCAN-2 | Compose; both client settings |
| MH-WEB-2b vs configurable RPC | Reload needed after changing RPC origin |

## 7. Acceptance harness (shared)

PoC acceptance for the whole menu: (1) a `hardening` settings object with every id above as a boolean/enum, default values as in the table; (2) Playwright egress/header recording proxy (extends AT-PO-1/AT-PO-6); (3) anvil e2e: payments with each of FEE-1, ANN-3, TAG-2, AMT-1 on/off, scanner finds all; (4) relayer anvil e2e with REL-1/2/3/5 toggled; (5) for each feature a negative test shows the "does NOT hide" statement is displayed in the UI copy. Test-ids: `AT-MH-<feature>-<Rn>`. Record date, actor, result per run, as in privacy-ops section 6.

## 8. Verification status

Verified in repo this session: router fee path and announcer call (`GhostPayRouter.sol:32,38,80,122,185,216`); `metadata.ts` layout and strict length; stealth tag mechanics; one key set and one signer per session (`session.ts:78`); no seed derivation in core-crypto; scanner calls (`logs.ts:207`); single relayer and RPC URL settings; relayer gas rule and lane; header/referrer config; BTC spend defaults. Not verified: any real wallet, RPC provider, relayer on a real chain (README), effectiveness against real chain analytics, W3C/MDN statements, BIP-326 anti-fee-sniping, EIP-5792 batching, vendor-specific heuristics, SP output ordering with shuffling, PSBT export surface of the BTC package.

## 9. Sources (retrieved 2026-10-21)

- ERC-5564: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md (event signature, view tag byte, 128 to 124 bit margin, funding wallet text, schemeId 1) [P]
- BIP-69: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0069.mediawiki [P]
- BIP-125: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0125.mediawiki [P]
- BIP-352: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki [P]
- BIP-78: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0078.mediawiki [P]
- Referrer Policy https://www.w3.org/TR/referrer-policy/ and SRI https://www.w3.org/TR/SRI/ and MDN pages: fetch failed (DNS), [U]
- Repo docs: `docs/remote/anonymization-research.md`, `docs/remote/security-specs/privacy-ops.md`, `docs/remote/privacy-specs/hygiene.md`, `docs/remote/privacy-specs/payer-hiding.md`, `apps/relayer/PRIVACY.md`
