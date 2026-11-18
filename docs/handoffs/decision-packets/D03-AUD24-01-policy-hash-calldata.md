# Decision packet D03 / AUD24-01: scheme-2 `policyHash` in router calldata

Prepared 2026-11-18 against `main` `5467c158` for the owner decision listed as D03 in
[NEXT_PHASE_QUEUE](../consolidation-20261118/NEXT_PHASE_QUEUE.md). **This packet changes nothing.** Scheme 2 stays
disabled and undeployed, and its ABI is unchanged, as
[GITHUB_PAGES_RELEASE_2026-11-12](../GITHUB_PAGES_RELEASE_2026-11-12.md) requires until the Pages release. This is
AI-assisted analysis, not an audit.

## 1. The finding

`GhostPayPolicyRouter` takes `PolicyRef{owner, policyHash}` on every entry point
(`packages/contracts/src/interfaces/IGhostPayPolicyRouter.sol:18-21`, used at :81, :104, :122, :142).
`policyHash = keccak256(abi.encode(destination, delaySeconds, limitsRoot))` is **constant per seller** (it is part of
the seller's public scheme-2 meta-address). Every scheme-2 payment therefore carries the same 32-byte word in
plaintext calldata. As a result:

- any chain observer can group all of a seller's scheme-2 payments **at payment time**, before any account is
  deployed or withdrawn from;
- with `limitsRoot == 0`, the destination can be brute-forced from `policyHash` over the factory's 1 h .. 30 d delay
  range.

This is a **regression** of round-3 finding N-01. Commit `50881e47` (2026-10-21) fixed it with a salt-only ABI
(DEVIATIONS R10). Consolidation `cfe7b32` brought back the pre-fix router, and the regression test
`test_policy_calldataDoesNotLinkPaymentsToSeller` was dropped with it. Audit 26 rated it **Medium (privacy)**, and
`test/audit/Review24.audit.t.sol::test_EXPLOIT_AUD24_01_policyHashLinksPaymentsInCalldata` reproduces it today.

**Exposure today: none.** Scheme 2 has no deployment and no manifest entry. It is outside the lean static beta
(`apps/web/scripts/localBuildProfile.mjs:118-122` excludes `features/policy` and `policy-scheme` from the lean
bundle), and the release matrix lists it as deferred.

## 2. ABI consumers (everything that must move together)

| Consumer | File(s) |
|---|---|
| Router contract and interface | `packages/contracts/src/GhostPayPolicyRouter.sol`, `src/interfaces/IGhostPayPolicyRouter.sol` |
| Contract tests / invariants / Echidna | `test/GhostPayPolicyRouter{,.invariant}.t.sol`, `test/PolicyRouterBase.t.sol`, `test/audit/Review24.audit.t.sol`, `test/echidna/*` (policy harnesses), `.gas-snapshot` |
| TS ABI, builder and decoder | `packages/policy-scheme/src/abi/policyRouter.ts`, `src/router.ts` (+ tests) |
| Payer-hiding relay | `packages/payer-hiding-contracts/src/RouterCall.sol` (`SELECTOR_POLICY`, gross-amount word index; AUD24-07 `MIN_POLICY` head size), `test/PHBase.t.sol` |
| Sponsor target allowlist | `packages/payer-sponsor/src/routerTargets.ts` (+ test), `src/index.ts` |
| Web (full profile only) | `apps/web/src/features/policy/**` via `policy-scheme` |
| Docs | `docs/CONTRACTS_SPEC.md` §4, `docs/developer/contracts-reference.md`, `byte-layouts.md`, `api/policy-scheme.md` (AUD24-03 says these already describe the salt-only ABI), `packages/contracts/DEVIATIONS.md` (R10–R13 were dropped with the regression; restore R10) |

## 3. Options

| | Option | Privacy effect | Cost / risk | Authority change |
|---|---|---|---|---|
| **A** | **Restore the salt-only ABI from `50881e47`.** Each entry point takes `bytes32 salt = keccak256(abi.encode(owner, policyHash))`; the router checks `stealth == Clones.predictDeterministicAddress(IMPLEMENTATION, salt, FACTORY)` with a cached immutable implementation. | Closes the payment-time link: salts are unique per payment because `owner` is. **Residual (inherent):** `PolicyAccountFactory.deploy` calldata publishes the policy pre-image, so the first deployment of any account links every deployed account of that seller from then on. | Public ABI change, but nothing is deployed, so there is no migration. About 9 files (§2) change in lockstep. The reference implementation and its regression tests exist at `50881e47`. Re-run Foundry, coverage, Slither, Echidna and Mythril, and redo the Mythril dispositions that name the router. | None. The router already verifies the same CREATE2 binding, only from a salt. One accepted edge from R10(a): the router can no longer reject a zero `owner`, so `policy-scheme` must refuse it before building the salt. |
| B | Keep `PolicyRef` but commit to `policyHash` per payment (e.g. `H(policyHash, owner)`) and verify in the account. | Similar to A for routing. | Larger: new verification path inside `PolicyAccount`, new invariants. No advantage over A. | Adds account-side logic. |
| C | Keep the current ABI and document the linkability. | Every scheme-2 payment stays seller-linkable on-chain; contradicts the CONTRACTS_SPEC §4 claim and the closed N-01. | Docs only. | None. |
| D | Keep scheme 2 disabled and decide later (status quo). | No exposure while undeployed. | None now. The decision is still needed before any scheme-2 deployment. | None. |

## 4. Recommendation

**D now, A before scheme 2 is ever deployed.** D is what the Pages-release freeze already requires. A is the only
option that restores the documented privacy property, it has a reviewed reference implementation, and it costs no
migration while nothing is deployed. Take B only if per-payment salts conflict with a future requirement; C is not
recommended.

## 5. Acceptance for option A (when scheduled)

1. RED first: turn `test_EXPLOIT_AUD24_01_policyHashLinksPaymentsInCalldata` into the restored
   `test_policy_calldataDoesNotLinkPaymentsToSeller`, which asserts the `policyHash` appears at no byte offset of two
   same-seller calldatas, their salts differ, and a cross-used salt is rejected. It must fail on the current ABI.
2. Port `50881e47` onto current `main`, including R10(a): `policy-scheme` refuses a zero owner and
   `test_policy_zeroOwnerSaltNotDetectable` pins it. Update `RouterCall.sol` (`SELECTOR_POLICY`, word index and
   `MIN_POLICY`, which also closes AUD24-07) and `payer-sponsor` targets in the same change.
3. Add the policy-scheme unit test "calldata never carries the seller-constant policyHash".
4. Gates on the exact head:
   - Foundry tests and `forge snapshot --check`, with the gas snapshot regenerated for the new ABI;
   - coverage, Slither and the Echidna policy and router harnesses;
   - Mythril records re-dispositioned;
   - policy-scheme, payer-hiding and payer-sponsor suites, and the web full profile.
5. Docs: CONTRACTS_SPEC §4 states the residual from §3 A; DEVIATIONS R10 is restored and dated; AUD24-01, -03 and
   -07 are marked closed in audit 26's successor.
6. Independent review of the contract diff before any scheme-2 deployment.

## 6. Owner decision requested

Choose D now plus A before deployment (recommended), or another option. Record the choice in this file, and have
the coordinator reflect it in NEXT_PHASE_QUEUE D03.
