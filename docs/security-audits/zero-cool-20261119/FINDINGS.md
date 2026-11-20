# Consolidated security findings

## Result

The completed core review confirms **16 deduplicated finding families: 4 Medium and 12 Low** across the selected source versions. Thirteen concern browser-facing behavior, sometimes behind experimental/testnet configuration; three are explicitly supporting or disabled contract/API findings. The count includes known defects still present on main even where another reviewed branch already contains a repair. It is not a count of new discoveries or live exploitable deployments.

The supplemental hosting review also records the concrete correctness, documentation, recovery and conditional hardening issues below. They are kept separate from the core browser count. **No Critical or High issue was established in the reviewed scope.** Static review is not proof of absence, and no finding was established by live exploitation, vulnerability reproduction or a real-funds transaction.

Coverage is complete for **546 paths / 670 distinct path-and-blob versions / 12 pinned snapshots**, with no pending source rows. The source cutoff is **2026-11-19 22:29:30 America/Los_Angeles** (2026-11-20 06:29:30 UTC). Initial main was `c977b5d6723f6822c3b5d86cd6b231712c53c395`; the final observed main is `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. [COVERAGE.md](COVERAGE.md) defines the scope and exclusions; [scope-refs-final.json](scope-refs-final.json) pins every snapshot.

The strongest repair priority is to bring the existing session, sweep-context and receipt-consistency fixes into the intended shipping line. The newer recovered-fixes branch contains the receipt, QR and ERC-20 fixes but retains main's older session and sweep behavior. Consolidation/format carry those lifecycle fixes but omit the ERC-20 simulation and backup-component clipboard corrections. **No reviewed snapshot resolves the complete finding set.**

## Medium findings: repair before the next release

### WEB-LIB-01 — RPC receipt identity/status is insufficiently checked

Main asks for a submitted transaction hash but accepts a returned receipt without requiring its `transactionHash` to equal that request. Unsupported parsed statuses are classified as reverted instead of rejected. A stale, mismatched or malformed configured-RPC response can attach an incorrect outcome/block to the requested payment. This is a consistency check that a client can enforce; adding it does not make a dishonest RPC independently trustworthy.

Evidence: initial-main [wallet.ts:478–503](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/wallet.ts#L478-L503). The corrected blob `800cfa90810b887898d4184ff3f5ccfb2601c971` occurs on consolidation, format and recovered-fixes. Other reviewed refs retain the older behavior. Existing correction commits include `a221a9d5` and `9048c09b`.

**Action:** integrate the prepared canonical hash and supported-status checks, retaining the submitted hash and unknown/unverified outcome when validation fails. No loss of funds or independent settlement verification was demonstrated. Confidence is high from source. [Full evidence and proposed invariant checks](web-libs-review.md).

### WV-03 — Idle timeout preserves ordinary authority with an unbacked session

Main preserves sole-copy custody by returning from idle lock before discarding an unbacked session, but it does not suspend ordinary signing authority. The affected scenario is subsequent use of that same browser after idle expiry while such a session remains loaded; no remote-access prerequisite is assumed.

Evidence: initial-main [AppShell.tsx:145–168](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/AppShell.tsx#L145-L168). The six updated feature/release refs suspend synchronously before custody checks and retain only the documented recovery route. Initial/final main, erc20-simulation, recovered-fixes, unique-code and tor-completion retain the baseline.

**Action:** integrate that prepared suspension behavior. Preserve sole-copy encrypted recovery while immediately revoking ordinary authority. This is a known integration gap, not a criticism of retaining the only recoverable key copy. Confidence is high from source. [Full view evidence](web-views-review.md).

### WEB-LIB-03 — Wrapper-owned asynchronous key copies outlive revocation

Main's asynchronous secret wrapper and keystore export hold copied plaintext scalars until awaited work settles. Clearing the session disposes boxed storage but does not synchronously wipe those issued arrays. Pending work can therefore retain usable wrapper-owned copies beyond lock/clear. This differs from WV-03: the former concerns whether authority is suspended, while this finding concerns already-issued buffers.

Evidence: initial-main [session.ts:323–330](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts#L323-L330), plus clear/export at 420–445. The six updated refs use corrected blob `9440ec16a0283f70b8fc317f13f98db0de0194e0`; the other final refs retain the older implementation.

**Action:** integrate outstanding-copy tracking, synchronous wiping on clear/suspend and rejection of stale results. Preserve consumer currentness checks too. No independent remote heap-access path was established; tracking cannot erase arbitrary engine/caller copies. Confidence is high from source. [Full library evidence](web-libs-review.md).

### WV-04 — A pending sweep can use context that no longer matches the form

Baseline edits to destination/mode during pending vault authorization or RPC work do not invalidate the captured sweep. Downstream helpers validate the original transaction intent and session but cannot observe that the visible form context changed. The earlier destination/mode can therefore continue toward signing and submission. This is stale consent, not a remotely selected unsigned destination.

Evidence: initial-main [Sweep.tsx:138–209](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L138-L209) and [sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweep.ts). The six updated refs invalidate relevant edits and pass the review guard through helpers; the six main-family refs retain the baseline.

**Action:** integrate the prepared context invalidation and signing/handoff checks. Preserve durable outcome evidence after an actual handoff; a later edit cannot unsend a transaction. Existing candidate regression source was read, not executed. Confidence is high from source. [Full view evidence](web-views-review.md).

## Low browser-facing findings

The evidence links contain exact source paths, lines, blobs, prerequisites, remediation and validation limits. All nine have high confidence in the source condition. Runtime effect is qualified where it was not measured.

| ID | Confirmed issue and bounded impact | Disposition and action |
| --- | --- | --- |
| **WV-01** | Wallet connection may issue further account/chain requests, including a network-switch request, after the initiating application operation becomes stale. Principal callers reject the stale final result. The helper does not sign or submit transactions. | Present on all 12 refs. Add currentness checks around awaits and before every new provider request. Final severity is **Low**, reduced from the original Medium proposal after independent review of actual impact. An already-open external wallet prompt cannot be recalled by the app. [View evidence](web-views-review.md), [quality decision](finding-quality-review.md). |
| **ZC-CRYPTO-01 / WV-02** | Minimal signed receipts can omit recipient comparison while introductory guidance promises it. The success body itself lists narrower checks accurately; signatures and invoice/chain/asset/amount requirements still hold. No forgery, settlement proof or spend bypass was established. | Present on the six updated refs; absent in main-family required-address formats. Return and display recipient binding as matched/omitted/not requested; expose an explicit strict policy where required. Preserve intentional minimal receipts. Count once. [Schema evidence](crypto-schema-review.md), [quality wording correction](finding-quality-review.md). |
| **WV-05** | TRON refuses mainnet genesis but does not bind the connected node to the selected Nile/Shasta label. An endpoint for another enabled test network can be used under the chosen label. | Present on all refs. Compare known genesis with the selected network and define local-chain policy. Mainnet refusal remains intact; no mainnet-loss path or protection against a lying node is claimed. [View evidence](web-views-review.md), [independent package corroboration](multichain-review.md). |
| **WV-06 / MC-03** | Baseline Bitcoin/Solana/native-TRON follow-up requests identify locally matched payments to the provider. Updated native/BTC/Solana work reduces this, but the **TRON token receipt lookup remains match-conditioned in all refs**, before the browser discards token results. No secret key is sent. | One privacy family, partially repaired on the six updated refs. Retain their fixes and exclude/defer token lookup unless deliberately selected, or retrieve evidence independently of the local match set. Preserve token integrity checks. [View evidence](web-views-review.md), [residual token call chain](multichain-review.md), [independent confirmation](finding-quality-review.md). |
| **WEB-LIB-02** | Malformed nonempty ERC-20 ABI boolean results can be labeled successful simulation. This overstates preflight assurance; unavailable simulation is already a warning under the documented policy, so this is not a hard authorization-gate bypass. | Corrected only on erc20-simulation and recovered-fixes. Integrate the prepared canonical-boolean classification while preserving the intentional legacy empty-return case. [Library evidence](web-libs-review.md). |
| **NPE-01** | A rejected conflicting multipart QR part still refreshes the idle timestamp. It can extend an incomplete session; conflict and final payload-integrity checks remain enforced. | Corrected on consolidation, format and recovered-fixes. Preserve the existing reject-before-timestamp repair (`118ae827`). [Network/privacy evidence](network-privacy-review.md). |
| **NPE-02** | Optional indexer URL construction performs unbounded synchronous normalization before transport deadlines. A configured unusually long URL can impose excessive work; ordinary RPC responses do not control this value. Actual duration was not measured. | Present on all refs in a testnet-restricted optional mode. Use linear normalization plus a documented URL-length budget in package and settings. The similar PIR repair does not fix this constructor. [Network/privacy evidence](network-privacy-review.md), [caller qualification](finding-quality-review.md). |
| **MC-02** | Baseline TRON block-range handling accepts incomplete results and advances across missing heights, potentially leaving payments undiscovered in an apparently completed scan. | Corrected on the six updated refs. Integrate exact-span/contiguous-height checks (`259c2760`, known SOLANA-TRON-08). No spend bypass is claimed. [Multichain evidence](multichain-review.md). |
| **WEB-LIB-04** | Backup cleanup can clear newer unrelated clipboard content because its old component tracks only backup-copy sequence, not current clipboard ownership/content. A prior backup copy and permitted later clipboard write are prerequisites. No theft or disclosure was established. | Corrected **only on privacy-snapshot and quick-hide**, not consolidation, format, the clipboard branch or newer integrations. Integrate shared ownership plus digest comparison; refuse blind clearing when reading is denied. External clipboard compare/write remains non-atomic. [Library evidence](web-libs-review.md), [independent confirmation](finding-quality-review.md). |

EVM match-specific evidence reads are a separate disclosed default: even updated refs default bulk evidence to off. Optional cover reads do not establish anonymity. This is retained as ZC-CHAIN-O01 rather than counted again as a new hidden default.

## Low supporting or gated API findings

These three are included in the 16-family total but excluded from active Pages lock/payment claims. They remain in all 12 reviewed refs.

| ID | Source condition and actual limit | Action |
| --- | --- | --- |
| **MC-01** | Software Bitcoin signing checks abort/disposal before potentially asynchronous confirmation but not afterward. An outstanding call can return signatures after revocation and retain derived buffers while waiting. The shipped Pages callback is synchronous and its signer is privately disposed in `finally`; that long-pending prerequisite is not established there. | Recheck lifecycle immediately before signing and revoke outstanding buffers or avoid keeping them through approval. No unauthorized broadcast was established. [Multichain evidence](multichain-review.md). |
| **ZC-CRYPTO-02** | Legacy address-book rekey can restore key context after lock and make the reported lock flag inconsistent. The book remains cleared and ordinary operations still reject. No active Pages consumer was found. | Guard continuation with a generation/context check and use a consistent operational/reported lock predicate. Do not portray this as a current seller-vault unlock. [Crypto/schema evidence](crypto-schema-review.md). |
| **ZC-CHAIN-01** | Policy-account native buffer can be permanently stranded when a **nonzero immutable limits root lacks a permitted native withdrawal**. Zero root is unrestricted and is not this case. Browser policy payments pass no buffer, pins are empty and the feature is experimental. Known CONTRACTS-CORE-01; no deployed loss was inspected. | Refuse/remove or redesign the buffer API with explicit withdrawal semantics. Depositing to the account is not an immediate owner-gas top-up. Any deployed immutable-contract repair needs deployment/client coordination. [Contract evidence](chain-contracts-review.md), [independent qualification](finding-quality-review.md). |

## Exact status by reviewed branch

**P** = source condition present; **C** = identified source correction present; **Partial** = named native/BTC/Solana fixes present but TRON token residual remains; **N/A** = required-address receipt format lacks the optional omission case. C is not a claim of executed tests or deployment.

| Ref | Receipt polling | Idle authority | Async key copies | Sweep context | ERC-20 preflight | QR deadline | Clipboard |
| --- | --- | --- | --- | --- | --- | --- | --- |
| main | P | P | P | P | P | P | P |
| release | P | C | C | C | P | P | P |
| consolidation | C | C | C | C | P | C | P |
| privacy-snapshot | P | C | C | C | P | P | C |
| quick-hide | P | C | C | C | P | P | C |
| clipboard | P | C | C | C | P | P | P |
| format | C | C | C | C | P | C | P |
| erc20-simulation | P | P | P | P | C | P | P |
| main-final | P | P | P | P | P | P | P |
| recovered-fixes | C | P | P | P | C | C | P |
| unique-code | P | P | P | P | P | P | P |
| tor-completion | P | P | P | P | P | P | P |

| Ref | Minimal receipt assurance | TRON block completeness | Non-EVM match privacy |
| --- | --- | --- | --- |
| main | N/A | P | P |
| release | P | C | Partial |
| consolidation | P | C | Partial |
| privacy-snapshot | P | C | Partial |
| quick-hide | P | C | Partial |
| clipboard | P | C | Partial |
| format | P | C | Partial |
| erc20-simulation | N/A | P | P |
| main-final | N/A | P | P |
| recovered-fixes | N/A | P | P |
| unique-code | N/A | P | P |
| tor-completion | N/A | P | P |

WV-01, WV-05, NPE-02, MC-01, ZC-CRYPTO-02 and ZC-CHAIN-01 remain on every ref. The token portion of the privacy family also remains everywhere. [finding-status.json](finding-status.json) records exact source identities and machine-readable dispositions.

## Supplemental hosting issues

In addition to the 16 core finding families, the hosting review confirms **three Low documentation/local operational defects**, plus the informational hardening and trust boundaries below. These three are not three remotely exploitable security vulnerabilities. Their affected logic is unchanged across all twelve snapshots. Independent source/caller adjudication is in [hosting-finding-quality-review.md](hosting-finding-quality-review.md).

| ID | Classification and evidence | Practical consequence and action |
| --- | --- | --- |
| **ZC-HC-DOC-01** | Low documentation/assurance defect. `tools/portable-hosting-kit/src/package-docs.mjs:52–53` describes a subpath among independent mirror origins, and ordinary package creation includes that generated guide. | A path prefix does not isolate origin-scoped storage or permissions. Correct the guide to require dedicated origins. Existing CLI shared-origin refusal/warnings remain intact; no actual deployment disclosure was established. [Core hosting evidence](hosting-core-review.md). |
| **HF-01** | Low local correctness/availability defect; informational security severity under operator-controlled paths. `profiles/static-export.mjs:23–25` conflates all two-dot-prefixed basenames with parent traversal. The CLI reuses this helper before profile replacement. | Some nested roots evade the intended overlap refusal. If a selected, already marked output contains the original unpacked input in such a relationship, successful regeneration can remove that original input with the old output tree. This is a conditional source-supported local data-loss possibility; no deletion was executed. Compare exact parent segments while preserving equality handling. Count one root cause across export and CLI. [Feature evidence](hosting-feature-review.md), [independent caller correction](hosting-finding-quality-review.md). |
| **ZC-HC-O01** | Low operational recovery defect. `core/atomic.mjs:122–135` retains a backup when restoration fails, but catch cleanup at 160–165 then removes remaining backups. | Requires a commit failure, rollback failure and successful cleanup. The previous bytes intended for recovery may be lost. Retain/report failed-restore backups. A new archive can remain internally valid with a stale external checksum sidecar; only explicit comparison detects that mismatch, and does not restore deleted bytes. No remote write/authentication bypass was established. [Core evidence](hosting-core-review.md), [independent correction](hosting-finding-quality-review.md). |

### Informational hosting hardening

| ID | Evidence and practical limit | Action |
| --- | --- | --- |
| **H-AD-01** | Preview parser-error handling can pass a request-derived target through optional transport headers into raw serialization. The only production `startPreview` caller omits the enabling `hostConfig` option, and the listener is loopback-only. Cross-user/deployed-service impact was not established. | Keep Informational severity and Low repair priority. Omit request-derived headers from parser errors and validate all names/values immediately before raw serialization. No payload or reproduction is provided. [Adapter/preview evidence](hosting-adapters-review.md), [quality decision](hosting-finding-quality-review.md). |
| **HF-N01** | MIME lookup can return inherited object properties instead of its advertised string/null result. Both normal packaging and archive/directory verification use an own-property policy check; the CLI overlay has a fixed JSON path. | Use an own-property lookup or prototype-free mapping. No verified-package or ordinary CLI serving bypass was established. [Feature evidence](hosting-feature-review.md), [independent countermeasures](hosting-finding-quality-review.md). |
| **ZC-HC-H01** | Full-validation header/privacy callbacks use ordinary `readFile` rather than guarded inventory reads. Another local writer must change the input tree to affect this gap. Packaging rechecks stored bytes; preview/profile operate from private verified copies. | Reuse retained inventory entries and bounded/no-follow reads; ideally derive reports and archive from the same captured bytes. No expected-digest bypass was established. [Core hosting evidence](hosting-core-review.md). |
| **HF-N02** | Path-based ancestor checks do not pin directories against a concurrent local writer. This is an explicit filesystem trust boundary, not an additional demonstrated vulnerability. | Preserve private verified input and controlled output parents. A hostile-filesystem guarantee would require a separately reviewed descriptor-based design. [Feature evidence](hosting-feature-review.md), [adapter limits](hosting-adapters-review.md). |

The latest timestamp repair is on final main and ten of the twelve snapshots; the old Date-based source remains only on initial main and erc20-simulation. The Tor branch strengthens checksum-aware canonical onion-origin/no-port validation and advertised-port consistency. The new static recipe's version pin matches official release information, but its exact upstream checksum signature, Docker image and real Tor Browser behavior were not qualified. [Build/Tor review](build-hosting-review.md), [validation record](VALIDATION.md).

## Other recorded hardening and operational limits

These entries preserve source observations without inflating them into demonstrated browser compromise. Detailed reports contain exact source evidence and branch limits.

| Area | Observation and required interpretation | Report |
| --- | --- | --- |
| EVM privacy | Default receipt/transaction reads remain match-specific. Bulk cover reads are opt-in and do not prove anonymity. | ZC-CHAIN-O01, [chain/contracts](chain-contracts-review.md) |
| Contract configuration/accounting | Native buffers are an explicit fee/metadata exception. An unusable configured factory fee token can prevent deployment. Preserve deployment validation and accurate accounting statements. | ZC-CHAIN-O02/O03, [chain/contracts](chain-contracts-review.md) |
| Decoder, RPC and comment precision | General decoder lacks an independent buffer-cap check, but builder/contract enforce it. Newer RPC fetch/retry options add hardening; main already has HTML no-referrer policy. A CREATE2 comment overstates chain separation while signatures bind chain. | ZC-CHAIN-H01/H02/H03, [chain/contracts](chain-contracts-review.md) |
| Residual secret buffers | Several exception/KDF/key/decoded-buffer paths rely on garbage collection. Wipe owned buffers in `finally` where possible; no independent memory disclosure was established and JavaScript erasure cannot be complete. | ZC-CRYPTO-H01, [crypto/schema](crypto-schema-review.md), [multichain](multichain-review.md) |
| Experimental scan helpers | Light-client composition can label logs as proof without verifying that exact set. Quorum comparison misses some equal-height disagreements; a host-count validator does not enforce its full distinct-host comment. No active browser voting/proof consumer was established. | [Network/privacy](network-privacy-review.md) |
| Optional network/SDK APIs | OHTTP's overall deadline depends on cooperative awaited operations. Standalone legacy HTTP/merchant SDK APIs have weaker cancellation/body bounds than current browser wrappers. No active Pages gap was established for those exports. | OHTTP observation, MC HTTP note, ZC-CRYPTO-O01; [network/privacy](network-privacy-review.md), [multichain](multichain-review.md), [crypto/schema](crypto-schema-review.md) |
| Bitcoin state | Updated branches improve continuous spend coverage, canonical evidence and reconciliation. Baseline browser code still re-derives outputs and checks current outspend before spending; arbitrary stored metadata alone was not shown to authorize a spend. | [Multichain](multichain-review.md) |
| Supporting crypto/policy APIs | Newer digest rebuilding, displayed-leaf consistency, canonical calldata, clock/type validation and cleanup reduce helper misuse. No additional active on-chain/browser bypass was established in older gated paths. | [Crypto/schema](crypto-schema-review.md) |
| Browser lifecycle/robustness | Hidden-page import cancellation, manifest service/chain scoping, numeric/QR validation and monotonic jitter improve consistency. Inspected consumers keep separate approval; no independent signing/disclosure/lock bypass was established. Tag-archive cancel does not undo committed store work. | [Browser libraries](web-libs-review.md), [quality review](finding-quality-review.md) |
| Build trust | Known fixture-key, compiler-cache checksum, CSP origin, generated-patch path, agent prompt and Pages artifact-gate improvements remain distributed. Their trusted-configuration/cache/input prerequisites are explicit. | BUILD-01 through BUILD-06, [build/hosting](build-hosting-review.md) |
| Hosting operations | Generated configurations and advisory reference scans do not prove endpoint ownership, absence of every egress route, log-free operation, arbitrary service identity or runtime router support. Physical identity separation and controlled paths remain necessary assumptions. | [Hosting adapters](hosting-adapters-review.md), [hosting core](hosting-core-review.md) |
| Dependencies | Both lockfiles have zero production registry advisories and 17 Low full-tree entries tracing to two development-toolchain advisories. These are not 17 separate core findings and no active browser path was established. | [VALIDATION.md](VALIDATION.md), retained npm JSON |

## Repair and verification order

1. Choose the shipping commit and integrate the prepared Medium repairs for receipt consistency, synchronous lock suspension, outstanding-copy revocation and sweep-context invalidation. Check source identity rather than branch recency.
2. Carry the separate ERC-20, QR deadline, TRON range and backup-component clipboard fixes into that same line. Check the component as well as the shared clipboard helper.
3. Repair the unresolved connection guard, selected TRON network binding, token-scan privacy residual, indexer input budget and minimal-receipt assurance distinction where that format is included.
4. Correct the hosting operator guide, containment helper and recovery-backup cleanup, then apply bounded API hardening. Preserve the current local/loopback/private-directory limits in product claims.
5. Address supporting signer/vault/policy findings before adding consumers that rely on their stronger lifecycle or funding semantics.
6. Run relevant existing regression suites and source-specific invariant checks on the combined candidate, then qualify browser/build/deployment behavior at that exact commit. This audit neither merged repairs nor executed those application suites.

Deduplication is explicit: WV-02 is ZC-CRYPTO-01; wallet helper/view reports share WV-01; TRON network corroboration shares WV-05; MC-03 is the residual in WV-06. WV-03 and WEB-LIB-03 remain distinct because authority retention and outstanding-buffer revocation require different invariants. HF-01 is counted once across callers. Known issues are labeled as reconfirmed rather than presented as new discoveries.
