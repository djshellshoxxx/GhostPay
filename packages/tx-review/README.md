# @ghostpay/tx-review

Pre-sign decoder and reviewer: turns the exact bytes about to be signed (transaction or EIP-712) into a closed `Intent`, compares it with what the user reviewed and with an allowlist policy, and refuses with machine-readable reason codes. Spec: [`docs/remote/specs/tx-review.md`](../../docs/remote/specs/tx-review.md).

- `decodeTx` / `decodeTypedData`: router `payERC20`, `payERC20WithPermit`, `payNative`; ERC-20 `approve` and `transfer`; native transfer; relayer `Sweep` and ERC-2612 `Permit`. Everything else is `{ kind: 'unknown', reason }`. Calldata must re-encode byte for byte (truncation, trailing bytes, dirty padding fail). `payERC20WithBuffer` and `payERC20WithPermitAndBuffer` are rejected (haiku L-04: buffer payments are not reviewable here).
- `review(intent, expected, policy, now, ctx?)`: `{ ok: true }` or `{ ok: false, reasons }`. Every rule and every compared field has its own `ReasonCode`.
- `assertReviewed(...)`: same, throws `ReviewRefusedError` carrying all reasons.

Dependencies: `viem` and `@ghostpay/chain-adapters` (ABIs, `decodePaymentCalldata`, typed-data type tables). Wired into `apps/web` through `lib/txGuard.ts`: `assertReviewed` runs before the direct sweep signature, both relayed-sweep typed-data signatures (sweep, permit), the ERC-20 approval and the router payment (not the buffer methods `payERC20WithBuffer` and `payERC20WithPermitAndBuffer`, which this package rejects by design). Nothing here has been checked against a real wallet or chain.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

## Status and deviations

Imported by `apps/web` (`txGuard.ts`); no external audit.
Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Scripts (`package.json`): `build`, `typecheck`, `test` (`vitest run --coverage`), `lint`.
