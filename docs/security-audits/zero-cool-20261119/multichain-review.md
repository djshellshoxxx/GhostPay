# Bitcoin, Solana and TRON package review

Status: **complete for the assigned source inventory**. All 63 unique path/blob versions across 59 paths were read, covering 472 path/ref appearances. `multichain-coverage.json` records exact source identity. Completion means source review; it does not establish that these implementations are free of defects or dynamically qualified for deployment.

## Scope and method

| Package | Paths | Distinct source versions | Path/ref appearances |
| --- | ---: | ---: | ---: |
| `packages/btc-silent-payments/src` | 34 | 37 | 272 |
| `packages/solana-stealth/src` | 15 | 15 | 120 |
| `packages/tron-adapter/src` | 10 | 11 | 80 |
| **Total** | **59** | **63** | **472** |

The eight commits are pinned in `scope-refs.json`. Here, **baseline** means main `c977b5d6723f6822c3b5d86cd6b231712c53c395` and erc20-simulation `87cf6c603338ad64ec02300fe42b96c3e0a205b9`. **Updated** means release `417f7c71daf8645e1432f2ec8f070110879b80bd`, consolidation `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, privacy-snapshot `d6819796a9542acc488b896786faffe83b913d9b`, quick-hide `137628961463fc5abd8b7927b2efe6b18a0a206a`, clipboard `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` and format `a9e0715573f7247d7a16f9d1d030cf0232708fb2`.

Each baseline file was read in full. The four changed package files were reviewed using that complete baseline and complete baseline-to-release diffs, with additional current-source checks for findings. Other snapshots carry the same recorded blobs. The generated protobuf descriptor and its complete generated types were included. Browser callers were inspected where deployment applicability depended on them. No production edits, exploit construction, vulnerability reproduction, live endpoint probes, transactions or application tests were performed.

## Findings and branch disposition

| ID | Severity / category | Baseline | Updated | Scope |
| --- | --- | --- | --- | --- |
| MC-01 | Low, supporting signer API lifecycle | Present | Present | Pending asynchronous confirmation can outlive abort/disposal; the shipped Pages confirmation callback is synchronous |
| MC-02 | Low, scan completeness | Present | Addressed in source | Known `SOLANA-TRON-08`: missing TRON block-range entries are silently skipped |
| MC-03 | Low, privacy | Present | Present | Matching TRC-20 receipts still cause per-match RPC queries during the current TRON scan |
| WV-05 corroboration | Low, network identity | Present | Present | Selected TRON testnet is not compared with the connected node's genesis; count the views finding once |

MC-03 requires a correction to any broad statement that the updated TRON scan eliminates all per-match requests. The updated browser removes native-address balance and memo lookups, but the underlying token receipt path remains. It may be consolidated under WV-06 with an explicit partial-fix disposition, or retained as a separately scoped residual token-privacy issue. Do not count the same baseline per-match behavior twice.

No critical/high issue was established in this assigned package scope. Findings below distinguish code-level defects, already prepared corrections, and supporting-library hardening. They do not infer a live-funds exposure from the default testnet demonstrations.

### MC-01 — Software signer can finish an outstanding request after abort or disposal

**Severity:** Low in this repository's shipped integration; supporting-library lifecycle defect. **Confidence:** high from source. **Affected:** all eight refs. Source blob: `packages/btc-silent-payments/src/spend.ts`, `60697bc4a3b2c8518f822786027049ee6d770e53`.

**Evidence.** `SoftwareSilentPaymentSigner.signSpend` checks the supplied signal and `#disposed` only at entry, lines 636–638. It derives independent one-time private-key buffers at line 645, then awaits the public API's potentially asynchronous confirmation callback at line 710. After confirmation returns `true`, it signs at line 716 without rechecking either lifecycle condition. `dispose`, lines 588–590, sets the flag and wipes the signer's root-key copy, but does not wipe those outstanding local derived-key buffers. Their cleanup occurs only when the pending `signSpend` finally exits, lines 717–718.

**Impact and limits.** A consumer using the documented asynchronous confirmation option can receive signatures for an already-started request after its signal is aborted or the signer is disposed. An indefinitely pending confirmation also keeps the derived keys alive beyond disposal. Disposal does correctly refuse later requests and wipes the stored root copy; this finding concerns an outstanding request. It does not establish access by a remote party or an unauthorized broadcast.

The active browser caller is `apps/web/src/features/btc/sweep.ts`, lines 143–170, identical between baseline and consolidation. It supplies a synchronous comparison callback and calls `dispose` in `finally`; it does not expose the signer's object while that callback waits. Consequently, the long-lived asynchronous-confirmation prerequisite is not established in the shipped Pages flow. This should be fixed before adding a real asynchronous approval UI or another consumer that relies on abort/dispose to revoke pending signing authority.

**Remediation.** Recheck the abort/disposal state after awaited confirmation and immediately before signing. Ensure lifecycle revocation reaches every outstanding derived-key buffer, or wipe temporary validation keys before awaiting and derive signing keys again only after a live approval. A terminal disposed state must remain terminal for outstanding as well as future operations.

