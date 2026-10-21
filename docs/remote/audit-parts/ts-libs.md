# Audit part: TypeScript libraries

Scope: `packages/core-crypto`, `invoice-schema`, `chain-adapters`, `btc-silent-payments`, `policy-scheme`.
Date: 2026-10-21. Method: full read of all non-test source, DEVIATIONS/README, audits 01-04; re-ran all suites; scratch
probes in `/tmp/claude-0/audit-ts/` (a1-a4 `*.test.ts`, run through vitest with absolute src imports). No repo code edited.

Test state at audit time: core-crypto 54/54, invoice-schema 174/174, chain-adapters 216/216, btc-silent-payments 299/299
(all 28 official BIP-352 cases present, sha256 `f5f9ed4a...4af1`), policy-scheme 53 pass + **7 skipped (the anvil on-chain test:
no `anvil` binary here, so CREATE2/EIP-712/router parity was NOT executed; I verified it by reading Solidity and by comparing
ABI selectors with `packages/contracts/out`, see PS-OK)**.

Status key: CONFIRMED (read + reproduced or unambiguous in code), PLAUSIBLE (needs an adversary/condition I could not exercise), REFUTED.

## Summary

| ID | Sev | Pkg | Title | Status |
|---|---|---|---|---|
| TS-01 | Medium | btc-silent-payments | Block scanner attributes a found output to the LAST output with the same key (outpoint/amount spoof) | CONFIRMED |
| TS-02 | Medium | btc-silent-payments | Oracle-reported txid/vout/amount/height are never verified; fabricated or replayed payments are accepted | PLAUSIBLE |
| TS-03 | Low-Med | chain-adapters (+web) | `FetchResult.reorg` is ignored by the only consumer; matches are returned at tip depth | CONFIRMED |
| TS-04 | Low | btc-silent-payments | BlindBit client: no body-size cap, no timeout, unbounded tip height, plain `http` allowed | CONFIRMED |
| TS-05 | Low | policy-scheme | `decodePolicyPaymentCalldata` checks only the account binding, not amounts/token/metadata/canonical encoding | CONFIRMED |
| TS-06 | Low | chain-adapters | Log `blockHash` and reorg race: stale-fork logs can be committed under a new-fork cursor hash | PLAUSIBLE |
| TS-07 | Low | chain-adapters (+web) | Staleness bound for the price feed is seller-controlled (up to 24 h) | CONFIRMED (web call site) |
| TS-08 | Low | core-crypto, btc | Secret wrappers leak through `structuredClone`, `Array.from`, `Buffer.from`, `slice` (prior S3-08) | CONFIRMED |
| TS-09 | Low | invoice-schema | Bidi/zero-width text accepted (prior S3-12); zero-address token and signer==spend key accepted | CONFIRMED |
| TS-10 | Low | chain-adapters | Chain id checked once; manifest signature/bytecode unchecked; single-provider trust (prior S3-01/S3-14) | CONFIRMED |
| TS-11 | Info | core-crypto | ADR-0001 hashes the 33-byte compressed point; interoperability with other ERC-5564 wallets is unproven | PLAUSIBLE |
| TS-12 | Info | btc-silent-payments | `buildSenderContext` result not zeroized on `GROUP_LIMIT_EXCEEDED`; fee rate rounding can give fee 0 | CONFIRMED |
| TS-13 | Info | chain-adapters | No L2 sequencer-uptime check for Chainlink reads; `-32000` range errors not halved | CONFIRMED |

Prior findings re-verified: S3-08 CONFIRMED (probe a1), S3-12 CONFIRMED (a2), S3-14 CONFIRMED by code reading (`rpc.ts:260` only
call of `eth_chainId`; `requestWithFallbackCheck` has no caller in `apps/*/src`), S3-01 CONFIRMED (`deployments.ts` validates
`signature` format only). S3-02 still holds in code (`checkAnnouncement` matches on keys only). Prior "safe" claims that I
re-checked and agree with: point validation, rejection sampling, y-parity flip, strict base64url, strict JSON, low-s,
AAD binding, preview-vs-calldata. FEE_SCHEDULE parity re-read against `GhostPayPolicyRouter.sol` (floor(gross*25/10000)): equal.

