# @ghostpay/privacy-pipeline

Testnet-only proof of concept (anvil `31337`, Ethereum Sepolia `11155111`, Base Sepolia `84532`; Bitcoin `testnet`, `signet`, `regtest`). Private, `UNLICENSED`, ESM. Spec: `docs/remote/privacy-specs/chaining.md` and `profiles.md` section 18. Legal questions are handled by the owner (ADR-0006) and do not block this package. No GhostPay fee is added by any step this package models.

## What it does

Lets a user chain privacy steps into ordered pipelines (for example `fresh wallet -> amount shaping -> pool deposit -> dwell -> pay from pool`, and on the seller side `receive -> pool deposit -> dwell -> pool exit`), checks the chain, shows what it costs and what it still reveals, and runs it as a resumable state machine over **injected drivers**.

- **Planner** (`expand`, `planHash`, `simulate`): lineage tree, plan hash, cost/latency/trust/leak summary. Pure.
- **Validator** (`validate`): typing rules T-1..T-4, chain rules C-01..C-35 (rule data is defined locally in `src/chainRules.ts`, no import of `privacy-profiles`), projection to a profile-style option selection plus a local restatement of the profile rules R-xx that a pipeline can trigger, layer rules (self-test, environment, capability). Never throws; unknown kinds, unknown parameters and anything not understood fail closed.
- **Executor** (`createExecutor`): persist-before-sign, reconcile-before-resubmit, checkpoints, abort with emergency exits, partial failure per lineage. It does no I/O itself: drivers, store, clock, confirmer, signer, delay source and capability probe are all ports.
- **Presets** (`templateFor`): pipeline templates for `standard`, `enhanced`, `maximum`, `confidential-amount`, with recorded downgrades.
- **Join check** (`checkJoin`): payer pipeline against the seller pipeline that receives it (origin, asset, BTC mode, C-31 warning).
- **Builders** (`newPipeline`, `addStep`, `removeStep`, `moveStep`, `nextKinds`) for the custom pipeline editor.
- No network calls, no `fetch`, no `node:*`, no `Date`, no `Math.random`, no crypto import (grep test). One runtime dependency: `@noble/hashes` (sha256 for plan hash and instance ids).

## Steps (18 kinds)

`src.wallet`, `payer.fresh-wallet`, `ct.wrap`, `amount.shape`, `pool.deposit`, `pool.dwell`, `pay.submit`, `pay.from-pool`, `recv.stealth`, `sweep.delay`, `hops.forward`, `hygiene.sweep`, `pool.exit`, `ct.sweep`, `ct.unwrap`, `btc.send`, `btc.recv`, `btc.payjoin-contribute`. Every step has a closed parameter set; every parameter is user-selectable and defaults to the spec value (for example pool dwell 24-72 h, hop delay 10 min to 12 h, router fee 25 bps, exit gas `permit-sponsored`, payer mode `direct`, route `router`, sweep destination `self-derived`, layers all `direct`, RPC `single`, scan `range`, verification `address-free`, isolation `per-step`). Defaults are the least-protective baseline: choosing a chain is always an explicit act.

Presets never contain hops, `ct.unwrap`, PayJoin or a second pool; acks are never added by the package (the caller shows `requiredAcks` and the user acknowledges).

## Honest limits (does NOT protect; normative, copy these keys in the UI)

- Chaining adds no privacy beyond its strongest single step. Steps do not multiply crowds. The unlinking claim of a pipeline is at most that of its pool step, which is crowd-dependent; on a testnet it is effectively none.
- Every step's own "does NOT protect" list still applies; the summary shows the union (`reveals`).
- Longer pipelines add leaks of their own: amount continuity across steps (fees are public, so the amount ladder identifies the origin), timing across steps, a rare combination being a label in itself, more trusted parties, more time with the app open.
- The executor cannot hide anything the method packages expose; it only orders, persists and resumes them.
- Layers (Tor, OHTTP, ...) hide the client IP from relay-like parties; they do not hide content, timing patterns or on-chain links. `tor-browser` isolation per step cannot be enforced by the page (shown as `privacy.warn.chain.isolationUnenforced`).
- The package emits message keys only, no prose, and no numeric score exists anywhere in its types. The strength field is an unordered set. No key or id uses the words anonymous, untraceable, unlinkable or mix (grep test); the only anonymity-related key is the standing disclaimer `privacy.warn.noAnonymity`.

