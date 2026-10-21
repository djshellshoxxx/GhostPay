# Deep security audit: packages/btc-silent-payments

Branch claude/remote-extensions-1, 2026-10-21. Scope: `src/**` incl. `spend.ts`, `scan/`. Findings only; no fixes applied.
Baseline run: `npx vitest run` in the package = 18 files / 299 tests pass. PoCs below were run via a scratch vitest config outside the repo (scratchpad `btc/*.poc.ts`); no repo file edited. `npm audit` not run (no result obtained; dependency section is static).

## 1. Threat model

Assets: `b_spend` (funds), `b_scan` (privacy of all received payments, label tweaks), per-input signing keys `b_spend+t`, spend tweaks, recipient/payer metadata (wallet birthday height, UTXO set, change position).
Trust boundaries:
- Caller of `buildSpendTransaction` (trusted: supplies destinations, change address, fee rate, outputs).
- `TweakSource` / BlindBit oracle (UNTRUSTED, remote; sees heights; returns tweaks, output keys, txid/vout/amount, block hash).
- Network transport (`FetchLike`, injected).
- Counterparty strings: SP addresses, `bitcoin:` URIs, hex fields (hostile).
- JS runtime (no constant-time, no guaranteed erasure).
Adversaries: malicious/compromised oracle (omit, forge metadata, DoS, learn heights); on-path attacker on http oracle; malicious payer (output-key copying, dust); hostile URI/invoice author; local logger/serializer leaking secrets; fat-finger caller.
Cross-ref: docs/threat-model/THREAT_MODEL.md:315 lists the Bitcoin tier as out of audited scope and not integrated; no app/package imports btc-silent-payments (grep, only its own package.json). So all findings are latent until wired.

## 2. Findings (counts: Critical 0, High 0, Medium 2, Low 7, Info 4)

### M1 Medium. Scanner attributes found output to the LAST same-key entry (shadowing / spoofed metadata)
Evidence: `src/scan/scanner.ts:55-56` builds `byKey = new Map(); for (o of outs.outputs) byKey.set(toHex(o.xOnlyPublicKey), o)` (later entry overwrites earlier); `:62` `byKey.get(...)` supplies `txid/vout/amountSats`. Output x-only keys are public once a payment is in mempool/block, so anyone can create another output with the identical key P (same block, later position) or the oracle can append one. Only one result is yielded per key (`receiver.ts:154,160` `consumed`), so the genuine UTXO is not reported and the wallet gets the attacker's txid/vout/amount (e.g. 1 sat). Funds are not stolen (same key spends either), but real value is hidden until a rescan and balances are wrong. Reproduction (ran): scratch `a.poc.ts` "A": block with genuine output (amount 1001) plus a copy with same key, other txid, amount 1 -> scan yields 1 result, txid = attacker's, amount 1. Suggested fix: key the map to a list, yield every outpoint carrying a matched key (or report all), reject/flag duplicate keys.

### M2 Medium. Oracle-supplied chain data is unauthenticated (omission, forged position/amount, unchecked block hash)
Evidence: `scan/blindbit.ts:176-196` accepts any `txid/vout/amount/block_hash`; `scanner.ts:43-45` "reorg" check only compares the oracle with itself; no header/PoW or second-source check; DEVIATIONS.md acknowledges `/utxos` spent-set semantics unverified. Consequences: oracle can withhold tweaks/outputs (payments never detected, undetectable), report wrong txid/vout/amount (spend then fails signature/ broadcast: sighash commits amounts, `spend.ts:262-266`; no theft), report a fake `block_hash`, and see every height scanned. Confirms prior audit security-btcapps M3. Reproduction: static (`blindbit.ts:176-196`); metadata forgery shown by M1 PoC. Suggested fix: cross-check hits (txid/vout/amount/hash) against a second source or own node before display/spend; document omission as an accepted trust assumption; expose a hash-verification hook.

