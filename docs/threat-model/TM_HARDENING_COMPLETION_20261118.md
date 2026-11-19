# TM1–TM15 bounded privacy-hardening completion

## Source and decision boundary

This continuation starts from PR #238 commit
`198aa5baff22272453733a0f3dcfcac0e0994eec`. Both current-main-at-discovery
`dfc75ef2087fa6463ae59e0818abec01796c578d` and PR #222
`2bc2098298d90928eb1acafad969f28316bb05fc` are its ancestors. The task branch is
`chatgpt/ghostpay-tm-hardening-20261118`; its PR targets the #238 integration branch
so the review shows only this bounded continuation. Existing integrated repairs
are reused, not reimplemented. [Final qualification](../handoffs/tm-hardening-20261118/QUALIFICATION.md)
records the eventual exact source SHA, commands, results and hosted checks.

Scope is the unfinished safeguards and acceptance for section 9 of
[PRIVACY_THREAT_MODEL.md](PRIVACY_THREAT_MODEL.md). No main merge, deployment,
release publication, contract/Mythril remediation, new protocol, new key
generation, recovery implementation, dependency upgrade or general repository
consolidation is included. This is AI-assisted engineering and independent agent
review, not an external security audit or an anonymity certification.

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
| 5 | Restrict browser outbound destinations with an exact build-time CSP allowlist. | Broad HTTPS/WSS development compatibility remains; documented hosted profile sets origins and requires a tight policy. | Fix Pages clean-environment propagation and skipped postbuild. Reject unsafe/malformed origins without echoing them. Validate actual early head meta and enforcing global header policies; generate matching standard/embed nginx artifacts. Exercise actual full/lean Pages artifacts, bad-input regressions and independent malformed-HTML probes. | TM continuation; real deployed headers/origin/certificates remain unverified. Pages ignores `_headers`; meta has fewer capabilities than HTTP headers. |
| 6 | Document the actual Tor boundary, exactly as the authoritative recommendation requires. | Tor is never enabled automatically; the profile notice retains UNVERIFIED. | Keep Tor Browser ambient routing distinct from onion bundle hosting and RPC/wallet traffic. Document strict profile-state failures, HTTPS/WSS CSP limitations and the real-network smoke procedure. | Documentation acceptance complete at source level; real Tor bootstrap, circuits, onion reachability and public RPC execution remain unverified. |
| 7 | Warn about local destination reuse without creating a persistent plaintext source/destination linkage database. Existing #230 session-memory ledger and late-completion epoch checks are retained. | Advisory current-session reuse warning; no persistent history or uploaded address history. | Rerun session/lock/reload/late-result ledger regressions and Sweep tests. Explicitly disclose that unknown is not “safe.” | #230 / #238; known-wallet classifier branch is inactive because no authoritative dataset ships. No list is invented or external classifier added. |
| 8 | Prevent checkpoint-name membership tests using public seller keys. The owner’s v4 HKDF slots supersede incompatible HMAC/HKDF v3 implementations. | Private slot names use the loaded viewing key, chain and public key ID; legacy progress is ignored with best-effort cleanup. | Preserve #235 architecture; rerun distinct keys, wrong seller, corruption, session replacement, metadata and legacy non-migration tests. Explicitly record that v2→v3 migration is no longer the chosen policy: a legacy rescan is intentional. | #235 owns checkpoints. Block/hash contents remain plaintext and unauthenticated; older tabs/storage denial can retain ignored legacy records. |
| 9 | Minimize receipt payloads while retaining historical compatibility. Existing receipts omit `stealthAddress` by default. | Explicit inclusion belongs to the selected payment and seller. | Reset inclusion on payment/seller change; prove resulting minimized signed JSON contains no address. Preserve historical/full-schema verification. Correct QR disclosure without removing attestation/original-file caveats. | TM continuation; transaction hash, amount and signer still permit public-chain linkage. |
| 10 | Encrypt invoices by default and prevent another seller inheriting plaintext opt-out or pending private form results. | Encryption on; plaintext opt-out and passphrase are form/session choices, not stored preferences. | Bind the form to seller-session identity, including same-key reinstall; discard stale results and reset on reload/replacement. Preserve profile switching, encrypted imports/exports and historical plaintext compatibility tests. | TM continuation owns default/consent only. Per-invoice signer generation and pinned-signer policy remain outside scope; #234 owns validation API. Bearer links still carry their decryption key. |
| 11 | Reduce request-size and application-log metadata while preserving the existing optional relayer protocol. | Web pads by default; server accepts optional padding; zero-log false; ingress direct unless existing trusted-proxy configuration selects it. | Reject explicit null ingress/padding enums and malformed/boundary padding. Unexpected CSPRNG/padding failures stop before dispatch instead of silently removing padding. Test ingress contradictions and zero-log fields; document retained operational events and infrastructure logs. | TM continuation only. Explicit off, oversized-body and one specific legacy-server fallback remain. Quote tuple is retained; quote-less protocol and real Tor ingress are not implemented here. |
| 12 | Reduce direct per-match receipt signaling through optional bulk evidence. Existing #238 cancellation repair is retained. | Evidence target zero/off; valid finite values capped at 500. | Non-finite values disable the option. Preserve malformed evidence, target overflow, cancellation, legacy receipts and repeated-range disclosure. Fix inherited lint error in the TM12 cancellation fixture without changing its assertions. | TM continuation; all matched transactions remain included, so target is not a hard request cap. Repeated crowded ranges can reveal matches. |
| 13 | Use available chain-specific spend evidence and defer sensitive reads to review/signing. | Bitcoin derives spend state from complete scanned data; partial/light/history may query outpoints; sign-time recheck remains. Solana/TRON balance reads occur at review/signing. | Derive BTC spent outpoints from verified raw inputs rather than an untrusted coinbase annotation. Stop TRON subsequent balance/memo/destination stages after lock, endpoint change or unmount. Preserve existing Solana review/lock and BTC fallback/sign-time tests. | TM continuation at flow boundaries; SDK/transport deadlines remain #241. No identical privacy/consistency guarantee is asserted across chains. |
| 14 | Keep explicit Tor/own-node selection and prevent a bad saved profile silently reverting to public/direct RPC. Existing #228 per-dispatch guard is retained. | Fresh absence = Direct/single; nondefault requires acknowledgment. | Strictly require all four persisted fields; malformed/incomplete/unreadable/pending settings block new shared EVM RPC dispatch, including cached clients and retries. Preserve explicit Direct repair and cross-tab status display; test available loopback fixtures and persistence. | TM continuation; deletion of site data resets defaults. Preference checks are not origin-compromise protection, proof of endpoint ownership, or verified Tor routing. |
| 15 | Add optional scan-range padding without uncontrolled allocation, late requests or stale-result acceptance. | Padding zero/off; finite positive values capped at 100000 blocks; PIR remains unselected/research-only. | Reject non-finite values; enforce arithmetic preallocation budgets and cancellation in both scan-source helpers and the active web scheduler. Wire the existing Scan AbortSignal into primary/secondary windows; reject late results and later dispatch. Web calls allow at most 4096 initial grid windows and 4096 uncached window requests including provider-limit splits. Preserve boundaries/deduplication and disclose request expansion. | TM continuation only; already-dispatched work must settle before scheduler cancellation completes; head/block calls and transport retries are outside this window budget. No general transport timeout engine is added. |

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
| CSP | Broad development compatibility | Immutable built policy; tight hosted profile requires an exact list | `scripts/tests/privacy-csp.test.mjs`, `src/buildScripts.test.ts`, real Pages build output |

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
