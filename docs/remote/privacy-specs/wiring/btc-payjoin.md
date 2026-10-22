# Wiring: `@ghostpay/btc-payjoin`

Status: **not wired**; this is the exact list of edits for the integration swarm. Package state and limits: `packages/btc-payjoin/README.md`, `DEVIATIONS.md`. Testnet/signet/regtest only.

## 1. The one export needed in `packages/btc-silent-payments` (spec 7.2 item 1)

Do not edit it from the PayJoin lane; the integration swarm adds it. Purpose: let the PayJoin receiver sign a detected silent-payment P2TR output as its contributed input (BPJ-RCV-9).

Add to `packages/btc-silent-payments/src/spend.ts` and re-export from `src/index.ts`:

```ts
/**
 * Signs input `index` of `tx` as a silent-payment key-path spend. Does NOT finalize.
 * The output key of a silent payment is final: never apply a BIP-341 taproot tweak
 * (do not use Transaction.signIdx with tapInternalKey).
 * @param tx    mutable Transaction whose EVERY input already has witnessUtxo (script + amount):
 *              the BIP-341 sighash commits to all prevouts.
 * @param index input to sign.
 * @param output the spent SpendableOutput (txid/vout/amountSats/xOnlyPublicKey/spendTweak).
 * @param spendSecret wallet spend key (SecretScalar).
 * @throws SilentPaymentError INVALID_INPUT when the derived x-only key differs from output.xOnlyPublicKey,
 *         SIGNATURE_INVALID when the noble verification of the fresh signature fails.
 */
export function signSilentPaymentInput(
  tx: Transaction, index: number, output: SpendableOutput, spendSecret: SecretScalar,
): void
```

Implementation: the body of the per-input loop in `buildSpendTransaction` factored out: `spendPrivateKey(spendSecret, output.spendTweak)`; compare x-only key with `output.xOnlyPublicKey`; collect `scripts`/`amounts` from `tx.getInput(i).witnessUtxo` for all inputs; `digest = tx.preimageWitnessV1(index, scripts, 0, amounts)`; `tx.updateInput(index, { tapKeySig: schnorr.sign(digest, key) })`; verify with `schnorr.verify`; zeroize the key. `buildSpendTransaction` must call the helper so there is one signing path. Add tests: helper output equals the old path on the existing spend vectors; wrong tweak throws; the 299 existing tests stay green.

The PayJoin side then needs no dependency on that package. The wallet maps a `SpendableOutput` to a `Utxo`:

```ts
{ txid, index: vout, amount: amountSats, script: Uint8Array.of(0x51, 0x20, ...xOnlyPublicKey),
  source: 'silent-payment', inputVsize: 58 }
```

and implements `ReceiverWallet.signInput(tx, index, utxo)` by calling `signSilentPaymentInput(tx, index, spendableOutputFor(utxo), spendSecret)` when `utxo.source === 'silent-payment'`. The core then finalizes the input and verifies the signature (`verifyKeyPathInput`) before releasing the proposal. Set `ReceiverContext.contributeFromSp: true` only when the seller opts in (setting `contributeFromSp`).

Caveat to keep in the UI copy: contributing a silent-payment UTXO links that UTXO to a PayJoin transaction; it does not make PayJoin and silent payments "work together" (BPJ-SP-1/-2).

## 2. Seller wallet (receiver side), `apps/web` or a Node/CLI host

1. Construct `ReceiverWallet` from the seller's own UTXO source: `isMine`, `listSpendable`, `signInput`, and for non-interactive mode `testMempoolAccept` (node RPC `testmempoolaccept`). Software keys only, as `buildSpendTransaction`.
2. Provide a **persistent** `SeenInputs` (IndexedDB in the browser, a file or DB in a host). The in-memory class is for tests; a restart otherwise reopens the probing and re-entrancy windows (BPJ-RCV-3). Share it with the SP scanner state backup (spec Q5) if desired.
3. Provide `ExposedUtxos` persistence so an exposed UTXO is reused first (BPJ-RCV-10).
4. One fresh receiver address per invoice from a **separate branch** (`m/84'/1'/account'/0/i` P2WPKH or `m/86'/1'/...` P2TR), never an `sp1`/`tsp1` address (`addressToScript` refuses those with `uri_conflict`).
5. Open a session: `transport.openReceiverSession({ address, network, amountSats, expirySeconds, outputSubstitution })`, show `session.uri` (build the full URI with `buildPayjoinUri`), then loop `receiverSession.serve(session)` until the invoice expires or is paid. Interactive mode allows one live Original per address.
6. v1 needs an endpoint reachable by the payer: `new V1HttpTransport({ listen: nodeListen })` binds **loopback only**; expose it through a TLS terminator or an onion service (see `docs/remote/onion-i2p-research.md`). `http` to a non-loopback, non-`.onion` host is rejected by the URI validators.

## 3. Payer side

`SenderSession.open({ uri, utxos, feeRateSatPerVb, changeAddress, signer, transport, now, params })`, then `poll()` until `ready` / `fallback` / `failed`; broadcast `txHex` and call `markBroadcast('payjoin')`, or on `fallback` broadcast `txHex` and call `markBroadcast('fallback')`. The UI MUST show which path occurred (spec risk 5), show only the local error code descriptions (never remote text), and refuse any URI whose `parsePayjoinUri` throws. `signer` is a `PsbtSigner` over the payer's software keys (hardware wallets are out of scope and are weaker here: BIP-78 "double payment risk").

## 4. Invoice creator UI (swarm 4)

- Add a `btcMode` selector with `BTC_MODE_INFO` (`plain | silent-payment | payjoin-v1 | payjoin-v2`); render `limits` next to the choice. `payjoin-v2` must be disabled until a concrete `FfiBackend` exists (`DEVIATIONS.md` 8).
- A bitcoin URI must carry either `sp=` or `pj=`, never both; call `parsePayjoinUri(uri, network)` on anything pasted.
- Copy rules: no "anonymous", "untraceable" or "mix" wording; no GhostPay fee on this step; state N1..N8.
- Settings (spec 5): `directoryUrl`, `ohttpRelayUrls[]`, `maxSessionSeconds` (3600), `contributeFromSp`, `fallbackOnFailure`.

## 5. Repo edits outside the package

| File | Edit |
|---|---|
| `package.json` (root) | none: `workspaces: packages/*` picks the package up; `build:libs` not needed (nothing depends on it yet) |
| `.github/workflows/ci.yml` | add `btc-payjoin` to the `rest` set automatically (workspaces other than the named ones); optional job running `npm run test:e2e -w @ghostpay/btc-payjoin` with `BITCOIND_BIN` and `REQUIRE_BITCOIND=1` after fetching a pinned bitcoind (the e2e skips when unset) |
| `THIRD_PARTY.md` | add `payjoin` 0.25.0 (optional peer, only if the ffi entry is used; license not declared in the npm package, owner decision) and the test-only bitcoind binary (Bitcoin Knots v29.2.knots20251110, MIT) |
| `docs/user/privacy-limits.md` | add the N1..N8 list for PayJoin invoices |
| `docs/MULTICHAIN_SPEC.md` | pointer to the PayJoin spec and this package (docs only) |
| `package-lock.json` | regenerated by `npm install --ignore-scripts` (the `payjoin` peer is optional and not installed) |
