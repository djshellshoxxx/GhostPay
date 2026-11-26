# GhostPay privacy evidence matrix — initial source-pinned assessment

Status: **research draft; not a privacy certification**. Prepared 2026-11-10 (America/Vancouver). Baseline: repository `main` at branch creation; inspect the branch ancestry and current integration PR #98 before treating this as candidate-head evidence. No network packet capture, live RPC, Tor/I2P/PIR operator, browser runtime, or on-chain verification was performed for this document.

## Definitions and evidence standard

- **Network privacy (N):** whether a remote endpoint learns the connecting client IP or network identity. An anonymizing transport is a separate assumption; the application cannot prove operator log policies.
- **Query privacy (Q):** whether an endpoint learns which recipient, announcement, outpoint, transaction, or page is of interest. Padded ranges and local matching reduce specificity, not timing disclosure.
- **Authenticity (A):** whether a returned record is cryptographically bound to the claimed canonical chain/block, rather than merely matching another provider's assertion.
- **Completeness (C):** whether all relevant records in a specified interval were returned. Header equality, returned-record proofs, and manifest hashes do not alone prove absence of omitted records.
- **Evidence grades:** S = inspected source/design; T = deterministic automated test with exact run evidence; L = live network/operator measurement; E = independently authenticated chain proof. A claim must not be promoted from S to T/L/E without a recorded command, source SHA, result and trust assumptions.

## Evidence matrix

| Mode / boundary | N: who sees connection | Q: what is exposed | A: assurance | C: assurance | Current evidence and qualification needed |
|---|---|---|---|---|---|
| Direct EVM JSON-RPC | RPC endpoint sees client IP unless separately proxied | Requested ranges, addresses/topics and timing; receipt/balance lookups can expose matched recipients | Provider assertion unless separately verified | Provider assertion; omissions possible | S: `docs/audits/08-completion-gates.md` and privacy research report 04. Capture complete RPC call graph and test lying/omitting provider. |
| Fixed-window public scan | RPC sees client IP unless proxied | Padded public range and timing; downstream receipt/token queries may be specific | Depends on underlying RPC | No independent proof from padding | S: research report 04 cites `apps/web/src/lib/scanPrivacy.ts` on older integrated PR #47; path not found on current main at this inspection. Reconcile PR #98 and capture full traffic, including follow-up calls. |
| Public announcement indexer | Indexer sees IP unless transport hides it; independent RPC also sees calls | Padded block range/page size/timing; no owner key or view tag in indexer request | Contiguous headers and sampled/announcement block hashes checked against second source, not a cryptographic log-inclusion proof | **Not established**: indexer may omit events within genuine blocks | S: `packages/scan-source/src/indexer.ts`. Test omission, reorg, truncation, restart and pagination. |
| Light-client wrapper | Underlying source still sees queries; any checkpoint/consensus endpoints may see connections | Same query exposure as inner source | Verified header hashes; stronger log proof only if actual client proves inclusion. The `verifiesLogs` flag alone is insufficient evidence for every result | **Not established** without authenticated interval coverage | S: `packages/scan-source/src/light.ts`; research report 04. Define per-result evidence, bootstrap trust, log inclusion and coverage tests. |
| Two-server XOR PIR | Both servers see connecting IP unless separate anonymity transport | Individual server cannot infer selected page if operators do not collude and query construction is sound; timing and PIR use remain visible | Page SHA-256 relative to manifest; manifest needs independent chain authentication | **Not established**: page manifest may omit chain events | S: `packages/pir-two-server/README.md`. Test non-collusion assumptions, identical manifests, chain binding, bandwidth and actual remote transport. |
| Bitcoin spentness/Esplora queries | Configured provider sees IP unless proxied | Matched outpoints can identify wallet interest | Provider assertion unless independently verified | Provider can omit or misstate spends | S: `docs/audits/08-completion-gates.md`; PR #113 proposes optional local spend tracking. Reconcile unmerged implementation, measure provider calls and test reorgs. |
| Relayer quote and sweep | Relayer/proxy sees IP and request timing | Owner, destination, token, amount, fee, signature; RPC provider sees simulations and broadcast | Contract enforces signed sweep constraints; request privacy is not guaranteed | Payment outcome must be independently reconciled on chain | S: `apps/relayer/PRIVACY.md`. Test proxy logs and RPC traffic in actual deployment; review operator-specific retention. |
| Seller-signed receipt exchange | Depends on transport used to share receipt | Receipt contents and associated transaction may reveal payment relationship | Signature proves key control/field integrity, not seller identity or on-chain payment | Not a chain-history completeness mechanism | S: `docs/audits/08-completion-gates.md`. Require independent chain evidence and context binding. |
| Public registry | Registry chain and RPC are observable | Public association of meta-address and registry identity | Contract/state readback and signed deployment trust required | Provider completeness remains a separate concern | S: `docs/FEATURE-ASSESSMENT-2026-10-23.md`. Test consent and association disclosures. |
| Hosted frontend / mirrors | Host/CDN can see IP, headers and access timing | Page visits, potentially URL paths; fragment secrets are not sent in normal HTTP requests but can leak through client-side code or browser extensions | Release signature/provenance and byte verification needed | Not applicable to scan data; host can serve incomplete or altered assets | S: research report 03. Verify actual served bytes, CSP, scripts and outbound requests per hosting profile. |

