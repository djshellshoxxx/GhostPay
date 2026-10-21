# Parser fuzzing report

Branch `claude/remote-extensions-1` (working tree as of 2026-10-21). Scratch: `/tmp/claude-0/assure-fuzz/` (harness `fuzz/*.fuzz.ts`, per-target results `out/*.json`, repros `repro/`, `repro2/`, `redos/`). Nothing in the repo was modified except this file. Targets were run from a scratch copy of the sources (`repo/`), under vitest 5.0.5 / Node 22.22, with `@ghostpay/*` workspace deps (`core-crypto`, `chain-adapters`, `invoice-schema`) resolved to the repo's built `dist/`.

## Summary

About 60 million generated cases over 27 targets (two PRNG seeds, 1337 and 7, for the nine cheapest), a static ReDoS scan of all 142 regex literals, and 2.5 million coverage-guided jsfuzz executions over five composite targets. Across all targets:

- Crashes: none. No process crash and no untyped exception from the invoice, BIP-352 address, BlindBit, relayer-validator or manifest parsers; untyped throws exist only in F5, F6 and F10 (all fail closed).
- Hangs: no exponential ReDoS. Seven quadratic regexes, one of which is reachable from user text (F2). Large-input probes (64 MiB base64url, 1M-deep JSON, 10 MB integer token, 5 MB BIP-352 string) are linear and fast.
- Memory: no blowup in any bounded-input parser. Two unbounded-body reads (F3, F4) and one attacker-chosen scrypt cost (F9).
- Non-canonical acceptance: invoice fragment, BIP-352 v0 address and router metadata are bijective or canonical; the weaker spots are the manifest, RPC envelope, BIP-21 URI and BlindBit bounds (F7, F8, F10, F11).
- No forgery: 0 of 640k mutated fragments produced a valid signature on a different invoice or on the same invoice via a different encoding.

| # | Severity | Target | Issue |
|---|---|---|---|
| F1 | Low-Medium | invoice-schema text fields + web Pay view | Bidi controls, ZWSP, tag chars, U+2028/9, noncharacters, PUA accepted in `memo` / `description` and rendered raw |
| F2 | Low | `apps/web/src/lib/settings.ts:52` (+2 others) | Quadratic regex `/\/+$/`: 100k slashes = 8.9 s, 300k = 83 s |
| F3 | Low-Medium | `BlindBitClient` | No body cap, no timeout; 200k-entry `/tweaks` costs 23 s CPU |
| F4 | Low | `apps/web/src/lib/relayerClient.ts` | 200 MB body fully buffered before the 16 KiB cap check; weak quote field checks |
| F5 | Low | `tx-review` `decodeTx`/`decodeTypedData`, `chain-adapters` `decodePaymentCalldata` | Untyped throws despite "never throws"; dirty `v` word, `types` null/missing |
| F6 | Low | `chain-adapters` RPC | `requestWithFallbackCheck` stack overflow on 400 KB nested result; duplicate keys last-wins |
| F7 | Low | deployment manifest | Duplicate keys, impossible dates, any-length `signature` accepted |
| F8 | Info | relayer quote token | Leading zeros in `expiresAt` verify (token malleability) |
| F9 | Low | `apps/web/src/lib/keystore.ts` | Attacker-chosen scrypt cost up to 2 GiB / ~64x default work before authentication |
| F10 | Info | `parseBitcoinUri` / `buildBitcoinUri` | Unsanitized label/message, untyped `URIError`, trailing-zero amounts |
| F11 | Info | BlindBit response bounds, scan checkpoint | `vout`/height > u32, amount > MAX_MONEY, duplicates, inconsistent cursor accepted |

## Method

All generators are in `fuzz/lib.ts` (xoshiro128** PRNG, string mutators with a pool of Unicode/format specials, structure-aware JSON mutator in `fuzz/mutate.ts`, ddmin-style minimizer). fast-check 4.10.2 is installed in the repo but was not used for the million-case loops (custom generators were faster and gave deterministic seeds); the repo's own `invoice-schema/src/fuzz.test.ts` was not re-run. Each target has an oracle, not only a crash check:

