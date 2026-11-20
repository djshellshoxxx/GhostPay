> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay core contracts and policy review — continuation 2

## Outcome

All production and configuration versions assigned to this worker are complete. The review records **one new low-severity verification finding**, **three informational observations**, **six retained known conditional risks**, **two design boundaries**, and **five historical issues whose latest implementations contain the described hardening**. These categories are separate so pre-existing constraints and historical fixes are not counted as newly discovered current vulnerabilities.

The owned ledger covers **117 unique path-and-blob versions**: **114 complete** and **3 contract test files pending**. Completed coverage represents 20,257 lines, including three generated ABI data files reviewed structurally. This is a bounded worker handoff, not a claim that the entire repository audit is finished. The exact remaining test and repository-tooling versions appear below.

## Immutable scope and method

| Label | Commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| latest | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |

All 20 selected heads were reconciled through the supplied selected-heads inventory. The companion JSON records each path, full Git blob, every selected head carrying that blob, line count, review method and completion state. An unchanged blob was reviewed once; a changed version was counted only after a complete file read or a complete delta against a fully read version. Inventory, search results and file counts were not treated as source review. All ten core contract/interface source files are unchanged across the selected heads.

Review was static and read-only. No application, test or configuration source was edited. No test suite, analyzer, fuzz campaign, vulnerability reproduction or live endpoint probe was executed. Existing test source was read as evidence of intended coverage; it is not a passing runtime result. No remote write or push was attempted by this worker.

| Assigned kind | Complete | Total unique versions |
|---|---:|---:|
| Production source, deployment and analysis tooling, generated ABIs | 50 | 50 |
| Configuration | 8 | 8 |
| Tests and test fixtures | 56 | 59 |
| **Total** | **114** | **117** |

The 114 completed versions comprise 111 full-source/full-delta reviews and 3 complete structural ABI reads. For the ABIs, every entry, recursive tuple field, mutability, event index marker and error definition was read from the parsed static data and reconciled with the fully read contracts. That method is explicitly recorded as reviewed-data, rather than literal line-by-line source review. The production total includes all five versions of the contract-local Python helpers, including the compatibility launcher and capture-mythril-evidence.py.

The 14 mock/Echidna paths provisionally excluded by the predecessor were restored to scope and fully read. They are first-party verification support for the core contracts. The JSON explicitly supersedes those provisional exclusions. The complete experimental web withdrawal helper was also read to calibrate call-path exposure; it is a supplemental read outside the 117 owned versions. Its blob is `292f043fa2966470785cb1a5119af0faac655fc3` and is identical on main and latest.

Policy functionality is a supporting full-profile feature, not a feature shipped in the lean Pages profile. The inspected experimental web deployment helper rejects factories with nonzero flat fees, and its signing functions construct typed data locally. Those facts materially limit the applicability of several fee-related and historical library findings. Source: `apps/web/src/features/policy/withdraw.ts:129-151` at **latest** (blob `292f043fa2966470785cb1a5119af0faac655fc3`).

## Current findings and observations

### CW2-01 — Router invariant handler can discard invalid-metadata acceptance evidence

**Severity/status:** Low. **Confidence:** High in static source behavior; runtime not exercised.

The payBadMetadata handler reverts from its successful external-call branch when the router accepts invalid metadata. The invariant configuration sets fail_on_revert=false. That handler revert rolls back the successful router operation and can be discarded by the invariant campaign; it leaves no persistent acceptance flag for an invariant to inspect. This weakens this stateful property. Separate router unit and fuzz tests still cover metadata rejection, and no production acceptance defect was established.

**Impact conditions.** A future regression accepts the malformed metadata exercised by this handler, and the campaign uses the checked-in invariant configuration. The finding concerns verification assurance, not an established current fund-loss path.

**Recommended change.** Record unexpected acceptance in persistent handler state and assert that it remains zero, or distinguish expected protocol reverts from handler assertion failures so every assertion failure fails the campaign.

**Validation criteria.** Every unexpected acceptance must produce a campaign failure; normal rejected calls may remain admissible exploration outcomes. Review that state rollback cannot erase the violation indicator.

**Source evidence:**

