# Deep bug hunt: TS libs (core-crypto, invoice-schema, chain-adapters)

Date: 2026-10-21. Branch: claude/remote-extensions-1. READ-ONLY on source, tests and config. Only this file written. No git commit.

## Scope and method

- Read: packages/core-crypto/src, packages/invoice-schema/src, packages/chain-adapters/src (non-test). Docs: docs/SPEC_REVIEW.md, docs/CONTRACTS_SPEC.md, docs/MULTICHAIN_SPEC.md, the three package DEVIATIONS.md, TODO-VERIFY.md, docs/remote/audits/code-tslibs.md, security-tslibs.md, docs/audits/03 (grep).
- Ran (verified): existing vitest suites, all green: core-crypto 54/54, invoice-schema 174/174, chain-adapters 216/216 (vitest v5.0.5, `npx vitest run` per package).
- Ran (verified): scratch probes in `/tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/probe/` (vitest with a config outside the repo, mock RPC clients, no network). Files: `a.probe.test.ts` (reorg mock, retries), `b.probe.test.ts` (manifest, viem parseSignature, buffer decode, sparse array), `d.probe.test.ts` (grossForNet top of range), `c.probe.test.ts` (grossForNet minimality), `hexchk.mjs`, `noble.mjs` (noble point decoding). Outputs: `out.txt`, `d.txt` in the same folder.
- Everything else below is from reading. It is marked "by reading".

## Read first (not re-reported)