### L1 Low. Oracle-controlled tip height gives an unbounded scan loop
Evidence: `blindbit.ts:96-100` `getTipHeight` returns any safe integer (`uint`); `scanner.ts:41-47` accepts any integer `toHeight` (no uint32 cap, unlike `BlindBitClient.height` `:109` and `adapter.ts:46-48`); loop `:49` sequential. Reproduction (ran, "E"): source returning tip 2^40 -> 2001 requests served before the test aborted. A hostile oracle serving fabricated empty blocks can keep a wallet scanning/ requesting indefinitely (CPU, battery, traffic). Fix: cap tip at uint32, sanity-bound vs fromHeight (and optionally vs wall-clock-derived max), per-scan block limit.

### L2 Low. No response size cap or default timeout in BlindBitClient
Evidence: `blindbit.ts:117-118` `res.json()` reads the full body; `MAX_ENTRIES` (200000, `:41`) applies after parsing; no default timeout when `signal` absent (`:109-112`). 200k tweaks also means ~200k ECDH multiplications per block in `scanTweakAgainstSet` (`receiver.ts:141`), minutes of CPU. Confirms prior L1. Fix: cap bytes (`content-length`/streamed), default `AbortSignal.timeout`, lower entry cap or yield to event loop.

### L3 Low. Plain `http:` oracle allowed for any host
Evidence: `blindbit.ts:64-71` accepts http/https for any host. On-path attacker learns scanned heights and can omit/forge data (M2). Also fetch follows redirects by default (init has no `redirect:'error'`, `FetchLike` type `:14-17`), so an https base can redirect to http/another host. Confirms prior L2. Fix: https unless loopback; `redirect:'error'`.

### L4 Low. Weak absolute fee guard; fee may be 44-50% of value
Evidence: `spend.ts:237` `if (fee*2n > total && fee > 10_000n)`: any fee up to 10,000 sat passes at any ratio; ratio only enforced above 50%; `MAX_FEE_RATE_SAT_PER_VB = 10_000` (`:66`). Reproduction (ran, "L3"): total 2,240,000 sat, 1-in/1-out sweep at 10000 sat/vB -> OK, fee 990,000 sat (44%). Confirms prior L3. Fix: ratio cap (e.g. 10-20%) with absolute floor, lower rate cap, require explicit override for high fees.

### L5 Low. feeRate below 0.0005 sat/vB yields a zero-fee transaction
Evidence: `spend.ts:90-93` `BigInt(Math.round(feeRate*1000))`. Reproduction (ran, "B"): `feeRate: 0.0004` sweep -> OK, `feeSats 0`, signed non-relayable tx. Also sub-1 rates below relay minimum (1 sat/vB default) accepted with no floor. Fix: reject `feeRate` below a minimum (or `Math.ceil`).

### L6 Low. False INSUFFICIENT_FUNDS when the change slot is just below dust
Evidence: `spend.ts:226-234`: if `candidate < dust` fee falls back to `total-paid`, rejected when `> feeNoChange + dust`, but `total-paid` can reach `dust + feeChange` (feeChange > feeNoChange by ~43 vB). Reproduction (ran): total 100000, rate 10, paid so change would be 545: leftover 1965 > feeNo+dust 1536 -> `INSUFFICIENT_FUNDS` despite funds being sufficient. Liveness only (fails closed). Fix: compare against `feeChange + dust` or recompute.

### L7 Low. Transaction/scan metadata fingerprints
Evidence: `spend.ts:211` fixed order destinations then change (change index always last; PoC "changeIdx 1 of 2"), `tx.addOutput` order not shuffled (documented, `spend.ts` remarks), locktime 0 and version 2, sequence fixed 0xfffffffd/0xfffffffe (PoC: locktime 0, seq 4294967293) vs Core's anti-fee-sniping locktime; heterogeneous change (regular vs SP) address types visible. Scanner: `scanner.ts:49-56` always requests both tweaks and utxos for every height from `fromHeight` => oracle learns wallet birthday/range and request cadence; sequential timing. Fix: shuffle outputs, set locktime to tip height (caller-supplied), batch/random-order or Tor/PIR guidance.

### L8 Low. Post-sign verification does not bind outputs to the plan
Evidence: `spend.ts:262-263` `verifyKeyPathSpend` checks signatures and vsize only; destination scripts/amounts/change are never re-read from `rawTx` and compared to `order`. A logic regression (or a bug in `@scure/btc-signer` output handling) would sign a valid tx paying the wrong output with no detection. Also change/destination address correctness (own-wallet change) is a caller trust assumption, `spend.ts:34-38`. Fix: decode `rawTx` outputs and assert equality with `order` and fee == total-sum(outputs).