- `packages/contracts/test/GhostPayRouter.invariant.t.sol:103-118` at **latest** (blob `bd526370803a3098359f8e3d70661edf26edd2be`).
- `packages/contracts/foundry.toml:23-26` at **latest** (blob `59bf7337ea5fe8526869f22e9595e022027b4712`).

### CW2-O01 — CREATE2 documentation overstates cross-chain address separation

**Severity/status:** Informational. **Confidence:** High in static source behavior; runtime not exercised.

The factory documentation says a different chain yields a different account address. Its address calculation includes the factory, implementation and owner/policy salt, with no chain identifier. Equal addresses and inputs on two chains can therefore produce equal account addresses. Policy signatures remain chain-bound, so this is a documentation defect rather than a demonstrated signature replay flaw.

**Impact conditions.** Identical factory and implementation addresses and identical owner/policy inputs exist on multiple chains. Integrators rely on the stronger documentation claim.

**Recommended change.** Document the actual CREATE2 inputs and distinguish account address derivation from the chain-bound EIP-712 signature domain.

**Validation criteria.** The documented prediction formula must match the implementation; cross-chain isolation claims must identify the particular domain-binding mechanism.

**Source evidence:**

- `packages/contracts/src/PolicyAccountFactory.sol:18-21,109-110,170-190` at **latest** (blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`).
- `packages/contracts/src/PolicyAccount.sol:29-31,354-360` at **latest** (blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`).

### CW2-O02 — Predeploy static checks do not have the claimed checksum parity

**Severity/status:** Informational. **Confidence:** High in static source behavior; runtime not exercised.

The shell predeploy script claims the same static checks as the Forge scripts, but accepts any letter case in a 40-digit hexadecimal address. DeployBase requires the exact checksummed spelling. Without the optional Forge dry run, the preflight can print all checks passed before the deployment script rejects the configuration. The deployment checksum guard itself remains intact.

**Impact conditions.** An operator uses the static preflight with an address spelling rejected by DeployBase and does not enable the optional dry run.

**Recommended change.** Share the checksum validation or describe the shell checks as format checks and make the remaining validation requirement explicit.

**Validation criteria.** Preflight and deployment agree on accepted address spelling, or the preflight result precisely states the checks it omitted.

**Source evidence:**

- `packages/contracts/scripts/pre-deploy-check.sh:2-3,23,46-48,138-150` at **latest** (blob `eb882038fe26a25cd117cbb67292c606fdec1a8d`).
- `packages/contracts/script/DeployBase.s.sol:38-48` at **latest** (blob `8be0210512826f28aaec9a8be08baed672fb7056`).

### CW2-O03 — NatSpec gate omits the policy router

**Severity/status:** Informational. **Confidence:** High in static source behavior; runtime not exercised.

The NatSpec script describes coverage of production contracts but its explicit contract array omits GhostPayPolicyRouter. Existing documentation on that router does not repair the gate omission; later missing documentation in this production contract would be outside the stated gate.

**Impact conditions.** A documentation regression occurs only in GhostPayPolicyRouter and the project relies on this script for production-contract NatSpec coverage.

**Recommended change.** Include GhostPayPolicyRouter and derive or reconcile the contract list against an authoritative production-contract inventory.

**Validation criteria.** All five first-party core production contracts are included in the stated documentation gate.

**Source evidence:**

- `packages/contracts/scripts/check-natspec.sh:2-8` at **latest** (blob `aa9af794d11a2e0dc29c53d10a65770f2bac0387`).

## Retained known conditional risks

### CW2-K01 — Nonzero factory fees retain an immutable fee-token availability dependency

**Severity/status:** Medium, conditional. **Confidence:** High in static source behavior; runtime not exercised.

Fee collection occurs before account creation. Fee-token balance or allowance views that revert, or transfer behavior that violates the exact balance-delta checks, can prevent deployment to already-funded counterfactual policy addresses. The latest deployment script adds an explicit acknowledgement of this residual risk; it does not change the immutable factory. Ordinary clean transfer refusal can be waived under the factory conditions, so it would be inaccurate to say every blacklist or transfer refusal freezes deployment.

**Impact conditions.** FLAT_FEE is nonzero, an undeployed policy address already holds funds, and the chosen fee token becomes incompatible with the required views or deltas. This concerns supporting policy/direct integrations. The reviewed experimental web deployment helper rejects nonzero factory fees; this path is not a shipped lean-Pages feature.