| Target (file) | Cases | Oracle |
|---|---|---|
| `decodeBase64Url` (`b64json`) | 6.0M | typed `Base64UrlError` only; `encode(decode(x)) === x`; bytes equal Node `Buffer.from(x,'base64url')`; alphabet check |
| `parseStrictJson` / `canonicalize` (`b64json`) | 6.0M | typed `JsonParseError` only; differential vs `JSON.parse` (accepts only if native accepts, equal values); canonical re-parse idempotent; null prototype |
| `validateInvoice`, `validatePrivatePart` (`invoice`) | 1.5M + 0.3M | typed `SchemaError` only; `validate(parse(canon(x)))` equals x; output deep-equals input (no silent normalization) |
| `parseFragment` plain + encrypted (`invoice`) | 0.6M + 40k | typed `InvoiceError` only; mutations at char, byte and structure level (re-canonicalized to reach schema and signature layers); accepted + valid signature must equal the original invoice AND original bytes |
| `loadDeployment`/`validateManifest` (`chain`) | 1.6M | typed `ChainAdapterError`; address checksum/distinctness, chainId, feeBps, non-zero hashes on accept; date, signature, size, `__proto__` probes |
| `validateRpcUrl`, `parseQuantity` (`chain`) | 3.0M + 4.0M | typed; accepted URL has no credentials/fragment, https/wss or opted-in loopback; quantity matches canonical regex and round-trips |
| `createClient` response handling, `getBlock`/`getLogs`/`blockNumber` (`chain`) | 400k | typed `ChainAdapterError` only; envelope mutations incl. duplicate ids/results, batch arrays, 900k-deep nesting |
| `validateAnnouncementLog` (`chain`) | 1.6M | typed `ChainAdapterError`; accepted logs have 33-byte compressed key, lowercase hash, range-checked block |
| `parseMetadata` (`chain`) | 6.0M | typed `GhostPayCryptoError`; accepted input rebuilds byte-for-byte via `buildErc20Metadata`/`buildNativeMetadata` |
| `decodePaymentCalldata` (`chain`) | 400k | typed; fee/net arithmetic on accepted calldata |
| `decodeSilentPaymentAddress` (`btc`) | 3.0M | typed `SilentPaymentError`; accept/reject and key bytes compared with an independent BIP-350/352 reference decoder written for this run (polymod, charset, padding, version, point checks); v0 round-trips to the same string |
| `parseBitcoinUri`, `btcStringToSats` (`btc`) | 2.0M + 4.0M | typed; accepted URI rebuilds and re-parses to equal fields |
| `BlindBitClient` `/info`, `/tweaks`, `/utxos` (`btc`) | 600k | typed `SilentPaymentError`; bounds on accepted outputs; fake `fetch` incl. non-ok and throwing `json()` |
| `parseQuoteRequest`, `parseSweepRequest`, `verifyQuote` + primitives (`relayer`) | 5.2M | typed `RelayerError` 400 only; canonical forms; token MAC malleability |
| relayer HTTP server (`relayer`) | 12k raw-socket requests | no 500, no crash, `/healthz` alive; header/framing/method/path/Content-Type/Origin/encoding mutations |
| tx-review `decodeTx`, `decodeTypedData` (`misc`, `quote`) | 0.6M + 0.8M | "never throws" contract |
| address-safety, relayer-guard `parseIp`/`parseCidr`, scheme-1/2 meta-address, web `extractFragment`/`sanitizeSettings`/`requestQuote`/checkpoint/`loadManifest`, Chainlink reader, `parseUnits` | ~12M | typed errors; IPv6 byte expansion vs independent reference; round-trips |
| Regex scan | 142 literals (99 unique) | `recheck` 4.4.5 on every regex literal and `new RegExp("literal")` in non-test `apps/` and `packages/` source |

## Findings

