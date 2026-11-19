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

The previous coordinator explicitly released generation 2. Root acquired generation 3 by expected-head/nonforce transition, verified live ref/sole parent/one-file tree, and used expected PR heads, fresh checks and independent review for #257. Expiry alone never authorizes takeover. This run explicitly released its matching lease at6408563f55081ee941c2036086c025ebf63d2c96 on2026-11-19T11:41:48.000Z; live ref, sole parent, one-file tree and contents were read back. Future integration must acquire ownership from the observed live state.

Next action: close exact-head gates and reconcile the owned recovery/idle/export candidates. Do not merge broad failing candidates or label compilation as security acceptance.

## Completed Pages-artifact repair; integration still pending

The original #276 runtime b13870688d722fe5928ed192499ae76be55554ee accepted two reproduced interleavings: hash build-infoA then parse commitB, and inventory a regular index then follow a substituted external symlink. Independent review also reproduced two static private-tree defects: invalid filename bytes could collapse into an existing U+FFFD filename, and invalid manifest bytes could decode to a valid Unicode record. These are distinct byte/identity consistency defects; no wallet fund-loss or publisher-authentication claim is made.

#277 at8cbae85c95fa707210704ee72bb4416b36e5a4d7 fixes the four cases. Final verifier blob56a1753d5181a6c5f9738ab62fd5f32911b6b516 and test blobd827559a5db32969b955d4f299a65db420010824 were independently reviewed and fetched back exactly. The original six groups remain; final implementation and independent runs each pass17/17, zero skips. Mutation detection uses descriptors, no-follow/nonblocking opens, regular-file identity and metadata checks, guaranteed close, same-buffer commit parsing and final inventory checks. Raw directory names and manifest bytes must round-trip UTF-8 losslessly; valid Unicode remains supported.

The caller must keep the tree, trusted manifest and ancestors private/stable through verification and use. These portable checks do not provide an atomic filesystem snapshot or immunity to arbitrary concurrent writers. Unsupported open-flag platforms fail closed. Hosted CI and trusted real-artifact verification remain unqualified.

## Current #264 analyzer artifact, separately verified

[Current security evidence](20261119-security-gates-264.json) preserves the exact #264 Mythril artifact14516957113, run44487029107/job135432935301, requested and checkout source bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a. ZIP SHA-256c6bce07d662aec1fa50b2320e452dbe19ed57ca7e575b9f4560240224f2019b9 and complete254,223-byte report SHA-256475b27ec3adae0ccdc2d7fbcd8c30c4a1b819616f65b80f2863de5d7c307cdcb were independently verified; the report is not truncated.

Five per-contract result objects report success:true/error:null, but three contain findings:10 total,7Low/3Medium. The strict runner correctly exits1. The historical11-record disposition has8Low/3Medium; its R8 (PolicyAccountFactory allowance at source132, PC1781, SWC113, Low) is absent from this bounded output. Absence does not establish resolution or complete symbolic exploration. Contract src/lib/Foundry/remappings OIDs match the historical beb525dd source; run-mythril.sh differs only in comments, and other workflow changes do not prove identical execution environments. No finding was suppressed and no gate was relaxed.

CodeQL remains a separate high-alert blocker. The inspected workflow44487024101 artifact listing returned no artifacts; the successful JavaScript analysis log records SARIF upload but no alert location/dataflow. The connector annotation endpoint is unsupported, and the cloud browser transport failed before navigation. The later #262 evidence packet also lacks attribution. Do not label the high alert harmless or resolved.