**Recommended change.** Prefer a zero-fee factory where fee-token independence is required. Any future fee-bearing design should preserve policy materialization when the fee token is unavailable, while retaining policy authorization. Existing immutable deployments require an explicit migration or funding restriction strategy.

**Validation criteria.** Every offered funding path has a documented means to materialize and withdraw the resulting policy account under the stated token assumptions; an acknowledgement alone must not be represented as a technical fix.

**Existing tracking:** `N1`, `R-11`, `SEC-E2-01`.

**Source evidence:**

- `packages/contracts/src/PolicyAccountFactory.sol:113-117,128-163` at **latest** (blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`).
- `packages/contracts/script/DeployPolicy.s.sol:23-29,72-77` at **latest** (blob `c20b4f85726f3634d91be71372cdcafda778ce4b`).
- `apps/web/src/features/policy/withdraw.ts:147-151` at **latest** (blob `292f043fa2966470785cb1a5119af0faac655fc3`).

### CW2-K02 — Reusable public policy hashes expose a payment correlation identifier

**Severity/status:** Medium, privacy; conditional. **Confidence:** High in static source behavior; runtime not exercised.

The policy router exposes a public policy hash, and the factory computes that hash from destination, delay and limits root. Reusing those policy values retains the same public identifier even when one-time owner addresses differ. This supports correlation of payments sharing a policy; it does not alone prove a real-world identity or ownership.

**Impact conditions.** A receiver reuses the same policy values across scheme-2 payments. This is supporting policy functionality, not this specific field in the scheme-1 core payment path.

**Recommended change.** Ensure privacy claims describe policy-level linkability. If policy-payment unlinkability is a requirement, review a protocol commitment design that does not publish a stable reused identifier.

**Validation criteria.** Privacy documentation must match the identifiers actually emitted, and any revised commitment scheme must preserve payment-to-policy binding without an unintended stable public identifier.

**Existing tracking:** `AUD24-01`, `N-01 regression`.

**Source evidence:**

- `packages/contracts/src/GhostPayPolicyRouter.sol:17-19,93-104` at **latest** (blob `56f5ef6ef90c6441812f3695da55916ecce352c4`).
- `packages/contracts/src/PolicyAccountFactory.sol:180-190` at **latest** (blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`).

### CW2-K03 — Policy asset restrictions can leave funded assets without an eligible withdrawal

**Severity/status:** Medium, conditional. **Confidence:** High in static source behavior; runtime not exercised.

The policy router may send a native buffer into a policy account, while a nonzero limits root requires a matching asset leaf to authorize withdrawal. The payment builder receives the policy hash, not the policy contents needed to establish native-asset eligibility. A policy without an eligible native leaf can therefore retain an unusable native buffer. More generally, missing asset leaves and tokens incompatible with exact withdrawal deltas can strand direct deposits under the immutable policy. The native buffer is held by the policy account; it is not transaction gas delivered to the owner EOA.

**Impact conditions.** A restricted policy lacks the necessary asset eligibility, or funded token behavior violates withdrawal requirements. The native-buffer issue is conditional on selecting that payment option for such a policy.

**Recommended change.** Require authenticated policy eligibility before offering native buffers or assets, explain the buffer purpose accurately, and reject unsupported asset funding paths in clients. Evaluate any future owner-authorized recovery design separately against the existing restrictions.

**Validation criteria.** Every asset and buffer option offered by an integration is withdrawable under the authenticated policy and supported token behavior; recovery claims must account for immutable policy restrictions.

**Existing tracking:** `CONTRACTS-CORE-01`, `Policy audit P-02`.

**Source evidence:**