- Accepted deviations: packages/*/DEVIATIONS.md, TODO-VERIFY.md.
- Already reported, confirmed still present, not repeated as new: code-tslibs M-01 (cross-call reorg, yields rolled-back payments), L-01 (scan ignores toBlock), L-02 (wss accepted, rejected by transport), L-03 (sponsor fee 0 for small amounts), L-04 (decodePaymentCalldata accepts buffer calls router reverts on; the `value > maxBufferWei` case was re-confirmed by probe, see below), L-06 (species leak of SecretBytes), I-07 (size cap in UTF-16 units), I-08 (reorg depth bounded by finalityDepth). security-tslibs M-1, L-1..L-5, I-1..I-5. docs/audits/03 S3-12: bidi and invisible characters are NOT rejected by `text()` (invoice-schema/src/schema.ts:150, the control-char regex is `[\u0000-\u001f\u007f-\u009f]`, which does not cover U+202A-U+202E, U+2066-U+2069, U+200B-U+200F); still present, by reading.

## Summary

| Severity | Count | IDs |
|---|---|---|
| critical | 0 | |
| high | 0 | |
| med | 1 | BUG-01 |
| low | 3 | BUG-02, BUG-03, BUG-04 |
| low (edge, fail-closed) | 1 | BUG-05 |
| info | 2 | BUG-06, BUG-07 |

No crypto maths defect. Scheme-1 derivation, view tag, key recovery, metadata layout, noble point decoding (non-canonical x rejected, verified), grossForNet minimality (1..5000, verified), ABI signatures vs spec (verified by parsing `abi/*.ts`), and Chainlink `latestRoundData` return order all check out.

## Findings

### BUG-01 (med): reorg during a truncated multi-request scan is never detected; stale announcements persist

- **Where:** packages/chain-adapters/src/logs.ts:226-237 (new cursor hash read after the logs), :233 (only cross-check, and only when `doneThrough === head`), :238 (cursor returned without any per-window hash record).
- **Evidence (verified by probe, `a.probe.test.ts`, mock client, `getLogsMaxRange: 10`, `finalityDepth: 3`, head 30):**
  - Call 1, `maxRequests: 2`, `cursor {nextBlock: 0}`. Window 1 `[0..9]` returns the announcement at block 5 (blockHash `...aaaa`). The mock then reorgs blocks >= 5 (new hash `...bbbb`, head hash changes too, which is what a real reorg of block 5 does). Output: `truncated: true, announcements: 1, cursor {nextBlock: 20, last: {number: 19, hash: ...bbbb}}`.
  - Call 2, with call 1's cursor. `getBlock(19)` returns `...bbbb`, equal to the stored hash, so no reorg. Output: `reorg: undefined`, no retraction. The block-5 announcement from call 1 is never invalidated.
- **Why:** `last` is set from `getBlock(doneThrough)` AFTER all logs are read (line 231). The hash at the end matches the new chain, so the stored cursor looks clean. The only consistency check (line 233) runs only when the scan reached `head`. A truncated call never reaches head, so a reorg inside the scanned span is invisible from then on.
- **Failing scenario:** backfill of a long range on Base Sepolia (2 s blocks) hits `maxRequests` (default 50) and returns `truncated: true`. Block 5 000 of the already-read span is reorged while later windows are still being fetched. The stored payment from the orphaned block is shown as paid forever, and the cursor carries the new chain's hash, so nothing flags it. Distinct from code-tslibs M-01, which covers the cross-call case (reorg detected, but results already yielded are not retracted).
- **Fix:** record the hash of each window's end block (fetched before its `getLogs`, or re-read after it), and before returning re-verify every recorded boundary against the chain. On the first mismatch, return `reorg: { rolledBackTo: <start of that window> }` and drop the window's results. Alternatively, verify `getBlock(doneThrough)` against the hash of the same block read at the start of the call. Add a test: truncated two-window scan with a reorg in window 1 must report `reorg`.

### BUG-02 (low): `retries: NaN` disables the retry bound (unbounded retry loop)

- **Where:** packages/chain-adapters/src/rpc.ts:210 `const retries = Math.min(Math.max(opts.retries ?? 2, 0), 5);` and :219-227 (`attempt >= retries` never true for NaN).
- **Evidence (verified, `a.probe.test.ts`):** `retries: 2` made 3 transport attempts then stopped. `retries: NaN` kept retrying: the probe's transport stopped it only at its own sentinel of 200 attempts (`Math.max(NaN,0)` and `Math.min(NaN,5)` both stay NaN).
- **Failing scenario:** an app builds `retries` from a settings string (`Number(input)` of a bad value gives NaN). Every transport failure is retryable, so `createClient` never returns and each sleep grows as `base * 2**attempt`. Hang with no error.
- **Fix:** `const retries = Number.isInteger(opts.retries) ? Math.min(Math.max(opts.retries!, 0), 5) : 2;`. Also validate `timeoutMs`, `maxResponseBytes`, `baseDelayMs` as finite and non-negative. A NaN `timeoutMs` makes `setTimeout(ctl.abort, NaN)` fire immediately (by reading, not run).

### BUG-03 (low): manifest date check accepts non-existent calendar dates

- **Where:** packages/chain-adapters/src/deployments.ts:71-73 (`isRealDate`: regex plus `Date.parse` not NaN). Contradicts DEVIATIONS.md item 8 ("rejects ... invalid calendar dates").
- **Evidence (verified, `b.probe.test.ts`):** `validateManifest({... date: "2026-02-30T00:00:00Z" ...}, 11155111)` returns a manifest. Node `Date.parse` maps 2026-02-30 and 2023-02-29 to March dates instead of NaN.
- **Impact:** the `date` field is metadata only, so the impact is limited to a manifest with a wrong or misleading date passing the gate. It does matter for audit trail and the "signature" workflow that is built on manifest fields.
- **Fix:** parse y/m/d/H/M/S and check `new Date(Date.UTC(y, m-1, d)).getUTCDate() === d`, hours <= 23, minutes and seconds <= 59, and offset within range.

### BUG-04 (low): duplicate keys in a deployment manifest silently take the last value

- **Where:** packages/chain-adapters/src/deployments.ts:182 (`JSON.parse(text)`), then `validateManifest`.
- **Evidence (verified, `b.probe.test.ts`):** manifest text with `"router":"0x1111…"` followed by `"router":"0x9999…"` loads with `router = 0x9999…`. The invoice-schema parser (`parseStrictJson`) rejects duplicate keys; the manifest path does not.
- **Failing scenario:** a manifest is edited or merged by a tool that emits a duplicate key. The router and fee recipient the UI displays and signs against become the later value, with no error. The manifest signature is never verified (code-tslibs I-04), so nothing else catches it.
- **Fix:** parse with a duplicate-rejecting parser (reuse the invoice-schema strict parser or a key-counting scan) before `validateManifest`.

### BUG-05 (low, fail-closed): `grossForNet` rejects the top of its own range

- **Where:** packages/chain-adapters/src/fees.ts:86-91. The `g > MAX_ROUTER_GROSS` check (line 87) runs before the downward-correction loop (line 88), and the initial estimate `ceil(net*10000/9975)` can exceed the true minimum by 1.
- **Evidence (verified, `d.probe.test.ts`):** `net = routerNet(MAX_ROUTER_GROSS)` makes `grossForNet` throw `INVALID_INPUT: net too large`, although `MAX_ROUTER_GROSS` already yields that net. Of the 2001 nets in `[top-2000, top]`, exactly `top` throws; the other 2000 satisfy minimality (verified). `c.probe.test.ts`: minimality holds for 1..5000 with 0 violations.
- **Impact:** a `fixed_token` invoice with `tokenAmount` at ~0.9975 * 2^256 cannot be built. Fails closed, no funds move.
- **Fix:** clamp `g` to `MAX_ROUTER_GROSS` before the loops, or move the range check after them.

### BUG-06 (info): sparse `lineItems` arrays pass validation and canonicalize to a different array

- **Where:** packages/invoice-schema/src/schema.ts:160-176 (`validateLineItems` uses `Array.prototype.map`, which skips holes and keeps them); sign.ts:32 and json.ts:272 (`canonicalize` uses `map` + `join`, which turns a hole into an empty string).
- **Evidence:** verified, `b.probe.test.ts`: `validateInvoice({...base, lineItems: <array of length 1 with a hole>})` returns `lineItems.length === 1` with `0 in lineItems === false`. By JS semantics (checked with node): `[,]` canonicalizes to `"[]"`. So `signInvoice` signs a canonical form with zero line items, while the caller's array has one.
- **Impact:** programmatic callers only (`parseStrictJson` cannot produce holes). The payer sees zero items. Totals are not cross-checked (DEVIATIONS item 3), so nothing else catches it.
- **Fix:** in `validateLineItems` iterate by index and reject `!(i in arr)`, or `Array.from`. Make `canonicalize` reject holes.

### BUG-07 (info, by reading, not run): non-2xx responses are not consumed or cancelled

- **Where:** packages/chain-adapters/src/rpc.ts:108 (`if (!res.ok) throw new RpcHttpError(res.status);` before any body read or cancel).
- **Impact:** the response body stays open until GC, which can hold a socket on a rate-limited endpoint (429 is retried, so this repeats). Not run; depends on the undici version.
- **Fix:** `await res.body?.cancel().catch(() => {})` before the throw.

## Checked and found correct (no finding)

- core-crypto: `randomScalar` (rejection sampling, zeroize in `finally` after `wrapSecret` copy), `generateKeySet` KEY_REUSE, `decodeMetaAddress` (132-digit strict, both on-curve, distinct), `deriveStealthPayment` / `checkAnnouncement` / `deriveStealthSecret` (tag, `h` reduction, address compare case-insensitive, scheme-id check), `parseMetadata` / `build*Metadata` (57-byte layout, amount range, zero and native token rejects), `parseCompressedPoint` (noble rejects x >= p; verified with `noble.mjs`).
- invoice-schema: base64url strict decode (length %4 == 1 rejected, trailing bits must be zero, by reading), `parseStrictJson` (dup and forbidden keys, depth 8, integer-only, trailing junk), `canonicalize` round-trip check in `parseFragment`, AAD = "GPI1" || chainId u64 BE || signer (encrypt and decrypt use the same source fields), 16 KiB limit (MAX_ENCODED_CHARS = ceil(16384*4/3) consistent), `verifyInvoiceSignature` low-s and fixed-length sig regex, `validateInvoice` ranges (`fixed_token` <= 2^256-1, `safeInt` bounds, `quote.expiresAt >= timestamp`).
- chain-adapters: router `assemble` ternary precedence (`native ? kind !== 'native' : (kind !== 'erc20' || token mismatch)`), `reencode` canonical check, `viem` parseSignature v=00/01 normalized to 27/28 via yParity (verified, so raw 0/1 is accepted), `sweep` v encoding `0x1b`/`0x1c`, EIP-712 manual vs viem digest (uses the same field order as SWEEP_TYPE_STRING), ABI tuple order for `sweep` / `sweepWithPermit` (verified), `fiatToTokenAmount` exponent arithmetic (dimension check by hand), `readPrice` bounds, `validateRpcUrl` (userinfo, fragment, scheme), `requestWithFallbackCheck`.

## Could not verify

- Real RPC providers, real reorgs, real `eth_getLogs` limits (all mocked).
- `secp256k1.sign` default return format in noble 2.4 (used as `Uint8Array` in invoice-schema/sign.ts:82; tests pass, so it is consistent).
- Web Crypto and `TextDecoder` behaviour in browsers (only Node 22.22 checked, and only the Date.parse and hex probes).
- BUG-07 is by reading only.
- Whether the ERC-2612 permit path (`payERC20WithPermit`) signature value/deadline matches the router call: requires an on-chain or EVM run (none available: no forge, no EVM in this node).
- Feeds (`FEEDS` empty) and token addresses beyond the two Sepolia USDC entries (TODO-VERIFY).
