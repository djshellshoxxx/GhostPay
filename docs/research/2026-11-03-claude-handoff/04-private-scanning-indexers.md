# Private scanning, indexers, light clients, and PIR: implementation research

Research date: **2026-11-03 America/Vancouver / 2026-11-04 UTC**.
GhostPay source inspected: main `0014bc5b26c7487ea1f9fb230194c36673193236` and integrated PR #47 `f8193502e602c99bb24ff956f142671750b744a0`.

**Later ownership update:** [PR #70](https://github.com/djshellshoxxx/GhostPay/pull/70), observed at `a4f7a2c7d05d358cec09df0e613c3ef6e46aae90`, owns current scanner budget/cursor corrections and related tests. This report's service/API and upstream-reuse recommendations are separate proposals; reconcile any overlapping client edits with that PR. The ownership update is based on PR metadata, not a fresh reproduction or complete review of that patch.
This note records source inspection and proposed acceptance work. **No upstream build, PIR benchmark, live-network query, or GhostPay runtime test was executed for this note.**

## Decision for Claude

Keep the existing EVM scanner and fixed-window transport as the core. The next useful implementation candidate is a **small, optional reference service for the already-defined public announcement API**, after core acceptance and ownership reconciliation. Evaluate Ponder behind that API if maintaining reorg-safe indexed storage would otherwise require significant new infrastructure.

Treat Helios as a concrete integration experiment, and single-server PIR as a later research project. Neither supplies an automatic proof that an announcement scan is complete. Do not connect experimental clients to the lean build merely because their upstream code is available.

## 1. Current source, rather than the old roadmap

| Area | Observed implementation at PR #47 | Remaining question |
|---|---|---|
| Fixed-window scanning | `apps/web/src/lib/scanPrivacy.ts` implements `planScan`, endpoint validation, windowed clients, disclosure text, and `createIndexerScanClient`; `Scan.tsx` and `Settings.tsx` use it. | Measure whole-flow traffic, including receipt verification and checkpoint reads; the source itself documents their more precise disclosures. |
| Public announcement indexer | `packages/scan-source/src/indexer.ts:createIndexerSource` consumes `/v1/logs`, validates records, checks header continuity and checks block hashes against another source. | A production reference service, versioned wire contract, persistence/rollback semantics, bounded response behavior, and deployment qualification. No `packages/light-indexer` directory exists in this inspected tree. |
| Light-client seam | `packages/scan-source/src/light.ts:createLightSource` and `types.ts:LightClient` exist. The wrapper checks block hashes. | Bind each returned log to authenticated receipt evidence; specify coverage/completeness separately. A boolean capability is not evidence for a particular response. |
| Two-server PIR | `packages/pir-two-server` already contains page packing, manifest checks, XOR query/answer primitives, HTTP transport, and fixed-count fetching. | Independent operator assumptions, real transport qualification, snapshot transitions, end-to-end cost, and chain-authenticated data origin. |
| Lean reachability | `apps/web/scripts/scan-bundle.mjs` contains rejection markers for PIR/light/quorum code. Stage-one indexer support is separately wired. | Preserve actual module-evidence checks when changing imports. A source package existing does not imply it belongs in the supported build. |

Evidence: [scanPrivacy.ts][GP1], [indexer.ts][GP2], [light.ts][GP3], [types.ts][GP4], [PIR README][GP5], [bundle guard][GP6], [stage-one scope][GP7].

The earlier [light-indexer reuse note][OLD] was preliminary: it did not inspect Ponder, did not establish an exact SDK scanner, and described YPIR paths inaccurately. This note adds verified source locations; it does not erase that historical record.

## 2. Keep four guarantees separate

A useful result schema should describe at least these independent properties:

1. **Network privacy:** which endpoint sees the client's IP and when.
2. **Query privacy:** whether the endpoint learns the address, selected page, receipt, or scan position.
3. **Authenticity:** whether returned data belongs to the claimed chain and block.
4. **Completeness:** whether all relevant records in the claimed interval were considered.

This decomposition follows from GhostPay's current interfaces and the external sources below. It is a proposed design criterion, not a claim that any candidate supplies all four.

A second RPC can improve disagreement detection but does not by itself supply cryptographic completeness. A PIR page hash establishes agreement with a manifest; the manifest must itself have an authenticated relationship to chain data. A light-client header establishes a block identity; returned log contents need receipt verification. The app already explains some of these limits; preserve that language until stronger guarantees are demonstrated. See the [transport disclosures][GP1], [indexer checks][GP2], [light-client wrapper][GP3], [evidence types][GP4] and [PIR design][GP5].

## 3. Concrete reuse candidates

### SCAN-01 — Ponder: optional operator-side indexer, not a browser dependency

**Verified source:** `ponder-sh/ponder` commit `cdc960f4b4b97391466967980edfe291e0047c77`; `packages/core/package.json` reports **0.18.4**. Root [LICENSE][P1] is MIT.

Read locations:

- [`packages/core/src/utils/finality.ts`][P2]
- [`docs/pages/docs/indexing/overview.mdx`][P3]
- [`docs/pages/docs/production/self-hosting.mdx`][P4]
- [`packages/core/package.json`][P5]
- [`docs/pages/docs/requirements.mdx`][P6]

Ponder provides event-driven indexing, database rollback within a configured reorg window, and crash recovery. Its documented self-hosting model uses a Node service and PostgreSQL. The inspected manifest requires Node >=22.12 and viem >=2.35; resolve against the exact package manifest rather than looser prose requirements. See the [indexing documentation][P3], [self-hosting guide][P4], [package manifest][P5] and [requirements page][P6].

**Important fit limit:** Ponder's `getFinalizedBlock` uses a configured time window. Its internal “finalized” boundary is a storage/rollback policy; it must not become GhostPay's consensus-finality label. The default constant is 180 seconds in this inspected source. [P2]

**Adoption mode:** evaluate as an exact-pinned optional service dependency. Prefer an adapter and small handlers over copying its indexing engine. The service must expose GhostPay's existing public range API, not require a new browser GraphQL client.

**Suggested GhostPay seam:** a separately reviewed `apps/indexer/` service (proposed, not present), feeding `createIndexerScanClient` and `createIndexerSource`. Keep key derivation and ownership matching in the browser.

**Acceptance requirements:**

- Compare a local canonical event corpus with the API output, including empty windows and blocks without announcements.
- After a local reorg, return the replacement chain consistently and invalidate data beyond the common ancestor.
- Restart during backfill and prove deterministic continuation without gaps or duplicate visible events.
- Bind pagination/response caps to an explicit coverage boundary. An oversized interval must never look complete merely because a result limit was reached.
- Serve the public announcer stream without recipient-specific query fields, credentials in URLs, or secret-derived filters.
- Record independent RPC ownership and treat provider agreement as a trust assumption.

**Priority:** useful after core acceptance if a reference service is actually wanted. A dependency-free service may still be better for the first testnet slice; decide from a measured data-volume and maintenance comparison.

### SCAN-02 — Helios: existing browser provider and receipt verification code

**Verified source:** `a16z/helios` commit `2af9b41887e069144ee56cd710f3ddca195473f8`; root [LICENSE][H1] is MIT.

The inspected [`helios-ts/lib.ts`][H2] contains `createHeliosProvider`, `waitSynced`, and a JSON-RPC `request` bridge, including `eth_getLogs` and `eth_getBlockReceipts`. This resolves the old note's question about whether a browser-facing integration surface exists; it does **not** verify GhostPay compatibility or a released package artifact.

[The RPC execution provider][H3] verifies returned logs against authenticated block receipts and checks their filter membership. Its `verify_logs` gathers receipts for blocks represented in the returned result. Therefore a verified returned record and a complete historical result are distinct guarantees. This is source-based reasoning, not a reproduced upstream vulnerability or an assessment of every provider mode.

[Receipt proof helpers][H4] include `verify_receipt_proof`, `verify_block_receipts`, and `verify_authenticated_block_receipts`.

**Adoption mode:** isolated integration spike or test oracle; no automatic replacement of existing RPC code. Consume the reviewed upstream client behind GhostPay's seam rather than porting cryptographic verification into TypeScript.

**Suggested GhostPay seams:** `packages/scan-source/src/types.ts:LightClient`, `light.ts:createLightSource`, and the optional transport construction boundary in `apps/web/src/lib/scanPrivacy.ts`.

**Acceptance requirements:**

- Define evidence per operation: verified header, verified receipt/log inclusion, and complete interval coverage.
- The result must not become `integrity: 'proof'` solely because an adapter declares `verifiesLogs: true`.
- Verify supported chains, checkpoint freshness and bootstrap trust, historical block availability, browser storage, memory and cold-start behavior.
- Independently record every upstream endpoint used, including consensus/checkpoint services. A light client does not automatically hide the query.
- Build and inspect the actual WASM distribution with GhostPay's CSP and lean-exclusion requirements.
- Keep scan bounds and reorg handling deterministic when the light client is behind, not synchronized, or unable to authenticate the requested historical block.

**Priority:** deferred experiment with high explanatory value. The first useful change may be a clearer evidence type and conformance test specification.

### SCAN-03 — SimplePIR/DoublePIR: benchmark reference

**Verified source:** `ahenzinger/simplepir` commit `e9020b03bf2872c75b8954e749e32408b5db87ed`; [LICENSE][S1] is MIT. Source locations include `pir/pir.go`, `pir/simple_pir.go`, `pir/double_pir.go`, `pir/pir_test.go`, and `eval/plot.py`. The [README][S2] identifies Go plus C tooling; it is not simply a C library as the old research table implied.

The [authors' USENIX paper page][S3] explains the tradeoff between throughput, query communication, and a downloaded preprocessing hint. Its published measurements are not GhostPay measurements.

**Adoption mode:** benchmark/reference implementation outside the shipping application. If adapting test methodology, preserve notices and retain parameter provenance.

**Target:** a later experiment comparing `packages/pir-two-server/src/xor.ts` with single-server retrieval over the same public page corpus. Measure initial setup, updates, mobile upload/download, memory, and recovery after database-generation changes. Do not compare only steady-state queries or only one record size.

### SCAN-04 — YPIR: current exact code locations and hardware constraint

**Verified source:** `menonsamir/ypir` commit `a73e550a469605c2fa23945a4d96c20fb2f4a839`; [LICENSE][Y1] is MIT. The [README][Y2] asks for Ubuntu and AVX-512. The source tree uses `src/client.rs`, `src/server.rs`, `src/scheme.rs`, and `src/bin/run.rs`; benchmarks are under `rodeo/`. The old `pir/` / `eval/` description should not guide implementation.

The [USENIX paper][Y3] removes the offline hint transfer of earlier designs while retaining other communication and computation costs. Hardware-specific published throughput does not establish performance on the user's host or a browser.

**Adoption mode:** later benchmark executable, not a browser dependency. No in-process port or production service is recommended from this research alone.

**Target:** the same future PIR comparison harness as SCAN-03. Supply a representative immutable announcement slice and a separate append/reorg workload. Pin parameters and the dependency graph before comparing results.

### SCAN-05 — Ethereum Foundation Reads / insPIRe: useful research, blocked reuse

The [Reads PIR project][R1] links executable reference work and its newer GPU-serving implementation. The September-dated [wallet guide][R2] explicitly describes incomplete review, no published TypeScript/WASM client at that snapshot, and absent declared licenses. Those statements are dated evidence.

The fetched `keewoolee/inspire-gpu-serving` tree at `91a1fc505e9b30d807bc5e430d64cef9e397efe6` contains `crates/client/src/lib.rs`, `crates/server/src/http.rs`, `crates/keyword`, and `crates/chain`. No license file appeared in that recursive tree. Its [current README][R3] describes newer token-storage and name-table work than the September guide, so the guide must not be treated as a complete current feature inventory.

**Adoption mode:** design-only / do not copy or depend. License permission, review, exact feature coverage, and browser integration remain unresolved. Public visibility is not a reuse license.

**What is useful now:** requirements for consistent database generations, fixed request shapes, sidecar/update handling, and explicit failure instead of silent privacy downgrade. Treat the [sharded PIR proposal][R4] as a design proposal, not a ready-made GhostPay announcement service.

**Target:** future `pir-two-server` evolution or a separate experimental backend. The first acceptance artifact should be a versioned wire contract and dataset-generation model, not imported crypto code.

### SCAN-06 — TorJS/Arti: update the research assumption, preserve the core boundary

The [Reads TorJS architecture page][T1] describes an Arti WASM client with a browser WebRTC/WebSocket gateway, and links the [official Tor GitLab Arti repository][T2]. This is substantive non-GitHub upstream discovery.

A normal browser still lacks raw TCP/SOCKS access. A WASM Tor implementation plus a gateway is a different architecture from opening SOCKS in page JavaScript. Thus the existing local-proxy/Tor-Browser approach remains coherent, while an absolute assertion that an in-browser Tor client cannot exist is outdated.

**Adoption mode:** research-only. The gateway, bootstrap, browser network behavior, artifact delivery, license set and sustained maintenance require separate qualification. Do not add a CDN dependency or route existing payment flows through it automatically. The hosting report owns the broader Tor/I2P source review.

**Target:** a future explicit `HttpTransport` implementation, selected by user configuration and kept outside the supported lean artifact until accepted. Record which requests occur before circuit readiness and what each infrastructure operator can observe.

## 4. Suggested Claude task slices

| ID | Concrete deliverable | Acceptance evidence | Dependency |
|---|---|---|---|
| SCAN-A | Version the existing public indexer response/coverage contract; document exact max-size and rollback semantics. | Source-mapped schema and fixtures; consumer compatibility review. | Coordinate with owner of PR #47's scanner files. |
| SCAN-B | Compare a small custom service with a Ponder-backed service on identical public local data. | Deterministic event-set and restart/reorg comparison; dependency and operating-cost inventory. | Explicit decision to build an optional service after core qualification. |
| SCAN-C | Replace ambiguous “proof” capability language with per-response evidence requirements. | Documented inclusion vs coverage semantics; tests cannot infer completeness from a capability flag. | Scope review for experimental light-client package. |
| SCAN-D | Add a whole-flow network-observation acceptance plan. | Requests for checkpoints, matched receipts, fallback, cancellation and retry have documented disclosures. | Preserve existing transport behavior and owner constraints. |
| SCAN-E | Benchmark XOR PIR, SimplePIR and YPIR on one reproducible dataset. | Publish data size, query size, setup cost, hardware, update costs and unrun scenarios. | Later research; no deadline or production-readiness claim. |

No automatic source copying, live service deployment, chain enablement, or runtime changes were performed.

## Sources and exact provenance

[GP1]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/apps/web/src/lib/scanPrivacy.ts
[GP2]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/scan-source/src/indexer.ts
[GP3]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/scan-source/src/light.ts
[GP4]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/scan-source/src/types.ts
[GP5]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/pir-two-server/README.md
[GP6]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/apps/web/scripts/scan-bundle.mjs
[GP7]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/specs/10-feature5-stage1-private-scanning.md
[OLD]: https://github.com/djshellshoxxx/GhostPay/blob/0014bc5b26c7487ea1f9fb230194c36673193236/docs/research/reuse/light-indexer.md
[P1]: https://github.com/ponder-sh/ponder/blob/cdc960f4b4b97391466967980edfe291e0047c77/LICENSE
[P2]: https://github.com/ponder-sh/ponder/blob/cdc960f4b4b97391466967980edfe291e0047c77/packages/core/src/utils/finality.ts
[P3]: https://github.com/ponder-sh/ponder/blob/cdc960f4b4b97391466967980edfe291e0047c77/docs/pages/docs/indexing/overview.mdx
[P4]: https://github.com/ponder-sh/ponder/blob/cdc960f4b4b97391466967980edfe291e0047c77/docs/pages/docs/production/self-hosting.mdx
[P5]: https://github.com/ponder-sh/ponder/blob/cdc960f4b4b97391466967980edfe291e0047c77/packages/core/package.json
[P6]: https://github.com/ponder-sh/ponder/blob/cdc960f4b4b97391466967980edfe291e0047c77/docs/pages/docs/requirements.mdx
[H1]: https://github.com/a16z/helios/blob/2af9b41887e069144ee56cd710f3ddca195473f8/LICENSE
[H2]: https://github.com/a16z/helios/blob/2af9b41887e069144ee56cd710f3ddca195473f8/helios-ts/lib.ts
[H3]: https://github.com/a16z/helios/blob/2af9b41887e069144ee56cd710f3ddca195473f8/core/src/execution/providers/rpc.rs
[H4]: https://github.com/a16z/helios/blob/2af9b41887e069144ee56cd710f3ddca195473f8/core/src/execution/proof.rs
[S1]: https://github.com/ahenzinger/simplepir/blob/e9020b03bf2872c75b8954e749e32408b5db87ed/LICENSE
[S2]: https://github.com/ahenzinger/simplepir/blob/e9020b03bf2872c75b8954e749e32408b5db87ed/README.md
[S3]: https://www.usenix.org/conference/usenixsecurity23/presentation/henzinger
[Y1]: https://github.com/menonsamir/ypir/blob/a73e550a469605c2fa23945a4d96c20fb2f4a839/LICENSE
[Y2]: https://github.com/menonsamir/ypir/blob/a73e550a469605c2fa23945a4d96c20fb2f4a839/README.md
[Y3]: https://www.usenix.org/conference/usenixsecurity24/presentation/menon
[R1]: https://reads.ethereum.foundation/projects/pir/
[R2]: https://reads.ethereum.foundation/projects/pir/wallets/
[R3]: https://github.com/keewoolee/inspire-gpu-serving/blob/91a1fc505e9b30d807bc5e430d64cef9e397efe6/README.md
[R4]: https://ethresear.ch/t/sharded-pir-design-for-the-ethereum-state/24552
[T1]: https://reads.ethereum.foundation/projects/torjs/
[T2]: https://gitlab.torproject.org/tpo/core/arti