---

## TS-01 Block scanner attributes a match to the last duplicate output  [Medium, CONFIRMED]

- File: `packages/btc-silent-payments/src/scan/scanner.ts:61-63` (`byKey.set(toHex(x), o)` overwrites), `:72` (`byKey.get`) .
- Evidence: probe `a3.test.ts`: one tweak, receiver key, two block outputs with the same x-only key (`txid 11.. vout 0, 1000 sat` and
  `txid 22.. vout 3, 99 999 999 sat`). `scanBlocks` yields ONE result: `2222:3:99999999`, i.e. the later (attacker) output.
- Impact: a silent-payment output key is public once the tx is in a block/mempool. An attacker who gets a transaction paying the
  same x-only key (any amount) into the same block makes the receiver record the attacker's outpoint/amount instead of the real
  one. If the attacker output is tiny, the wallet's balance/sweep omits the real output (it stays spendable but is not tracked);
  the candidate set is also block-wide, not per-tweak, so the output is not tied to the transaction whose tweak matched.
- Fix: key the lookup by x-only key to a LIST of outputs; return every matching output (and its txid/vout), and tie outputs to the
  originating tx (index tweaks and outputs per txid; BlindBit `/tweaks` has no txid, so with this source verify against the
  transaction itself). Never silently drop duplicates; add a test with two outputs sharing a key.

## TS-02 Oracle data (txid, vout, amount, block) is trusted  [Medium, PLAUSIBLE]

- Files: `scan/blindbit.ts:173-196` (`getOutputs`), `scan/scanner.ts:48-58` (consistency check compares two answers from the same oracle).
- Evidence: reading. The tweak and output lists come from one HTTP source. A hostile or MITM'd oracle (`http` allowed, TS-04)
  cannot forge a match for a key it does not know, but it can replay a real tweak/output pair with a different `txid`, `vout`,
  `amount`, `height` or `blockHash`, report the same output at several heights (no cross-block dedupe), or omit tweaks (silently
  missing payments). `REORG_DETECTED` only fires if the oracle disagrees with itself. The txid byte order of `/utxos` is
  undocumented (DEVIATIONS), so a wrong order would produce an unspendable outpoint.
- Impact: forged "payment received" display and wrong sweep inputs; sighash commits to amounts, so a lying amount yields an invalid
  signature, not theft.
- Fix: verify a found output against an independent source before showing it as received (own node/second oracle via
  `getrawtransaction`, check output script == `5120||x`, amount, confirmations); dedupe on `(txid,vout)` across heights; make
  `amountSats/txid/vout` optional-and-flagged "unverified" in the adapter type until verified.

## TS-03 `reorg` result ignored; zero-confirmation matches  [Low-Medium, CONFIRMED]

- Files: `packages/chain-adapters/src/logs.ts:150-244` (returns `reorg`, `finalityDepth` used only as rollback depth);
  consumer `apps/web/src/lib/scanClient.ts:100-135` (never reads `res.reorg`; `grep -rn "\.reorg" apps/*/src` finds nothing;
  `finalityDepth` is never used outside chain-adapters).
- Evidence: reading + grep. Matches found in the newest blocks are pushed to `all`/`onMatch` immediately; if a later page reports
  `reorg.rolledBackTo`, previously emitted matches are not removed.
- Impact: a payment seen at depth 0 and reorged away is still displayed as received in that session (seller may release goods).
- Fix: expose confirmations in `ScannedAnnouncement` (head - blockNumber) or add `minConfirmations` to `fetchAnnouncements`
  (stop at `head - finalityDepth`); make the consumer drop matches with `blockNumber >= reorg.rolledBackTo`.

## TS-04 BlindBit client resource limits and transport  [Low, CONFIRMED]