## Priority findings

**P0-PRIV-01 — Separate returned-record authenticity from interval completeness.** `createIndexerSource` checks continuity and cross-source block hashes but explicitly reports `integrity: 'unverified'`; a malicious indexer can omit announcements. Do not advertise authenticated complete scanning. Add omission tests and a coverage-evidence contract before upgrading UI claims.

**P0-PRIV-02 — Measure complete scan traffic.** Fixed-window transport does not necessarily hide recipient-specific follow-up balance, receipt, token, or spentness calls. Record sanitized method names, parameter classes, endpoint roles and timing, never real addresses or secrets.

**P0-PRIV-03 — Reconcile source ancestry.** The 2026-11-04 research references integrated PR #47; `apps/web/src/lib/scanPrivacy.ts` was absent on inspected main. Recheck PR #98 and PR #113, preserve active ownership and do not label historical branch features as deployed.

**P1-PRIV-04 — PIR authenticity and collusion.** Independently authenticated manifest/chain binding and distinct operators are unverified. Do not claim PIR provides chain truth or hides network identity.

**P1-PRIV-05 — Relayer/proxy observability.** Application-level redacted logs do not establish reverse-proxy, CDN, provider or optional policy-gate retention. Produce a deployment-specific privacy notice and traffic/logging test.

**P1-PRIV-06 — Bitcoin outpoint disclosure.** Compare optional local spend tracking in PR #113 with provider-backed checks; ensure default UX does not misrepresent freshness or completeness.

## Proposed test matrix

| Test ID | Setup | Pass criterion | Owner boundary |
|---|---|---|---|
| PRIV-T01 | Inject indexer response omitting a valid event in a header-consistent block | No claim of complete/proven scan; documented limitation and no false paid status | scan-source owner |
| PRIV-T02 | Instrument fixed-window scan with mocked RPC | Inventory all RPC methods and specific follow-up queries; no secret data in evidence logs | scanner owner |
| PRIV-T03 | Inject mismatched head/hash and truncated indexer page | Fail closed; no silent coverage advancement | scan-source owner |
| PRIV-T04 | Two PIR servers with different manifests, colluding operators and delayed responses | Reject mismatched manifests; claims disclose collusion/timing/IP limits | PIR research owner |
| PRIV-T05 | Relayer behind test reverse proxy and mocked RPC | Verify actual logs/metrics exclude sensitive fields, identify proxy/provider exposures | relayer owner |
| PRIV-T06 | BTC reorg and optional local spend detection | Correct rollback, no silent external spentness request when opt-out selected | BTC owner / PR #113 |
| PRIV-T07 | Light-client verified header with omitted logs | Never claim complete interval solely from header verification or a capability flag | light-client owner |
| PRIV-T08 | Serve signed candidate through each supported hosting profile | Verify bytes, outbound requests, CSP and deployment-specific network disclosures | release/hosting owner |

