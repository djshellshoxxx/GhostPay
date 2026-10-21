# Deviations and open points (@ghostpay/btc-payjoin)

Evidence tags: **[P]** primary source fetched 2026-10-21, **[R]** repo file read, **[T]** observed by running code, **[U]** unverified.

## Spec findings (BPJ-V2-1 spike, partly done)

1. **BIP-78 wire format** was re-read from the raw BIP (`bip-0078.mediawiki`, sha256 in `test-vectors/bip78-appendix.json`) before coding: POST base64 body with `Content-Type: text/plain`, query parameters `v`, `additionalfeeoutputindex`, `maxadditionalfeecontribution`, `minfeerate`, `disableoutputsubstitution`, 200 + base64 body or JSON `{errorCode, message}`, `Access-Control-Allow-Origin: *` on every response [P].
2. **BIP-77 fragment order contradiction.** The "Receiver fragment parameters" section says "lexicographical order" and the example is `EX`, `OH`, `RK`; the "Parameter Ordering" section says "reverse lexicographical" [P]. The reference implementation (`payjoin/src/core/uri/v2.rs`, master, retrieved 2026-10-21, commit not pinned) uses a `BTreeMap` joined with `-`, i.e. ascending, and accepts `-` or `+` [P]. This package **emits ascending**, **accepts any order and both separators**. Not tested against `payjoin-cli` output [U].
3. **BIP-77 `OH` length contradiction.** The text says a 2-byte key id + 33-byte key (35 bytes); the BIP's own example and rust-payjoin's test vector decode to **34 bytes** [T: decoded in `uri.test.ts`]. The parser accepts 34 or 35.
4. **`EX` byte order** is not stated in the BIP; rust-payjoin `time.rs` uses the Bitcoin consensus encoding of a u32, i.e. little-endian [P]. Decoding the BIP's example gives 2025-01-07 [T].
5. HPKE info strings, padding sizes and mailbox derivation were **not** re-checked against rust-payjoin source: this package implements none of the v2 crypto (see 8).

## Deviations from the spec

6. **No dependency on `@ghostpay/btc-silent-payments`.** Spec 7.1 lists it as a workspace dependency; nothing needed types from it. The receiver wallet takes a `signInput` callback, so the single export requested in `wiring/btc-payjoin.md` is called by the wallet, not by this package.
7. **`PayjoinUri.pjos: boolean` is `outputSubstitution: boolean`** (`false` = emit `pjos=0`); the spec's name was ambiguous.
8. **v2 transport: adapter shape only.** `@ghostpay/btc-payjoin/ffi` loads `payjoin@0.25.0` lazily [T: loads under Node 22.22 and exposes 145 exports], enforces the BPJ-V2-3 allowlists and operator separation, and adapts a narrow `FfiBackend`. **No concrete `FfiBackend` over the payjoin API was written**: the package is a typestate machine (ReceiverBuilder, Initialized, UncheckedOriginalPayload, ..., JSON session persisters, OHTTP request contexts), a correct mapping needs a running directory + OHTTP relay to test, and none was obtainable (rust-payjoin release assets and crates.io returned 403). The adapter is tested only with a fake backend. **Treat v2 as unbuilt.** Own v2 crypto (spec M4) was not attempted.
   - Correction to spec 3 [T]: `payjoin@0.25.0` on npm is a **WASM** package (`payjoin`, `payjoin/web`, `payjoin/web-vite`, described "EXPERIMENTAL"), not a native Linux/macOS binary, so it installs under `--ignore-scripts` and has a browser entry. Its `package.json` declares no `license` and the tarball has no LICENSE file; the repo is MIT per the spec [U].
9. **Sender fallback.** BPJ-SND-2 says fallback only after `EX`. `SenderSession.poll` offers the Original **immediately on an explicit failure** (receiver error, failed checks, transport error) and after the sender timeout. Rationale: after a failure the receiver cannot complete a payjoin (it lacks the sender signatures), so waiting only delays the payment. `fallbackOnFailure: false` turns the offer off. `markBroadcast` enforces that payjoin and fallback are never both recorded.
10. **Original PSBT policy added beyond BIP-78:** the receiver rejects originals with mixed input sequences (a valid proposal is impossible, BIP-78 requires one sequence value), with keypaths or partial signatures (BIP-78 says the original MUST NOT include them), and below a configurable minimum feerate (default 1 sat/vB).
11. **Receiver contribution policy:** exactly one UTXO; the payment output grows by the contributed value minus the receiver's fee share and never drops below the Original's value (stricter than BIP-78 when substitution is allowed); the sender's fee-output share is capped at `floor(F0 * maxSenderInputVsize / V0)` so it always satisfies the sender's own cap check.
12. **Input vsize is estimated by script type** (P2WPKH 68, P2TR 58, P2SH-P2WPKH 91, P2PKH 148, otherwise 110 vB, the BIP-78 reference sender's figure). `Utxo.inputVsize` overrides it. Fee maths use integer arithmetic.
13. **Seen-inputs store** is an interface plus an in-memory implementation only. A persistent implementation is required before any non-interactive receiver is run for real (BPJ-RCV-3). Concurrency protection is in-process.
14. **Memory transport is not a model of BIP-77 security**: no encryption, no padding, no OHTTP; it models store-and-forward, expiry and single-use mailboxes only. The directory observes message lengths in `observed` for tests.
15. **`SenderEvent` has an extra `done` kind** after a transaction was marked broadcast.
16. No coin selection in the Original builder: the caller chooses the UTXOs and all of them are spent. Change below 546 sat is folded into the fee (then there is no `additionalfeeoutputindex`).
17. `verifyKeyPathInput` (BPJ-RCV-9 signature check before release) covers P2WPKH and P2TR key-path inputs only; other receiver script types are released as signed by the wallet, without an independent verification.
18. Unreachable defence-in-depth branches in `psbt.ts` (`non_witness_utxo` hash and `witness_utxo` consistency) are marked `v8 ignore` because `@scure/btc-signer` already rejects those PSBTs when parsing; they are kept so fee maths never rest on an unchecked amount.
19. PSBT v2 inputs (BIP-370) are not explicitly rejected; whatever `@scure/btc-signer.fromPSBT` accepts is processed [U].

## Not verified

- Interop with any third-party implementation (BTCPay Server, Wasabi, `payjoin-cli`): none run.
- v2 end to end (directory, relay, OHTTP, HPKE): none run.
- Taproot (P2TR) payjoins on **Bitcoin Elements 23.2.4** in `-chain=regtest` mode are rejected with `Invalid Schnorr signature` even for a plain single-input spend (different taproot sighash), so Elements was dropped; Bitcoin Knots 29.2 accepts them [T].
- The silent-payment contribution path (BPJ-RCV-9) is tested with an inlined noble signer and noble verification only, not against a node and not with the real `btc-silent-payments` export (does not exist yet).
- UTXO-probing mitigation is partial by design (BIP-78); the "unnecessary input heuristic" is not addressed beyond preferring a same-script-type input [U: heuristic is from the PayJoin literature, not BIP-78].
- Legal posture of running a directory or relay: deferred by the owner; this package runs none and takes no fee.
