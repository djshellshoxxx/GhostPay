# @ghostpay/ux-sandbox

Sandbox / testnet try-it mode (spec `sandbox-mode`): mode state with a forced distinct visual flag and banner keys, in-memory mock chain, rate-limited faucet, faucet guidance (caller-supplied sources only), and branded types plus runtime guards that keep test data out of real profiles.

Pure logic: inject `rng` and `clock`; no network, DOM or storage.

```ts
const sb = new Sandbox({ rng, clock });
sb.enter();
const p = sb.createProfile();
sb.getFaucet().drip(p.address);
sb.getChain().mine(3);
```

See `docs/remote/usability/specs/sandbox-mode.md`, `wiring/ux-sandbox.md`, `audit-ux-sandbox.md`.
