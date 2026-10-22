# Spec: sandbox / test mode (@ghostpay/sandbox)
## Requirements
- R1 `MockChain`: in-memory, deterministic (no randomness, no I/O); accounts via `account(i)`; native + token balances (bigint); blocks with parent hash; Payment and Announcement events with block/log index.
- R2 Test marker: chain ids 31337-31399 are reserved. `MockChain` refuses any id outside. `isTestInvoice` requires reserved chain id AND memo prefix `[TEST - NO REAL FUNDS] `. `brandAsTest` adds the prefix (idempotent, <=500 code points) and refuses live ids. `chain.test === true`.
- R3 Faucet: default 1e18, cap 100e18, 60 s per-address cooldown on the injected clock; mints into a mined block.
- R4 `ManualClock`: advance/set, never backwards, integer seconds only.
- R5 Fault injection: `delaySeconds` (tx not minable until clock catches up), `failNext` (included, reverts, no state change), `dropNext` (never mined), `reorg(depth, {replay})` (state/events revert, new block hashes, transfers replay or drop, faucet mints vanish).
- R6 Insufficient balance => tx status `failed`, balances unchanged. Money is bigint only.
## Acceptance tests
Range edges 31336/31337/31399/31400/NaN/fraction; marker needs both parts; determinism of block hashes; exact balances after transfer; failed tx leaves balances; faucet cap+cooldown boundary (59 s vs 60 s); delay boundary; failNext/dropNext counts; reorg state revert and different hash on re-mine; bad reorg depths; bad addresses/amounts (0, negative, 2^256).