### F1 Low-Medium: invoice text accepts bidi/format/separator code points; web renders them raw
Evidence: `invoice-schema/src/schema.ts` `text()` rejects only lone surrogates, non-NFC, and C0/C1 controls. Of 197,513 accepted mutated invoices, accepted memo/description text contained: bidi controls 2,002 (U+202A-202E, U+2066-2069, U+200E/F, U+061C), ZWSP/WJ/BOM 1,132, tag characters (U+E0000-E007F) 411, private use 420, noncharacters (U+FDD0-FDEF, U+FFFE/F) 816, U+2028/2029 814, ZWJ 410. End to end (`repro/repro.repro.ts` R5): a memo `"Pay \u202Eexe.txt\u202C \u200Bnow\u2028line2"` and a line item `"a\u2066b\u2069\u{E0041}\uFFFE"` signed and fragment-encoded round-trip with `trust=trusted-seller` when the key is pinned. `apps/web/src/views/Pay.tsx:408` (`{li.description}`) and `:420` (`{inv.memo}`) render them as plain React text; `grep -rn "sanitizeDisplayText\|address-safety\|unicode-bidi\|isolate" apps/web` finds nothing, so the existing `address-safety` sanitizer is not wired in. The same class survives `sanitizeDisplayText` for U+2028/2029, noncharacters and unassigned code points (address-safety fuzz: 5,319 / 5,328 / 7,770 of 2.6M).
Impact: text-direction spoofing and invisible content in the payer's confirmation screen (memo imitating "Total ... paid" lines, hidden payload). XSS is not possible (React escaping; see `redteam-web.md`); amounts and addresses are rendered from validated fields, so no value change.
Repro: `cd /tmp/claude-0/assure-fuzz && PATH=/root/.local/bin:$PATH node_modules/.bin/vitest run --config vitest.repro.mts repro/` then `grep R5 out/repro.txt`.
Fix: in `text()` also reject `\p{Bidi_Control}`, `\p{Cf}` (allow U+200D/FE0F only between emoji if wanted), `\p{Zl}`, `\p{Zp}`, `\p{Co}`, `\p{Cn}`, `\p{Noncharacter_Code_Point}` (`address-safety` already rejects Bidi_Control, default-ignorable, Co and Cc but not Zl/Zp/Cn/noncharacters), or call `sanitizeDisplayText` in Pay.tsx and add `unicode-bidi: isolate` on `.wrap`. Rejecting in the schema changes accepted v1 inputs, so decide before the first release.

### F2 Low: quadratic regex `/\/+$/` reachable from user-typed or stored text
Evidence: `recheck` reports "2nd degree polynomial" for `/\/+$/` at `apps/web/src/lib/settings.ts:52` (`checkRelayerUrl`, also called by `sanitizeSettings` on every settings load), `packages/btc-silent-payments/src/scan/blindbit.ts:103` (`normalizeBase`), `packages/ops-monitor/src/fetcher.ts:17`. Measured (`repro/repro.repro.ts` R3, shared 4-core box under load): `checkRelayerUrl("https://r.example/" + "/".repeat(n) + "x")` n=10k: 77 ms, 30k: 745 ms, 100k: 8.9 s; plain `String.replace` n=300k: 83 s. `sanitizeSettings` with 50k slashes: 2.2 s. The same pattern shape `/0+$/` (`units.ts:22`, `format.ts:12`, `Disclosure.tsx:27`) is flagged but its input is capped at 8-36 digits, not exploitable. The only other flagged pattern is the build-time `vite.config.ts:14`. No exponential patterns among 142.
Impact: UI freeze on a pasted or stored 100 KB+ URL; persistent if written to `localStorage`, but writing there already needs same-origin script. The BlindBit and monitor sites take operator/user-chosen URLs.
Repro: `node /tmp/claude-0/assure-fuzz/redos/time.mjs`.
Fix: trim trailing slashes with a loop (`while (s.endsWith('/')) s = s.slice(0, -1)`) and cap the URL length (2048) before `new URL`.

