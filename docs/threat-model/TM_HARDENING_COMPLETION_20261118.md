# TM1–TM15 bounded privacy-hardening completion

## Source and decision boundary

This continuation starts from PR #238 commit
`198aa5baff22272453733a0f3dcfcac0e0994eec`. Both current-main-at-discovery
`dfc75ef2087fa6463ae59e0818abec01796c578d` and PR #222
`2bc2098298d90928eb1acafad969f28316bb05fc` are its ancestors. The task branch is
`chatgpt/ghostpay-tm-hardening-20261118`; [PR #249](https://github.com/djshellshoxxx/GhostPay/pull/249) targets the #238 integration branch
so the review shows only this bounded continuation. Existing integrated repairs
are reused, not reimplemented. [Final qualification](../handoffs/tm-hardening-20261118/QUALIFICATION.md)
records the eventual exact source SHA, commands, results and hosted checks.

The published checkpoint used for the artifact follow-up below is
`f0c15de9b381ac8a13ed3c76781d7fad8b236391`. The additional five-file TM5 correction
is identified by its source hashes in the artifact receipts until the coordinator
publishes the next exact-tree commit. The latest hosted status belongs to
[PR #249's checks](https://github.com/djshellshoxxx/GhostPay/pull/249/checks);
neither this checkpoint SHA nor an earlier successful selection is a claim that
the final candidate has passed every required gate.

Scope is the unfinished safeguards and acceptance for section 9 of
[PRIVACY_THREAT_MODEL.md](PRIVACY_THREAT_MODEL.md). No main merge, deployment,
release publication, contract/Mythril remediation, new protocol, new key
generation, recovery implementation, dependency upgrade or general repository
consolidation is included. This is AI-assisted engineering and independent agent
review, not an external security audit or an anonymity certification.

The final prepublication main refresh is `e454de6abfefda70d82784fafc1d8949b277c334` (#242 owner integration). The bounded continuation still targets the unchanged #238 base; independent results on main do not qualify this stack.

## Completion matrix

“Implemented” below describes the source disposition. Execution is separately
identified in the qualification record. A test definition, source inspection or
earlier PR result is not counted as an executed final-head pass.

| TM | Intended protection and existing implementation | Default / consent | Continuation and acceptance | Integration owner / residual |
|---|---|---|---|---|
| 1 | Avoid address-bearing balance reads merely on opening Sweep. Existing #231 repair binds each explicit request to payment, chain, endpoint and session, including asynchronous client creation. | Every refresh requires **Check balance**; reload and selection changes do not repeat a previous action. | Preserve implementation; rerun Sweep consent/privacy suites and actual full/lean journeys. Cached-client dispatch tests complement the action boundary. | #231 / #238; requests already sent cannot be recalled; signing performs separately disclosed reads. |
| 2 | Explain provider observations at Scan, Bitcoin, Solana and TRON decision points. Notices are already wired. | Visible before the relevant scan/review action. | Inspect full and lean flow copy; correct connecting-IP wording and stale user-guide claims; retain disclosure and locale/security-key tests. | TM continuation; native-language and real provider acceptance are unverified. |
| 3 | Avoid ambient credentials, referrer and cache retention in shared RPC requests. Existing transport uses omit/no-referrer/no-store and rejects redirects. | Applied to the supported shared fetch transport. | Rerun chain-adapter RPC and browser service regressions; preserve library flags and unchanged bundle/source guards. | #241 owns broader transport isolation; this does not certify every browser egress surface. |
| 4 | Keep endpoint credentials out of unintended persistent/exported configuration. Existing heuristic and memory-only RPC settings were incomplete. | Saved non-session settings remain plaintext; session-only is explicit and now available for every nonempty RPC URL. Export defaults remain preferences only. | Normalize session markers; detect named credential path segments; apply retention changes only after complete form validation. Omit session-only RPCs and heuristic-detected credential endpoint values from exports without deleting source settings. Test rejected forms, normalized URLs, false-negative escape hatch, reload and export boundaries. | TM continuation; detection is heuristic and cannot guarantee every secret is detected. Session-only means page lifetime. |
| 5 | Restrict browser outbound destinations with an exact build-time CSP allowlist. | Broad HTTPS/WSS development compatibility remains; documented hosted profile sets origins and requires a tight policy. | Fix Pages clean-environment propagation and skipped postbuild. Reject unsafe/malformed origins without echoing them. Validate actual early head meta and enforcing global header policies; generate matching standard/embed nginx artifacts. Correct the bundle scanner's rejection of configured origins only inside the validated enforcing `connect-src` attribute; retain all other origin/resource/source checks. Actual isolated full/lean artifacts and adversarial parser probes now pass within the scope recorded below. | TM continuation; canonical build/browser qualification and real deployed headers/origin/certificates remain unverified. Pages ignores `_headers`; meta has fewer capabilities than HTTP headers. |
| 6 | Document the actual Tor boundary, exactly as the authoritative recommendation requires. | Tor is never enabled automatically; the profile notice retains UNVERIFIED. | Keep Tor Browser ambient routing distinct from onion bundle hosting and RPC/wallet traffic. Document strict profile-state failures, HTTPS/WSS CSP limitations and the real-network smoke procedure. | Documentation reviewed; real Tor bootstrap, circuits, onion reachability and public RPC execution remain unverified. |
| 7 | Warn about local destination reuse without creating a persistent plaintext source/destination linkage database. Existing #230 session-memory ledger and late-completion epoch checks are retained. | Advisory current-session reuse warning; no persistent history or uploaded address history. | Rerun session/lock/reload/late-result ledger regressions and Sweep tests. Explicitly disclose that unknown is not “safe.” | #230 / #238; known-wallet classifier branch is inactive because no authoritative dataset ships. No list is invented or external classifier added. |
| 8 | Prevent checkpoint-name membership tests using public seller keys. The owner’s v4 HKDF slots supersede incompatible HMAC/HKDF v3 implementations. | Private slot names use the loaded viewing key, chain and public key ID; legacy progress is ignored with best-effort cleanup. | Preserve #235 architecture; rerun distinct keys, wrong seller, corruption, session replacement, metadata and legacy non-migration tests. Explicitly record that v2→v3 migration is no longer the chosen policy: a legacy rescan is intentional. | #235 owns checkpoints. Block/hash contents remain plaintext and unauthenticated; older tabs/storage denial can retain ignored legacy records. |
| 9 | Minimize receipt payloads while retaining historical compatibility. Existing receipts omit `stealthAddress` by default. | Explicit inclusion belongs to the selected payment and seller. | Reset inclusion on payment/seller change; prove resulting minimized signed JSON contains no address. Preserve historical/full-schema verification. Correct QR disclosure without removing attestation/original-file caveats. | TM continuation; transaction hash, amount and signer still permit public-chain linkage. |
| 10 | Encrypt invoices by default and prevent another seller inheriting plaintext opt-out or pending private form results. | Encryption on; plaintext opt-out and passphrase are form/session choices, not stored preferences. | Bind the form to seller-session identity, including same-key reinstall; discard stale results and reset on reload/replacement. Preserve profile switching, encrypted imports/exports and historical plaintext compatibility tests. | TM continuation owns default/consent only. Per-invoice signer generation and pinned-signer policy remain outside scope; #234 owns validation API. Bearer links still carry their decryption key. |
| 11 | Reduce request-size and application-log metadata while preserving the existing optional relayer protocol. | Web pads by default; server accepts optional padding; zero-log false; ingress direct unless existing trusted-proxy configuration selects it. | Reject explicit null ingress/padding enums and malformed/boundary padding. Unexpected CSPRNG/padding failures stop before dispatch instead of silently removing padding. Test ingress contradictions and zero-log fields; document retained operational events and infrastructure logs. | TM continuation only. Explicit off, oversized-body and one specific legacy-server fallback remain. Quote tuple is retained; quote-less protocol and real Tor ingress are not implemented here. |
| 12 | Reduce direct per-match receipt signaling through optional bulk evidence. Existing #238 cancellation repair is retained. | Evidence target zero/off; valid finite values capped at 500. | Non-finite values disable the option. Preserve malformed evidence, target overflow, cancellation, legacy receipts and repeated-range disclosure. Fix inherited lint error in the TM12 cancellation fixture without changing its assertions. | TM continuation; all matched transactions remain included, so target is not a hard request cap. Repeated crowded ranges can reveal matches. |
| 13 | Use available chain-specific spend evidence and defer sensitive reads to review/signing. | Bitcoin derives spend state from complete scanned data; partial/light/history may query outpoints; sign-time recheck remains. Solana/TRON balance reads occur at review/signing. | Derive BTC spent outpoints from verified raw inputs rather than an untrusted coinbase annotation. Stop TRON subsequent balance/memo/destination stages after lock, endpoint change or unmount. Preserve existing Solana review/lock and BTC fallback/sign-time tests. | TM continuation at flow boundaries; SDK/transport deadlines remain #241. No identical privacy/consistency guarantee is asserted across chains. |
| 14 | Keep explicit Tor/own-node selection and prevent a bad saved profile silently reverting to public/direct RPC. Existing #228 per-dispatch guard is retained. | Fresh absence = Direct/single; nondefault requires acknowledgment. | Strictly require all four persisted fields; malformed/incomplete/unreadable/pending settings block new shared EVM RPC dispatch, including cached clients and retries. Preserve explicit Direct repair and cross-tab status display; test available loopback fixtures and persistence. | TM continuation; deletion of site data resets defaults. Preference checks are not origin-compromise protection, proof of endpoint ownership, or verified Tor routing. |
| 15 | Add optional scan-range padding without uncontrolled allocation, late requests or stale-result acceptance. | Padding zero/off; finite positive values capped at 100000 blocks; PIR remains unselected/research-only. | Reject non-finite values; enforce arithmetic preallocation budgets and cancellation in both scan-source helpers and the active web scheduler. Wire the existing Scan AbortSignal into primary/secondary windows; reject late results and later dispatch. Web calls allow at most 4096 initial grid windows and 4096 uncached window requests including provider-limit splits. Preserve boundaries/deduplication and disclose request expansion. | TM continuation only; already-dispatched work must settle before scheduler cancellation completes; head/block calls and transport retries are outside this window budget. No general transport timeout engine is added. |

## Per-TM verification status at this checkpoint

These statuses distinguish executed local checks from source review and remaining
qualification. Test counts cover the named selections, often overlap, and must
not be added as unique coverage. The implementation and independent-review
receipts are linked from the [qualification record](../handoffs/tm-hardening-20261118/QUALIFICATION.md).
Final exact-source hosted results are tracked on
[PR #249](https://github.com/djshellshoxxx/GhostPay/pull/249/checks). No row below
declares all required gates complete.

| TM | Evidence available | Verification status and remaining acceptance |
|---|---|---|
| 1 | Independent existing-test selection passed all **17 Sweep privacy cases**, plus two targeted Sweep integration cases shared with TM7. Asynchronous clients, lock, replacement, unmount and explicit action consent are covered. | **Local targeted pass and source review recorded.** The combined TM1/TM7/TM8 run completed 58 tests across six files, exit 0, with 138 unrelated cases deliberately filtered. Inputs matched f0c15de9 and stayed unchanged. Whole Sweep and actual full/lean browser journeys remain pending. |
| 2 | Provider-observation copy and locale security-key coverage were reviewed; four-catalog validation completed with zero errors and retained fallback warnings. | **Local catalog checks passed; source review recorded.** Full/lean rendered-flow checks, native-language review and real-provider observations are not established. |
| 3 | Shared RPC service tests are included in the **98-passing-test** settings/network selection; the request-option assertions in `chain-adapters/src/rpc.test.ts` were inspected. | **Local service selection passed; supported transport flags reviewed.** Final transport/package and browser egress qualification remains pending. This is not a result for every egress surface or for #241's separate tree. |
| 4 | Settings/network selection **98/98**, final export-helper selection **38/38**, and independent settings/policy review selection **46/46** passed. Failing-first cases covered retention, export and saved-policy defects. | **Local targeted passes and independent source review recorded.** Full/lean browser reload/exchange fixtures are defined; final exact-source browser, typecheck, lint and complete-suite gates remain pending. |
| 5 | Original CSP parser/generator checks **30/30** passed. The follow-up CSP/bundle regression selection passed **79/79**; independent probes passed **56/56** (54 synthetic plus two existing artifact scans). Fresh corrected full and lean Vite artifacts each passed bundling, CSP application and unchanged `scan-dist`: **six stages, all exit 0**. | **Local targeted and isolated-artifact checks passed; correction independently reviewed.** Canonical TypeScript/npm build, hosted Pages/full-lean Chromium and live header enforcement remain pending or unverified. Artifact build metadata is `unknown`; these are source-hash-pinned checkpoint artifacts, not release artifacts. |
| 6 | Tor documentation and UI boundary claims were source-reviewed against the existing browser/proxy architecture. | **Documentation review recorded.** No real Tor bootstrap, circuit, onion reachability, exit-route or public-node smoke pass is claimed. |
| 7 | Independent selection passed **10 destination privacy cases** and the two targeted Sweep integration cases shared with TM1, including session-memory history and stale completion. | **Local targeted pass and source review recorded.** These cases are part of the same 58-pass execution, not additional coverage totals. Whole suites and full/lean journeys remain pending. Known-wallet classification remains inactive because no authoritative list is shipped. |
| 8 | Independent selection passed **13 cursor-slot cases, seven checkpoint reconciliation cases and nine scanClient checkpoint/session cases**. It exercises the owner's v4 HKDF slots, distinct/wrong keys, corruption, replacement, metadata and ignored legacy formats without architecture changes. | **Local targeted pass and source review recorded.** Same 58-pass, exit-0 execution; 83 unrelated scanClient cases were filtered. Both incompatible v3 formats and v2 are intentionally not resumed. Whole scanner/browser gates remain pending; prior-owner results do not substitute for them. |
| 9 | Receipt/finite-setting selection **14/14** passed. Independent receipt/invoice selection passed **8 cases with 5 deliberately filtered**, and a separate metadata selection passed **18/18**. | **Local targeted passes and independent source review recorded.** Minimized receipt identity/reset behavior has local evidence; historical receipt/schema and full/lean end-to-end qualification remain pending on the final source. |
| 10 | The new invoice suite first failed **3 cases with 1 control passing**; session replacement, stale-result, profile and ordering cases then passed in the combined selection. Independent receipt/invoice checks also passed. | **Local targeted passes and independent source review recorded.** Final encrypted/plaintext compatibility and full/lean browser gates remain pending. Per-invoice signer creation and pinned-signer policy are not implemented by this continuation. |
| 11 | Relayer privacy/config selection **125/125** and web relayer-client selection **35/35** passed after the explicit-null and RNG-downgrade regressions failed first. | **Local targeted passes and source review recorded.** Final full relayer/package coverage and hosted results remain pending; real Tor ingress and infrastructure-log behavior remain unverified. |
| 12 | Non-finite option rejection passed in the **42-test** scan-settings selection and independent **18-test** metadata selection. Existing bulk-evidence/cancellation assertions were preserved. | **Local default/validation checks passed.** Complete chain-adapter evidence/cancellation qualification and the affected typed-lint gate remain pending; the local final lint process was killed and is not a pass. |
| 13 | Bitcoin spend/resume/Esplora selection **47/47** and TRON/Solana flow/hardening selection **91/91** passed after the BTC annotation and TRON late-dispatch regressions failed first. | **Local targeted passes and source review recorded.** Final whole-package/browser gates and real-chain acceptance remain pending or unverified; sign-time disclosure and chain-specific authority limits remain. |
| 14 | The **98-test** settings/network selection and independent **46-test** helper/policy selection passed, including malformed/partial policy and cached-client/retry refusal checks. | **Local targeted passes and independent source review recorded.** Final full/lean storage/reload/cross-tab fixtures remain pending. Local fixtures do not establish real Tor routing, own-node ownership or policy coverage for separately configured scan endpoints/indexers and alternate transports. |
| 15 | Scan-source **80/80** passed with its original coverage gates; padded/range selections **33/33** passed independently. The active web scheduler first failed **16 cases with 7 controls passing**. A later focused scheduler/client run passed **19/19 with exit 0** at checkpoint `221cfa0df5c28013118bc25fad1549eb794548ae`. The broader run logged **62 assertion passes**, but worker termination timed out and interruption returned **130**. | **Local helper and focused scheduler passes recorded; broader process qualification incomplete.** Both real Scan Cancel cases have assertion evidence, but final full/lean browser and complete-suite gates remain pending. The later cancellation-fixture typing correction was independently reviewed; it does not turn earlier runs into final-head passes. |

### TM5 artifact-validation follow-up

Actual full and lean tight-CSP artifacts built from checkpoint
`f0c15de9b381ac8a13ed3c76781d7fad8b236391` exposed an integration defect: CSP
application accepted the normalized configured HTTPS/WSS origins, while the
bundle scanner rejected the same origins in the enforcing `index.html` policy.
Both original scanner invocations exited 1. This was an observed artifact-gate
failure, not a browser-network result.

The independently reviewed correction is limited to
`apps/web/scripts/{scan-bundle,apply-csp}.{mjs,d.mts}` and
`scripts/tests/privacy-csp-bundle.test.mjs`. It shares validated configuration and
inert DOM/source-location parsing, then excludes only the exact configured-origin
portion of the validated enforcing `connect-src` attribute from the generic host
scan. The same origin in application code, another directive/attribute, body text,
comments, CSS, workers or another page receives no new allowance. Malformed,
duplicate, misplaced or mismatched policies and ambiguous source syntax still
fail; explicit-null and non-ASCII-separator regressions are retained.

The local receipts `bundle-csp-review.md`, `bundle-csp-final-green.log`,
`acceptance-csp-bundle-probes.log` and `corrected-artifact-results.json` record the
79 regression passes, 56 independent probes and six successful fresh-artifact
stages. `corrected-{full,lean}-artifact-inventory.json` pins the produced bytes;
the result receipt pins the checkpoint plus all five changed source hashes.
These checks do not replace the canonical TypeScript/npm build, complete hosted
suites, Chromium or deployed-policy acceptance. The coordinator records the next
exact-tree commit and its hosted results in the qualification record and PR #249.

## Single privacy-defaults and consent test matrix

| Surface | Fresh state | Persistence / scope | Main acceptance definitions |
|---|---|---|---|
| Sweep balance | No automatic sensitive lookup | Action belongs to selected payment/session/config; never replayed on reload | `views/Sweep.test.tsx`, `Sweep.privacy.test.tsx`, existing browser journey |
| RPC endpoint storage/export | No provider preselected; preferences-only export | User-chosen ordinary URLs persist; session-only URLs live only in page memory; rejected form leaves markers unchanged | `lib/settingsPrivacy.test.ts`, `settings.test.ts`, `settingsExchange.test.ts`, `views/Settings.test.tsx`, `e2e/privacy-settings.spec.ts` |
| Network profiles | Direct / single | Explicit saved four-field profile; invalid/pending/unreadable blocks shared EVM RPC dispatch; deleting preferences resets defaults | `lib/defaultServices.privacySelection.test.ts`, `defaultServices.networkGuard.test.ts`, Settings and privacy-settings browser tests |
| Destination reuse | Empty history | Current seller session; clears on lock, replacement, reload; no plaintext import | `lib/sweep.destinations.privacy.test.ts`, Sweep tests |
| Checkpoint slots | No public-name fallback | Private v4 names; same seller/key/chain can resume; legacy progress rescans | `lib/scanCursorSlot.test.ts`, `scanCheckpointPrivacy.test.ts`, `scanClient.test.ts`, scanner spam/resume case |
| Receipt address | Omitted | Choice resets on payment/seller change and remount | `components/ReceiptPanel.test.tsx`, `lib/receipts.test.ts`, invoice-schema receipt tests |
| Invoice encryption | Enabled | Plaintext opt-out, passphrase and private fields scoped to active seller form; reset on reload/reinstall/replacement | `views/CreateInvoice.privacy.test.tsx`, existing CreateInvoice/profile/ordering and invoice-schema tests |
| Bulk evidence | 0 / off | Local scan preference; finite target at most 500, always retaining matches | `lib/scanPrivacy.bulkEvidence.test.ts`, chain-adapter evidence/cancellation tests |
| Additional padding | 0 / off | Local finite preference at most 100000 blocks; request preflight/cancellation enforced | `lib/scanPrivacy.test.ts`, `scanPrivacy.scheduler.test.ts`, `scanPrivacy.clients.test.ts`, `views/Scan.privacy.test.tsx`, `packages/scan-source/src/{padded,range}.test.ts` |
| Relayer request padding | Client on, server optional | Explicit request option; documented size/legacy exceptions only | `lib/relayerClient.test.ts`, `apps/relayer/src/privacy.test.ts` |
| Relayer zero-log / ingress | Zero-log off; direct or configured trusted proxy | Operator configuration; invalid/null enums fail | Relayer privacy/config/log suites |
| CSP | Broad development compatibility | Immutable built policy; tight hosted profile requires an exact list | `scripts/tests/privacy-csp.test.mjs`, `scripts/tests/privacy-csp-bundle.test.mjs`, `src/buildScripts.test.ts`, isolated full/lean artifacts and final hosted Pages output |

The strict network-selection guard applies to the shared EVM RPC factory and its cached clients/retries. It does not add a per-dispatch policy guard to separately configured scan endpoints/indexers, raw relayer fetch, Bitcoin, Solana or TRON adapters. Indirect manifest checks do not replace those separate transport boundaries; #241 remains the broader owner.

RPC/profile/scan preferences are intentionally device/page configuration shared by
seller sessions, not key-specific records. Receipt disclosure and invoice-private
form choices must not carry to another seller. Experimental PIR, OHTTP, I2P and
Nym are not activated by these fixes. No endpoint, address history, credential or
validation request is sent to an external classification service.

## Integration dependencies and explicit non-completions

- **#222:** original TM implementation; its old browser fixture failures are not
  relabeled as successes. #233’s adapted encrypted/minimized/consent fixtures are
  already present in #238.
- **#228 / #231 / #230:** cached own-node guard, balance consent and ephemeral
  destination ledger are retained and requalified in the combined source.
- **#235:** v4 checkpoint implementation takes precedence over the handoff’s
  stale v3 wording. This work does not reintroduce public legacy migration.
- **#241:** general transport isolation and non-cooperative transport deadlines
  stay separately owned. It merged to main during this task at `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`; the later observed main is `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` (also #237). Those changes are not silently imported into this bounded #238 continuation. Its green CI does not automatically qualify this stack.
- **#234:** opt-in signer-validation API remains separately owned; no key
  generation or mandatory pinned-signer policy is added.
- **#239 / #240 and the Spec 18 lane:** recovery/export work remains untouched.
  PR #238’s existing payment-key-export test failure must be tracked separately.
- **Known-wallet classification, per-invoice signer creation, quote-less relayer
  protocol, real Tor/own-node/public-network/physical-device/native-language
  acceptance:** explicit limitations or separately owned requirements, not
  silently claimed complete.

Overall GhostPay release readiness is a separate decision. An inherited failed
gate is still a failed gate; no skip, threshold reduction, workflow relaxation
or suppression is authorized by this matrix.
