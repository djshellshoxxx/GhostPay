# Completed pinned-domain handoff: network/privacy/exchange audit

## Source pin and completion

Repository: `/workspace/scratch/95717c2024fa/GhostPay-audit`.
Audit branch: `audit/zero-cool-core-20261119`.
Audit notes: `docs/security-audits/zero-cool-20261119/`.
Read the repository `AGENTS.md`, audit `README.md`, and `scope-refs.json` before continuing. Main source is `c977b5d6723f6822c3b5d86cd6b231712c53c395`; release is `417f7c71daf8645e1432f2ec8f070110879b80bd`. All eight exact snapshots and every source alias are preserved in the scope and coverage JSON. Use pinned sources, not a moving branch name.

**Completed: 116 of 116 distinct domain path/blob versions, covering 108 paths. Exact remaining ledger: none.** The predecessor fully read/analyzed 94 versions. The transport successor completed the remaining 22: 19 complete baseline files and the complete release diffs for `browser.ts`, `claims.ts` and `index.ts`. Larger `profiles.ts` and `ohttp.ts` files were read in contiguous, nontruncated chunks. Previously completed rows were preserved; no search-only output was promoted to full source coverage.

| Package | Reviewed versions | Pending |
| --- | ---: | ---: |
| address-safety | 6 | 0 |
| hygiene | 12 | 0 |
| metadata-hardening | 13 | 0 |
| net-transport | 24 | 0 |
| payment-uri | 14 | 0 |
| pir-two-server | 13 | 0 |
| qr-exchange | 11 | 0 |
| scan-source | 18 | 0 |
| tx-review | 5 | 0 |
| **Total** | **116** | **0** |

Completion applies only to this domain in the pinned inventory. Later live-main movement is coordinator-owned and was not added by this successor. It is not covered merely because these 116 rows are complete.

## Scope and restrictions that remain in force

This was a read-only defensive review of the browser/core dependency inventory and seven newer selected snapshots. Identical path/blob pairs counted once. Inventory-listed exports were inspected, but their presence was not treated as proof of browser reachability. Archived code, future features, unrelated servers/CLI and external targets were not added.

No app changes, exploit scripts, vulnerability reproductions, live endpoint probes, transactions, deployments, pushes, merges, commits or installations were performed. Existing test source was read to establish contracts; no runtime test result is claimed. GitHub publication was blocked by automatic approval review pending user permission and was not retried or worked around. The root ACTIVE_WORK claim covers these notes.

This review owns writes only to `network-privacy-review.md`, `network-privacy-coverage.json`, and this handoff. The coordinator owns overall integration and moving-head delta coverage.

## Findings and decisions to preserve

1. **NPE-01 Low, high confidence, already known:** QR assembler updates activity time before rejecting a conflicting same-session chunk. The old blob is on main/release/privacy-snapshot/quick-hide/clipboard/erc20-simulation. Consolidation/format contain the existing fix `118ae827a5244156226c48e7d4cc3eb3524810ff`. The report contains precise source lines. The defect extends idle lifetime; it does not accept conflicting payload bytes or bypass payload integrity.
2. **NPE-02 Low availability, high source confidence:** `scan-source/src/indexer.ts:66–75` retains unbounded repeated suffix-regex normalization in an active browser constructor. App-level indexer validation is linear but does not cap the URL length. The lower package reintroduces excessive synchronous work. No timing or denial-of-service reproduction was performed. The related PIR-client defect was repaired in six recent refs by `d37b0ab37d0e9968bda21c57bd18d78c2897487d`; indexer's blob remains identical in all eight. User-configured/stored URL influence is required; ordinary remote responses cannot control this value alone.
3. **Two informational scan-source observations, outside current Pages modes:** `createLightSource` labels proof from `lc.verifiesLogs` while only checking block hashes, without binding the separately supplied inner logs to a verification operation. `createQuorumSource` compares every head with the first and can miss disagreement among another equal-height group. The selected browser does not offer these light/PIR/quorum scan factories. Preserve the informational classification and actual limits in the report.
4. **Informational transport API limitation, not a new active Pages finding:** `profiles.ts:492–532`, blob `1549e1d6ce45263576f1aef5c3fbe699258dd64c`, makes OHTTP's timer abort a controller but does not race injected HPKE/relay promises against a rejecting deadline. A nonsettling injected operation can outlive `timeoutMs`. The default fetch receives the signal; ordinary remote-response defeat of native cancellation was not established. OHTTP is absent from the browser entry and no selected consumer was found. The report gives source evidence, preconditions and bounded remediation guidance. No runtime reproduction was run.
5. The settings quorum validator's distinct-host comment remains stronger than its condition: it accepts repeated hosts when there are at least two hostnames. This is not a demonstrated browser voting bypass. The selected web modes are `single`/`own-node`; scan quorum rejects disagreement rather than choosing a majority.
6. PIR pair checks and OHTTP relay/gateway host comparisons remain heuristics, not proof of independent operators. Neither establishes non-collusion. Recent PIR factory creation also requires experimental opt-in. No active browser PIR/OHTTP route was established.
7. **Current browser transport:** full `createFetchTransport` source enforces redirect refusal, omitted cookies/referrers, finite input budgets, a rejecting deadline across fetch/body reads, streamed byte limits, late-result rejection and fixed handling of untrusted injected errors. Its browser callers were inspected at pinned main/release and imports were mapped across the eight snapshots. No additional active-browser defect was established within the transport package boundary.
8. Node SOCKS/CONNECT and experimental profile exports were fully read, including credential isolation, tunnel/socket handling, request limits, self-test gating and claimed privacy limits. This is not qualification of real Tor/I2P/Nym, an HPKE implementation, RFC vectors or TLS interoperability. The declared testnet guard is a configuration check, not endpoint attestation.

## Evidence and validation performed

- Complete sources or complete baseline-relative diffs were read for every completed ledger entry. The coverage JSON preserves exact `ref`, `commit`, `path`, `blob`, `status`, `notes`, and all `sources` aliases.
- The successor read full fetch/adapter isolation test source and bounded OHTTP timeout-test excerpts as supporting contract evidence. Those tests were not executed.
- Static consistency checks verified the coverage identity set and source aliases against the inventory, 116 reviewed versions/108 paths, zero pending rows, and preservation of the predecessor's 94 completed rows. All 860 commit/path source aliases resolved through Git to the exact recorded blobs.
- The predecessor's 94 unchanged rows have canonical JSON SHA-256 `d979aef9428de23ed19b31f8469e10cf9e0b6510fa761fcf9dfef4217cf55cab` when serialized with Python `json.dumps(rows, sort_keys=True)` in original list order. This is a ledger-preservation check, not a source-security test.

## Next action

The coordinator can incorporate these completed domain notes into the overall audit and reconcile separately reviewed moving-head changes. The two Low findings remain unresolved by this audit; source coverage does not mean repair or release approval. Dynamic and protocol qualification were outside this worker's authorized task and remain unclaimed. Publication remains subject to the existing automatic approval block.
