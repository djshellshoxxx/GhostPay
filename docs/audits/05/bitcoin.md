# Audit 05: bitcoin (BIP-352 silent payments, BIP-78 PayJoin, web BTC feature)

AI-assisted review. Not an independent professional audit.
Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree). All file:line refs are to that snapshot.

## Summary

| Severity | Count |
|---|---|
| critical | 0 |
| high | 1 |
| medium | 2 |
| low | 3 |
| info | 2 |

Main result: the PayJoin **receiver** takes the sender's claimed `witness_utxo` amounts as fact. It uses them to size its own fee share. A hostile sender can make the receiver burn up to about one third of its largest UTXO as miner fee (BITCOIN-01). This is new. The prior self-review (PJ-04) covers only the reverse direction, a receiver lying to the sender.

BIP-352 core (input extraction, input_hash, label tweaks, the k counter, taproot parity, sender grouping, spend key derivation, sighash) matched the BIP text and reference code on every point I checked. No finding there. The weak points are the trust boundaries around scanning: block data from Esplora or BlindBit, and per-block output metadata.

Package status: `btc-payjoin` is library-only, not wired into `apps/*`, and testnet-only (mainnet refused in code). `apps/web/src/features/btc` is testnet/signet/regtest only, with mainnet disabled. Severities rate the code as written, as if it were deployed. Current real-money exposure is nil.

## Method

- Static read of every non-test source file in `packages/btc-silent-payments/src`, `packages/btc-payjoin/src` (except the `ffi/` body, which got a skim only) and `apps/web/src/features/btc`.
- Compared against `test-vectors/bip-0352.mediawiki` and `reference.py`, and the BIP-78 sender/receiver checklists (from memory and the package docs; the BIP-78 text itself is not in the repo).
- Read prior reports so I would not re-report them: `docs/remote/audits/{security,bugs,code}-btcapps.md`, `docs/remote/privacy-specs/audit-btc-payjoin.md`, `docs/audits/0*.md`, and both packages' `DEVIATIONS.md`.
- No code was executed. There is no `node_modules` in the snapshot, and the rules say not to run JS in the live tree. Exploit arithmetic below was worked by hand from the code.

## Findings

### BITCOIN-01 (high): PayJoin receiver trusts sender-claimed input amounts; a hostile sender makes it burn up to ~1/3 of a UTXO in fees

- Files:
  - `packages/btc-payjoin/src/psbt.ts:95`: `witness_utxo` is returned unverified.
  - `packages/btc-payjoin/src/receiver/checks.ts:78,86-89`: `F0` is computed from claimed amounts, and only a lower bound on feerate is checked.
  - `packages/btc-payjoin/src/receiver/contribute.ts:171,192-199,225-238`: `extra = ceil(F0*vi/V0)`, the candidate filter is `u.amount > 3*extra`, `own = extra - sc`, and the payment output is reduced by `own`.
  - `contribute.ts:271-277`: the sender `witness_utxo` is copied into the proposal.
  - `contribute.ts:297-299`: the receiver signs, then `verifyKeyPathInput` checks against the same claimed amounts.
- Mechanism: the receiver never checks the Original's sender input amounts against the chain. In interactive mode nothing checks them. In non-interactive mode `testMempoolAccept` (`checks.ts:103-107`) only returns a bool, and the real Original is valid, so it passes. When the receiver contributes a segwit v0 input (P2WPKH or P2SH-P2WPKH), its BIP-143 signature commits only to its own amount. So the inflated claim never invalidates the final transaction. `contribute.ts:205-207` prefers the sender's script kind, so a P2WPKH sender gets a P2WPKH receiver input.
- Exploit (hand-computed, 1 sat/vB):
  1. Attacker has one real P2WPKH UTXO of 100 000 sat. The invoice is 10 000 sat to a receiver with P2WPKH UTXOs of 50 000 and 1 000 000 sat.
  2. The attacker builds a valid Original (fee 141 sat, vsize ~141) and signs it with the real amount. In the PSBT it sets `witness_utxo.amount = 100 000 + 690 344`, and it omits `additionalfeeoutputindex`, so `sc = 0`.
  3. The receiver computes `F0 = 690 485`, `extra = ceil(690 485*68/141) ≈ 333 000`. The 50 000 UTXO fails the `> 3*extra` filter. The 1 000 000 UTXO is chosen, and `own = 333 000`. The payment output becomes `10 000 + 1 000 000 - 333 000 = 677 000`, which passes `newPayment >= payment.amount`. The receiver signs.
  4. The attacker signs its own input (real amount) and broadcasts through a node with `maxfeerate=0`. The on-chain fee is 333 141 sat. The receiver has lost 333 000 sat to miners. The attacker paid only the 10 000 sat invoice.
