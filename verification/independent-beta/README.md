# Independent beta payment-state verification (W5)

A standalone black-box harness that drives the **unmodified, built** GhostPay web app (lean Pages profile) in
Chromium with two tabs of one browser profile, a mock EIP-1193/EIP-6963 wallet and a synthetic JSON-RPC chain, then
checks requirement-derived safety invariants. It does not import production modules, edit production code or tests,
or add dependencies. Ordinary CI does **not** run it; a green CI run is no evidence that this harness ran.

- Safety model, requirement citations, invariants I1–I8 and ambiguity items A1–A6: [SAFETY_MODEL.md](SAFETY_MODEL.md)
- Results, findings and routing to other workers: [HANDOFF.md](HANDOFF.md); raw records under `results/`

## What it exercises (milestone 1)

One EVM chain/asset (Base Sepolia 84532, native ETH, via the repository's signed fake E2E deployment), one payment
intent **X** and an unrelated control intent **C**, both 0.5 ETH fixed-price invoices from a fresh seller key.
Each scenario runs in a fresh browser context: a seller tab creates the invoices and closes, then payer tabs **A** and
**B** act. Steps include interrupted wallet replies (hang with/without broadcast, error after broadcast, rejection),
reload, tab close/reopen, account and chain changes, RPC outages, mining, drops, reorgs, explicit status checks and
deliberate clears (accepted or dismissed). Every sequence ends with a fixed judgement suffix: retry X in both tabs,
pay C once, re-check X.

## Isolation

- App served by `harness/serve.mjs` on `127.0.0.1` only (origin `http://localhost:4173`, mapped to 127.0.0.1).
- The RPC (`https://rpc.e2e.test`) is answered by Playwright request interception inside the browser process; every
  other off-origin request is aborted and recorded (`blockedOrigins`, expected empty).
- No live wallet, key with value, funds, third-party host or unbounded fuzzing. Generated runs are capped at 200
  sequences of at most 8 random steps; minimization is capped at 24 replays per failure.

## Run

Prerequisites: `npm ci --ignore-scripts && npm run build:libs` (repository setup), pre-installed Chromium at
`/opt/pw-browsers/chromium` (override with `GHOSTPAY_CHROMIUM`). From the repository root:

```bash
node --test verification/independent-beta/harness/selftest.test.mjs
```

```bash
node verification/independent-beta/harness/build.mjs --profile lean
```

```bash
node verification/independent-beta/harness/run.mjs --named --concurrency 3
```

```bash
node verification/independent-beta/harness/run.mjs --seeds 1-24 --concurrency 3 --minimize
```

`build.mjs` refuses to build when any production path differs from `HEAD`, builds exactly like
`apps/web/playwright.config.ts` (ephemeral signed fake manifest, public test key, no release commit) and fingerprints
`apps/web/dist`. `run.mjs` refuses to run if the bundle changed since that fingerprint, and records source SHAs,
production-path diff against the pinned main, environment, command, seeds, every wallet handoff, chain log, dialog,
RPC method gaps, per-step observations, violations and ambiguities in `results/<run>/run.json`. Exit status: 0 no
product-defect candidates, 1 candidates found, 2 harness error.

## Layout

| File | Role |
|---|---|
| `harness/chain.mjs` | synthetic chain: mempool, blocks, fork-tagged hashes, reorg, drop, truth |
| `harness/rpc.mjs` | JSON-RPC answers over the chain, outage mode, off-origin deny guard |
| `harness/wallet.mjs` | EIP-6963 shim + Node controller: scripted send behaviours, account/chain events, handoff log |
| `harness/app.mjs` | UI driver by accessible names / en.json text; generic storage observation |
| `harness/oracle.mjs` | invariants I1–I8, ambiguity classification |
| `harness/scenarios.mjs` | named scenarios N1–N8 and the seeded generator |
| `harness/run.mjs` | runner, bounded ddmin minimizer, run record |
| `harness/selftest.test.mjs` | harness self-audit: chain/RPC properties, oracle sensitivity to planted violations |
