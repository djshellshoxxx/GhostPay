# Browser libraries and components security review

Status: **complete for the assigned scope: 145 of 145 unique source versions reviewed; none pending.** The first reviewer completed 67 versions, a fresh continuation completed 47 more, and the coordinator read the final 31 component versions. The machine-readable `web-libs-coverage.json` records each complete source read or complete baseline-plus-diff review. This is static review completion, not release qualification.

The eight-ref tables below preserve the original review snapshots. `FINDINGS.md`, `scope-refs-final.json` and the final inventory add the subsequent main/integration/Tor branch aliases. The independent quality review resolves WV-01 to Low severity and adds WEB-LIB-04 below.

## Scope and method

Owned production scope: `apps/web/src/lib/**` and `apps/web/src/components/**`, excluding test helpers. Compared pinned main with every distinct `(path, blob)` in the eight refs listed below. Each reviewed entry represents a complete source read, or a complete baseline read plus complete version diff. Identical Git blobs were not reread independently; the coverage JSON records all branch aliases. Its 145 entries exactly match the `web-libs` domain of the shared `source-inventory.json`.

Only audit notes were written. No production edits, commits, pushes, merges, package installation, exploit construction, live endpoint probes, transaction submission, or test execution occurred in this review. Findings are source-based. Local fake-provider / fixture guidance below is proposed validation, not a claim that such tests ran.

### Pinned revisions

| Ref label | Exact commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| consolidation | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| privacy-snapshot | `d6819796a9542acc488b896786faffe83b913d9b` |
| quick-hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| format | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| erc20-simulation | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |

## Confirmed findings and dispositions

### WEB-LIB-01 — RPC receipts are not bound to the submitted hash on several pinned branches

**Severity:** medium, payment-state integrity. **Confidence:** high for source behavior. **Disposition:** known correction is present in consolidation and format; the other pinned branches retain the older behavior. This is not claimed as a novel discovery.

**Evidence:** main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, `apps/web/src/lib/wallet.ts:478–503`, especially `486–495`. `pollReceipt` queries by the submitted hash, but accepts a returned object without checking that its `transactionHash` matches that request. It reads destination, status and block number and attributes the result to the requested payment. It also maps every parsed status other than `1` to reverted, rather than refusing unsupported status values.

**Preconditions and impact:** a configured RPC supplies a stale, mismatched or malformed response during receipt polling. The application can assign a success/reverted outcome and block number to the wrong requested payment or misclassify an unsupported status. This does not make a configured RPC trustworthy and is not independent settlement verification. A fully malicious RPC can fabricate a consistent response; the issue is the missing consistency check the client can enforce. Deployment/payment gates still constrain where the flow is reachable, and no fund loss was demonstrated.

**Existing remedy:** consolidation `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, `apps/web/src/lib/wallet.ts:497–508`, requires a primitive, well-formed transaction hash, checks equality against the requested hash, and accepts only status `0` or `1`. Git history identifies the existing corrections `a221a9d5199bde11e45e1bc822e7305f4fe01bb9` and `9048c09b94d158392226590f80eea7c40144b024`. The same corrected wallet blob is present on format. The optional receipt destination check is unchanged; this finding specifically concerns hash binding and status validation, not a claim that every RPC statement becomes authenticated.

**Remediation:** integrate the existing validated receipt checks into the branch intended for release; preserve the recorded submitted hash and an unknown/unverified outcome when validation fails.

**Safe regression guidance:** use a local fake RPC to cover absent/malformed/mismatched receipt identity, unsupported status, a valid matching receipt, and an unavailable receipt. Verify only a matching valid receipt advances payment state and that validation failure does not erase the submitted transaction hash.

### WEB-LIB-02 — ERC-20 simulation classifies malformed ABI boolean results as successful

**Severity:** low, preflight assurance. **Confidence:** high. **Disposition:** corrected only in the pinned erc20-simulation candidate; still present in the pinned consolidation. This is an existing candidate fix, not a novel issue.

**Evidence:** main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, `apps/web/src/lib/txGuard.ts:111–129`. After checking only even-length hexadecimal encoding, `simulateCall(..., expectBool=true)` refuses a correctly sized zero boolean but otherwise returns `ok`. Wrong-width and noncanonical nonzero ABI outputs therefore receive the same status as a valid successful boolean.

**Preconditions and impact:** an RPC or token implementation supplies malformed nonempty return data during an ERC-20 preflight. The UI can present the simulation as successful when it should be unavailable/indeterminate. This helper deliberately allows an `unavailable` simulation as a warning under its documented policy, so this is not evidence of bypassing a hard transaction-authorization gate or of a demonstrated loss of funds.

**Existing remedy:** `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, `apps/web/src/lib/txGuard.ts:124–135`, retains the intentional legacy no-return case, requires a nonempty ABI boolean to have the correct width, refuses false, and treats a noncanonical value as unavailable. No other pinned ref has that corrected blob.

