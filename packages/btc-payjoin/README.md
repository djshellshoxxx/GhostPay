# @ghostpay/btc-payjoin

BIP-78 PayJoin policy core in strict TypeScript, a `PayjoinTransport` interface with an in-memory transport and a v1 HTTP transport, and an **optional, unverified** BIP-77 (v2) adapter over `payjoin-ffi`. Spec: [`docs/remote/privacy-specs/btc-payjoin.md`](../../docs/remote/privacy-specs/btc-payjoin.md). Wiring: [`docs/remote/privacy-specs/wiring/btc-payjoin.md`](../../docs/remote/privacy-specs/wiring/btc-payjoin.md). Self review (AI-assisted, **not** an independent audit): [`docs/remote/privacy-specs/audit-btc-payjoin.md`](../../docs/remote/privacy-specs/audit-btc-payjoin.md).

**Testnet only.** Bitcoin `testnet`, `signet`, `regtest`. `mainnet` is not representable and every entry point refuses it (`network_not_allowed`, BPJ-GEN-1). Private, ESM, `UNLICENSED`. **Not wired into `apps/*`.**

## What it does and does not give you

PayJoin makes the payee add one input to the payer's transaction, which weakens the common-input-ownership heuristic and hides the real payment amount from simple analysis. It is **not** a mixer and **not** unlinkability. Limits (spec section 2), which any UI must repeat:

- N1: no silent-payment property; the payee address is visible to the payer.
- N2: not a mixer; the receiver input binds the receiver's UTXO history to this transaction.
- N3: the payer learns one receiver UTXO per attempt (UTXO probing; mitigations are partial).
- N4: directory and relay (v2) see timing and sizes; one operator running both voids OHTTP separation.
- N5: either party can broadcast the original, fully linked transaction at any time.
- N6: wallet support is uneven; a payer without PayJoin pays the plain address.
- N7: network-layer exposure (node or Esplora IP) is unchanged.
- N8: mainnet is out of scope and enforced in code.

PayJoin and BIP-352 are mutually exclusive per transaction (BPJ-SP-1): `sp1`/`tsp1` addresses are refused (`uri_conflict`), a URI carrying both `sp=` and `pj=` is refused (BPJ-URI-2). BIP-352 advises against collaborative (CoinJoin-like) use because there is no formal security proof; a PayJoin has one receiver input and no silent-payment output, which is why it is outside that advice, and GhostPay still keeps the two apart.

## Modules

| Module | Content |
|---|---|
| `uri.ts`, `params.ts` | `bitcoin:` URI build/parse (v1 and BIP-77 fragment `EX`/`OH`/`RK`), BIP-78 query parameters |
| `sender/checks.ts` | `verifyProposal` (BIP-78 sender checklist, one error code per check), `checkFinalFeeRate` |
| `sender/original.ts` | Original PSBT builder (signed, finalized, no keypaths) |
| `sender/session.ts` | `SenderSession` state machine, fallback and exclusive-broadcast handling |
| `receiver/checks.ts` | `checkOriginal` (finalized, no leaks, not owned, never seen, broadcastable, invoice output) |
| `receiver/contribute.ts` | `buildProposal`: one-UTXO contribution, fee bump, sender fee-output contribution, optional output substitution, signature verification |
| `receiver/session.ts` | `ReceiverSession` state machine (one live Original per address when interactive) |
| `transport/*` | `PayjoinTransport`, `MemoryTransport` (no crypto), `V1HttpTransport` (+ `nodeListen`) |
| `ffi/` (`@ghostpay/btc-payjoin/ffi`) | lazy loader for `payjoin` 0.25.0, allowlist and operator-separation policy, `FfiBackend` adapter. **No concrete backend**, see DEVIATIONS |
| `modes.ts` | `BTC_MODE_INFO` table (data for the invoice-mode selector) |

## Tests

```bash
npm run typecheck && npm run lint && npm test                  # unit, vectors, property and fuzz tests; coverage thresholds 95/90/95/95
BITCOIND_BIN=/path/to/bitcoind npm run test:e2e                # regtest end-to-end; skipped when BITCOIND_BIN is unset
```

Unit tests include the BIP-78 appendix vector (`test-vectors/bip78-appendix.json`, provenance in `test-vectors/README.md`), one negative vector per sender check, per-check receiver tests, fast-check properties (honest proposals verify and conserve value) and fuzzing (malformed input only ever throws `PayjoinError`).

The regtest e2e was run against **Bitcoin Knots v29.2.knots20251110** (a Bitcoin Core fork; sha256 of the tarball matched the release `SHA256SUMS`, PGP signature not checked). `bitcoincore.org` and the `bitcoin/bitcoin` release assets were not reachable from the sandbox.

## Status

Library only. Real node: P2WPKH, P2SH-P2WPKH and P2TR payjoins were accepted by `testmempoolaccept`, broadcast and mined on regtest. **Not run:** any public network, any third-party wallet, `payjoin-cli`, a BIP-77 directory/relay, a hardware wallet. Everything else: [`DEVIATIONS.md`](./DEVIATIONS.md).