## Next steps

1. Reconcile exact branch/PR ownership for #98, #113 and existing scan/privacy work; this document is research-only.
2. Implement a **redacted RPC call-graph fixture** as a separately owned test PR, beginning with T02.
3. Add omission and false-completeness regressions (T01/T07) without changing scanner authorization or user payment status.
4. Measure traffic against local mocks, then separately authorized testnet providers and proxy profiles.
5. Update user privacy disclosures only after observed evidence supports the stronger wording.

## Sources

- `packages/scan-source/src/indexer.ts` (current main, inspected)
- `packages/scan-source/src/light.ts` (current main, inspected)
- `packages/pir-two-server/README.md` (current main, inspected)
- `apps/relayer/PRIVACY.md` (current main, inspected)
- `docs/audits/08-completion-gates.md` (current main, inspected)
- `docs/FEATURE-ASSESSMENT-2026-10-23.md` (historical assessment)
- PR #75 source-pinned research: `docs/research/2026-11-03-claude-handoff/04-private-scanning-indexers.md` at `894dc868dc5d07102ecb7f6a1e251381d8127f61`
- PR #113 beta hard-lane candidate (unmerged at inspection)

No claim of runtime qualification, security certification or network anonymity is made by this document.

## Evidence update 2026-11-25 (PRIV-T02, T01, T07 and checkpoint safety)

Branch `claude/priv-t02-rpc-disclosure`. Tested code commit: `2ab3b243a57bb4e917fb6b9848f78a2a4347d312` (later commits on the branch change docs only). Evidence level **T** (deterministic automated test against synthetic chains and mock transports). **No L or E evidence was produced**: no live RPC, indexer, light-client, PIR or operator traffic was measured, no packet capture was taken, and nothing here is a privacy guarantee, an anonymity claim or a production qualification. The call graph and measured table are in [privacy-rpc-call-graph.md](privacy-rpc-call-graph.md).

Test command (from `apps/web`): `npx vitest run src/test/rpcDisclosure.test.ts src/lib/scanDisclosure.test.ts src/lib/scanPrivacy.indexer.omission.test.ts src/lib/scanClient.checkpoint.test.ts --coverage=false`. Result: 4 files, 111 passed, 2 expected-fail (`test.fails`, see finding F1). From `packages/scan-source`: `npx vitest run`: 10 files, 121 passed, coverage thresholds met.

| Boundary | Query privacy (Q), as measured in the mock | Authenticity (A) | Completeness (C) | Level | Limitations and remaining verification |
|---|---|---|---|---|---|
| Fixed-window public scan (`runScan` over `createClient` and the windowed client) | Zero address, recipient or token requests in all 17 scenarios. Every log request names only the public announcer and the announcement topic. A matched router payment adds one receipt and one transaction lookup (duplicated to a second provider); a tag-valid but unverifiable claim sends the same lookups. Exact block reads reveal scan position, including the resume anchor read. Retries repeat the same shape and add one chain-id re-check | Provider assertion | Provider assertion | T | Mock chain only. The classifier is a heuristic over request shape; unknown shapes are reported as `unknown` and every scenario asserts zero. Padding does not hide timing, match count or position. Live provider behaviour, TLS metadata and IP exposure are unmeasured (needs L) |
| Public announcement indexer | Public block range and page size only in the mock | Continuity, head and sampled block hashes checked; `integrity` stays `unverified` | **Not established.** Omission inside genuine headers is asserted as undetected, reported `unverified`. CONTINUITY, HEAD_MISMATCH, TRUNCATED, OUT_OF_RANGE and BAD_RESPONSE fail closed | T | No test expects detection of an undetectable omission. See finding F3 |
| Light-client wrapper | Same exposure as the inner source | `blockIdentity: 'verified'` assumes a correct client implementation; none in this repo is audited | `recordInclusion` and `intervalCompleteness` are always `unverified`; `describeScanEvidence` cannot return `verified` for either | T | See finding F2. A real inclusion-proof path does not exist yet (needs E) |
| Resume and checkpoint | Resume reads an exact anchor block (position disclosure, measured) | n/a | Checkpoint safety regressions pass; reorg at the anchor re-reads the range; a stale or concurrent scan cannot overwrite a newer checkpoint (F1 fixed) | T | See finding F1 |

