# Spec: sandbox-mode (feature 7)

Package: `packages/ux-sandbox`. Pure logic; no DOM, network or timers. Clock and rng are injected.

## Requirements
- R1 Mode model: `real | test`. `visual` is derived (`test` => `test-distinct`), never stored or accepted from input.
- R2 Banner: in test mode always visible, `role=status`, i18n keys only (`SANDBOX_I18N_KEYS`), plus a label prefix key for every amount, address and tx. Not dismissible.
- R3 Mock chain: accounts, bigint balances, deterministic ids from injected rng, pending to confirmed over N mined blocks (default 3), supply conservation (balances + in-flight = minted).
- R4 Faucet: fixed drip, per-address cooldown (injected clock), lifetime cap. Clock regression counts as rate-limited.
- R5 Faucet guidance: generic step keys and warnings. Sources come only from the caller; each must be plain https, no credentials, no fragment, no whitespace. Always `trusted:false`. No URL is hardcoded.
- R6 No mixing: branded types (`TestAddress`, `TestTxId`, `TestProfileId`, `TestAmount`, `RealProfileId`), a `kind` discriminant on profiles, and runtime guards (`assertNoTestData`, `assertSameDomain`, `assertRealProfile`, `toRealProfileId`). Deep scan fails closed.
- R7 Reset: `Sandbox.reset()` wipes chain and faucet (test mode only). `exit()` wipes automatically. Chain handles are unreachable in real mode.

## Acceptance tests (all implemented in `src/*.test.ts`)
- AT1 test-mode state forces `test-distinct`; a forged stored state with `visual:'normal'` is re-derived.
- AT2 banner visible in test mode with all keys in the i18n list; hidden in real.
- AT3 same seed gives same address and tx ids; collisions throw `id-collision`.
- AT4 faucet 1_000_000n; second drip at +20s returns retryAfterMs 40_000; works at +60s; clock set back stays blocked.
- AT5 transfer of 300n from 1000n: sender 700n at once, recipient 300n only after 3 blocks; overspend, self-send, zero and non-bigint rejected.
- AT6 fast-check: `totalSupply() === totalMinted` under random mint/transfer/mine.
- AT7 URLs `http:`, `javascript:`, userinfo, fragment, whitespace, over 2048 chars rejected.
- AT8 test data in a real context throws; forged profile objects are caught at runtime.
- AT9 reset and exit leave no accounts, txs or faucet state.