- Files: `scan/blindbit.ts:105-123` (`await res.json()` with no size cap or timeout; only `signal` is honoured),
  `:96-104` (`http:` accepted for any host), `:129-133` (tip height is any safe integer), `scan/scanner.ts:49-50` (loop to the
  oracle-claimed tip, no cap).
- Evidence: probe a3: `getTipHeight` returned `4294967295` from a stub; `scanBlocks` would then iterate ~4.3e9 heights (each an
  oracle request). `MAX_ENTRIES` (200 000) is checked only after the whole body is parsed.
- Fix: stream with a byte cap (e.g. 8 MiB) and a per-request timeout; require `https` except loopback opt-in; clamp
  `toHeight` to a caller-supplied maximum or cross-check the tip with a second source; cap blocks per scan call.

## TS-05 `decodePolicyPaymentCalldata` verifies less than its TSDoc implies  [Low, CONFIRMED]

- File: `packages/policy-scheme/src/router.ts:162-187` (doc: "Use before showing a wallet prompt: a tampered `stealth` or `owner` is detected").
- Evidence: reading. It only recomputes `predictAccountAddress(owner, policyHash) == stealth`. It does not: check the call `to`
  or `value`; re-encode the calldata (non-canonical padding/trailing data accepted by viem's decoder is not detected);
  parse the metadata or compare `net`/token/gross; validate the ephemeral key; return gross/token at all. Contrast
  `chain-adapters/src/router.ts:assemble/decodePaymentCalldata`, which does all of these for the scheme-1 router.
- Impact: a wallet-preview built on it would not catch a swapped token, amount, metadata or router.
- Fix: port `decodePaymentCalldata`/`assertPreviewMatchesCalldata` semantics (canonical re-encode, metadata == f(gross, token),
  `to == router`, value rules) or narrow the TSDoc to "binding check only".

## TS-06 Logs vs cursor hash race, uncorroborated `blockHash`  [Low, PLAUSIBLE]

- File: `chain-adapters/src/logs.ts:188` (`headRef` read BEFORE the logs), `:231-236` (end-of-scan check only when
  `doneThrough === head`; `last.hash` is read AFTER the logs), `:145-146` (log `blockHash` stored, not compared with `getBlock`).
- Evidence: reading. If the chain reorganises between `getLogs` for range R and the final `getBlock(doneThrough)` while
  `doneThrough < head` (truncated scan), the cursor records the NEW fork's hash for logs fetched from the OLD fork; the next
  call's reorg check then passes and the stale announcements are never rolled back. `ScannedAnnouncement.blockHash` is whatever the RPC said.
- Fix: read the hash of `doneThrough` before and after `getLogs` and require equality, or verify each log's `blockHash` against
  `getBlock(blockNumber)` for the touched blocks; store hash per processed range.

## TS-07 Price staleness bound controlled by the seller  [Low, CONFIRMED at call site]

- Call site: `apps/web/src/lib/pay.ts:148` passes `maxAgeSeconds = clamp(inv.quote.expiresAt - inv.quote.timestamp, 60, 86400)`
  to `readPrice` (`chain-adapters/src/quote.ts:84-115`); both values are in the signed-but-attacker-authored invoice.
- Impact: a seller sets a 24 h window, so a 23 h-old Chainlink answer is accepted; `quote.maxSlippageBps` is validated by the
  schema but no code in chain-adapters uses it.
- Fix: bound `maxAgeSeconds` by the feed's heartbeat (per-feed config, e.g. heartbeat + margin), ignore the invoice for this
  value, and apply `maxSlippageBps` against a second read before sending. Also (TS-13) the quote is read through the same
  single RPC the payer uses, so a hostile RPC can feed any price within the window.

## TS-08 Secret wrappers are not a boundary  [Low, CONFIRMED]

- Files: `core-crypto/src/secret.ts:24-46`, same class copied in `btc-silent-payments/src/secret.ts`.
- Evidence: probe a1 prints `LEAKS structuredClone,Array.from,Buffer.from,slice`; `String()`/template throw as intended.
- Fix: as in S3-08 (closure/WeakMap-backed non-Uint8Array type with `use(fn)`), or document as best-effort only (README already says
  zeroization is best-effort but not that the wrapper is bypassable).
- Also: the secret-handling review found no logging of secrets, no secret in error messages (fixed messages everywhere),
  buffers zeroized after copy (`rng.ts:38`, `stealth.ts:75,201`, `receiver.ts` ecdh/t), `generateKeySet` compares secrets with a
  non-constant-time `every` (`keys.ts:48`, harmless: both fresh randoms). bigint intermediates (`sum`, `d`, `h`) cannot be wiped.
  noble `multiply` is used for secret scalars (not `multiplyUnsafe`).

## TS-09 Invoice text/fields  [Low, CONFIRMED]

- `invoice-schema/src/schema.ts:146-158` accepts bidi controls (probe a2: `memo 'pay ‮evil'` accepted) (S3-12 stands).
- `schema.ts:238-239`: `token` may be the zero address (accepted; chain-adapters rejects it later and allowlists tokens, so Info).
- `schema.ts:281`: `signer` may equal the meta-address spend key (probe a2: accepted) although ADR-0002 says use a dedicated key.
  Fix: reject signer equal to either meta key, zero token, and Unicode categories Cf/Co.
- Checked and fine: canonical-form equality (`envelope.ts` `canonicalize(parsed) !== source`), duplicate/proto keys, numbers
  (`9007199254740992`, `-0`, `1.0`, `1e2`, `01` all rejected), `__proto__` payload leaves `Object.prototype` clean, DoS (18.7 KB
  fragment parses in 9 ms; 3000-key object 3 ms; 7000-element array 6 ms; depth <= 8), high-s signature rejected, upper-case
  pinned key matches, expiry is advisory (an expired invoice still parses as `valid-signature`, by design; callers must call
  `checkExpiry`). Signature scope deviation (full plaintext, not ciphertext hash) is consistent: re-encryption by a link holder is possible and harmless.

## TS-10 RPC trust model  [Low, CONFIRMED]

- `chain-adapters/src/rpc.ts:260` chain id read once; `logs.ts` never re-checks; `deployments.ts:73-96,120-135` `signature`,
  `deployTx`, `bytecodeHashes` format-only; DEVIATIONS 2 admits fee recipient / announcer / code are not read back from chain.
  Request/response handling itself is solid (id match, batch rejected, 2 MiB streamed cap, `redirect:'error'`, quantity regex,
  block number equality in `getBlock`, `removed` rejected, log range bounds enforced).
- Fix: as S3-01/S3-14 (periodic `eth_chainId`, `eth_getCode` + codehash + `FEE_RECIPIENT()` read-back at load, two-provider check
  for high-value reads).

## TS-11 ERC-5564 scheme-1 shared-secret serialisation  [Info, PLAUSIBLE]

- `core-crypto/src/stealth.ts:70-77`: `s_h = keccak256(compressed S)`, view tag `s_h[0]`, `Q = P_spend + (s_h mod n)G`. I re-read the
  installed SDK (`@scopelift/stealth-address-sdk` `checkStealthAddress.js`, `generateStealthAddress.js:165,178`):
  `getSharedSecret` of noble-secp256k1 v2 (compressed by default) then `keccak256(sharedSecret)`: identical, so the package is
  interoperable with that SDK. The ERC text does not pin the serialisation (other implementations hash the x-coordinate or the
  uncompressed point), so interoperability with those wallets/scanners is not guaranteed. Point validation (infinity, `x>=p`,
  off-curve, 04/hybrid), zero hash, `sum==0`, mod-n reduction and parity flip all behave as documented (probe a1: all bad
  ephemeral keys -> `matches:false`; flipped parity -> no match).
- Action: state the serialisation as a normative part of ADR-0001 and add a cross-implementation vector from a second wallet
  before mainnet.

## TS-12 Minor (btc-silent-payments)  [Info, CONFIRMED]

- `sender.ts:127,135`: if `GROUP_LIMIT_EXCEEDED` is thrown, `ctx.inputPrivateKeySum`/`inputHash` are not zeroized (the `try/finally` starts later).
- `spend.ts:91`: `Math.round(feeRate*1000)`; `feeRate < 0.0005` rounds to 0 -> fee = `ceil(0/1000)` = 0 (zero-fee tx is non-standard, funds not at risk).
- Verified correct against BIP-352: tagged-hash construction, `input_hash` over smallest 36-byte outpoint (byte order, over ALL
  inputs), taproot negation of odd-y input keys, `a == 0` and `A == infinity` skip, NUMS/annex handling, P2PKH window search,
  P2SH-P2WPKH checks, future-segwit skip, label tweak `hash(b_scan||ser32(m))`, change label always scanned, K_max = 2323 per
  group (sender) and in the receive loop, `k` increments on every match, x-only label matching covers both parities, spend key
  parity normalisation, 28 official vectors incl. K_max, NUMS, sum-to-zero, malleated P2PKH.

## TS-13 Minor (chain-adapters)  [Info, CONFIRMED]

- `quote.ts`: no sequencer-uptime/grace-period check for L2 feeds (Base/OP/Arbitrum); `FEEDS` is empty so nothing is exposed until feeds are added.
- `logs.ts:204`: only `-32602`/`-32005` trigger range halving; Alchemy/Erigon variants (`-32000 "query returned more than 10000 results"`) abort the scan (availability only).
- `rpc.ts:284`: retry classification relies on the error MESSAGE prefix `RPC_FAILURE: transport` (fragile coupling to `fail()` formatting); correct today.

---

## PS-OK  policy-scheme calldata / merkle / EIP-712 parity (REFUTED concerns)

Read against `packages/contracts/src/*.sol` and `packages/contracts/out/*.json`:
- Policy hash `keccak256(abi.encode(address,uint256,bytes32))`, salt `keccak256(abi.encode(owner,policyHash))`, EIP-1167 prefix/suffix
  (`3d602d80600a3d3981f3363d3d373d3d3d363d73 ... 5af43d82803e903d91602b57fd5bf3`, same constant as OZ `Clones.sol` in `lib/`), CREATE2 with the
  factory as deployer: match `PolicyAccountFactory.sol` / `PolicyAccount.initialize`.
- Leaf `keccak256(bytes.concat(keccak256(abi.encode(token,uint256 limit,uint64 window))))`, sorted-pair inner hashing (string compare
  of lowercase 0x hex is numeric order), StandardMerkleTree array layout, single-leaf root == leaf, proof self-verification:
  match `PolicyAccount.requestWithdraw` + OZ `MerkleProof.verifyCalldata`. Duplicate tokens, zero limit, limited leaf with zero
  window are refused (stricter than contract, safe).
- EIP-712: all four type strings, field order, domain name/version (`GhostPayPolicyAccount`/`1`, `GhostPaySweepRelayer`/`1`),
  verifyingContract = clone, `id == structHash`, low-s signatures (OZ ECDSA) and double digest (manual + viem) agree.
- ABI selectors: chain-adapters `GhostPayRouter` (10/10), policy-scheme `GhostPayPolicyRouter` (11/11), `PolicyAccount` (26/26),
  `PolicyAccountFactory` (9/9) equal the compiled artifacts' function selectors (probe a4). Policy router arg order
  (`token, stealth, PolicyRef, gross, minNet, deadline, [maxBuffer], eph, metadata[, permit]`) matches the Solidity signatures; the later
  contract commit 5057460 only reordered checks (no ABI change).
- Fee: `floor(gross*25/10000)`, `gross <= MAX_UINT256/25`, `net>=minNet`, metadata layout (57 bytes, marker, asset, net) and
  ephemeral key prefix 02/03 are checked identically in `chain-adapters/src/{fees,router}.ts`, `policy-scheme/src/router.ts` and the contracts.
- Not executed: the anvil test (7 skipped here). Run it in CI before relying on CREATE2/clone/EIP-712 parity.
