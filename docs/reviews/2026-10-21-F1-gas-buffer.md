# Phase B review: F1 gas buffer

Date: 2026-10-21. Reviewer: documentation author (self-run; not independent). Roadmap: `POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md` Feature 1. Related audits: 01 (F1-1..F1-6, G-30), 02 (contracts), 04 (D1).

## Scope reviewed

- Contract: `GhostPayRouter.payERC20WithBuffer` (`packages/contracts/src/GhostPayRouter.sol`; spec `CONTRACTS_SPEC.md` sections 1 and 3).
- Maths: `calculateBuffer` in `packages/chain-adapters/src/fees.ts`.
- Client: buffer sizing and quote lifetime (`apps/web/src/lib/pay.ts`), execution (`payExec.ts`), UI toggle and notice (`apps/web/src/views/Pay.tsx`).

## What the feature does

An opt-in (default off) native-coin amount is sent with an ERC-20 payment, in one transaction, straight to the one-time address, with no GhostPay fee. The amount is `ceil(gasEstimate x maxFeePerGas x (10 000 + safetyBps) / 10 000)`, using a fixed 100 000 gas sweep estimate, `2 x eth_gasPrice` as the max fee, a 20 % safety margin, a hard cap of 0.01 native coin and a 120 s quote lifetime (`apps/web/DEVIATIONS.md` item 12). It needs the user's RPC.

## Evidence (existing tests, by name)

| Check | Test |
|---|---|
| Formula uses ceiling rounding and bounds | `fees.test.ts`: "matches the roadmap formula with ceil rounding", "property: >= base and < base*(1+s)+1", "rejects bad input" |
| Buffer sized from RPC gas price, capped, unexpired only | `pay.test.ts`: "builds buffer payments with a capped, unexpired quote only", "sizes the buffer from the RPC gas price with 20 % safety", "fails closed when gas is absurdly high or the RPC misbehaves" |
| Default off, public-linkage notice, needs RPC | `Pay.test.tsx`: "gas buffer: default off; enabling shows the native amount and the public-linkage notice; needs an RPC", "gas buffer without an RPC explains what is missing", "native invoices offer no gas buffer" |
| ERC-20 flow with buffer: exact approval, prepare, send | `Pay.test.tsx`: "ERC-20 flow with a buffer: approves exactly, prepares a buffer payment, sends"; `payExec.test.ts`: "approves exactly the gross amount when the allowance is too low, and verifies it took effect" |
| Permit cannot be combined with a buffer | `payExec.test.ts`: "permit needs an RPC and cannot be combined with a buffer; native ignores permit" |
| Contract: buffer forwarded without fee, announced metadata, reverts | `GhostPayRouter.t.sol`: `test_buffer_forwardsValueWithoutFee`, `test_buffer_announcesErc20Metadata`, `test_buffer_revertsBufferRequired`, `test_buffer_revertsBufferTooLarge`, `test_buffer_revertsWhenStealthRejectsEth`, `test_buffer_revertsOnTokenFailure`; fuzz `testFuzz_bufferIsNeverCharged` (`GhostPayRouter.fuzz.t.sol`) |
| Preview equals calldata for the buffer path | `pay.test.ts` "REFUSES when the calldata was mutated after the preview was made" (shared gate; the buffer-specific assertion is part of the gate, not a separate test) |

## Checklist (Roadmap F1)

- [x] Opt-in, default off (tested).
- [x] Public-linkage notice shown (tested).
- [x] Stale/expired quote rejected; cap enforced (tested).
- [x] No automatic submission after a delay (see F6 review).
- [x] Atomic revert if any transfer or announcement fails (contract tests).
- [ ] Native amount **and a fiat estimate** shown separately: native amount only (audit F1-3).
- [ ] Invoice specifies buffer acceptance, maximum and refund behaviour: not in the schema (audit I-10, F1-5).
- [ ] Sweep-estimate failure fails closed **per token**: the estimate is a fixed constant, not a simulation (audit F1-2, F1-6).
- [ ] Tests for "fee spike between quote and send" with a real RPC: only mocks (`pay.test.ts` covers an absurdly high gas price, not a live spike).
- [ ] Wallet call = allowance **or permit** plus buffer: permit is disabled when a buffer is used because the router has no permit+buffer function (audit F1-4; the spec itself defines none). Costs the payer an extra approval transaction.

## Residual risks and gaps (honest)

1. **Privacy cost.** The buffer is a public native transfer in the payment transaction and links the payer to the one-time address more visibly than a plain payment (D1/D8). The UI says so; there is no mitigation.
2. **Estimate is a guess.** A fixed 100 000 gas may be too low for exotic tokens or high L2 data fees; the seller may not be able to afford the sweep. Too high wastes the payer's native coin. No refund path.
3. **Stealth contracts / hostile recipients.** Native forwarding sends all gas to the one-time address; a stealth *contract* can revert or burn gas, failing the payment atomically (`test_buffer_revertsWhenStealthRejectsEth` covers revert, not gas burning).
4. **No wallet or chain was used.** Everything above runs against mocks or Foundry; no testnet run exists (audit W-14).
5. **Not covered:** behaviour when `eth_gasPrice` is manipulated by a malicious RPC beyond the cap (the cap bounds loss to 0.01 native coin per payment); L2 fee models; tokens with transfer hooks (rejected by design).

## Disclosure text check

User-facing wording is in `docs/user/review-and-pay-an-invoice.md` ("Gas buffer") and the in-app notice; both state that it is public and links payer and one-time address.

## Verdict

Reasonable for testnet experimentation. Do not describe it as a complete Feature 1 (invoice policy, fiat estimate and permit combination are missing). Re-review after any change to estimate sizing or the router.