### F3 Low-Medium: `BlindBitClient` has no body cap and no timeout, and a legal-size response costs 23 s CPU
Evidence (`packages/btc-silent-payments/src/scan/blindbit.ts`; also static-analysis F1):
- `res.json()` buffers the whole body; `MAX_ENTRIES` is checked afterwards. Standalone (`redos/mem.mjs`, global `fetch` against a local streaming server): body 10/50/150/300 MB gives peak RSS delta 32/67/183/318 MB, wall 0.09/0.35/0.84/1.6 s. A server that streams without end grows the tab until the OS kills it (observed: 12.4 GB cgroup OOM kill when my first repro server looped).
- No timeout: a server that accepts the request and never replies leaves `getTweaks()` pending forever unless the caller passes an `AbortSignal` (repro R2: still pending after 5 s).
- Within `MAX_ENTRIES`: `getTweaks()` with 200,000 valid-shape tweaks (13 MB JSON) took 23.4 s (about 117 us/entry, `parseHex`+`toHex`+`parseHex`+EC `pointFromCompressed` each); `getOutputs()` with 200,000 entries took 4.3 s. A hostile oracle can pin the scanning thread per block.
Repro: `node /tmp/claude-0/assure-fuzz/redos/mem.mjs 150`; `grep R2 /tmp/claude-0/assure-fuzz/out/repro.txt`; the 200k probe is in `out/blindbit-responses.json` stats (`probe:tweaks-200000`).
Fix: stream with a byte counter (Content-Length precheck plus reader cap, e.g. 16 MiB); apply `AbortSignal.timeout` inside `get()`; lower `MAX_ENTRIES` to a realistic per-block bound (tens of thousands); validate points lazily (the scanner multiplies each anyway) or in yielded batches; drop the double hex round trip.

