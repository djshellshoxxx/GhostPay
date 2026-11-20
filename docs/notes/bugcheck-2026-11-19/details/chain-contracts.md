> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# Chain adapters, contracts, hygiene and metadata audit

## Exact scope and completion

Reviewed main `c977b5d6723f6822c3b5d86cd6b231712c53c395` and latest integration `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

All 74 selected first-party production source files at each revision are reviewed: 31 chain-adapter files, 18 contract implementation/interface/deployment-script files, 12 hygiene files and 13 metadata-hardening files. This is 78 distinct path/blob combinations across the two revisions, 11,576 main lines and 11,784 integration lines. No assigned production file remains pending. The generated router and sweep-relayer ABIs were inspected as losslessly compacted JSON records and cross-checked with the Solidity implementation. Unchanged blobs inherit review; all four changed variants were reviewed in full context.

Additional source read: the reference announcer used by deployment scripts, the ABI-generation shell script and its two Solidity interface inputs. Third-party vendored libraries, analysis-runner scripts, test fixtures and the data-only configuration matrix are outside the production-source completeness count. Relevant existing tests and documented contract residuals were consulted as evidence. No application source was modified.

The exact path, revision, blob and review method are in `chain-core-audit.json`. Interaction coverage of the sweep advisory is explicitly separate from ownership of the full web files.

## Newly confirmed open findings

### CC-01 — Destination-reuse warnings disappear on five enabled EVM testnets

**Priority:** medium; browser advisory correctness/privacy UX. **Affected:** integration `e22c174…` and privacy `1376289…`; the feature does not exist in the pinned main source.

**Sources:**

- `packages/hygiene/src/testnet.ts:3–15`: the hygiene package accepts only Anvil, Ethereum Sepolia and Base Sepolia.
- `packages/hygiene/src/ledger.ts:57–60,70–71,89–92`: both recording and retrieving destination history enforce that narrower allowlist.
- `apps/web/src/lib/defaultServices.ts:119` and `packages/chain-adapters/src/config/chains.ts`: the browser offers all seven enabled EVM testnets.
- `apps/web/src/lib/sweep.ts:152–170,179–195`: failed history recording and lookup are swallowed; lookup then returns no advisory.
- `apps/web/src/views/Sweep.tsx:139,342,465,565`: direct and relayed completion record the destination, and the warning is rendered only when the helper returns one.

**What happens:** within an active seller session, recording a submitted sweep and subsequently selecting the same destination works on Ethereum Sepolia and Base Sepolia. The same sequence on OP Sepolia (`11155420`), Arbitrum Sepolia (`421614`), Polygon Amoy (`80002`), BNB Smart Chain Testnet (`97`) or Avalanche Fuji (`43113`) silently loses the record and produces no `used` warning. Both recording paths reject the chain and the wrapper catches both rejections.

**Impact and limit:** users on those enabled networks do not receive the new destination-reuse warning. This does not block or alter sweep submission, and it does not establish any unauthorized transfer. The product impact requires an otherwise available/configured sweep on the affected network. Known-wallet warnings can still work because that branch runs before the ledger lookup.

**Validation:** a local memory-only test imported the actual integration `session.ts` and `sweep.ts` helpers and exercised all seven enabled chain IDs. Two controls passed and the five affected-network assertions failed with `undefined` instead of `used`. No RPC, wallet, signing or transfer operation was used. Evidence: `chain-core-qa/destination-networks.test.ts` and `chain-core-qa/destination-networks.log`; Vitest completed in 5.23 seconds. The relevant advisory block in privacy `1376289…` is byte-for-byte identical to integration, and its hygiene testnet guard has the same git blob. Main has neither `DestLedger` nor `recordSweepDestination` in this web module.

**Fix direction:** use one explicit supported-chain policy for the browser and its advisory ledger, or separate the in-memory advisory ledger's chain validation from the narrower experimental RPC helpers. Keep the fail-safe behavior that advisory-storage errors cannot fail an already-submitted sweep. Add the seven-network table above to the normal helper regression suite.

### CC-02 — Hygiene verification helpers do not bind returned logs to the requested token and block range

**Priority:** low in the current browser release; exported package verification correctness. **Affected:** main and integration; `packages/hygiene/src/verify.ts` is unchanged.

**Sources:** `packages/hygiene/src/verify.ts:46–73,87–100,115–131,145–161,190–223`.

`transferLogs` sends an emitter and block-range filter, but after receiving the answer it checks only that the result is an array. `parseTransferLogs` validates several field shapes and retains the block number, but it discards the emitter and event-position identity. The consumers then match transaction/recipient/amount or sum outgoing transfers without checking that each log belongs to the requested token and interval. Duplicates also have no preserved event identity on which to deduplicate.

**Impact and limit:** stale, mixed or repeated RPC result rows can be reported as a confirmation or counted as an outflow by these helper APIs. This is an avoidable evidence-integrity weakness in the exported PoC helpers. These functions are not called by current `apps/web/src` production code at either audited pin; the main browser payment-verification path uses the stricter chain-adapter implementation. Do not describe this as a demonstrated browser false-payment result. One provider can still lie consistently after these checks; filter binding is a basic input-validation invariant, not provider authentication.

**Evidence:** direct source trace plus the existing `sweepConfirmed` fixture: its positive test supplies the standard fixture block while requesting a different recent-block interval, and the implementation has no interval comparison. No adversarial reproduction was executed.

**Fix direction:** retain and validate emitter, block number, block hash, transaction hash and log index before accepting evidence; reject records outside the requested token/range and deduplicate by canonical event identity before summing. Keep the address-free query shape. Add ordinary stale-page, mixed-result and duplicate-page fixture checks before using these helpers in the browser.

### CC-03 — Bitcoin fee-rate normalization can return below its configured minimum

**Priority:** low; pure exported helper API correctness. **Affected:** main and integration; the production blob is unchanged.

**Source:** `packages/metadata-hardening/src/btc.ts:54–70`.

The function first raises the rate to the configured minimum, but its cap fallback compares the original rate against the cap and then returns the cap. An inconsistent minimum/cap pair can therefore turn a valid rounded result into a value below the required minimum. The documented contract says a returned value never falls below `minRate`.

**Ordinary local check:** `normalizeFeeRate('testnet', 0.5, { minRate: 1, cap: 0.8 })` returns `0.8`. A valid control with `cap: 2` returns `1`. Incompatible minimum/cap requirements should instead produce a configuration/policy error.

**Impact and limit:** a caller relying on the minimum may construct a fee policy that violates its own floor. Current browser production code does not call this helper. The check makes no assumption about a current Bitcoin network relay fee or transaction acceptance.

**Validation:** `node chain-core-boundary-check.mjs` exited zero after recording the mismatch and passing two ordinary control checks. See `chain-core-boundary-check.log`. No chain or wallet interaction occurred.

**Fix direction:** validate that an explicit cap is finite, positive and compatible with `minRate`; reject an impossible combination. Before returning any cap fallback, enforce the same lower-bound invariant as the ordinary rounded result.

## Previously documented residual still present

### CC-K01 — Nonzero policy-factory fees retain a conditional deployment-liveness dependency on the fee token

**Disposition:** existing conditional medium residual, not a new discovery and not fixed by the latest deployment-script acknowledgement.

**Sources:** `packages/contracts/src/PolicyAccountFactory.sol:113–117,128–163`; `packages/contracts/DEVIATIONS.md`, P7; `docs/audits/mythril-14290880802-factory-dispositions.md`, R7/R8 and independent-review N1.

When `FLAT_FEE` is nonzero, account creation depends on successful fee-token balance/allowance reads and exact balance deltas. The waiver covers selected transfer failures, but failing views or successful transfers with unexpected deltas still prevent deployment of the counterfactual account. The immutable factory remains part of that account's address. The latest `DeployPolicy.s.sol:69–80` requires an explicit token-specific freeze acknowledgement before a nonzero-fee deployment; it does not change the contract behavior.

The repository already records this exposure as conditional and keeps the relevant release decision open. This review did not verify deployment state on a live chain, execute the documented probe, clear an analyzer gate or approve a deployment. Keep the existing zero-fee/future specified recovery-policy decision visible in the consolidated notes.

## Main issues already corrected in integration

These are source-confirmed differences, not newly open integration defects.

| Main issue | Main source | Integration disposition | Scope |
|---|---|---|---|
| Manifest date validation accepts calendar rollovers such as an impossible February day because it relies on `Date.parse` alone. | `packages/chain-adapters/src/deployments.ts:71–73` | `:71–80` adds explicit calendar-day validation. | Manifest-input correctness; no signature bypass asserted. |
| `NaN` retry configuration defeats the attempt cutoff because every comparison against it is false. | `packages/chain-adapters/src/rpc.ts:223` | `:227–229` maps non-finite retry values to zero. | Exported client option; current browser normally uses the finite default. No unbounded-loop reproduction run. |
| Default RPC transport leaves cookie/referrer/cache policy to fetch defaults and document policy. | `packages/chain-adapters/src/rpc.ts:103–109` | `:109–112` explicitly sets credential omission, no-referrer and no-store. | Transport privacy-policy gap. Existing page policy may already suppress the referrer; no observed credential leak claimed. |

The large integration `payments.ts` change adds bulk receipt/transaction evidence reads, cancellation-aware scheduling and batch-bound verification. All additions and their interaction with the existing direct-router proof checks were reviewed. No further confirmed defect was established in this pass.

## Rejected candidates and validation limits

- Empty-object private-part padding fails its bucket check, but the actual invoice-schema private part requires `lineItems`. This does not establish a valid invoice flow bug and is excluded from findings. The local boundary-check log explicitly labels it as rejected.
- Generic raw-input validation gaps without a valid typed caller or a demonstrated reachable effect were not inflated into product bugs.
- No broad test suites were launched by this worker. The two focused ordinary checks above are the complete executed validation set.
- `forge` was absent from PATH. Solidity implementations, interfaces and deployment scripts were source-reviewed; Foundry runtime tests and analyzer probes were not executed.
- Vendored OpenZeppelin and forge-std implementations were not independently re-audited. This is a first-party source audit, not a formal proof or a release/deployment qualification.