### I1 Info. SecretBytes redaction is bypassed by derived copies
Evidence: `secret.ts:28-30` species returns plain `Uint8Array`. Reproduction (ran "F"): `secret.slice()`, `subarray`, `Uint8Array.from(secret)` return plain `Uint8Array`; `JSON.stringify(secret.slice())` serializes key bytes; `Buffer.from(secret).toString('hex')` works. Confirms prior info 9. Fix: documented; consider `slice`/`subarray` overrides that throw.

### I2 Info. Zeroization / constant time
`spend.ts:187-191,276` zeroizes derived keys, but noble `schnorr.sign` (`:258`) and bigint arithmetic (`receiver.ts:230`, `sender.ts:60,83`) leave unzeroizable copies; `FoundOutput.spendTweak` secrets returned to callers by the adapter (`adapter.ts:123`) are never zeroized by the package. All documented as best effort (`secret.ts` docs). No constant-time scalar mult.

### I3 Info. URI label/message are returned unsanitized
`uri.ts:92-93,103-104` returns decoded `label`/`message` including control and bidi characters for UI rendering; length is bounded (2048). Encoding side uses `encodeURIComponent` correctly (`:45-46`), `sp` is fully validated (injection of extra params impossible, `:39`). Keys are case-sensitive (`AMOUNT=` ignored; also noted in bugs-btcapps).

### I4 Info. Scan does ECDH even for blocks with no candidate outputs
`scanner.ts:58-60` / `receiver.ts:141`: with an empty output set each tweak still costs a scalar mult before `candidates.size` is checked. Performance only; skip when `byKey.size===0`.

## 3. Reviewed, no finding (verified in code)
- Key derivation and parity: `spendPrivateKey` (`receiver.ts:229-240`) negation and zero check; spend loop checks derived x-only equals claimed output key (`spend.ts:197`) before signing; tweak range checks `strictScalar`; `labelTweak`, `buildSenderContext` handle sum 0 / taproot negation; recipients capped `K_MAX`; rejection-sampled RNG (`rng.ts`), fail on stuck RNG.
- Replay: signatures commit to BIP-341 sighash with all prevouts/amounts; SIGHASH_DEFAULT; input dedupe (`spend.ts:111-116`), vout/txid validation, max 5000 inputs.
- Injection/parsing: strict hex (`ecc.ts parseHex`), lowercase-only bech32m with HRP/network checks (`address.ts:206-212`), strict witness parser with canonical compact size (`tx.ts:73-99`), `res.json()` failure -> `INVALID_RESPONSE`, error messages are fixed strings (`errors.ts`), no key material in errors, transport only receives `GET <base>/<info|tweaks|utxos>/<uint>` (no keys/headers).
- Reentrancy: n/a (synchronous, no shared mutable state except `TAG_CACHE` of public hashes, `ecc.ts:73`).
- Dependencies: exact-pinned `@noble/curves 2.4.0`, `@noble/hashes 2.4.0`, `@scure/base 1.2.6`, `@scure/btc-signer 2.4.1` (`package.json`); no install scripts reviewed; `npm audit` not run (unverified).

## 4. Cross-check of docs/remote/audits (haiku, previously unverified)
- security-btcapps M3, L1, L2, L3, info 8, info 9: CONFIRMED (above: M2, L2, L3, L4, L5, I1).
- bugs-btcapps M2 (burn-without-change contradiction): not reproduced as stated; `spend.ts:232-234` refuses a leftover over `feeNoChange + dust`, though the guard is off by the change-vsize delta (L6). bugs-btcapps "Info" on `vout`/amount bounds in scanner: confirmed (`blindbit.ts:188-191` uint only), spend path rechecks (`spend.ts:111-115`).
- security-btcapps statement that relayer/web do not import btc-silent-payments: confirmed (grep).
- Not verified: full BIP-352 conformance beyond the passing vectors; noble/scure internals; mutation/fuzz of parsers; live BlindBit behaviour.
