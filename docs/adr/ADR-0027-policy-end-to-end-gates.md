# ADR-0027: Policy-account end-to-end boundaries and completion gates

Date: 2026-11-09. Status: **Proposed design; experimental feature remains disabled by default.**
Source inspected: PR #88 `0a68a57b77a70d3bcf4635ccbc5190d735e71f40`, including PR #84.
This supplements [ADR-0014 and ADR-0023](ADR-LOG.md), and corrects their older implementation inventory. It authorizes no deployment, release, trust-root change or mainnet use.

## Current implementation, verified from code

| Stage | Existing implementation | Remaining boundary |
| --- | --- | --- |
| Create | `apps/web/src/features/policy/PolicyCreate.tsx`, `create.ts`; destination/delay/limits; scheme-2 meta-address and downloadable strict policy record | No chain/factory/implementation identity in the v1 record; no supported invoice format for scheme 2 |
| Derive | `packages/policy-scheme/src/derive.ts`, `policy.ts`; owner derivation and CREATE2 prediction | Vectors cover the local fixture deployment, not a published testnet deployment |
| Pay | `PolicyPay.tsx`, `pay.ts`, `send.ts`; native/ERC-20 router calldata, exact approvals, review/session/deadline checks, duplicate-attempt journal | Manually entered token addresses; no integration with an approved token profile or scheme-2 invoice |
| Deployment check | `chain.ts::verifyPolicyDeployment`; testnet/client chain, code presence, getter consistency, fee/scheme/factory checks | Getters and non-empty code do not authenticate bytecode; `PINNED_POLICY_DEPLOYMENTS` is empty |
| Scan | `scan2.ts`; scheme-specific announcements, local owner/account prediction, cursor/reorg handling | `Scheme2Match` contains unauthenticated payer metadata; no `PaymentVerification`-equivalent result is produced |
| Deploy / withdraw | `PolicyReceive.tsx`, `withdraw.ts`; deterministic deploy call, account read, limits/headroom, typed-data request/cancel/execute | The UI refuses non-zero factory fees; account history/readback is not a complete fresh evidence snapshot before signing; pending execution exists only in component state |
| Restore | `record.ts`; bounded strict v1 record, hash/root/meta-address checks, bounded candidate policy search; owner key re-derived from seller keys and announcement | Record restoration is not recovery of lost seller keys; losing limit leaves can prevent reconstruction |
| Recover lost owner key | No function in `PolicyAccount.sol` or its ABI changes `owner` after initialization | ADR-0023 is a contract design, not an implemented recovery path |

The feature is gated by `VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1`; `PolicyView` lists only testnets and `verifyPolicyDeployment` rejects mainnets. The ordinary invoice schema explicitly accepts only `schemeId: 1`. The ordinary relayer is not a policy withdrawal service. Existing app and local-Anvil tests exercise useful pieces, but these facts do not establish the complete product path requested in the completion gates.

## Decision

Keep the existing experimental module isolated and off by default. Do not extend ordinary Pay/Scan/receipt status or advertise policy payments as supported until every gate below has evidence. Implement bounded safety fixes to the existing module independently of enablement.

The completed scope fix invalidates deployment verification and its Pay/Receive state immediately when chain, factory or router input changes, when verification restarts, or when the view is left. Late success/failure results cannot overwrite a newer scope. A captured deployment guard joins the seller-session guard immediately before wallet submission. Scan captures the seller session before its asynchronous fetch; replacing or locking that session hides the old cursor, matches and account actions and requires a fresh scan. Account token input stays fixed while its check/action is pending. These changes do not supply missing contract authentication, recovery or payment verification.

## Required supported path

1. **Select a supported testnet profile.** Bind chain ID, router, factory, implementation, announcer, fee parameters and supported assets to authenticated deployment data. Read bytecode and immutable getters at one explicit canonical block. Refuse missing code, mismatched code hashes, proxy/implementation drift, disabled chains and unsupported assets. Do not let pasted addresses become trusted configuration merely because getters agree.
2. **Create and back up a policy.** Validate the destination, bounded delay and each supported token limit; derive the canonical policy hash and deterministic owner/account. Display the exact chain and deployment identity. Require an explicit local policy-record download and seller-key-backup acknowledgement. A versioned successor to the record must bind deployment identity; unknown versions and fields fail closed. The record contains public configuration with privacy impact and never contains seller secrets.
3. **Review and pay.** Use a versioned scheme-2 invoice or an explicitly separate payment request with stable identity, chain, deployment, payee meta-address, token, amount and validity. Never reinterpret a scheme-1 invoice as scheme 2. Recheck destination/owner/policy/account, exact approval, amount, chain, deadline and scope before each wallet request. Preserve every broadcast hash and an unknown-outcome lock; explicit retry must follow outcome review.
4. **Verify receipt of value.** Match the announcement locally, then require canonical block identity, correct announcer and router caller, successful direct router transaction, exact decoded owner/policy/account/token/amount, and an exact independently checked native value or ERC-20 transfer. Bind evidence to a unique event/transaction so repeated announcements cannot credit twice. Metadata, account balance, a QR or a seller signature alone never proves this payment. Reorgs invalidate credited observations and any dependent proposed reconciliation. Unsupported indirect/router/token semantics remain unverified.
5. **Deploy and withdraw.** Verify CREATE2 identity, clone implementation and fresh account owner/destination/delay/root/hash. Gather bounded, complete pending-request history and current nonce/window state at a coherent block; incomplete/disagreeing history blocks signing. Check token support and proof, amount, free balance, conservative window headroom, deadline and unused nonce immediately before signing, then recheck scope before submission. Record request IDs and actual on-chain execution times, allowing reload/reorg recovery from canonical chain state. An estimated time or broadcast hash is not a successful execution. A destination change requires renewed policy review.
6. **Recover.** Distinguish policy-record restoration, seller-key-backup restoration, pending-operation discovery and on-chain lost-key recovery. The first two must be exercised in a fresh profile. The latter requires an accepted, implemented, tested contract revision; the current contract cannot do it.