**Validation limit.** Existing `signer.test.ts` checks entry with an already-aborted signal and requests made after disposal. The inspected test section does not establish cancellation during pending confirmation. No runtime regression was executed in this audit. A future regression should assert that cancellation during approval produces no signatures and clears operation-owned secrets.

### MC-02 — Baseline TRON scans accept incomplete block ranges

**Severity:** Low, payment-discovery completeness. **Confidence:** high. **Affected:** main and erc20-simulation. **Updated:** addressed in the other six refs. Known correction: commit `259c2760`, `fix(tron-adapter): getBlockRange fails closed on missing or non-contiguous blocks (SOLANA-TRON-08)`.

**Evidence.** Baseline `packages/tron-adapter/src/rpc.ts`, blob `45983a55998d9ba820c00466f941670231cb445a`, lines 190–201, accepts a missing block array as an empty result, filters out-of-range responses, and checks only increasing height order. It does not require one entry for every requested height. `packages/tron-adapter/src/scan.ts`, lines 150–153, advances by its requested page size after processing that response. The browser's TRON scan calls this iterator and returns the originally requested `fromBlock`/`toBlock` range.

**Impact and limits.** A partial or inconsistent provider response can produce an apparently completed scan with payments in omitted blocks undiscovered. This is detectable structural incompleteness, separate from the broader inability of a single trusted RPC to prove the truth of all chain data. It does not permit spending another wallet's funds or bypass the configured mainnet refusal.

**Prepared correction.** Updated RPC blob `d0a921bb15848c23db3338fa1c96e18146cbda88` requires the returned in-range count to equal the requested span and each position to carry its exact expected height. Missing, duplicate and non-contiguous ranges fail closed. Integrate that prepared change with its regression coverage rather than treating the most recent main-based ERC-20 branch as containing it.

**Validation limit.** The source changes and existing regression assertions were inspected; tests were not executed.

### MC-03 — Current TRON token detection still reveals matching transactions to the RPC

**Severity:** Low within the default testnet scope, privacy. **Confidence:** high. **Affected:** all eight refs. Source blob: `packages/tron-adapter/src/scan.ts`, `b7a3ce1fa5c8e87f9af03414ed19a2eba6ee6a50`.

**Evidence.** `scanTron` first checks whether a candidate matches the local viewing key at line 157. Only after that match, it calls `confirmTrc20` for a token candidate at line 158. `confirmTrc20`, lines 124–125, calls `getTransactionInfo` with that candidate's transaction ID. The RPC implementation sends the transaction-specific `/wallet/gettransactioninfobyid` request. This happens before the final `trustedToken` flag is assigned at line 166; an absent trusted-token list does not suppress the query.

Current `apps/web/src/features/tron/scan.ts`, consolidation lines 52–62, calls `scanTron` without limiting it to native candidates, then discards token results from sweep selection while incrementing `tokenCount`. The receipt request has already occurred. Removing the browser's own per-address balance and memo reads therefore leaves this package-level request in the current scan path.

**Impact and limits.** For a scanned block containing matching token announcements, the node can distinguish those matching transactions from unrelated candidates by the extra receipt lookups and associate them with that scan session. The viewing and spending secrets themselves are not sent. This is an existing local-match disclosure, not evidence that the RPC can derive keys or spend funds. Native-only scans without token matches do not take this path.

**Remediation.** For the current native-only sweep feature, exclude token candidates before any match-conditioned receipt request unless token discovery is an explicit user choice. If token discovery is supported, either obtain receipt data independently of the match set and perform filtering locally, or defer the selected-token receipt lookup to a clearly authorized review step. Preserve receipt confirmation before crediting token value; removing that integrity check without replacing the privacy design would create a different problem.

**Consolidation guidance.** WV-06 correctly identifies baseline native balance/memo and Bitcoin outpoint disclosures and their prepared fixes. Narrow its updated TRON disposition to the native path, and record this residual token receipt disclosure as unresolved. The package blob is unchanged across all eight snapshots. No request was sent in this audit; the conclusion follows from the actual current call chain.

### WV-05 — Independent confirmation of selected-testnet identity mismatch

The views finding is confirmed. Current `apps/web/src/features/tron/rpc.ts`, lines 38–43, checks that block zero is not the mainnet genesis, but accepts no expected network and performs no comparison with the selected Nile/Shasta value. `features/tron/network.ts` already contains separate Nile and Shasta genesis constants. `TronView.tsx`, lines 109–118, authorizes the selected `net.id`, constructs the client for the user-entered URL, and calls the mainnet-only check without passing that selection.

The package's `createTronAdapter` binds its invoice chain label to its configured network, but it does not authenticate an RPC's chain; the browser feature directly uses the RPC helpers. A node for a different enabled test network can therefore be used under the selected network's displayed label. This is a Low testnet identity/consent issue. The actual mainnet-genesis refusal remains in place; this is not a claim that the constant is still wrong or that a truthful mainnet response is accepted. Use the primary ID WV-05 only once.

