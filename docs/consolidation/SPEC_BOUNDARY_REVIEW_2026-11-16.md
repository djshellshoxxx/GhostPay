# Registry recovery and specification boundary review — 2026-11-16

Reviewed source: local b4da65f03dddac9d06b230aeb94ee49544b1db11, equivalent remote base b4be8866f6ff883fbbedc49be88b5b251a7d270e. This document records partial completion, not release approval.

## Recovered registry helpers

Added pure nonce-read, nonce-invalidation and on-behalf-registration builders plus public exports. Canonical Final EIP-6538 was read directly on 2026-11-16: https://eips.ethereum.org/EIPS/eip-6538. Its interface matches the generated ABI: nonceOf(address), incrementNonce(), registerKeysOnBehalf(address,uint256,bytes,bytes), with signature before meta-address. Existing scheme ID 1n, canonical address and validated scheme-1 key conversion are preserved. Every call has zero value. Signature bytes remain opaque for EOA/ERC-1271, including empty signatures, with an explicit 8,192-byte client allocation limit. Malformed signatures and invalid JavaScript runtime types fail validation.

No signing, RPC, wallet interaction, chain enablement or deployment-authenticity claim is added. Callers must verify their selected chain/deployment before sending and obtain explicit confirmation. Supplied signatures must authorize the meta-address, current nonce and correct chain-specific EIP-712 domain. The on-behalf UI remains outside spec 06 v1 scope.

## Evidence and recovery limits

- Confirmed local commit 1b647e29e9f3e10f746c0034170d7f8a249f0d91 contains the initial helpers/export/tests; ownership was committed in 1fd7c2dd. The final typeof guard and four runtime-type cases were then applied successfully.
- After those edits, one-worker focused Vitest passed 40 tests across registryDelegation.test.ts, registry.test.ts and registry.compat.test.ts, including 200 deterministic fast-check cases with seed 20261116. Independent source review found no blocker and confirmed canonical ABI order and absence of signing/network operations.
- Typecheck and targeted ESLint attempts exited 137 without diagnostics. Built-package export smoke and combined-tree verification remain pending. Tests do not establish these gates.
- The environment became unavailable before the final local commit could be confirmed. Source/test contents here were transcribed from complete prior tool-returned text plus the exact successful patches; the export was added to the fetched remote base index. No post-outage local hash comparison or runtime re-execution was possible. This recovered branch must be qualified before integration.

## Remaining specification boundaries

| Spec | Existing behavior | Remaining work and decision |
| --- | --- | --- |
| 06 registry | Direct publish/address lookup/unpublish; generated ABI; new pure delegated/nonce helpers | ENS resolution/provenance and independently verified per-chain runtime hashes remain missing. Existing registry presence/typehash probing is not codehash authentication. Resolve ENS chain/provider policy and the draft's conflicting ADR number before broader changes. |
| 07 observability | Explicitly enabled bearer-protected /metrics on main listener; bounded relayer_* metrics; nine fixed alert kinds; public-HTTPS/DNS checks and timeout | No /v1/stats, separate loopback listener, signed webhook/HMAC secret, or exact draft alert/dedupe contract. Implementation notes acknowledge differences without superseding every requirement. Reconcile the external contract before changes; retain deployed metric names. |
| 09 matrix | Fourteen configured chains: seven enabled testnets and seven disabled mainnets; engineering defaults explicitly identified | No proposed verified matrix/provenance gate. Accepted ADR-0016 multichain expansion authorizes the testnets; the older nine-chain draft and its different proposed ADR-0016 cannot silently override it. Collect primary deployment evidence, distinguish capability from deployment trust, and preserve unknown values. No invented verified cells or pins. |
| 14 profiles | Signed bounded profile schema, query profile parsing, opt-in full-app origin/source/nonce message protocol; popup default; lean iframe host disabled | No production profile-URL loader, payer-visible signer trust binding or template/amount attributes. The unused fetch helper reads Response.text() without a stream cap when Content-Length is absent. Deferred audit G1-02 still requires paid-invoice signer binding before completion. Preserve disabled lean embedding until identity, bounded fetch, templates and header-capable hosting are qualified. |

Relevant source: docs/specs/06-erc6538-registry.md, 07-relayer-metrics-observability.md, 09-chain-token-deployment-matrix-and-pins.md, 14-embed-merchant-profile.md; docs/adr/ADR-0016-multichain-config-expansion.md; apps/relayer/src/{server,config,metrics,alerts}.ts; apps/web/src/lib/embedHost.ts; apps/web/src/{App,AppLean}.tsx; packages/invoice-schema/src/merchantProfile.ts; docs/audits/24-ai-assisted-security-audit-2026-10-28.md (G1-02).
