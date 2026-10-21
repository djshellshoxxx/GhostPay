# Spec: embed-return: Return-to-merchant and proof handoff
Impact 2/5 | Effort M | Score 1 | Wave 2 | Depends on: embed-snippet, pay-reconcile
Built in: `packages/ux-flow` (`src/ret.ts`, reuses `src/proof.ts`). Generic only (swarm 8 owns POS/plugins).

## Problem
The popup uses noopener, so merchants get no completion callback.

## Design
No postMessage back-channel. After payment the payer may click "Return to merchant"; the target origin must equal the `returnOrigin` carried in the seller-signed invoice. Data travels only in the URL fragment (`#proof=<code>`), which is not sent in the HTTP request. The merchant verifies the proof against their own RPC (`verifyProofOffline` checks agreement with expected nonce/chain/tx only).

## API
- `canonicalOrigin(o, allowLocalhost?) -> string|null` (exact `URL.origin` string, https only).
- `buildReturnUrl(returnOrigin, proof, path='/')` -> `origin + path + '#proof=' + proof`; proof strictly decoded first; path charset `[A-Za-z0-9._~\-/]`, no `//` start, no dot-segments, no `?`/`#`/backslash.
- `isAllowedReturn({returnOrigin?}, target) -> boolean`.
- `verifyProofOffline(code, {nonce, chainId, txHash}) -> {ok,proof}|{ok:false,error: BAD_PROOF|MISMATCH}`.
- `checkSignedReturn({returnOrigin, nonce, signature}, verifier) -> boolean`; message = UTF-8 `ghostpay-return-v1\n<origin>\n<nonce>`; verifier is caller-supplied `(msg, sig) => boolean`; fails closed on throw/non-`true`/bad inputs.

## Requirements
1. **EMBED-R1** MUST Return URL has no `?`; data only in fragment.
2. **EMBED-R2** MUST Only https origins exactly equal to the signed returnOrigin; no wildcards, subdomains, lookalikes, userinfo, backslashes, whitespace, queries, case variants, or relative/scheme-relative/javascript:/data: targets.
3. **EMBED-R3** MUST No `returnOrigin` (or a non-canonical one) -> isAllowedReturn false (feature hidden).
4. **EMBED-R4** MUST Proof size-bounded (512) and strictly decoded before use.
5. **EMBED-R5** MUST Signature check fails closed; this package contains no crypto.
6. **EMBED-R6** SHOULD Reference merchant verifier snippet (Node, own RPC): deferred; needs schema field `returnOrigin` (separate change by schema maintainers).

## Acceptance tests (`src/ret.test.ts`)
T-1 lookalike/http/userinfo/backslash/query/whitespace/relative targets rejected (20 vectors); T-2 URL ends `#proof=...`, no `?`; T-3 signed-state check passes with correct message and fails when origin tampered (verifier compares exact bytes); plus verifier-throws and malformed-input cases.