## Known baseline corrections and boundary checks

### Bitcoin spend-state consistency is improved in the updated group

Three inspected commits explain the three changed Bitcoin scan files: `9617e857` forwards local spends through `HeaderAnchoredTweakSource`; `e5b25efe` adds continuous spend coverage and chain-evidence reconciliation; `78e50547` preserves canonical spend evidence against duplicates and replayed observations.

The baseline state implementation has no explicit continuous negative-spend coverage, can replace a prior discovery record for a repeated outpoint, and can replace a first recorded spend with a later duplicate. Its parser does not enforce the new duplicate-identity and cross-field hash consistency checks. Reconciliation returns early when the last remembered block still agrees, without separately validating older discovery/spend evidence. The baseline header wrapper also drops the optional inner `getSpends` capability. These are known state-integrity and privacy integration limitations, addressed by the updated `headersync.ts`, `scanner.ts` and `state.ts` blobs recorded in the coverage file.

Their practical interpretation matters: baseline `apps/web/src/features/btc/scan.ts` re-derives historical matches and queries current outspend status before returning spendable outputs. The finding is not that arbitrary stored metadata alone authorizes a spend. The updated design adds explicit continuous coverage, preserves canonical evidence, verifies evidence against the local header chain, and keeps unknown coverage distinct from an unspent result. Treat these as supporting evidence for the existing Bitcoin local-spend/privacy work, not as three newly discovered fund-theft claims.

### Standalone legacy HTTP client has a weaker cancellation contract than the browser bridge

`packages/btc-silent-payments/src/scan/blindbit.ts`, blob `27b4ba539478dff52a2949b7659bb0ffa5f20664`, lines 136–149, races its operation against a timeout rejection without creating an abort controller for the underlying fetch/body read. A standalone caller can therefore observe a timeout while transport work continues. The byte cap bounds real response bodies; the body-less injected-response compatibility path delegates to `json()` without that cap.

This is a supporting API hardening observation, not an active Pages transport failure: `apps/web/src/features/btc/oracleBridge.ts`, inspected on baseline and consolidation, wraps the client in its own abort controller, 30-second deadline, capped body reader, fixed credential/redirect/referrer policy, and unconditional abort in `finally`. Keep those wrapper guarantees, and bring the standalone HTTP API up to the stronger cancellation/cleanup behavior of the package's gRPC-Web transport if it will be reused independently. No independent browser path lacking that wrapper was identified in the inspected integration.

### Residual secret-buffer cleanup opportunities

Several package-owned temporary buffers rely on garbage collection rather than explicit cleanup. Examples include the fresh ephemeral scalar and shared point in `packages/solana-stealth/src/stealth.ts`, discarded matched tweaks in `solana-stealth/src/scan.ts`, partially generated key pairs when a later random draw fails, and the previous node if `bip32Derive` throws before its successful-step cleanup. Label-table tweaks also need an explicit owner/lifetime when created internally for a scan.

These extend the crypto report's residual-buffer hardening observation; they are not additional exploit findings. No independent memory-disclosure primitive was established. Best-effort cleanup still has value, but JavaScript big integers, engine copies and garbage collection mean that source-level zeroization cannot promise complete erasure. MC-01 is distinct because retained derived keys are used by a pending operation after revocation, rather than merely remaining as residue.

### Security properties and declared limitations retained

The reviewed code validates compressed secp256k1 and prime-order ed25519 points, binds derived one-time keys back to expected addresses, uses dedicated domain labels for the Solana scheme, verifies produced signatures, and keeps scan secrets out of transport arguments. Bitcoin source and proof layers distinguish header-chain work, transaction inclusion, witness commitment, prevout truth and spent-state coverage; the documentation does not claim those different assurances are interchangeable. Header-only signet validation does not authenticate signet block signatures, and a source can withhold a heavier chain; these are declared limitations rather than newly introduced bypasses.

Solana token support explicitly excludes Token-2022 extensions requiring additional handling and places mint validation on the caller. The active browser demonstration's narrower asset scope must be preserved when presenting that support. TRON parsing checks its canonical raw transaction bytes against the JSON candidate and verifies token credits through receipts; MC-03 concerns when those receipts are requested, not removal of their integrity role.

## Validation and handoff

Only static reads, Git identity checks, complete diffs and bounded cross-layer searches were used. The coverage set was reconciled with the `multichain` inventory; all 63 records are reviewed and map to the exact Git blobs on the selected refs. No application tests or live chain operations were run and no production code was modified.

No assigned source remains unread. Consolidation should retain MC-01's supporting-library limitation, integrate the known MC-02 fix with its actual branch state, correct WV-06's TRON token-path disposition using MC-03, and count WV-05 once. The public-remote publication block in `AUDIT_HANDOFF.md` still applies; this report is local until separately authorized publication succeeds.
