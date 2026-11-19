# Independent review of recovered native sweep authority

**Scoped source verdict: APPROVED** at `ed95c5601b0ec127be56cad57fcb78d44954b2fb`. The overall release remains **BLOCKED** pending actual mandatory qualification. This read-only review made no product or test changes and executed no runtime suites.

## Exact source restoration

The freshly inspected source contains all known authority fixes from the previously reviewed final `02760fb4` runtime. Four blobs match the retained independent review identities exactly:

| Path | Git blob | Comparison |
|---|---|---|
| `apps/web/src/lib/sweep.ts` | `3710a28fe7e90c618d0b57da1aeed9f2a9adf599` | Exact |
| `apps/web/src/views/Sweep.tsx` | `6da18522b825c99b4073fd238174f63a8a2b7b38` | Exact |
| `apps/web/src/lib/sweep.nativeReview.test.ts` | `ead0a287483a65add77eb8ce1722cc05b235ec63` | Exact |
| `apps/web/src/views/Sweep.nativeReview.test.tsx` | `e8d5fcb22def002ca90add99e344b4a132835c10` | Exact |

The old executor's raw logs and unpublished commit objects are unavailable. Their previous results are not counted as current verification. [REVIEW.json](REVIEW.json) records the current source objects, observation time, all 14 feature paths and unchanged surrounding authority sources. The implementer reports no later production deviation; the four exact matches independently establish retention of the reviewed runtime and regressions.

## Authority findings

The previous Low-severity manifest-read lifetime gap is corrected in the recovered component. Every native manifest read checks current authority before and after response; a final check before translating manifest errors preserves the specific stale-review reason. The regression observes dispatches outside the manifest fixture and requires no later request, broadcast or journal after expiry during the first response.

The source retains opaque one-time review capability, permanent expiry/rollback/cancellation, original session and scope binding, exact selected endpoint and manifest, complete same-nonce replacement identity, fresh exact transaction comparison, and checks around local signing. Journal compare-and-swap and submitted/uncertain outcomes survive cancellation after transport starts. No unresolved concrete defect was found in this authority-lifetime scope.

## Precise network boundary

The native wrappers guard manifest readback and fee/oracle/simulation requests. RPC client initialization itself retains existing action/network authorization, with component checks before and after `app.getRpc`; its internal chain discovery/retries are not directly fee-clock wrapped. Cancellation/session/settings changes abort the grant. If the fee review expires during initialization, the subsequent check prevents manifest/private fee reads and signing. This review does not claim every SDK-internal initialization exchange is fee-clock guarded.

## Remaining work

Fresh runtime/type/lint/browser tests and complete exact-integration CI belong to the security worker and coordinator. Source identity is not a runtime pass or release-readiness verdict. External security review, owner decisions, dedicated-origin hosting, approved manifests/signing and real testnet acceptance remain governed by the release requirements.