- Repeatability: once per address in interactive mode (`receiver/session.ts:348`). Unbounded in non-interactive mode (the `seen` store only blocks reused sender outpoints, and the attacker uses fresh ones). A miner-attacker gets the burned value.
- Fix:
  - (a) Get sender prevouts from the receiver's own node (`gettxout`, or compare `testmempoolaccept` `fees.base` with `psbtFee`), and reject any mismatch.
  - (b) Independently cap the receiver's share with an absolute bound, e.g. `own <= ceil(maxPolicyFeerate * vi)`, not one proportional to the claimed `F0`.
  - (c) Add a regression test with an inflated `witness_utxo`.
- Confidence: high (logic traced end to end; not executed).

### BITCOIN-02 (medium): Scanner attaches output metadata by x-only key; a second output to the same key later in the block hides the real payment

- Files:
  - `packages/btc-silent-payments/src/scan/scanner.ts:61-63,67-75`: `byKey.set(toHex(key), o)` keeps the last output with that key.
  - `apps/web/src/features/btc/esplora.ts:406-411`: outputs are pushed in block order.
  - `apps/web/src/features/btc/scan.ts:607-626`: the found outpoint and amount come from that metadata, and the spent ones are dropped.
- Exploit:
  1. A payer (or anyone who learns the output key P, e.g. the payer's counterparty) sends the real SP payment in tx1.
  2. In the same block, they put tx2, which pays 330 sat directly to `OP_1 <P>` and has at least one eligible input. tx2 spends tx1's change, so it must come after tx1 in the block.
  3. The scan matches P once, but reports tx2's outpoint and amount. The app shows 330 sat and sweeps only that. The real tx1 output is never shown.
  4. After the dust is swept, rescans count it as "already spent", so the real output stays hidden for good.
- Impact: the funds are not stolen, since the key is unchanged and another BIP-352 wallet would find them. But they are hidden and cannot be swept from the app, and the received amount is misreported. The same applies to BlindBit `/utxos` data.
- Fix: key the metadata by `(xonly)` into a list, and emit one result per outpoint. Better, run the scan per transaction (tweak and output set belong together, as `EsploraTweakSource` already has them) instead of one block-wide candidate set.
- Confidence: high for the mechanism. Medium for realism (needs same-block ordering, which the descendant trick makes deterministic).

### BITCOIN-03 (medium): The Esplora server is fully trusted for chain data and can fabricate incoming silent payments

- Files:
  - `apps/web/src/features/btc/esplora.ts:304-321`: block hash and txs are taken as given, with no header, PoW or merkle check.
  - `esplora.ts:324-329`: `isUnspent` is taken as given.
  - `esplora.ts:350-353`: only the genesis hash is checked.
  - `apps/web/src/features/btc/scan.ts:587-628`.
  - `apps/web/src/features/btc/BtcView.tsx:187`: the hint says only that the server "cannot see your keys".
- Exploit: anyone can derive an SP output for the user's public `tsp1` address (the sender side needs only public keys). A malicious or compromised Esplora server picks any input key `a` and invents a block tx with prevout `OP_0 <hash160(aG)>`, a witness `[sig, aG]` and an output to `B_spend + t_0*G`, with any amount. `scanForPayments` reports it as a received, unspent payment. A merchant who uses this view to decide that an invoice was paid ships against a fake payment. Sweeping it "succeeds" if the broadcast goes to the same server (`esplora.ts:340-344` trusts the returned txid).
- Relation to prior: this extends `security-btcapps.md` M3 (BlindBit metadata trusted) from metadata to whole fabricated payments, and adds the web Esplora path, which did not exist then.
- Fix: say in the UI that the server can show fake or hide real payments. Cross-check found outpoints against a second, independent source before treating them as received. Long term, validate headers (PoW chain from a checkpoint) and the merkle inclusion of the found tx.
- Confidence: high.

### BITCOIN-04 (low): PayJoin sender, the receiver can redirect the sender's fee contribution to itself (extends PJ-04)

- Files: `packages/btc-payjoin/src/sender/checks.ts:97-99` (receiver prevout from the proposal), `:110` (`psbtFee` with claimed amounts), `:172-179` (contribution caps measured against the claimed `additionalFee`); `sender/session.ts:400` (`checkFinalFeeRate` uses the same claimed amounts).
- Exploit: the sender has v0 inputs and sets `maxAdditionalFeeContributionSats = M`. The receiver claims its input is worth `R + c` (real `R`), takes `c ≤ min(M, F0*vSender/V0)` from the sender's change, and adds `c` to its own payment output. With substitution allowed, the payment output is unchecked (`checks.ts:152`). The claimed `additionalFee` is `c`, so every check passes. The real fee is unchanged, so the sender pays `c` to the receiver, not to miners, and `minfeerate` is not really enforced. With taproot sender inputs the tx is invalid instead, because BIP-341 commits to all amounts.
- Impact: bounded by the contribution cap (about one input's fee). PJ-04 noted the fee or propagation effect but not the value transfer.
- Fix: as PJ-04 says, add an optional prevout lookup. Also, when `witness_utxo` only is present for receiver inputs, pass `maxadditionalfeecontribution` only if a lookup is available.
- Confidence: high.

### BITCOIN-05 (low): Light-client scanning stops at the first missing k; spent outputs omitted by the source hide later outputs of the same tx

- Files: `packages/btc-silent-payments/src/receiver.ts:145,166` (`break` on the first k with no hit); `scan/blindbit.ts:257-274` (`/utxos`; DEVIATIONS says it is unverified whether spent outputs are omitted); `scan/scanner.ts:63`.
- Scenario: a sender pays the receiver twice in one tx (k=0 and k=1). The receiver, or another device with the same seed, spends the k=0 output. A later rescan through a BlindBit oracle that lists only unspent outputs finds no match at k=0 and stops, so k=1 is never found. The Esplora path is not affected (it lists all outputs, `esplora.ts:406-411`).
- Fix: when the source may omit spent outputs, use a source that provides spent outputs too (BlindBit's `/spent-outputs`, or full-block data), or document the limit next to `BlindBitClient`.
- Confidence: medium (depends on oracle behaviour that is documented as unverified).

### BITCOIN-06 (low): Broadcast goes to whatever is in the URL field, which may not be the network-checked server

- Files: `apps/web/src/features/btc/BtcView.tsx:64-67` (`client()` builds from the current `url`), `:140-151` (`doBroadcast` does no `checkNetwork`); the URL input `:190` is not disabled after the scan.
- Scenario: the user scans against server A, then edits the URL (a typo, or a pasted lookalike) and broadcasts. The signed tx goes to an unchecked server B. That leaks the tx origin and IP to B, and B can claim acceptance (fake txid, `esplora.ts:342-343`) without relaying. No fund loss.
- Fix: bind the client used for scan, review and broadcast. Lock the URL field while a scan result exists, or run `checkNetwork` before broadcast and compare the returned txid with `signed.txid`.
- Confidence: high.

### BITCOIN-07 (info): PayJoin sender does not check that receiver inputs match the sender's script type

- File: `packages/btc-payjoin/src/sender/checks.ts:82-102`. There is no script-type comparison for added inputs. The receiver side prefers the same type (`receiver/contribute.ts:205-207`), but a third-party receiver could add, e.g., P2PKH to an all-P2TR tx, which makes the payjoin easy to fingerprint.
- Earlier BIP-78 versions had a MUST "no mixed input types" rule. I did not confirm whether the current BIP text still has it (the text is not in the repo). Privacy only.
- Confidence: low.

### BITCOIN-08 (info): Untrusted `pj=` URLs may point to loopback over plain http

- File: `packages/btc-payjoin/src/uri.ts:241`. `parsePayjoinUri` accepts `pj=http://127.0.0.1:<port>/...` from any scanned URI, and `transport/v1-http.ts:168-174` then POSTs to it. A malicious invoice can make a sender's wallet POST a base64 PSBT to a local service.
- Impact: low (fixed text body, `redirect: 'error'`). Consider allowing loopback only when the network is `regtest`.
- Confidence: high.

## Previously reported items: still open in this snapshot (not re-counted)

| Prior ID | Status | Snapshot location |
|---|---|---|
| bugs-btcapps M2 (leftover up to `feeNoChange + dust` burned without a change address, contradicting DEVIATIONS) | still present | `packages/btc-silent-payments/src/spend.ts:288-289` |
| bugs-btcapps L1 / security-btcapps I8 (`Math.round(feeRate*1000)` gives a zero fee for feeRate < 0.0005) | still present | `spend.ts:92-95` |
| bugs-btcapps L2 (`encodeURIComponent` lone surrogate throws `URIError`) | still present | `uri.ts:187-188` |
| bugs-btcapps L3 / security-btcapps L1 (BlindBit no default timeout, full body read before caps) | still present | `scan/blindbit.ts:185-201` |
| security-btcapps L2 (BlindBit accepts plain http for any host) | still present | `scan/blindbit.ts:178` (the web Esplora client restricts http to loopback, `esplora.ts:179-180`) |
| security-btcapps M3 (oracle metadata trusted) | still present; widened by BITCOIN-03 | `scan/scanner.ts:67-75` |
| PJ-01 (in-memory SeenInputs), PJ-04, PJ-06 | open, as documented | `receiver/seen.ts` |

No regressions found: nothing previously marked fixed was broken again.

## Checked, no finding

- `inputs.ts`:
  - P2PKH: backwards 33-byte window with a HASH160 match, as in the reference.
  - P2SH-P2WPKH: stricter than the reference.
  - P2WPKH: last witness item.
  - P2TR: annex removed only when stack > 1; NUMS internal key skipped; output key `lift_x`.
  - Uncompressed keys excluded.
  - `spendsFutureSegwit`: v2..v16 tx skipped.
- `receiver.ts`/`sender.ts`:
  - `input_hash` uses `outpoint_L` over ALL inputs (serialized little-endian txid and vout, smallest byte-wise).
  - `A` = sum of eligible keys; the sender negates odd-y taproot keys.
  - `t_k = hash_SharedSecret(ecdh || ser32(k))` with k counted per `B_scan` group in recipient order.
  - `K_MAX` = 2323 on both sides.
  - Labels: `hash_Label(ser256(b_scan) || ser32(m))`; change label m=0 always scanned; x-only comparison covers both parities.
  - Zero and out-of-range scalars fail closed.
- `spend.ts`:
  - Key = `b_spend + tweak`, negated for odd y.
  - No extra BIP-341 tweak.
  - SIGHASH_DEFAULT over all prevouts.
  - Independent schnorr verify and exact vsize check.
  - Duplicate-input rejection.
  - SP destinations derived over all (P2TR, eligible) inputs.
  - Network-bound address decoding.
  - RBF 0xfffffffd.
- `keys.ts`/`bip32.ts`: paths `m/352'/coin'/acct'/{1',0'}/0`; hardened/non-hardened per BIP-32; fail-closed on an invalid child.
- `address.ts`/`bech32m.ts`/`uri.ts`: strict decode, version 31 rejected, v0 exactly 66 bytes, network enforced.
- Web: no secret persisted; seed zeroized after derivation (string copies remain, documented); review-equals-signed check (`sweep.ts:75-99`); genesis check refuses mainnet.
- PayJoin sender checklist (`sender/checks.ts`): version and locktime, sequences, sender input order and presence, not finalized, receiver inputs finalized, fee not lower, output order, fee-output caps (three bounds), `pjos`, `minfeerate`.
- PayJoin receiver: finalized, no keypaths, not-mine, seen, sequence uniformity, payment amount, one-UTXO contribution, own-signature verify (P2WPKH and P2TR).

## Not reviewed

- `packages/btc-payjoin/src/ffi/index.ts`: skimmed only. The v2 adapter is self-declared unbuilt.
- `transport/memory.ts`, `modes.ts`, `errors.ts`, and the `units.ts` parsing edge cases (light read).
- All test files, `e2e/`, `reference.py` execution, and fixture correctness.
- `@noble/*`, `@scure/btc-signer` and `@scure/base` internals, and lockfile integrity (supply chain is out of this area's depth).
- Whether `@scure/btc-signer` `fromPSBT` has any amount sanity check that would block BITCOIN-01/04. I believe it cannot, without the previous tx, but did not read its source.
- Runtime behaviour: no node, Esplora, BlindBit or PayJoin peer was run. No PoC was executed (static review only).
