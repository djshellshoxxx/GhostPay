# OP Stack relayer cost accounting and receipt admission

R07-4 is implemented in an isolated worktree after the completed Solana/TRON compatibility packet. The optional
relayer now accounts for execution, L1 data and operator costs throughout quotation, admission, reservation and
settlement. Independent review also reproduced a pre-existing malformed receipt-status boundary; that separate R07
defect was authorized, tested first and fixed in the same receipt path.

## Source and integration

Base: `7be82871`, completed compatibility evidence. Final runtime: `de253aaf`; final test fixture/docs checkpoint:
`1ef57cee`. Claim: `d655260d`. Original requirement: #218 R07-4, historical documentation
`d894106e382c143c511912cb443cb980f5cf9731`, plus the coordinator's explicit contained-implementation directive.
This is a new implementation of that existing requirement, not a claim that the historical donor already fixed it.

Apply these commits in order after the compatibility packet:

`d655260d → a6bcaf38 → 0aef3a25 → 25ba30dc → 0b7fbfba → 6d23e5b6 → f3c0c795 → 2af11e38 → de253aaf → 1ef57cee`

The corrected RED-only branch `49d68d7b` is an alternate pre-implementation baseline. Its one-line correction is
already cherry-picked as `25ba30dc`; do not apply both. This evidence commit follows the sequence above.

## Behavior and preservation

The existing OP predeploy and 2× reserve policy are retained. A quote uses the oracle's `getL1FeeUpperBound` with a
legacy unsigned RLP size bound: fixed ABI calldata sizes (420 bytes for sweep, 580 for permit), maximum-width native
transaction integers, EIP-155 fields and framing. No placeholder compression ratio is used. The oracle accounts for
signature overhead. Quote lookups share an in-flight request and TTL, bounded to two shapes per configured chain;
fee-oracle failures have a separate streak so healthy gas-price reads cannot erase an outage.

Both simulation-time fee checks include a fresh additional reserve for the actual selected entrypoint. Daily and
loss reservations cover it too. After signing, the exact unsigned envelope reconstructed from the signed legacy
transaction is repriced. A missing/malformed oracle answer or reserve overrun refuses before journal hash handoff
and broadcast. Order/feed deadlines are rechecked after those asynchronous reads. The quote MAC fields, signed
order, 110% sponsor multiplier, fee cap and amount authority are unchanged.

Actual settlement uses `gasUsed × signed gasPrice + receipt.l1Fee + operatorFee(gasUsed)`, without multiplying the
actual fee by the reserve factor. The operator call is pinned to the canonical receipt block hash. This delegates
fork selection to the existing oracle and avoids inventing an Isthmus/Jovian formula. Missing fees keep the transaction
unsettled, including after restart. Actual overages are recorded even when they exceed the daily cap; the existing
loss budget already supports actual overages. Prior-day/window handling is preserved.

The separate status fix admits only exact `success`/`reverted` in both receipt methods, before any OP fee lookup.
Malformed status returns a fixed lookup failure or a timeout while waiting, so it cannot be settled as a mined revert.
The independent probe demonstrates the old behavior in both pre-OP `a6bcaf38` and OP `0aef3a25`.

No web Sweep, privacy configuration, server padding, log wrapper, ingress restrictions, journal schema, quote ABI,
dependency manifests/lock, RPC URLs, cryptographic protocol or excluded owner paths changed. The JSON packet retains
hashes for production source and unchanged boundaries.

## Executed evidence

The package checks use pinned Node 22.23.4 and the shared qualification mutex. Coverage thresholds remain 95/90/95/95.
Package dependencies are independent copies, not a claimed clean npm-ci run. Anvil was required, not silently skipped;
the two prior-built contract artifacts have source parity and their byte hashes retained.

| Check | Actual result | Source | Seconds |
|---|---|---|---:|
| Corrected OP baseline |15 failed, 1 non-OP control passed |`49d68d7b`|17.612|
| Initial focused OP recovery |38/38 passed |`0b7fbfba`|12.694|
| Full relayer coverage, required Anvil |556/556, 21 files, 0 skips |`6d23e5b6`|296.016|
| Inherited receipt-status RED |16 failed, 8 valid controls passed, 38 unselected |`f3c0c795`|5.149|
| Post-status chain/restart/Anvil/OP selection |97/97, 4 files, 0 skips |`2af11e38`|19.589|
| Final runtime build |exit 0 |`de253aaf`|7.623|
| Final six-file scoped lint |exit 0 |`1ef57cee`|18.377|
| Final OP/status regression recheck |62/62, 0 skips |`1ef57cee`|3.531|

Full coverage at `6d23e5b6`: statements 96.98% (2506/2584), branches 92.92% (1656/1782), functions 98.20% (437/445),
lines 98.77% (2091/2117). Raw lcov is preserved. This precedes the separate status guard; the later 97-case selection and
62-case recheck bind the final delta. A full final-head 580-case run is not claimed.

Preserved failures matter: the first quote fixture used 150% instead of the published 110%; it was corrected and rerun
on unchanged runtime, proving the actual baseline quote 500000 versus required 1419000. The first build exposed
TS2345 in the optional blockHash spread; whole-object branches fix its discrimination while emitting identical RPC
objects. Initial lint reported two unused fake arguments and an async-without-await fixture; the correction removed
no assertions. Every raw result remains in the packet.

**Whole-package typecheck remains unqualified:** both local attempts ended with SIGKILL (-9), after 39.839s at 768 MiB
and 29.316s at 512 MiB, with empty compiler diagnostic logs. The successful runtime build is not substituted for a
whole-package typecheck pass. Combined-head/hosted qualification remains coordinator-owned.

## Independent review and external boundary

Independent `contract_security` review passed the OP implementation, exact receipt-status guard and equivalent
TypeScript parameter rewrite at `0aef3a25`, `2af11e38`, and `de253aaf`. The fixture cleanup was reviewed separately;
its 62-case recheck passed. Durable review: `docs/handoffs/agents/OP_FEE_SOURCE_REVIEW_20261119.{md,json}`, commits
`54648f0e` and `ef4e95d6`. Original read-only probe and raw status RED/97-case evidence are retained by that reviewer;
this packet also copies the probe byte-for-byte with hashes. That independent read-only probe records Node 24.22.3; it is separate from package qualification. Review is not a cryptographic audit.

Primary interface: [Optimism GasPriceOracle 1.6.0](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L2/GasPriceOracle.sol),
observed Git blob `ab6cdcf80c4fe4336aa0711d91982bc282c96f77` on 2026-11-19. The official size oracle is a practical
compression estimator. The 2× reserve cannot guarantee arbitrary future fee movements. Unsupported/missing/reverting
getters or canonical-block RPC calls fail closed; a genuine zero operator fee is accepted. No public OP-chain, real
wallet/provider, transaction broadcast or deployment acceptance was performed. Local mocked OP transports and
ordinary Anvil cover different qualification boundaries.

Machine-readable details, full command arrays, source hashes, raw byte hashes and all retained failures:
[`workflows-op-fees.json`](./workflows-op-fees.json).
