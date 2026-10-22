# Wiring: `@ghostpay/privacy-pipeline` (owner of apps/web and relayer)

Package is pure logic; nothing below is done. Testnet chains only. Spec: `chaining.md` section 12 (lane E6), made concrete. The package performs no I/O: every row below is app-side code.

| File | Edit |
|---|---|
| root `package.json` workspaces / tsconfig refs | register `packages/privacy-pipeline` (if not auto-globbed) |
| `apps/web/package.json` | add dep `@ghostpay/privacy-pipeline` |
| `apps/web/src/lib/pipelineDrivers.ts` (new) | one `StepDriver` per `StepKind`, each a thin adapter to the method package or existing code (table below). Every driver must make `submit` idempotent by `i.intentKey` **or** make `reconcile(i)` answer truthfully from method state (`not-started`, `pending`, `done`, `failed`); the executor relies on this for its one-submit-per-intent-key guarantee. `reconcile` reads must use the address-free path (`HY-VER`) unless `layers.verification === 'direct'`. Drivers never return secrets: `HoldingRef.ref` is an opaque id (note index, derivation path, tx hash) matching `[A-Za-z0-9:_./-]{1,128}`. |
| `apps/web/src/lib/pipelineStore.ts` (new) | `PipelineStore` over `idbStore.ts`; `save({id, body})` seals `body` with the keystore key (`@ghostpay/secret-box`) before writing, `load(id)` unseals. **Authenticated** encryption is required: the executor trusts persisted instance state. Include runs in the keystore export; delete runs with the keystore. |
| `apps/web/src/lib/pipelineLock.ts` (new) | acquire `navigator.locks.request('ghostpay-pipeline:' + runId, ...)` around every `start/resume/advance/abort/pause`. The package only guards against re-entry inside one executor object; two tabs would otherwise double-run a lineage. |
| `apps/web/src/lib/pipelineScheduler.ts` (new) | calls `executor.advance(id)` on unlock, `visibilitychange`, and a timer at the earliest `dueAtMs` (reuse `jitter.ts` conventions: nothing signed while waiting); calls `executor.resume(id)` first after every app start (self-tests, reconcile). Supplies `DelayPort.draw` with the CSPRNG rejection-sampling `randomDelayMs` from `jitter.ts`. Shows `executor.status(id).overdue` as overdue (HOP-UX-4). |
| `apps/web/src/lib/pipelineContext.ts` (new) | builds `Context` (`env`, `capabilities` from the same probe as the profile `Context`, `testMode`, `selfTests` from the network self-test results) and `CapabilityProbe` (`capabilities()`, `selfTest(purpose)` = the NP self-test for that purpose's configured profile). Capability names used: see "Capabilities" below. |
| `apps/web/src/lib/pipelineConfirmer.ts` (new) | `Confirmer` that renders CP-1..CP-5 dialogs from `Checkpoint.keys`; returns `{ ok, planHash }` with the hash it displayed. CP-1 lists `requiredAcks` as unchecked boxes: never pre-ticked (PP-13). CP-3 delegates to the method's own review (`assertPreviewMatchesCalldata`, `decodeAndCheckPayload`). |
| `apps/web/src/views/Pipeline.tsx` (new) | step list with add/remove/reorder using `addStep/removeStep/moveStep` and live `validate`; the add menu shows `nextKinds(pipeline)` only; per-step parameter editors from `STEP_CATALOGUE[kind].params` (closed set: render `enum`/`int`/`bool`/`str` specs with their defaults); layers editor (`transport` per purpose, `rpcMode`, `scanMode`, `verification`, `isolation`); summary from `simulate` (cost next to `singleStepBaselineBps`, latency, `trust`, `strength` as an unordered list, `reveals`, `issues`, `amountLadderBps` as an amount ladder); run status per lineage from `PipelineRun.instances`; abort button that shows `AbortReport` with each exit's `leakKeys` and never acts on its own. No score, no ranking, no "stronger" wording. |
| `apps/web/src/views/Pay.tsx`, `Sweep.tsx` | "Run as pipeline" entry using `templateFor(preset, role, ctx, { chain, asset, origin })` with the profile's selected preset; show `downgrades` as keys; resume banner for paused runs (`pauseReason`: `selftest-failed:*`, `retryable:*`, `drift-declined`, `cp2-declined`, `pool-health:*`, `direct-read-declined`, `user`). |
| `apps/web/src/App.tsx` | route to `Pipeline` |
| `apps/web/src/lib/settings.ts` | none beyond the profile `privacy` field; templates derive from it. Seller side (spec Q5): store nothing; re-validate `templateFor(...)` per received payment with `origin` read at scan time (`router`, `pool`, confidential origin) and use `checkJoin(payerRunPipeline, sellerPipeline)` only where both are known (tests, demo). |
| i18n / copy (`apps/web`) | add copy for every key below. Copy must not use anonymous, anonymity, untraceable, unlinkable, mix, launder, obfuscate (reuse the profile banned-word test). Pool pipelines always show the crowd text (SP N1 / EP N2) and, on testnet, the fixed testnet line (SP 6.5): `reveals` already contains `privacy.warn.crowdTiny` and `privacy.warn.testnetOnly`. |
| `apps/relayer` | no source change. Pipelines call the same relayer routes as the method packages. |
| `docs/user/privacy-limits.md` | add the README "Honest limits" list verbatim. |

## Driver mapping (spec 6.1)

| Step kind | Adapter target |
|---|---|
| `src.wallet`, `recv.stealth` | local; `recv.stealth` driver returns the observed stealth holding from the scan result (`origin` from the announcement scheme) |
| `payer.fresh-wallet` | `@ghostpay/payer-hiding` `planFunding` (`delayMs`), fresh wallet derivation |
| `ct.wrap`, `ct.sweep`, `ct.unwrap` | `ConfidentialBackend` (CT packages) |
| `amount.shape` | amount-blur `planSplit` (local, plan only) |
| `pool.deposit`, `pool.dwell`, `pool.exit`, `pay.from-pool` | `@ghostpay/shielded-pool` / `ExternalPoolAdapter`; `health()` = pool lifecycle probe |
| `pay.submit` | existing `payExec.ts` / `@ghostpay/payer-hiding` |
| `sweep.delay` | local wait (delay is executed by the executor; driver `submit` is a no-op that records completion) |
| `hops.forward` | `@ghostpay/hops` (`planHops`, `runHopLeg`, its own `reduce`); one pipeline instance covers all legs, leg state stays in the HopPlan store |
| `hygiene.sweep` | `@ghostpay/hygiene` + existing `sweep.ts` |
| `btc.*` | `@ghostpay/btc-payjoin`, `@ghostpay/btc-silent-payments` |

For steps that are local (`src.wallet`, `recv.stealth`, `amount.shape`, `pool.dwell`, `sweep.delay`, `btc.recv`) the executor still calls `quote -> prepare -> submit -> reconcile -> outputs` and does not prompt (CP-3 is for on-chain steps). Make `submit` a quick local operation and `reconcile` return `done` once it ran.

## Capabilities the validator reads

`sweep-relayer`, `payer-sponsor`, `eip7702`, `erc4337-entrypoint`, `erc4337-paymaster`, `manifest:shielded-pool`, `manifest:privacy-pools`, `manifest:railgun`, `pool-note`, `pool-relayer`, `asp-publisher`, `manifest:confidential-ct1|ct2|ct3`, `seller-accepts-ct`, `payjoin-directory`, `payjoin-ffi`, `payjoin-v1-endpoint`, `multi-rpc`, `own-node`, `light-client`, `tor-indexer`, `pir-servers`, `tor-browser-asserted`, `tor-socks`, `onion-rpc`, `onion-relayer`, `i2p-proxy`, `nym-build`, `nym-socks5`, `ohttp-gateway-rpc`, `ohttp-gateway-relayer`. Use the same strings as the profile capability set; if the profile package spells one differently, map it in `pipelineContext.ts`.

## Message keys to add to the copy table

Errors (`privacy.err.*`): `chain.afterPoolExit`, `chain.typeMismatch`, `chain.repool`, `chain.consolidation`, `chain.crossChain`, `chain.ctToPool`, `chain.payjoinSp`, `chain.badParam`, `chain.wrapEqualsInvoice`, `conflict.optionClash`, `conflict.poolDepositSponsored`, `conflict.hopsPoolMax2`, `conflict.poolPayBlur`, `conflict.poolPayPayerMode`, `conflict.ctPayerMode`, `conflict.ctDirectPay`, `conflict.ctSplit`, `conflict.ctNoPoolOrHops`, `conflict.ctPoolPay`, `conflict.directPaySponsored`, `conflict.locktimePayjoin`, `conflict.poolReuseDestination`, `conflict.ppDepositorMustBeS1`, `conflict.hopsDirectMulti`, `conflict.amountNoiseRound`, `testModeOnly`, `hopsNoPermit`, `wrongChain`, `wrongEnv`, `wrongAsset`, `unknownValue`, `selfTestFailed`, `requires.sweepRelayer`, `requires.multiEndpoint`, `requires.torForIndexer`, `requires.poolExit`, `requires.payjoin`, `requires.sellerCt`, `requires.cap.<capability or profile id>`.

Warnings (`privacy.warn.*`): the profile list plus `chain.creditZero`, `chain.secondPoolNoGain`, `chain.amountContinuity`, `chain.longRun`, `chain.combinationFingerprint`, `chain.appMustStayOpen`, `chain.samePartyManySteps`, `chain.isolationUnenforced`, `chain.publicIrreversible`, `chain.quoteDrift`.

Acks (`privacy.ack.*`): `hopsWeak`, `poolDisclosure`, `shieldedPoolTestnet`, `payerStillPublic`, `ctTrust`, `ctUnwrapPublic`.

## Edits in other packages

- `packages/privacy-profiles` (lane A): when built, either import `STEP_CATALOGUE`/`CHAIN_RULES` from here or move `steps.ts` and `chainRules.ts` there (they have no dependencies besides each other and `types.ts`), and run chaining PL-7 against the real `RULES` (this package restates R-xx locally in `profile.ts`; see `DEVIATIONS.md` C.1).
- `docs/remote/privacy-specs/DEVIATIONS.md` (if the owner keeps one): paste `packages/privacy-pipeline/DEVIATIONS.md` section A and B for review.