## Executor guarantees and what they rest on

| Rule | Behaviour | Test |
|---|---|---|
| EX-1 | `signing` plus `intentKey` is saved before the driver (and so the sign port) is reached | `executor.test.ts` |
| EX-2 | run state holds references only; no field named like a signature, raw tx, key, seed or secret | `executor.test.ts`, `serialize.test.ts` |
| EX-3 | `instanceId = sha256(pipelineId | lineagePath | stepIndex)`; every `signing`/`submitted` instance calls `reconcile()` first on resume; `submit` is repeated for one intent key only after `not-started` | crash injection at every save, both before and after, plus driver-level crashes before and after the effect |
| EX-4 | reconcile reads follow the `verification` layer; a direct read asks first (CP-5) | `executor.test.ts` |
| EX-5 | resume order: self-tests, reconcile, due computation; overdue (> 1 h) steps are listed; realised delays are recorded and never re-drawn | `executor.test.ts` |
| EX-6 | abort never moves funds; refused while an effect may exist; reports each lineage holding with its emergency exits | `executor.test.ts` |
| EX-7 | lineages are independent; a terminal failure skips its descendants only; run ends `partial` | `executor.test.ts` |
| EX-8 | re-quote at due time; fee over plan plus 50 bps (default) or an unknown party asks CP-4 with a new plan hash | `executor.test.ts` |
| EX-9 | `health()` before pool steps; `sunset`/`unknown` pauses | `executor.test.ts` |
| EX-10 | one step at a time; one prompt at a time | `executor.test.ts` |

The guarantee "one submit per intent key" holds only if the driver's `submit` is idempotent by `intentKey` or its `reconcile()` is truthful. The package cannot check that.

## Unverified (UNVERIFIED)

- **No real driver was run.** Drivers for `@ghostpay/shielded-pool`, `@ghostpay/hops`, `@ghostpay/hygiene`, amount-blur `planSplit`, payer-hiding, confidential backends and BTC packages do not exist in this tree; only deterministic fakes (`src/fakeDrivers.testutil.ts`) were used.
- Chaining test-plan item 5 (anvil integration: the 3.5 chain with the mock pool, `maximum` seller, crash between deposit and exit, hops follower test) was **not run**.
- Tor, Nym, OHTTP and PIR behaviour is modelled as capability and self-test inputs only. Nothing here talks to a network.
- Profile rules R-xx are re-stated locally from `profiles.md` section 8 (R-21, R-23..R-25, R-27, R-33, R-38 and the invoice, identity and announce options are not pipeline-projected and are not evaluated here). When `@ghostpay/privacy-profiles` is built, run PL-7 against its real `RULES`; drift between the two copies is possible until then.
- The generated compatibility matrix (`chainMatrix()`) is this package's own generator; `scripts/gen-matrix.mjs --chain` (profiles lane) does not exist yet and the section 4 text table is checked cell by cell against it with the documented differences in `matrix.test.ts`.
- Fee numbers are a static model (router 25 bps; sweep relayer 50..300 bps per leg; pool relayer cap placeholder 100 bps). Real quotes override them.
- PL-12 (validate under 2 ms for 12 steps) is informational and was not asserted.

## Owner-review items

See `DEVIATIONS.md`.

## Use

```ts
import { newPipeline, validate, simulate, createRun, createExecutor, templateFor } from '@ghostpay/privacy-pipeline';

const { pipeline } = templateFor('maximum', 'seller', ctx, { chain: { family: 'evm', chainId: 11155111 }, asset: 'erc20-permit' });
const v = validate(pipeline, ctx);          // { ok, blocking, warnings, requiredAcks, typeErrors, selection, endHolding }
const summary = simulate(pipeline, ctx);    // cost, latency, trust, strength (set), reveals (keys), issues
const run = createRun(pipeline, ctx);       // refuses anything not ok
const ex = createExecutor(ports);           // ports: drivers, store, confirmer, clock, probe, sign, delay
await ex.start(run, userAcks);              // acks must cover v.requiredAcks
```

`npm test` (vitest with coverage 95/90/95/95), `npm run typecheck`, `npm run lint`.