- `packages/contracts/src/GhostPayPolicyRouter.sol:160-177` at **latest** (blob `56f5ef6ef90c6441812f3695da55916ecce352c4`).
- `packages/contracts/src/PolicyAccount.sol:26-43,170-185,220-239` at **latest** (blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`).
- `packages/policy-scheme/src/router.ts:40-41,128-137` at **latest** (blob `35f20d3f07e02f42fac244552f4b50bce292402f`).

### CW2-K04 — Fee waiver assumptions do not distinguish sender-controlled transfer vetoes

**Severity/status:** Low, economic; conditional. **Confidence:** High in static source behavior; runtime not exercised.

The factory allows fee-free deployment after a clean failed transfer when the prior fee balance and allowance are sufficient and observable state remains unchanged. A fee token with a payer-controlled sender hook can make that failure indistinguishable from the issuer-side refusal the waiver is intended to tolerate. The resulting risk is missed deployment-fee revenue, not policy ownership bypass or withdrawal of another owner's funds.

**Impact conditions.** An integration selects a nonzero factory fee and a fee token with suitable sender-controlled transfer behavior. The reviewed web helper only supports zero-fee factories.

**Recommended change.** Explicitly qualify fee-token behavior, prefer zero fees where that qualification cannot be maintained, or redesign fee collection and liveness together.

**Validation criteria.** Fee-token assumptions must address who can veto a transfer; accounting and availability expectations must remain consistent under all supported token behaviors.

**Existing tracking:** `AUD24-02`.

**Source evidence:**

- `packages/contracts/src/PolicyAccountFactory.sol:128-163` at **latest** (blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`).
- `apps/web/src/features/policy/withdraw.ts:147-151` at **latest** (blob `292f043fa2966470785cb1a5119af0faac655fc3`).

### CW2-K05 — Immutable fee-recipient acceptance remains a payment availability dependency

**Severity/status:** Medium, availability; conditional. **Confidence:** High in static source behavior; runtime not exercised.

Core and policy router transfers atomically deliver a nonzero fee to an immutable recipient. If that recipient cannot receive the relevant native or token payment, the transaction reverts. Token restrictions on the recipient or a native-rejecting recipient contract can therefore disable affected nonzero-fee payment paths. Atomic rollback prevents this from retaining the attempted payer funds in a partially completed payment.

**Impact conditions.** The computed fee is nonzero and the configured fee recipient becomes unable to receive the chosen asset. There is no mutable recipient repair path in these contracts.

**Recommended change.** Qualify the recipient and assets at deployment, monitor the supported payment assumptions, and maintain clear client handling and deployment migration procedures. Any future resilience mechanism must preserve transparent fee routing.

**Validation criteria.** Unavailable recipient/asset combinations are detected and surfaced before users rely on a successful payment; migration expectations reflect contract immutability.

**Existing tracking:** `Router audit R-01`.

**Source evidence:**

- `packages/contracts/src/GhostPayRouter.sol:54-66,121-128,179-197` at **latest** (blob `bc6369fffe44ebcad5548ae731860161444e7998`).
- `packages/contracts/src/GhostPayPolicyRouter.sol:109-139,179-207` at **latest** (blob `56f5ef6ef90c6441812f3695da55916ecce352c4`).

### CW2-K06 — Sponsored sweeps retain relayer execution-cost and owner-state risks

**Severity/status:** Low, economic; conditional. **Confidence:** High in static source behavior; runtime not exercised.

Sweep execution calls token code and depends on owner state at execution time. A sponsor can incur transaction costs when token behavior, owner balance or allowance differs from the state it previously checked. The sweep signature binds the fee recipient and withdrawal destination, and unused token allowance alone does not authorize a new sweep. This is a protocol sponsorship assumption; this worker did not establish that a current relayer service lacks the relevant controls.

**Impact conditions.** A service sponsors transactions based on permissionless owner requests, and its supported token or execution policy permits costly failures or stale owner state.

**Recommended change.** Apply supported-token qualification, fresh authorization/state checks, bounded gas expenditure and an explicit failed-transaction budget in the sponsoring service.

**Validation criteria.** Sponsor economics must account for failed execution, and any production service claim must be checked in that service rather than inferred from the contract alone.

**Existing tracking:** `Sweep audit S-01`, `Sweep audit S-05`.

**Source evidence:**

- `packages/contracts/src/GhostPaySweepRelayer.sol:46-59,118-143` at **latest** (blob `3095160e30f5bcc109e7786ec410ab81741dadd4`).

## Design boundaries and integration assumptions

### CW2-D01 — Fee rounding and native-buffer exemptions are explicit economic semantics

