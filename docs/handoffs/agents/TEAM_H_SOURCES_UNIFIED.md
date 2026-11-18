# Team H source selection and inclusion verification

Date: 2026-11-16. Branch: `codex/unified-btc-sources`. Root base: `25bbf1e3c87b9b2d8feeeeaca804027511b18608`. Worker final handoff `349b9a0c` cherry-picked as `9f20a5e1`. Pure inclusion helper `1eb2c4c8` and coinbase correction `a4496071` cherry-picked as `359e0838` and `740a3d26`; independently reviewed by final_review.

## Implemented behavior

The full Bitcoin view defaults to its existing Esplora source. A user may select a separate BlindBit HTTP endpoint or HTTPS gRPC-Web endpoint, then choose full-block agreement or light scanning. There is no default oracle and no request on editing/selecting fields. Endpoints must have separate origins, but UI explicitly says that different URLs do not establish operator independence. Exact network and unfiltered full-index capabilities are required.

Full-block mode retains all current Esplora txid/Merkle/header and BIP-141 witness checks and compares complete tweak/output multisets for every scanned block before scanning or checkpointing it. Existing Esplora extraction excludes coinbase and ineligible transactions before collecting outputs. An added, omitted or changed oracle entry fails closed, including no-match blocks. Full mode retains full-block download costs.

Light mode uses oracle scan data but requires each matched output's raw transaction and Merkle inclusion proof against a locally checked header. The verifier recomputes the txid, exact output index, amount and taproot script; rejects coinbase and malformed branch/header/height evidence. The mandatory hook covers new blocks, recovered history and resumed blocks, before matching-block checkpoints. Results additionally require the existing current outspend check. Sweep review/broadcast continues its fresh outpoint check. Restored metadata never becomes spend authority without re-derivation and fresh proof.

An optional second oracle cross-checks every block in either mode, without communicating match decisions. Light proof/outspend queries reveal matching transaction IDs/outpoints to Esplora. UI accurately states that inclusion does not validate witness data, previous outputs, scripts, all consensus rules, payment completeness or the best chain; colluding oracles may omit payments and spent status is still server-reported.

Scan keys remain inside the worker operation. The worker has no network API: typed public-height oracle requests and allowlisted Esplora GET paths cross bounded main-thread bridges. Each oracle operation has a 30-second absolute deadline including stalled body/fetch, response caps, at most two pending operations, abort cleanup and late-response disposal. Requests omit credentials/referrer, reject redirects and bypass cache. No dependency or worker bundle-guard edits.

Every source/mode change aborts the active session, wipes results and review/signature state, clears loaded metadata and disables saved continuity until reselected. Oracle saved state uses a cryptographic wallet/network/source policy scope including normalized Esplora, primary protocol/URL, mode and second endpoint. URLs are not stored in plaintext. Default full-block history remains compatible and freshly revalidates matches.

Mode A already operates through an own-node Esplora with local tweak extraction. A second browser-facing direct bitcoind adapter would duplicate this architecture and add credential/CORS handling without a required security benefit. Mode C remains absent and ADR-gated; mainnet stays disabled.

## Validation evidence and integration dependencies

- Red light worker tests: seven light cases refused by the temporary safety gate before mandatory proof integration; five full/transport cases passed.
- After proof integration: 22/22 source/worker cases passed, covering both protocols, forged amount/raw/Merkle, second-source omission on no-match blocks, restored proof failure, network/capability and stalled-fetch cancellation.
- Expanded BTC selection: 195 passed, 1 skipped, with one expected disclosure source-constant mismatch from the updated availability string; the constant is corrected in this change. This run includes the new explicit-source UI, deadline/body/concurrency and policy-scoped encryption tests.
- Inclusion helper: 64 focused parser/header/proof tests; helper coverage 100%; package typecheck/lint/build passed. Independent reviewer reran 34 helper tests, including coinbase rejection.
- Final sequential web typecheck and all changed source/test ESLint passed with a 1536 MB heap. Earlier concurrent runs ended with exit 137 under shared memory pressure and do not count as passes. Full and lean Vite builds both passed, followed by unchanged bundle guards (20 and 18 emitted files respectively). Full includes the 100.38 kB Bitcoin worker; lean excludes it. Existing bundle-size/QR dynamic-import advisories remain. No running checks.
- Root owns locale catalogs and security classification. Exactly 16 new keys and updated `btc.verification.mode.other.available` were supplied in `/tmp/ghostpay-btc-source-messages.json`. Temporary local catalog overlays are excluded from this source commit. Integration must include those keys in explicit critical security classification before locale tests can pass.
- Real BlindBit deployment/proxy and real-node regtest acceptance remain unperformed. Fixtures establish protocol and local behavior, not third-party availability or device/browser acceptance. Existing worker browser test is preserved; local Chromium execution is unavailable due sandbox `socket EPERM`.

No remote push, deployment, signature, approval receipt or release operation was performed by this lane.

## Review follow-up

Independent final_review passed 34/34 new-source, bridge, UI and policy tests. The reviewer found a distinct-tweak cap consistency issue in rejected-proof cleanup; fresh proof and result acceptance now use the same bounded tracker. A separate full-web regression was reproduced: all 5 Bitcoin cases in the chain-view locale fixture failed because jsdom had no Worker factory. The fixture now injects the existing structured-clone harness around the production protocol; all 17 cross-chain outcome tests remain intact. Final focused rerun passed 30/30 (all 17 chain outcomes, 12 worker oracle tests, 1 disclosure parity test). No expectations were weakened.

## Proof endpoint provenance

Checked on 2026-11-16 against primary documentation: [Blockstream Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md) documents `/tx/:txid/hex`, `/tx/:txid/merkle-proof`, `/block/:hash/header` and outspend routes. Its Merkle response follows [ElectrumX `blockchain.transaction.get_merkle`](https://electrumx.readthedocs.io/en/latest/protocol-methods.html#blockchain-transaction-get-merkle): `block_height`, a deepest-first hash branch, and zero-based `pos`. No invented proof endpoint or production-service default is used. This documentation check establishes the wire contract, not availability of any selected deployment.

## Final integration pins

Product implementation: `d5632c9e`; reviewed source follow-up: `d9ba125300eb4f90e64d92da949a0ea843dfc519`. Root already has worker final source `349b9a0c`; do not duplicate its `9f20a5e1` cherry-pick. Source claim `c24f85cd` precedes `d5632c9e` because that commit updates its ACTIVE_WORK section. Helper prerequisites are `1eb2c4c8` then `a4496071` (or equivalent `359e0838` then `740a3d26`). Root integrates its own catalogs/security groups and helper handoff. Independent final_review cleared product source `d9ba1253`, with 34/34 new selection tests and another 12/12 worker rerun after the cap fix.

Logs are in `/tmp/ghostpay-btc-source-{types-sequential,lint-sequential,full-build,full-guard,lean-build,lean-guard}.log`; focused outcome log `/tmp/ghostpay-chainviews-worker-green.log`. Full/lean module reports are `/tmp/ghostpay-btc-source-{full,lean}-modules.json`. These are local reproducible check artifacts, not release or approval evidence. Temporary locale overlays remain uncommitted for review; root owns final merge and critical classification. No dependency edits or shared-root build output mutations occurred.
