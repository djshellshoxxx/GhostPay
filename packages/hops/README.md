# @ghostpay/hops

Delayed multi-hop forwarding (`HOP-0` off, `HOP-N` delayed-forwarding). **Labelled Weak.** Testnet-only proof of concept (chain ids 31337, 11155111, 84532). Pure logic: no network calls, no chain submission; relayer, chain reads, store and address source are injected interfaces.

## What it does
- `planHops`: plan `k` (1..4) sweeps `S1 -> S2 -> ... -> S(k+1)=D`, full balance each, fresh one-use address per leg from an injected `HopAddressSource`, CSPRNG delay per leg (default 10 min .. 12 h, total cap 7 d), relayer rotation, fee cap (default 500 bps total, 300 bps per leg).
- `previewCost`, `fingerprintReport`: per-leg fee, total vs single sweep, delay range, amount ladder and candidate origin range.
- `reduce`: pure leg state machine; persist-before-sign (`signing` stores nonce + deadline before any signature exists).
- `runHopLeg` / `resumeLeg` / `resumePlan`: fresh quote at due time, balance read, sign inside `withSecretAt` using `chain-adapters` (`buildSweepTypedData`, `signSweep`, `signPermit`), submit via `RelayerClient`; crash recovery by `nonceUsed`.
- `handoffInfo`: pool-exit terminal address; hop delay credited to pool dwell is always 0; post-exit forwarding rejected.
- `labels`: mandatory copy (title, five body points, N1..N9), banned-word grep pattern.
- Stores: `serializePlan`/`parsePlan` (refuses `sig|signature|rawTx|privateKey|secret` keys), memory store, optional sealed store over an abstract `Sealer` (wrap `@ghostpay/secret-box` in the app; not a dependency here).

## Options and defaults
Off by default. `hops` default 2 when enabled (0 with pool-exit; max 2 there). `relayerSelection` default `rotate`. `finalDestination` default `self-derived`. `ackWeak: true` is required (`NOT_ACKED` otherwise). Tokens without ERC-2612 permit: `NO_PERMIT`. `direct` only with 1 hop and is **not implemented** (`DIRECT_UNSUPPORTED`).

## Does NOT protect (verbatim in `labels.LIMITATIONS`)
The payer and any block-explorer user can follow every hop; automated clustering links the chain; amounts are linkable; a small crowd is no anonymity set; the relayer sees every hop; network metadata unchanged; the pattern is a fingerprint; hops before a pool add nothing and hops after a pool exit are pure cost; testnet only. It adds delay and cost, not unlinkability. Test `AT-HOP-NEG-1` demonstrates a forward tracer recovering `D` in 200/200 single-user plans.

## Not verified (UNVERIFIED)
- Anvil e2e against the real `GhostPaySweepRelayer` and mock `PermitToken` (spec test 3, acceptance 2, 5) was NOT built or run. Signatures are checked in tests by recovering the signer from the EIP-712 digest with the repo's own `chain-adapters` builders, not by the contract.
- Real relayer HTTP adapter, `@ghostpay/hygiene` wiring, UI, Tor/proxy (HOP-RLY-3 is an adapter concern), AT-HOP-RLY-1 (relayer-side tests; relayer source untouched).
- Spec's Kappos et al. / Wang et al. claims not re-fetched.

## Test
`npm test` in this directory (vitest + coverage). See `DEVIATIONS.md`.