**Remediation:** bring the existing canonical-boolean classification into the release candidate and keep the UX distinction between successful and unavailable simulations.

**Safe regression guidance:** exercise local fixtures for a canonical true, canonical false, legacy empty return, noncanonical boolean, wrong width, invalid hex and an RPC error. Assert the three documented outcomes without sending a transaction.

### WEB-LIB-03 — Session clearing does not immediately wipe wrapper-owned asynchronous key copies on main

**Severity:** medium, local key lifecycle / lock boundary. **Confidence:** high. **Disposition:** known lifecycle repair is present in release, consolidation, privacy-snapshot, quick-hide, clipboard and format; main and erc20-simulation retain the older behavior. Coordinate with the view review's idle-lock finding WV-03; these are related parts of the same revocation boundary, not independent evidence of remote key extraction.

**Evidence:** main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, `apps/web/src/lib/session.ts:323–330`, opens plaintext scalar copies for an asynchronous callback and wipes them only after that promise settles. `exportKeystore` similarly holds three copied scalars until encryption settles (`434–445`). `clearSession` increments the revision and disposes the boxed session storage (`420–430`) but does not track or wipe those already issued copies. The async secret wrapper also does not reject a stale callback result itself before returning it.

**Preconditions and impact:** a secret-using operation remains outstanding when the session is cleared or locked. Its wrapper-owned plaintext buffers can remain usable until the promise settles, potentially beyond the user's lock action. Caller-side guards can prevent adopting a stale result, but they do not wipe those particular borrowed arrays. This review did not establish a remote route to access process memory or show that every caller publishes stale output.