### F4 Low: relayer client buffers the whole response before checking the 16 KiB cap; weak quote checks
Evidence: `apps/web/src/lib/relayerClient.ts:37-38` (`await res.text()` then `text.length > MAX_RESPONSE`). `repro` (in `out/web-parsers.json`): a 200 MB body returns the "too large" error only after RSS grew by 800 MB (about 4x). Also accepted by `requestQuote` (minimal repro `repro2/min.repro.ts`, `out/min.txt`): `fee = "115792089237316195423570985008687907853269984665640564039457584007913129639936"` (2^256, 134 of 3.5M mutated bodies); `feeTo` with a wrong EIP-55 mixed-case checksum (`isAddress(..., {strict:false})`, silently re-checksummed); any `quoteToken` of `[A-Za-z0-9._~+/=-]` up to 2048 chars (e.g. `"0"`, not the server's `v1.<exp>.<fee>.<64 hex>` form); `expiresAt` up to 2^53-1.
Impact: tab memory use by a hostile configured relayer (HTTPS-only, user-chosen); the fee is later compared with the published cap by callers, so no value impact found.
Fix: read `res.body` with a counting reader (abort at 16 KiB), reuse `QUOTE_TOKEN_PATTERN`, bound `fee <= MAX_UINT256`, use `strict:true`.

### F5 Low: `decodeTx`, `decodeTypedData`, `decodePaymentCalldata` throw untyped errors despite the "never throws" contract
Evidence (`repro/repro.repro.ts` R1, `repro2/min.repro.ts`):
1. A `payERC20WithPermit` calldata whose `v` word (uint8) is `0x...0100`: viem decodes it as 256 and the canonical re-encode throws `IntegerOutOfRangeError: Number "256" is not in safe 8-bit unsigned integer range`. `packages/tx-review/src/decode.ts` `decodeStrict` (`encodeFunctionData` outside the `try`) and `chain-adapters/src/router.ts` `decodePaymentCalldata` (`reencode`) both let it escape; `decodeTx` documents "Never throws". 501 of 600k mutated calldata for `decodeTx`, 70 of 400k for `decodePaymentCalldata`; `assertPreviewMatchesCalldata` is affected through it. Fails closed (an exception, not an accepted tx).
2. `decodeTypedData({domain:{},primaryType:'Permit',message:{}})` (no `types`) throws `TypeError: Cannot convert undefined or null to object`; `types:{Permit:null}` or `{Sweep:null}` throws `TypeError: Cannot read properties of null (reading 'length')` (`sameTypes`). 12,109 of 784k mutated payloads.
Fix: wrap the re-encode in `try/catch` and map to `NON_CANONICAL_CALLDATA` / `PREVIEW_MISMATCH`; in `decodeTypedData` check `typeof td.types === 'object' && td.types !== null` and that each entry is an array before `sameTypes`.

### F6 Low: RPC response handling
Evidence: (a) `requestWithFallbackCheck` -> `stableStringify` recursion: a 400,034-byte result of 200,000 nested arrays gives `RangeError: Maximum call stack size exceeded` (untyped, not `ChainAdapterError`) at `rpc.ts` (`repro` R6, `out/repro.txt`; the plain client path is fine, `JSON.parse` handles 900k nesting in 290 ms and then fails the envelope check). (b) Envelope parsing uses `JSON.parse`: duplicate keys last-wins (`{"jsonrpc":"2.0","id":99,"id":1,"result":"0xaa36a7"}` and duplicate `result` accepted), numeric `id` `1.0` and `1e0` accepted as id 1. Retries are clamped: `retries:1000` gave exactly 6 attempts for both `-32005` and transport errors (`repro2/retry.repro.ts`); batch arrays and string ids are rejected, `parseQuantity` accepted only canonical lowercase quantities in 4M cases.
Impact: a hostile RPC can make the cross-check throw an untyped error; duplicate-key tolerance is a non-canonical-input class only (provider is already trusted for its own answer).
Fix: depth-limit (e.g. 64) and iterate in `stableStringify`, or compare via a bounded-depth strict parse; optionally reject duplicate keys.

### F7 Low: deployment manifest validator accepts ambiguous or impossible values
Evidence (`packages/chain-adapters/src/deployments.ts`, minimal inputs in `repro` R4): (a) `loadDeployment` uses `JSON.parse`: `{"chainId":1,"chainId":11155111,...}` loads with chainId 11155111; a prepended `"router":"0x…01"` is silently overridden by the later key (25.8k of 800k mutated texts). (b) `isRealDate` is `RFC3339` regex plus `Date.parse`, so V8 rolls over: `2026-02-30T00:00:00Z`, `2026-02-31…`, `2026-04-31…`, `2025-02-29…` and `…T24:00:00Z` are accepted (`2026-13-01`, `T25`, `:60` rejected). (c) `signature` is `^0x[0-9a-fA-F]+$`: `0x0`, `0xabc` and a 200,002-char value are accepted; the field is carried only, no verifier exists in the repo and the UI says so (`Disclosure.tsx:44`: "whose signature this app does not verify"). Size cap (16 KiB, UTF-8 bytes), `__proto__` keys, role collisions, zero addresses, bad checksums, `feeBps != 25` and chain mismatch held in all 1.6M cases.
Impact: low (manifest is served from the app's own origin and these fields are informational). The `signature` field therefore carries no assurance today.
Fix: parse with `parseStrictJson`-style duplicate-key rejection; validate month/day/hour explicitly (`new Date(Date.UTC(...))` round trip); require `^0x[0-9a-fA-F]{130}$` (or the real length) for `signature`.

### F8 Info: relayer quote token is malleable by zero-padding `expiresAt`
Evidence: `apps/relayer/src/validate.ts` `QUOTE_TOKEN_PATTERN = /^v1\.[0-9]{1,12}\.…/` allows leading zeros while `verifyQuote` MACs `String(Number(exp))`. `v1.1900000100.1.<mac>` and `v1.001900000100.1.<mac>` both verify (`repro2/min.repro.ts`, `out/min.txt`; 7 hits in 400k). Replay is bounded by the contract's sweep nonce, so no impact found; any server-side dedupe or log correlation keyed on the token string would see two identities.
Fix: `[0-9]{1,12}` -> `(?:0|[1-9][0-9]{0,11})`.

### F9 Low: keystore import lets the file choose the scrypt cost, before authentication
Evidence: `apps/web/src/lib/keystore.ts` `decryptKeystore` accepts `N` in [2^14, 2^20] (power of two), `r` <= 16, `p` <= 4 from the file, with `maxmem: 2**31`. Worst accepted cost is 64x the default work and 128*N*r = 2 GiB. Measured with the same `@noble/hashes` `scryptAsync` (`redos/scrypt.mjs`): N=2^17,r=8,p=1 (production default) 0.73 s / +139 MB; N=2^19,r=8,p=1 3.0 s / +384 MB; the maximum was not run (memory). Extrapolated by linearity: roughly 45 s CPU and 2 GiB for N=2^20,r=16,p=4.
Impact: a malicious keystore file makes the tab burn CPU and possibly OOM before the AES-GCM tag can reject it (user must import the file and type a passphrase).
Fix: on decrypt accept only the parameters the app writes (`DEFAULT_SCRYPT` N/r/p), or cap at N<=2^18, r<=8, p=1; keep older values behind an explicit confirmation.

### F10 Info: BIP-21 / `sp` URI quirks
Evidence (`packages/btc-silent-payments/src/uri.ts`; `out/bip21-uri.json`, 3M cases x 2 seeds): `label` / `message` are percent-decoded without sanitization, so `%00`, `%E2%80%AE`, raw lone surrogates and 1.9 KB strings are returned (11,239 message and 1,941 label cases had control or bidi characters); `buildBitcoinUri({label:"a\ud800"})` throws untyped `URIError: URI malformed` (797 hits); the amount accepts trailing zeros (`1.50`, `1.5000`) and percent-encoded digits (`amount=%31`) although the doc says "strict BTC decimal"; unknown parameters including `SP=` (case) and `s%70=` (encoded key) are ignored, duplicates of the exact key `sp`/`amount` are rejected. Accepted URIs re-parse to equal fields after `buildBitcoinUri` (3M x 2 seeds) except through those paths; scheme match is case-insensitive, `req-*` rejected, `#` rejected.
Fix: display `label`/`message` only through `sanitizeDisplayText`; catch `URIError` in `buildBitcoinUri`; make `btcStringToSats` reject trailing fractional zeros if canonical form is required.

### F11 Info: bounds missing on BlindBit fields and the web scan checkpoint
Evidence: `out/blindbit-responses.json`, 600k cases: accepted `vout` 4294967296..2^53-1 (164 hits), `amount` up to 2^53-1 sats (above `MAX_MONEY_SATS` 2.1e15, 66), `/info` `height` and tip above 2^32 (the request side limits to `0xffffffff`, 250 + 434), duplicate `(txid,vout)` outpoints (1,342) and duplicate tweaks (15,860), zero-amount outputs, `pubkey` that is not on the curve or is zero (x=5, x=0), free-text `network` (<= 32 chars). `apps/web/src/lib/scanClient.ts` `localCheckpointStore.load` accepts `last.number >= nextBlock` (4,892 of 3.5M) and `nextBlock > last.number + 1` (gaps that skip blocks, 3,851) and `nextBlock` up to 10^20; only reachable by editing `localStorage`.
Fix: `vout <= 0xffffffff`, `0 <= amount <= MAX_MONEY_SATS`, `height <= 0xffffffff`, reject duplicate outpoints; require `nextBlock === last.number + 1n` (or at most `last.number + 1n`) and `< 2^64` in the checkpoint loader.

## Negative results (what held)

- `decodeBase64Url`: bijection with `encodeBase64Url` on 6M cases, equals Node `Buffer.from(x,'base64url')`, rejects `=`, `+`, `/`, whitespace, non-zero tail bits, length mod 4 == 1; 64 MiB input 0.99 s.
- `parseStrictJson`: 0 divergences from `JSON.parse` on accepted input, 6M cases; rejects duplicate keys, `__proto__`/`constructor`/`prototype`, floats/exponents/negatives/leading zeros, depth > 8 (1M-deep input rejected in 1 ms). 136,070 accepted non-canonical texts per run are caught by the `canonicalize(parsed) !== source` check in `parseFragment`. Performance is linear but slow on a 50 MB string (7.3 s) with no cap in the exported API; `parseFragment` caps at 16 KiB so it is not reachable there.
- `parseFragment`: 640k cases (plain and AES-GCM), 0 non-`InvoiceError` throws, 0 forgery, 0 alternate encodings accepted with a valid signature, changed-but-parsed envelopes (14,710 plain, 601 encrypted) all flagged `invalid-signature` with `signerPinned=false` (a changed envelope that verified would be a forgery: none); 16385-byte, 1 MiB and 64 MiB inputs rejected in under 60 ms; wrong prefix/version/case rejected.
- `validateInvoice`: 1.8M mutated invoices, only `SchemaError`; accepted output is idempotent and equals the input (no silent normalization); getter-based TOCTOU attempt: validator reads each field once for the check, output uses the value it validated.
- BIP-352 address: 3M cases x 2 seeds, 0 divergences from the independent reference decoder (accept/reject, version, padding, point validity, key bytes); all-uppercase and mixed-case rejected as documented; v0 canonical round trip; versions 1-30 accept and discard trailing bytes (documented, 59k cases/seed).
- `parseMetadata`: accepted <=> rebuilds byte-for-byte; uppercase hex input accepted and normalized (5.9k).
- `validateRpcUrl`: 3M cases, never accepts credentials, fragment, empty host, non-https/wss except opted-in loopback; query strings with API keys accepted (55 per 15k).
- Relayer validators: 5.2M cases, only `RelayerError` 400; addresses require checksum or lowercase; uints canonical decimal <= 78 digits and <= 2^256-1; `QUOTE_TOKEN_PATTERN` linear up to 10M chars. HTTP: 12,000 raw requests (bad framing, duplicate and conflicting `Content-Length`/`Transfer-Encoding`, 16 KiB+1 bodies, invalid UTF-8, hostile Origin/XFF, 9 KB headers, `Expect`) produced no 500, no crash and a live `/healthz`; the 413 limit, 415, 403 origin and 405 paths held. (Node answers some malformed requests itself with 400/431/100 and without the app's security headers: 7,764 + 112 + 107 responses.)
- `parseIp`/`parseCidr`: 2M cases, bytes equal an independent IPv6 expansion, zone ids and brackets rejected.
- Scheme-1 and scheme-2 meta-address, `parseStrictAddress`, `fingerprint`, `metaAddressFingerprint`, `sanitizeDisplayText` (4096-char worst inputs <= 1 ms): no untyped throws. Scheme meta-addresses accept any hex case and canonicalize on output (5.5k cases), as documented.
- Chainlink reader and `fiatToTokenAmount` (2.2M): typed errors only, payer rounding never under, seller never over; mutated feed words (dirty upper bits, trailing bytes) are accepted by viem's decoder (round 558, decimals 406 per run), which is lenient but still range-checked by `readPrice`.
- Slow-call anomalies logged by the harness (single calls of 50 ms to 13 s in `validateInvoice`, `decodePaymentCalldata`, `validateAnnouncementLog`, manifest) did not reproduce when the recorded inputs were replayed (0.3 ms, 1 ms, 0.35 ms, 0.03 ms per call, `repro2/slow*.repro.ts`); the box was shared with mutation-testing jobs (load average 9 on 4 cores), so these are scheduling/GC stalls, not input-dependent.
- Half-open HTTP requests: in the full suite 300 half-open POSTs were still open after 50 s, but an isolated rerun against the relayer harness and a bare `node:http` server with the same timeouts closed all of them with `408` at 30 s (`redos/slowloris.mjs`, `repro2/slowloris.repro.ts`, `out/slowloris.txt`). I could not explain the in-suite result (likely event-loop saturation after 12k abusive requests). Note for operators: a half-open socket lives up to `requestTimeout` + the 30 s check interval, and `maxConnections=1024` is shared, so 1,024 half-open sockets from one host occupy it for 30 s at a time unless a reverse proxy or `server.connectionsCheckingInterval` shortens it.

## Coverage-guided jsfuzz runs

`jsfuzz` 1.0.15, 200 s per target (stopped with SIGINT), seeded with valid inputs, oracle-style targets in `jsfuzz/targets/*.js` run over `tsc`-emitted CommonJS of `invoice-schema`, `chain-adapters`, `btc-silent-payments` and `apps/relayer` validators (instrumentation limited to those files by patching jsfuzz's `hookRequire` filter to skip `node_modules`; `--versifier=false`). Results: 0 crashes, 0 invariant violations, 0 timeouts, 0 memory-limit hits.

| Target | Executions | Coverage ids | Corpus | What it exercises |
|---|---|---|---|---|
| `t_fragment` | 288,333 | 1195 | 54 | `parseFragment` on raw envelope bytes (base64url-wrapped); accepted + valid signature must re-canonicalize to the same bytes |
| `t_schema` | 344,192 | 1049 | 50 | `validateInvoice` (idempotence), `parseStrictJson`, `decodeBase64Url` (bijection) |
| `t_chain` | 340,828 | 867 | 29 | `loadDeployment`, `validateRpcUrl`, `parseQuantity`, `validateAnnouncementLog`, `decodePaymentCalldata` (typed errors only) |
| `t_btc` | 378,568 | 950 | 46 | `decodeSilentPaymentAddress`, `parseBitcoinUri`, `btcStringToSats`, `BlindBitClient` x4 methods |
| `t_relayer` | 1,130,863 | 144 | 22 | `parseQuoteRequest`, `parseSweepRequest`, `verifyQuote` |

The coverage-guided runs are small next to the PRNG runs and found nothing the structured generators had not. Two false alarms to be aware of if this is re-run: (1) with jsfuzz defaults, the five targets "crashed" within 2 minutes (`timeout reached. testcase took: 43-109 s`, RSS 3-6 GB, once a V8 heap OOM) because jsfuzz instruments `node_modules` and its versifier (parent process) blows up on a 92 KB corpus entry; the recorded "crash" inputs (837-1009 bytes) replay in 0-3 ms in plain Node and the per-step marker log showed the stall happened after the target returned (`jsfuzz/dbg.log`). (2) Those artefacts are not target defects.

## Not run / limitations

- fast-check property loops were not used for the bulk runs (custom PRNG mutators instead); the repo's existing fast-check suites (`invoice-schema/src/fuzz.test.ts`, `properties.test.ts`) were not re-run here.
- No browser: the bidi/ZWSP rendering effect in F1 is inferred from the React source and absence of sanitizer/CSS isolation, not screenshotted; Playwright e2e not run.
- The maximum-cost scrypt keystore (F9) and a multi-GB BlindBit stream (F3) were extrapolated from 100-300 MB and N=2^19 runs to avoid exhausting the shared 16 GB box (one early repro was OOM-killed at 12.4 GB because of a bug in my test server).
- Not fuzzed: `ops-monitor` probes `w1`-`w6` (they need a scripted RPC world), `policy-scheme` calldata/EIP-712 builders (not parsers), `relayer` `config.ts` env/JSON loading, `secret-box`, the contracts' on-chain parsers (covered by Foundry/Echidna elsewhere), `apps/web` worker message handlers (`scanner.worker.ts`, `scannerCore.ts`) and `tags.ts` decrypt path beyond what `validatePayload` shares with the tested code.
- `recheck` is a static analyzer with a 10 s per-regex budget; all 99 unique patterns finished (no timeouts). Dynamic ReDoS timing was measured only for the flagged patterns and `QUOTE_TOKEN_PATTERN`.
- Case counts are generated inputs, not unique coverage; the structure-aware generators concentrate on shapes near valid inputs, so deep grammar corners of `decodeAbiParameters`, `URL` and viem internals are exercised only as far as the mutators reach them.
- A few documented-by-design leniencies are listed as stats, not findings: future BIP-352 versions discarding trailing bytes, scheme-1/2 meta-address any-case hex, `parseMetadata` string input any-case hex, attacker-signed invoices parsing with `valid-signature` trust when the signer is unpinned.

## Reproduction

```
export PATH=/root/.local/bin:$PATH; cd /tmp/claude-0/assure-fuzz
./runall.sh                                   # full suite (about 35 min); FUZZ_RUNS=0.01 for a smoke run, FUZZ_SEED=n for another seed
node_modules/.bin/vitest run --config vitest.config.mts <b64json|invoice|chain|btc|misc|quote|relayer>
node_modules/.bin/vitest run --config vitest.repro.mts repro/ repro2/    # minimized repros -> out/repro.txt, out/min.txt
python3 show.py out/*.json                    # per-target counts, stats, anomalies with shortest inputs
node redos/check.mjs                          # recheck over redos/regexes.json (extract.cjs regenerates it)
node redos/time.mjs; node redos/mem.mjs 150; node redos/scrypt.mjs; node redos/slowloris.mjs
jsfuzz/runjs.sh 240                           # coverage-guided runs, 240 s per target
```