**Severity/status:** Informational. **Confidence:** High in static source behavior; runtime not exercised.

The percentage fee uses integer flooring, and the native buffer attached to a token payment is not included in that percentage fee. These are existing contract semantics rather than a newly identified authorization defect. Claims that all transmitted native value is charged would need to account for the buffer exemption and small-payment rounding.

**Impact conditions.** A product or economic claim assumes fees on all value, including native buffers or amounts that round below a fee unit.

**Recommended change.** Align fee documentation, displays and revenue assumptions with the actual computation. Treat changes to the exemption as protocol changes.

**Validation criteria.** Client explanations and accounting agree with the contract fee formula for each payment type.

**Existing tracking:** `CONTRACTS-CORE-02`, `existing dust-fee tests`.

**Source evidence:**

- `packages/contracts/src/GhostPayRouter.sol:132-146,215-218` at **latest** (blob `bc6369fffe44ebcad5548ae731860161444e7998`).
- `packages/contracts/src/GhostPayPolicyRouter.sol:33-34,160-177` at **latest** (blob `56f5ef6ef90c6441812f3695da55916ecce352c4`).

### CW2-D02 — Announcement syntax does not by itself establish payment authenticity

**Severity/status:** Informational. **Confidence:** High in static source behavior; runtime not exercised.

The router enforces the public-key encoding length and prefix and a structured metadata format; callers still choose assets and announcement inputs. Integrations must perform the remaining point, derivation, asset and actual-payment checks. The predecessor crypto review covered the relevant point-validation code. No current client spoofing path was established by this worker.

**Impact conditions.** An integration treats announcement appearance alone as authenticated payment or receiver ownership.

**Recommended change.** Preserve full key/derivation checks, supported-asset policy and transaction-result verification at the receiving integration boundary.

**Validation criteria.** Receiver credit and payment presentation must depend on verified payment facts, not only event shape or a candidate address.

**Existing tracking:** `Router audit R-03`.

**Source evidence:**

- `packages/contracts/src/GhostPayRouter.sol:220-226` at **latest** (blob `bc6369fffe44ebcad5548ae731860161444e7998`).

## Historical main issues with latest hardening

### CW2-H01 — Main policy signing helper lacked the current canonical policy-only boundary

**Severity/status:** Historical; fixed latest. **Confidence:** High in static source behavior; runtime not exercised.

Main checked a caller-provided typed-data digest without restricting the domain and type structure to this package's policy structs, and read the caller digest again during signing. The release/latest implementation reconstructs the digest from validated canonical policy fields once and signs that local value. The inspected web withdrawal and cancel helpers construct their own typed data, so an externally reachable main-web path supplying arbitrary typed-data objects was not established.

**Impact conditions.** Historical exposure requires a caller able to supply an untrusted typed-data object to the secret-bearing library helper. The changed library boundary must not be presented as an established remote compromise of the web app.

**Recommended change.** Retain the canonical policy-only reconstruction and one-time input capture on branches that ship this helper.

**Validation criteria.** Only the exact supported domain, type and message fields reach the signer; subsequent mutation of caller-owned objects cannot alter the digest being signed.

**Source evidence:**

- `packages/policy-scheme/src/eip712.ts:321-364` at **main** (blob `5a300009bf3bd95e3c0bc808acffaa00ac366f36`).
- `packages/policy-scheme/src/eip712.ts:352-385,413-439` at **latest** (blob `2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7`).
- `apps/web/src/features/policy/withdraw.ts:129-144` at **latest** (blob `292f043fa2966470785cb1a5119af0faac655fc3`).

### CW2-H02 — Main policy proofs lacked the current stored-field binding checks

**Severity/status:** Historical; fixed latest. **Confidence:** High in static source behavior; runtime not exercised.

The historical library verified stored Merkle membership without all of the current recomputation checks tying token, limit and window fields to the stored leaf. Latest code adds that binding in proof retrieval and withdrawal construction. The on-chain account already recomputes and verifies the leaf, so this historical weakness supports client misplanning or rejected requests rather than an on-chain limit bypass.

**Impact conditions.** Untrusted or corrupted restored policy-tree data reaches historical client helpers.

**Recommended change.** Retain stored-leaf recomputation and withdrawal-field binding when restoring policy data and building requests.