**Existing remedy:** consolidation `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, `apps/web/src/lib/session.ts:98,121–139,393–407,527–560`, registers async copies, wipes them synchronously during clear/suspend, and checks captured authority before returning results. All fixed refs share session blob `9440ec16a0283f70b8fc317f13f98db0de0194e0`. The explicit encrypted-backup recovery path retains sole-copy custody under suspension; ordinary borrowing, signing and scanning use `activeSession` and refuse suspension (`142–146`). That limited recovery exception is intentional and is not reclassified as a raw-export bypass here.

**Remediation:** use the existing revocation-aware session implementation wherever the older helper is shipped. Keep cancellation at both the buffer-lifetime boundary and the consuming operation boundary; wrapper tracking alone cannot revoke arbitrary copies that a caller or cryptographic primitive has independently made.

**Safe regression guidance:** in an in-memory session with a deferred benign callback, clear/suspend and check the exact wrapper-issued arrays are wiped before the callback settles; verify the eventual stale result is refused. Separately verify the documented encrypted-recovery route remains available for a sole-copy session while ordinary secret operations fail.

### Cross-reference WV-01 — Pending wallet connection can issue follow-on provider requests after revocation

**Primary finding:** `web-views-review.md`, WV-01. Record once in the consolidated findings. **Final severity:** low consent/lifecycle; high source confidence. The initial reviewer proposed Medium; independent review narrowed the established impact to connection/chain requests without signing or submission. **Disposition:** present in every pinned ref. Historical statements about repairs on other branches are not treated as proof about these pinned commits; novelty is not claimed.

`apps/web/src/lib/wallet.ts:231–247` has the same `connectWallet` function on all eight revisions. It awaits the initial account request, then makes additional account and chain requests and may request a chain switch. It has no initiating-operation currentness callback or abort signal and makes no revocation check between these steps. The safe response is to prevent new app-issued requests after revocation; the application cannot retrospectively cancel a prompt already open in an external wallet.

The caller preserves the distinction: main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, `apps/web/src/views/Pay.tsx:697–717`, captures a session/flow guard but passes no guard into the helper. It checks currentness only after the helper completes. The identical recent caller is at `805–825` on consolidation, release, privacy-snapshot, quick-hide, clipboard and format. The erc20-simulation caller matches main. The whole `Pay.tsx` blob on the first group is `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099`, compared with main's `579cbe531c39c83745e9a188b176b5a479a32a6b`.

A connection must already be pending when the user leaves, locks or otherwise invalidates the operation. The impact is unwanted continuation of connection/chain-selection requests, not an established unauthorized transfer. Remediation and proposed local fake-provider validation are in WV-01. In particular, do not confuse the guards in `sendViaWallet` and `signTypedDataViaWallet` with protection of this separate helper.

### Exact branch matrix

`Affected` refers only to the specific source condition above; `corrected` means the reviewed source contains the identified remedy, not that runtime qualification was performed.

| Pinned ref | WEB-LIB-01 receipt identity/status | WEB-LIB-02 simulation boolean | WEB-LIB-03 async key copies | WV-01 connect continuation |
|---|---|---|---|---|
| main | Affected | Affected | Affected | Affected |
| release | Affected | Affected | Corrected | Affected |
| consolidation | Corrected | Affected | Corrected | Affected |
| privacy-snapshot | Affected | Affected | Corrected | Affected |
| quick-hide | Affected | Affected | Corrected | Affected |
| clipboard | Affected | Affected | Corrected | Affected |
| format | Corrected | Affected | Corrected | Affected |
| erc20-simulation | Affected | Corrected | Affected | Affected |

The exact identities underlying this matrix are recorded in `web-libs-coverage.json`. Receipt correction has wallet blob `800cfa90810b887898d4184ff3f5ccfb2601c971`; the older wallet blob is `fb1d864f3223ce007e35d81c19a308df88657121`. Both contain the same unguarded connection function. Simulation correction has txGuard blob `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23`; older is `abba792709126a191cbd589f2023351a7b9e1c66`. Session correction has blob `9440ec16a0283f70b8fc317f13f98db0de0194e0`; older is `4b5d36e9ed7651d1d6f3e4b63e805b41667e8f0a`.

## Known robustness changes, without a demonstrated security path

- `buildProfile.ts` on main treats an unexpected runtime profile value as full; consolidation admits full only through the positive known value. Compiled profile parsing already defaults lean. No attacker-controlled runtime-prop path was established; this remains a fail-closed robustness improvement, not a demonstrated privilege escalation.
- `format.ts:17–23` on main assumes the runtime type and decimal precision match its TypeScript contract. The format candidate adds the missing runtime guard. Bad internal arguments can otherwise throw; no externally reachable monetary miscalculation was established.
- `merchantIdentity.ts` on main uses ordinary JSON parsing for a small local advisory pin record. Consolidation uses strict JSON parsing. Local-storage tampering and canonicalization are distinct from verifying a merchant identity; no signature bypass was found in this change.
- Consolidation narrows recognized relayer diagnostic classes to fixed identifiers instead of accepting arbitrary bounded lowercase/underscore strings. This reduces trust in remote diagnostic text; no secret source or disclosure route was established here.

## Reviewed controls and rejected false positives

These are source observations across the completed 145 versions, not full-system assurances.

- Main's default services consume compiled signed bundled deployment manifests with compiled release keys. The legacy runtime manifest loader is not the default production Pages trust path. Consolidation removes that unused legacy loader and checks the declared application origin. An unsigned origin-fetched manifest was not established as an active default-service vulnerability. Sources: reviewed `defaultServices.ts`, `manifest.ts`, `bundledManifests.ts`, `releaseKeys.ts` on main and consolidation.
- Release self-verification uses same-origin URL checks, excludes URL userinfo/fragments, refuses redirects, omits credentials/referrer, bounds streamed data and has an independent deadline. Its documented inability to authenticate a malicious same-origin host is a trust limit, not a newly discovered repairable hash guarantee. Source: main `release.ts`.
- Consolidation's network authority uses opaque per-action grants, bounded response bodies and timeouts, method/action/chain constraints, revocation checks, and no silent private-to-direct fallback. It reads authoritative settings again at use and separately treats wallet-extension traffic as outside application RPC transport. Sources: consolidation `networkAuthorization.ts`, `networkSelection.ts`, `networkOperation.ts`, `boundedRequest.ts`, `services.ts`.
- Wallet discovery bounds announcements and displayed metadata, catches hostile provider metadata accessors, and labels identity limitations. Send/sign paths monitor provider changes and retain an acknowledged transaction hash even if authority changes after irreversible submission. This does not fix `connectWallet`. Source: both reviewed versions of `wallet.ts` and main `duplicateAttemptJournal.ts`, `transactionOutcome.ts`.
- Vault and custody changes use guarded atomic insert/compare-delete behavior and retain a remembered ciphertext tie for step-up checks. Deleting browser storage does not automatically remove that in-memory association. Sources: both reviewed `keyVault.ts` and `session.ts` versions.
- Settings exchange requires explicit endpoint/pin selection and confirmation, revalidates previews, and treats credential detection as a heuristic with documented limits. Source: reviewed `settingsExchange.ts` versions.
- Quick-hide is visual concealment that intentionally preserves mounted state and sole-copy recovery material. It uses concealment attributes, moves focus out, clears selections and binds timed reveal to scope/revision. It is not claimed to erase DOM data or lock keys. Sources: quick-hide `privacyMode.tsx`, `PrivacyQuickHide.tsx`, `SensitiveContent.tsx`, `PrivateHistory.tsx`, `PrivacyControls.tsx` and related settings components.
- Clipboard cleanup stores a digest for comparison instead of retaining the copied secret in its timer, respects failed clipboard reads, and uses serialized clear logic. The operating-system clipboard does not expose an atomic compare-and-clear primitive, so the documented external clipboard race is not reported as a new implementation guarantee. Sources: both reviewed `clipboardPrivacy.ts` versions and quick-hide clipboard components.
- Embed message handling validates source, origin and a one-time nonce; verified merchant profiles are revalidated after fetch and before accepting a pin. A suspected request-start-only expiry check was rejected after reading `MerchantProfilePanel.tsx:93–107` and its complete recent diff. Sources: main `embedHost.ts`, `embedProtocol.ts` and both reviewed panel versions.
- Error-message review found fixed schema paths rather than user input echoed through invoice error paths. The schema reviewer independently traced those paths in the validator. React renders error descriptors as text. Sources: reviewed `errors.ts`, `displayText.ts`, `sanitize.ts`, with schema-review coordination.

### WEB-LIB-04 — Backup cleanup can overwrite newer unrelated clipboard content

**Severity:** Low, clipboard integrity/availability. **Confidence:** high from source and independent review. **Disposition:** corrected only on privacy-snapshot and quick-hide among the original eight refs; the other six retain the old component. The later main-final, recovered-fixes, unique-code and tor-completion aliases also retain it.

Main `apps/web/src/components/SecretBackup.tsx:10–17,39–65`, blob `c86f77de050b838204e3f4222cd796ca6e54337a`, tracks backup-copy sequence numbers and clears by writing an empty string without comparing the current clipboard. Hide, timeout, visibility change, lock and unmount can invoke cleanup. Another application, manual copy or unrelated component can replace clipboard content without changing those backup-only sequence numbers. If the browser permits the later write, cleanup can discard that newer content. A backup copy must first have armed cleanup; no theft or disclosure was established.

Privacy-snapshot and quick-hide use component blob `c92bd4951f23325c854cdd8ca37f1ca1aa1a91b6`, which checks shared copy ownership and a digest of current clipboard content before clearing. Its helper does not fall back to an unconditional write if reading is denied. Integrate that existing correction. The operating-system clipboard has no atomic compare-and-clear primitive, so do not promise elimination of every external copy/write race. Proposed benign regression coverage should replace the copied value with ordinary unrelated text before cleanup and assert that the replacement is retained; no such regression was executed in this audit. See `finding-quality-review.md` for the independent caller and branch checks.

## Completed continuation review

The fresh continuation read the payment/sweep helpers, scan privacy/clients, receipt/export adapters, persistence and remaining library variants in full or by a complete delta from a fully read baseline. The coordinator then completed every remaining component, including the backup/QR/import, printable payment, receipt, merchant issuer, history/archive and six stealth-export components. No assigned source remains unread.

- The stale sweep context and revised native-fee review are recorded once under WV-04. The receipt optional-recipient issue is recorded once under ZC-CRYPTO-01/WV-02. Wallet connection continuation is WV-01.
- The exporter components bind operations to session/deadline/input identity, discard stale results and require explicit confirmation for raw key export and recovery-custody replacement. Download is distinguished from a verified backup. No separate current authorization bypass was established in those reviewed paths.
- Merchant template issuance is keyed by the signed profile/template/amount in its parent, so the suspected stale-props state reuse did not establish a defect. Receipt recipient omission is intentional format minimization; the assurance distinction still needs repair.
- Main's `CameraImporter` cancels camera capture on document hide but can finish an already pending paste/image import. The newer version revokes that local work too. Inspected consumers stage previews or clear review, so this remains lifecycle hardening without a separate demonstrated signing, disclosure, transfer or lock bypass.
- The newer manifest hook scopes provisional cache state to both chain and service identity. Main's chain-only reuse is recorded as robustness hardening; no payment authorization bypass was established.
- Jitter clock monotonicity, QR surrogate handling, stricter numeric/runtime validation and scan cancellation/budget improvements were examined. They are not counted as independent vulnerabilities without a stronger current consumer consequence.
- Tag-archive import is not an atomic transaction across every local store. Its partial/unknown-outcome wording and durable journal reflect that limitation; canceling a UI operation does not roll back a completed store write.

`web-libs-handoff.md` now records completion. All conclusions remain source-based; no application tests or vulnerability reproductions were executed.
