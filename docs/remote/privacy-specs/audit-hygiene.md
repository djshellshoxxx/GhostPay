# Self security review: @ghostpay/hygiene

AI self-review by the build agent. Not an independent audit. Date 2026-10-21. Scope: `packages/hygiene` (client logic only). Option B contract not built, not reviewed.

## Threat model
- Assets: spending/viewing secrets, derived destination keys, linkage data (ledger), which addresses the user owns.
- Adversaries: RPC provider (learns owned addresses), chain observers (link S1 -> D, consolidation), malicious/corrupt persisted ledger or RPC responses, hostile log entries, payer picking odd buffers.
- Out of scope: payer, relayer, timing, global observer (see README does-NOT-protect).

## Findings
| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | Med | Retained copies of seed/ikm in the HKDF stream and callback could outlive the call | Fixed: ikm copy, derived seed and RNG's `prk` zeroized on return and throw; tested (ikm and throw path). RNG internal wipe not directly observable in tests |
| 2 | Med | Address could leak into an "address-free" request via a coding slip | Mitigated: `assertAddressFree` runs on every `eth_getLogs` before sending (plain, padded, any case); tests record params |
| 3 | Med | Decoy read silently degrading to unbatched requests | Fixed: fails closed (`BATCH_UNSUPPORTED`) unless caller opts in |
| 4 | Med | Hostile or malformed logs poisoning UI state | Mitigated: strict parser drops bad topics/lengths/removed logs, never throws; fuzzed. Non-array RPC result throws `RPC_MALFORMED` |
| 5 | Low | Corrupt ledger enabling consolidation | Mitigated: strict `from()` (unknown fields incl. `__proto__`, dup rows/indices/sources, bad chain). Ledger loss still permits unknowing `external-*` consolidation (documented) |
| 6 | Low | Wrong EIP-55 checksum accepted | Fixed: mixed-case addresses must checksum |
| 7 | Low | RPC lying about logs (hides spend or fakes a receipt) | Open: no quorum here; use network-privacy `rpcMode` quorum. A `confirmed` receipt trusts one RPC |
| 8 | Low | `spentCheck` incomplete: direct non-router sends, capped range, busy tokens | Reported via `mayBeIncomplete`; not fixable client-side |
| 9 | Info | Deterministic derivation couples D_i to the spending key; domain-separated by salt/info | Accepted per spec |
| 10 | Info | Decoy effectiveness unmeasured; RPC seeing IP over sessions defeats it | Accepted, UNVERIFIED |
| 11 | Info | Buffer rounding raises payer cost up to 2.5x; payer may ignore it | Accepted per spec |
| 12 | Info | `fundingGuard` only knows listed wallets | Documented |

## Verification run
- `vitest run --coverage`: 142 tests pass; statements 100%, branches 99.67%, functions 100%, lines 100%. `typecheck`, `lint`, `build` clean.
- Covers AT-HY-1..6 (pure logic) with fixed vectors, fast-check properties, negative and fuzz cases. AT-HY-7..9 (relayer e2e, UI, Playwright egress) NOT run: belong to apps owners.
- NOT verified: any live RPC, real `eth_getLogs` pagination/limits, real tokens (non-standard Transfer events), Base Sepolia trace, browser memory zeroization (JS cannot guarantee it).
- Test keys are fake fixed values.

## Residual risks
Hygiene only: the S1 -> D link stays public; labels must keep "address hygiene, not anonymity". No dependency added.
