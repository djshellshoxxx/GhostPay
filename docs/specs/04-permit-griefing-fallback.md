# 04 Permit griefing fallback and error surfacing

Priority P1 | Effort S-M (2-3 d) | Owner: contracts (spec only) + chain-adapters + web + relayer | Deps: none; contract change only if option C chosen
Sources: research DOC-6, DOC-7, DOC-9; ERC-2612 front-run text; CONTRACTS_SPEC s2; DEV note on `PermitSig.deadline`.

## 1. Problem
`sweepWithPermit` and `payERC20WithPermit` already wrap/should tolerate front-run permit (try/catch). Gaps: (a) a permit that failed for a real reason (bad signature, wrong nonce, DAI-style variant) yields a generic allowance revert; (b) `PermitSig.deadline` is outside the sweep signature (harmless, undocumented); (c) relayer may waste gas when owner revokes/sweeps first (EIP-7702 text).

## 2. Design (off-chain first, no contract change)
Client/relayer **pre-flight classifier** in `chain-adapters/src/permit.ts`:
```ts
type PermitState = 'ok_to_permit' | 'already_allowed' | 'nonce_consumed' | 'sig_invalid' | 'expired' | 'unsupported_token';
async function classifyPermit(token, owner, spender, value, sig, now): Promise<PermitState>
```
Steps via `eth_call`: read `allowance(owner,spender)` (>= value -> `already_allowed`, skip permit), `nonces(owner)` vs signed nonce, `DOMAIN_SEPARATOR()` vs locally rebuilt, simulate `permit` (static call) to detect invalid signature. Token capability table (spec 09) marks DAI-style/no-permit tokens `unsupported_token` before any signing prompt.
Fallback ladder for sweeps: 1) `sweepWithPermit`; 2) if `already_allowed` or permit consumed by front-runner, call `sweep` (allowance path) automatically; 3) if `sig_invalid`/`unsupported`, UI offers: owner pays gas via buffer, or owner sends a one-time `approve` after buffer funding; never retry silently.
Relayer protections: simulate full call (`eth_call` + `estimateGas`) immediately before broadcast; reject quote if balance < amount or allowance zero and permit simulation fails; quote TTL <= 60 s; price a griefing margin into sponsor fee (`griefReserveBps`, operator-configurable, default UNVERIFIED/to be tuned); per-owner failure counter in limiter (3 failures/hour -> reject).
Option C (contract, deferred, needs CONTRACTS_SPEC change first): emit `PermitSkipped(token, owner)` event in the catch branch for observability; no behaviour change. Document that `deadline` of the permit is not signed by the sweep signature and that `permit.value >= amount` is the only coupling.

## 3. Threats
Front-run permit (tolerated by design); permit replay on other chain (token domain includes chainId; check tokens rebuild separator on fork: UNVERIFIED for OZ internals, verify vendored 5.6.1); owner front-runs sweep to drain (relayer gas loss; bounded by simulation + grief reserve); misleading errors (map to user text); no `tx.origin` use (add grep gate in CI, DOC-9).

## 4. Tests
Mock token matrix: front-run permit, reverting permit, no-permit, DAI-style. Anvil: relayer e2e where owner sweeps first; where permit front-run -> fallback to `sweep` succeeds. Unit: classifier for each state. CI grep: no `tx.origin` in `packages/contracts/src`.

## 5. Acceptance
- [ ] Each PermitState has a user-facing message. - [ ] Front-run scenario succeeds end-to-end. - [ ] Relayer gas loss in owner-drains-first test bounded and counted in metrics (spec 07). - [ ] Threat model gets "permit griefing" section (DOC-6).