**Validation criteria.** Every accepted proof has a leaf recomputed from its stated token, limit and window, and malformed stored data is rejected before signing.

**Source evidence:**

- `packages/policy-scheme/src/limits.ts:147-183` at **main** (blob `b25c1fa2a7b50ccb800c5eedfca2f927c33697a9`).
- `packages/policy-scheme/src/limits.ts:149-163` at **latest** (blob `2836251024e902ab3bbfd203b90f6ebacd42a9db`).
- `packages/policy-scheme/src/eip712.ts:223-272` at **latest** (blob `2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7`).
- `packages/contracts/src/PolicyAccount.sol:170-185` at **latest** (blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`).

### CW2-H03 — Main policy calldata decoder lacked current canonical and metadata checks

**Severity/status:** Historical; fixed latest. **Confidence:** High in static source behavior; runtime not exercised.

The historical decoder parsed the expected method and bound the predicted account, while latest additionally requires canonical re-encoding, full ephemeral-point parsing and metadata consistency with payment asset and amount. These are strengthened decoder checks. Even the current decoder cannot establish that a separately supplied receiver policy is authentic; integrations must preserve that independent binding.

**Impact conditions.** Historical callers rely on this helper to validate untrusted payment calldata or treat successful decoding as broader payee authentication.

**Recommended change.** Retain the latest canonical decoder and keep receiver-policy authentication explicit in the caller.

**Validation criteria.** Accepted calldata is canonical and internally consistent, and successful decoding is not equated with authenticated receiver ownership.

**Source evidence:**

- `packages/policy-scheme/src/router.ts:164-187` at **main** (blob `3e1af8ed068229466ec14478a39aa07bc5aaccb1`).
- `packages/policy-scheme/src/router.ts:168-227` at **latest** (blob `35f20d3f07e02f42fac244552f4b50bce292402f`).

### CW2-H04 — Main viewing-secret cleanup did not cover earlier validation failures

**Severity/status:** Historical; fixed latest. **Confidence:** High in static source behavior; runtime not exercised.

The historical policy derivation helper copied the viewing secret before validations outside its cleanup region. The latest helper validates the nonsecret inputs first and protects the secret-copy lifetime. This is a best-effort memory-hygiene improvement in JavaScript; no remote secret-exfiltration path was established.

**Impact conditions.** A historical helper invocation fails validation after creating the temporary secret copy.

**Recommended change.** Retain the latest ordering and ensure all secret-copy lifetimes enter guaranteed cleanup immediately.

**Validation criteria.** Every local secret copy is covered by cleanup on successful and exceptional exits, with no stronger memory-erasure guarantee than the runtime can provide.

**Source evidence:**

- `packages/policy-scheme/src/derive.ts:175-181` at **main** (blob `d70af630f3dfe38100f4714b1e8f5c38ab4d4e89`).
- `packages/policy-scheme/src/derive.ts:176-184` at **latest** (blob `ce4be42c09dec5e77b34f185c2af717687143330`).

### CW2-H05 — Main Mythril output handling lacked the latest completeness evidence

**Severity/status:** Historical; fixed latest. **Confidence:** High in static source behavior; runtime not exercised.

The historical wrapper and compatibility launcher lacked the current per-run completeness telemetry and strict evidence checks. Latest code requires fresh exclusive telemetry, ready state, a single report and zero recorded exceptions/timeouts/errors, and records source/tool identity. These changes strengthen evidence that the requested bounded analysis completed; neither version constitutes proof that the contracts have no vulnerabilities. No analyzer was executed in this audit.

**Impact conditions.** A historical analysis result is treated as a complete successful run despite missing completeness evidence.

**Recommended change.** Retain the latest fail-closed evidence path, strict parsing and source/tool identity checks; keep conclusions bounded to the actual analysis performed.

**Validation criteria.** Missing, duplicate, malformed, stale or incomplete analysis evidence cannot be presented as a successful completed security analysis.

**Source evidence:**

- `packages/contracts/scripts/run-mythril.sh:1-36` at **main** (blob `7ad37efb96f6b5e1f54ffbdfc8a644ef3b03ab4e`).
- `packages/contracts/scripts/mythril-compat.py:1-15` at **main** (blob `bd78f6b0cecc1f9b43c2a933a44981d38e403521`).
- `packages/contracts/scripts/run-mythril.sh:1-54` at **latest** (blob `a277ff0061e0d08f9850957f3dd9d96a59ad17ec`).
- `packages/contracts/scripts/mythril-compat.py:1-113` at **latest** (blob `4604d3055535ac85274c0bf83afdee8e6becbd9a`).
- `packages/contracts/scripts/capture-mythril-evidence.py:1-210` at **latest** (blob `e0d317c8462e9119a1564106562ca7db5afe92d9`).

## Controls established by the source review

The review traced payment atomicity, authorization, amount accounting and policy state transitions through the complete core implementations. The core routers guard payment entries against reentrancy, validate their expected metadata structure, enforce destination restrictions, and check receiving token deltas. Permit failure does not create an authorization bypass because the eventual token transfer still needs the required allowance. The policy router binds the intended counterfactual account to the configured factory, owner and policy hash. These observations support the specific controls; they are not a proof of absence of other defects. Source: `packages/contracts/src/GhostPayRouter.sol:1-250` at **latest** (blob `bc6369fffe44ebcad5548ae731860161444e7998`). `packages/contracts/src/GhostPayPolicyRouter.sol:1-299` at **latest** (blob `56f5ef6ef90c6441812f3695da55916ecce352c4`).

The sweep relayer binds signed fields to the chain and contract domain, enforces low-s signatures and per-owner nonce bitmaps, and updates nonce state before token interactions. Policy accounts restrict clone initialization, bind requests to owner authorization and the account domain, check Merkle-limited withdrawal parameters, delay withdrawals, and use a longer delay for destination changes. Cancellation and execution paths were read with their state transitions. The factory fixes implementation and policy-address inputs and verifies fee transfer deltas. Source: `packages/contracts/src/GhostPaySweepRelayer.sol:1-150` at **latest** (blob `3095160e30f5bcc109e7786ec410ab81741dadd4`). `packages/contracts/src/PolicyAccount.sol:1-391` at **latest** (blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`). `packages/contracts/src/PolicyAccountFactory.sol:1-192` at **latest** (blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`).

Test-source coverage read here includes signature-domain and field binding, replay and nonce boundaries, token balance deltas, reentrancy constraints, cancellation, destination timelocks, compiler/deployment configuration checks, analysis-result handling, and reachability canaries. The latest analysis wrapper evidence is fail-closed for the specific malformed or incomplete outputs it checks. The remaining large test files listed below were not used to make a completeness claim.

## Scope exclusions and resolved provisional exclusions

The following separate feature packages are outside this worker's core-contract/policy-library assignment: pool-contracts, pool-circuits, pool-prover, pool-sdk, pool-relayer, confidential-contracts, confidential-amounts, payer-hiding-contracts, and payer-sponsor/src/erc4337. Their implementations are not imported by the reviewed core-contract/policy runtime. This is an assignment boundary; it does not declare that every separately exposed full-profile feature is outside the overall audit. The root scope ledger governs any further assignment. Third-party implementations under packages/contracts/lib were not independently audited; their interfaces and caller assumptions were considered. Reading the small announcer reference fixture does not constitute a vendor audit.

All of these previously provisional core verification exclusions are now complete:

- `packages/contracts/test/echidna/EchidnaPolicy.sol`.
- `packages/contracts/test/echidna/EchidnaPolicyReachability.t.sol`.
- `packages/contracts/test/echidna/EchidnaRouter.sol`.
- `packages/contracts/test/echidna/EchidnaSweep.sol`.
- `packages/contracts/test/mocks/BlacklistToken.sol`.
- `packages/contracts/test/mocks/FalseReturnToken.sol`.
- `packages/contracts/test/mocks/FeeOnTransferToken.sol`.
- `packages/contracts/test/mocks/HookToken.sol`.
- `packages/contracts/test/mocks/MockERC20.sol`.
- `packages/contracts/test/mocks/NativeReceivers.sol`.
- `packages/contracts/test/mocks/NoReturnToken.sol`.
- `packages/contracts/test/mocks/PermitToken.sol`.
- `packages/contracts/test/mocks/RebasingToken.sol`.
- `packages/contracts/test/mocks/ReentrantToken.sol`.

## Exact remaining work for fresh workers

### Three owned contract tests — no content review completed

All three blobs are identical across the 20 selected heads. Together they contain 2,935 lines. Read them in full and reconcile any additional findings against the already completed contract source.

| Path | Git blob | Lines |
|---|---|---:|
| `packages/contracts/test/GhostPayPolicyRouter.t.sol` | `0e9db93e7a67f65003e32f05ca83272e94980003` | 1186 |
| `packages/contracts/test/MythrilExpiryDispositions.t.sol` | `b1ab1a4823f7c562f6d07e9b51bbfbeb4ca3dbb8` | 594 |
| `packages/contracts/test/MythrilFactoryDispositions.t.sol` | `be677e1b934bfb4275abf66771d98c75e45516c5` | 1155 |

### Repository tooling outside the assigned package roots — not reviewed here

The following 15 exact path-and-blob versions were discovered during scope reconciliation. They are pending, not excluded and not credited as reviewed. Per-head membership is preserved in the JSON. A repeated path with a different blob requires its own complete read or complete delta against a fully read version.

| Path | Git blob | Lines |
|---|---|---:|
| `scripts/testnet/deploy.sh` | `74ff0683949f4d7cad791a8ea76abff57989b810` | 107 |
| `scripts/testnet/make-manifest.mjs` | `62a562773b70fd09a5a9c4df01126bacf29bc44a` | 182 |
| `scripts/testnet/make-manifest.test.mjs` | `63241a487df8093b929f2255d370165c7782b63b` | 47 |
| `scripts/testnet/verify-sources.sh` | `ec27186bf1cc23b83fd41a21afb7f8f293ea27c6` | 49 |
| `scripts/testnet/verify-sources.test.mjs` | `4f57fc4ce8be691fb36380da44d3afa1e418c33c` | 66 |
| `scripts/tests/contract-analysis-workflow.test.mjs` | `eb49b85471b9eb139acb768c942aedc2b354e9d6` | 238 |
| `scripts/tests/echidna-runner.test.mjs` | `cd97972b2346c5adac7860dba7144b6180979346` | 101 |
| `scripts/tests/mythril-runner.test.mjs` | `3852bf05e014330882702bcd010b14fd6e1ae218` | 102 |
| `scripts/contract-analysis/mythril-disposition-check.mjs` | `c18bd4337dd18f197fe7d3e287b37691f9fea240` | 281 |
| `scripts/tests/contract-analysis-workflow.test.mjs` | `50a72a2ad5a883e37aca82114fd77ed9330d1dac` | 292 |
| `scripts/tests/mythril-completeness.test.mjs` | `c3abc1c843b91f20d4497f3c45b48685af3c343e` | 139 |
| `scripts/tests/mythril-disposition-check.test.mjs` | `d8d056f09b84ece35f7c768970a637a929f1285c` | 191 |
| `scripts/tests/mythril-evidence.test.mjs` | `c88dfc1ca8b6274d0607fed7e524b62c4a265c98` | 120 |
| `scripts/tests/mythril-runner.test.mjs` | `1d4f6661ae838547d02c453edc451b7de7655a6f` | 125 |
| `scripts/tests/policy-predeploy.test.mjs` | `c8911d80b1851299c4af00b310cde2239695bc14` | 84 |

### Other predecessor work — untouched by this continuation

The predecessor ledger still contains 42 other crypto-package test versions and 49 configuration versions for a fresh worker. This continuation did not read or complete them. Resume from crypto_protocol_review.json for their exact path, blob and branch membership; preserve its 73 production and 33 test reviews already complete. These figures are handoff counts from that predecessor, not additional coverage claimed by this report.

### Continuation instructions

Use immutable Git blobs and the JSON ledgers. Continue static source reading only; do not run tests, analyzers, proofs of concept, fuzzing or live probes. Do not modify application, tests or configuration, and do not push or write remotely. Keep findings defensive: source evidence, impact conditions, confidence, remediation and non-operational acceptance criteria. Checkpoint exact completion states before context exhaustion, and assign fresh workers the remaining blobs. The root report must remain explicit about incomplete scope until these pending entries are closed.