## Recovery design blockers requiring a revised ADR-0023

ADR-0023 proposes destination-signed recovery after `T_rec` of owner inactivity and limits cancellation to once per `T_rec`. Its bounded-griefing claim is incomplete: it also resets `lastOwnerActionAt` on accepted owner actions. An attacker holding the owner key can keep issuing accepted actions before the inactivity period expires, preventing a recovery proposal from becoming eligible. Limiting `cancelRecovery` alone does not bound that attack. Resolve whether destination recovery needs a non-renewable challenge window or a different authority model; specify the availability and theft trade-off before changing contracts.

The final design must define simultaneous destination change and recovery, which destination key is authoritative, ERC-1271 behavior, nonce consumption/replay, cancellation budget persistence across proposals, owner-action effects on timers, pending withdrawal invalidation, clone initialization and counterfactual deployment. Tests must prove a finite worst-case recovery time under continuous malicious owner activity if bounded griefing is claimed. Recovery must not silently allow a signature from a former destination to regain authority.

Factory fee handling has already evolved: `_collectFee` in `PolicyAccountFactory.sol` conditionally waives a failed transfer only when the payer had sufficient balance/allowance and balances/allowance did not mutate. It is incorrect to describe all old fee-token findings as untouched. Its balance/allowance calls can still revert; the UI also explicitly refuses non-zero fees. Decide and test the supported fee/asset policy as part of the accepted revision; this document changes neither fees nor contracts.

## Acceptance matrix for the next implementation

| Boundary | Required adversarial cases and pass condition |
| --- | --- |
| Deployment / chain | Wrong chain, mainnet, zero/missing code, malicious getter-compatible bytecode, wrong factory/implementation/announcer/router/fee, stale scope: no preparation or wallet request |
| Policy / record | Unknown version, oversized JSON, malformed keys, changed destination/delay/root/hash/meta-address, missing/duplicate/unsupported token leaves, wrong chain/deployment: no imported active policy |
| Payment | Wrong owner/account/policy/token/amount/value, excessive approval, expired deadline, edited scope and duplicate/unknown prior attempt: no new wallet request; already-broadcast approvals remain explicitly recorded |
| Observation | Wrong router caller, indirect transaction, reverted or wrong-hash receipt, mismatched transfer/value, spoofed metadata, duplicate evidence, unsupported asset and reorg: never promote to verified payment |
| Withdrawal | Wrong owner or implementation, changed destination, pending destination change, used nonce, expired signature, amount at/below/above limit, mixed or partial history, competing requests and reorg: refuse or conservatively reduce the plan; contracts enforce the same bound |
| Recovery | Lost record with/without limits; backup restore; lost owner key; compromised owner continuously active; replayed/expired recovery signature; wrong/former destination; ERC-1271 failure; repeated cancels; restart and reorg: correct bounded state transition or explicit unrecoverable state |
| Browser journey | Create → backup → pay → independently verify → deploy → request → reload → execute → fresh-profile restore; wrong-chain/input edits and locked/replaced session at each awaited boundary; testnet-only and disabled build remain enforced |

Acceptance evidence must name the exact app and contract commits, test commands and skipped cases. Real deployments, published trust roots and audited recovery are separate prerequisites; they are not inferred from mocked browser tests or a local Anvil pass. No external deployment or funded-wallet action is performed by this change.

## Validation of the bounded scope fix

Implementation commit: `47454c82e91e80ef86a9c5375744abc4109ec7f8`, based on PR #88. Node 24.22.1, Vitest 5.0.5. The following ran against the source tree committed at that SHA; no test/deadline/coverage gate was relaxed.

| Command / scope | Result |
| --- | --- |
| `cd apps/web && ../../node_modules/.bin/vitest run src/features/policy --maxWorkers=1` | 104 passed, 7 files, no skips |
| Same new `PolicyView.scope.test.tsx` against pristine parent `0a68a57` in a separate worktree | All 8 new regressions failed, including a mocked wallet request sent after the router input was edited |
| `npm run typecheck -w @ghostpay/web` | Passed |
| `node_modules/.bin/eslint --config eslint.config.js apps/web/src/features/policy` | Passed |
| `ANVIL_BIN=/workspace/scratch/0eeb5e74bd49/tooling/anvil REQUIRE_ANVIL=1 npm test -w @ghostpay/policy-scheme` | 95 passed, 6 files, no skips; statement/branch/function/line coverage 97.11/94.70/100/99.74% |
| `git diff --check` | Passed |

The package run used Foundry/Anvil 1.8.5 and artifacts compiled from the unchanged `packages/contracts` source inherited from PR #88. It demonstrates local contract/client behavior, not recovery support or a public deployment. A separate read-only reviewer inspected the bounded app diff and this ADR and reported no blocking finding within that scope. Root integration validation and hosted CI remain separate evidence on the eventual combined head.
