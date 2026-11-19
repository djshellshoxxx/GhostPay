# Security and privacy audit checkpoint

Checkpoint: 2026-11-19 UTC. Latest verified main: [c977b5d6723f6822c3b5d86cd6b231712c53c395](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395).
Branch: codex/ghostpay-consolidation-records-20261119 ([PR #273](https://github.com/djshellshoxxx/GhostPay/pull/273)). Initial baseline: 14ded337a10c140d7a9f9a9238ec038587d925bb.

This checkpoint does not declare feature completeness or release qualification. Read [HANDOFF](HANDOFF.md), [TEST_RESULTS](TEST_RESULTS.md), [REMAINING_WORK](REMAINING_WORK.md) and [MAIN_MERGE_LOG](MAIN_MERGE_LOG.md) together.

## Conclusion and scope

The reviewed work preserves local key control, static Pages operation and existing cryptographic primitives. No custodial backend, mandatory account, fee activation, deployment or release was introduced. This is a bounded engineering review, not an external audit or proof of zero vulnerabilities.

#257 passed its applicable exact-head checks before merging. #271/#272 have strong local evidence on unchanged feature blobs but fresh combined-head gates remain. Broad #264 is not eligible: tests/builds/analyzers fail, and one reported high CodeQL alert lacks accessible detailed attribution. It is not characterized as harmless or resolved.

| Finding / risk | Evidence and disposition |
|---|---|
| Executable sinks obscured by template/regex/JSX syntax | Merged #257 uses TypeScript AST, fails on parse errors and retains built-artifact/HTML/CSP checks. It is syntactic analysis, not general dataflow proof. |
| Nonbinary SOCKS input | Merged #257 rejects string chunks before parsing. The real-socket regression requires server close; timeout cannot pass it. No route-availability claim. |
| Zero pool values inconsistent with intended constraints | Merged #257 retains positive/full-withdrawal cases and all nine witness-output assertions. Circuit and contract runtime unchanged. |
| Incomplete TRON ranges | #271 preserves strict rejection and repairs empty-height fixtures. First/middle/last missing-height tests reject before disclosure, balance/memo work or broadcast. |
| Stale quote and signing review context | #272 binds generations/scope before and after awaits and at final handoff. Stale display and pre-handoff authorization lifecycle are distinguished; no demonstrated fund loss asserted. |
| Cancelling UI work destroys submitted/unknown/replacement evidence | #272 explicitly preserves the unchanged post-handoff suffix, prior hashes, journal CAS and submitted/unknown/refused outcomes. Lower helper still wipes secret copies in finally. |
| Canonical array or merchant-clock edge cases | #265/#268 focused evidence and #270/#262 follow-through. Dense compatibility, descriptor guards, finite nonnegative clocks and signed controls remain required. Caller NaN is not claimed to be a remote signature bypass. |
| Export outlives its scan grant | Active b0abb726, carried by #269, uses explicit export authority bound to endpoint/chain/session/settings, cancellation and disposal. Final source-bound GREEN evidence remains pending. |
| Sleep expiry precedes custody lookup but leaves authority live | Pending composition: retain immediate suspension plus atomic replacement/sole-copy recovery. Existing resolved blobs: session.ts 9440ec16a0283f70b8fc317f13f98db0de0194e0; AppShell.tsx 8e2006a8309403f336efda82c1cc6eb6699f04c4. Recheck chosen current source before reuse. |
| Jitter expiry and clock rollback | Independent #274 original suite 13/13; baseline 11/2. Local scheduling defect; no payment/signing bypass demonstrated. Lint/hosted/current-main reconciliation remain. |
| Released lane ticket can submit | GP-SCOUT-218-01: low internal invariant in paused relayer code. Exact-source reproduction ran a released ticket while replacement held accounting. No affected current service call path/public exploit established. Make release terminal before submit when that lane resumes. |
| Native proof used for ERC-20 negative-test construction | #264 correctly throws INVALID_PROOF. Recover the historical fixture-only hunk; retain builder, encoder and contract rejection, never relax proof binding. |

## Recovery boundaries

The #260 review examined scalar/public/address correspondence, authenticated headers, malformed/duplicate records, atomic replacement, cancellation and sole-copy unload behavior. It identified the composition dependency with #256. It did not establish fresh end-to-end restoration, mobile downloads, independent wallet import or all browsers.

Main's legacy backup is distinct from complete Spec 18 portability. Exports must exclude buyer ephemeral secrets, require deliberate re-authentication/plaintext confirmation, remain bounded/atomic and recover without the original service. Policy/AA/EIP-7702/BIP-352 models are not silently treated as scheme-1 EOAs.

## Dependency and supply-chain evidence

Fresh npm audit --omit=dev --json against the unchanged main/#271/#272 package lock exited 0: zero known production vulnerabilities in every severity category; metadata counted 286 production dependencies. This is time-bound registry advisory matching, not coverage of the different broad candidate dependency train or unknown vulnerabilities. The raw report is preserved with this checkpoint when available.

Committed-secret scan passed; all 111 action references were pinned. The new adapter/Sweep changes modify no dependencies, workflows, thresholds or analyzer policy. #257 excludes the major #253 dependency train. Its Snyk status was successful before merge. No complete fresh development-dependency audit is claimed if its execution was interrupted.

## Unresolved gates

- #264 CodeQL reports one high alert. Detailed annotation retrieval was rejected as an unsupported connector endpoint; no bypass or unsupported attribution was attempted.
- Strict Mythril remains a security/release gate. Historical source-bound evidence records 11 individually dispositioned findings (eight Low, three Medium); disposition is not analyzer success on current source.
- Full current-main tests/security/browser acceptance are not complete. Native artifacts/nodes, physical devices, public providers and external review remain separate requirements.
- Canonical announcer/registry per-chain hashes remain unverified. Existing Router/Sweep manifest code-hash/readback checks must be preserved; those are a different claim.
- No complete anonymity claim: selected RPCs and public blockchain metadata remain observable, and a webpage cannot attest an external Tor route.

The previous coordinator explicitly released generation 2. Root acquired generation 3 by expected-head/nonforce transition, verified live ref/sole parent/one-file tree, and used expected PR heads, fresh checks and independent review for #257. Expiry alone never authorizes takeover. Release this run's own lease when stopping.

Next action: close exact-head gates and reconcile the owned recovery/idle/export candidates. Do not merge broad failing candidates or label compilation as security acceptance.

## Later Pages-artifact verifier review

The new #276 verifier runtime b13870688d722fe5928ed192499ae76be55554ee passed its five original Node test groups, but two independent actual-module filesystem interleavings exposed false success: build-info was re-read with commitB after trusted hashes had bound commitA, and an inventoried regular index could be swapped to an external symlink before hashing. These are mutable-input consistency/TOCTOU findings, not a claim that static path traversal bypasses the checker. A separate owned follow-up is adding same-buffer metadata binding and regular/no-follow descriptor checks with deterministic regressions. Preserve the newer CLI control on #276; do not mark its unchanged runtime source-approved until this repair is independently qualified. Whole-tree immutability still requires an explicit private/stable-input boundary.