### Fixed findings

- **F1, checkpoint last-writer-wins: fixed 2026-11-26** (`apps/web/src/lib/scanClient.ts`). Concurrent scans could overwrite a newer checkpoint with an older one; the effect was a wasted rescan (more RPC reads of already-scanned ranges), never a skipped block. Now:
  - `runScan` owns the slot from the checkpoint the caller chose its cursor against (`checkpointSeen`; `Scan.tsx` passes the one its render showed), and re-reads the slot before each save. Once another scan has written or cleared it, the run stops writing the checkpoint for the rest of the run and leaves the other cursor (or the empty slot) in place, whether it is ahead (a newer scan) or behind (that scan's rollback). Only the write stops: the run still scans, records every page through `onPageMatches` and reports every payment.
  - `localCheckpointStore.save` is forward-only for a plain save, and a compare-and-swap when the caller passes the cursor it expects. `runScan` always passes it, so a scan that owns the slot can still move it backward (reorg rollback, claim replay, restart). An unparsable stored value counts as empty.
  - Limit, residual race: this is not a cross-tab atomic compare-and-swap. Within one document the read, compare and write are one synchronous step, but another tab's recent write can reach this tab's view of localStorage later, so a stale run can still overwrite a newer cursor in that window. The effect stays a later rescan, never a skipped block. The tests model tabs as stores over one in-memory Storage and do not prove cross-tab atomicity; strong exclusion would need a shared serialization mechanism and real concurrent browser qualification, neither of which is claimed.
  - Evidence (T): the two former `test.fails` cases pass as plain tests; `scanClient.checkpointOwnership.test.ts` covers the store rules, malformed storage and a seeded multi-writer fuzz.

### Open findings (reported, not fixed here)

- **F2, latent light-source label** (`packages/scan-source/src/light.ts` near line 22). Integrity is labelled `'proof'` from a capability flag, not from a checked proof. The app does not use the light source today. `describeScanEvidence` ignores the flag.
- **F3, indexer UI wording.** The checkpoint advances over records an indexer may have hidden, and `scan.done.finished` carries no indexer caveat. UI or wording change for the owner.
- **F4, `ScanProgress.caughtUp`** is true when the secondary provider lags; `Scan.tsx` does not read it. Observation only.

### Test matrix status

| Test ID | Status at this commit |
|---|---|
| PRIV-T01 | Implemented (T). Omission within genuine headers stays `unverified` |
| PRIV-T02 | Implemented (T), scenarios A to K plus J0 and twins; sanitized report writer via `GHOSTPAY_DISCLOSURE_REPORT` |
| PRIV-T03 | Truncation and head mismatch fail closed (T, part of the indexer tests); PIR and other providers not covered |
| PRIV-T07 | Evidence proposal and tests (T): header verification or a capability flag never yields a completeness claim |
| PRIV-T04, T05, T06, T08 | Not started here |

### Not performed

No live-network measurement, no privacy improvement (Phase 8 candidates are documented in the call-graph file and none is implemented because none was measured as a benefit), and no independent professional review: Phase 9 was an AI-assisted review by a separate agent and is not an audit.
