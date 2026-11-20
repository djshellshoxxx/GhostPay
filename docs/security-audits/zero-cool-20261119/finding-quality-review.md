# Independent finding quality review

Reviewed 2026-11-20 UTC by `finding_quality_review`. This is a defensive challenge of selected findings and two component observations, not an additional whole-domain coverage claim. The reviewer read the audit instructions, initial reports, scope pins and branch-drift record, then checked the relevant production source and caller boundaries independently. Source assertions below are static conclusions. No application code, tests, reproductions, live probes, transactions or installations were run. Only this note was written; the publication block was respected.

## Decisions

| Item | Independent disposition | Recommended severity / counting |
| --- | --- | --- |
| WV-01, late wallet connection continuation | Confirmed; source permits new provider calls after app authority becomes stale. | **Low for the established effect**, rather than the reports' Medium. Keep one primary finding across callers/layers. |
| ZC-CRYPTO-01 / WV-02, minimal receipt assurance | Confirmed; recipient comparison can be omitted while the introductory guidance promises it. | **Low**, one cross-layer finding. Optional receipt content is intentional; the missing assurance distinction is the defect. |
| NPE-02, configured indexer URL normalization | Confirmed unbounded input and problematic synchronous normalization remain in the browser's optional indexer path. Runtime duration was not measured. | **Low, conditional availability**; retain configuration-control and testnet prerequisites. |
| ZC-CRYPTO-02, legacy address-book rekey after lock | Confirmed inconsistent lock state and retained key context. Normal book access still fails. | **Low, supporting API only**; exclude from active Pages lock-bypass counts. |
| ZC-CHAIN-01, policy buffer stranding | Confirmed for a nonzero immutable limits root that does not permit native withdrawal. | **Low, gated supporting contract/API**; known residual, with no enabled browser buffer path established. |
| MC-03, TRON token receipt disclosure | Independently confirmed through the current browser-to-package call chain. | **Low privacy**, unresolved; correct any broad claim that WV-06 removes every TRON match-conditioned request. |
| Backup clipboard cleanup | Confirmed deletion of potentially newer unrelated clipboard content. | **Low integrity/availability finding**, with an existing correction on two selected privacy refs. |
| Hidden-page paste/image import continuation | Confirmed baseline lifecycle difference; a separate security consequence is not established. | **Hardening observation**, not an additional confirmed security finding on this evidence. |

## Evidence and necessary qualifications

### WV-01: real continuation gap; narrower severity is preferable

Main `apps/web/src/lib/wallet.ts:231–247` performs sequential account/chain requests and may request a chain switch without receiving an operation guard. `readChainId` supports a guard at `199–224`, but the connection helper does not pass one. The complete main-to-consolidation wallet diff changes receipt/transaction parsing only; it does not repair connection lifetime. Main wallet blob is `fb1d864f3223ce007e35d81c19a308df88657121`; consolidation's is `800cfa90810b887898d4184ff3f5ccfb2601c971`.

Consolidation `Pay.tsx:805–825` captures authority, starts the helper, and checks the result only after completion. Its lock subscription increments the flow revision at `438–458`. `RegistryView.tsx:114–125,145–160` likewise checks consent/session scope at result adoption. These controls reject stale app results but cannot prevent the helper's intermediate calls. The ordinary Pay connection UI establishes browser reachability; policy deployment gates do not protect that separate path.

The proven consequence is continued account/chain inspection and a possible external wallet network-change request. This helper contains no signing or transaction-submission request. The user initiated the original connection, and the app rejects its stale result. **I disagree with assigning Medium solely from these facts:** Low better describes the established security impact. Medium may remain an internal repair priority for consent consistency, but should not imply payment authorization bypass. Preserve the recommendation to check operation currentness around each awaited helper boundary and before every new provider request. An already-dispatched wallet prompt remains outside application cancellation control.

### ZC-CRYPTO-01 / WV-02: correct finding, with a wording correction

Consolidation `packages/invoice-schema/src/receipts.ts:24–25,147–167`, blob `a991e6aa7ac6bb2cea5758a1d79409c513758311`, deliberately permits absent `stealthAddress` and checks it only when both expected and signed values exist. `BoundReceipt` reports the receipt and signer classification, without a separate recipient-check status. Consolidation `Pay.tsx:678–688` supplies the prepared recipient when current; the result display at `1279–1282` does not distinguish omission.

The exact overstatement is in `apps/web/locales/en.json:973`, the **introductory guidance**. The success bodies at `984–985` accurately enumerate digest, chain, asset and amount; they do not explicitly claim recipient binding. Prefer the title **“Receipt guidance overstates recipient binding when the optional address is omitted”** over wording that attributes the explicit promise to the success body itself.

Signature and signer requirements remain enforced, as do invoice/chain/asset/amount and a supplied transaction hash. No payment-proof forgery or spend follows. Reporting which comparisons occurred is compatible with intentional minimal receipts. Count the schema and view observations once. The required-address baseline blob, `af7f5ffe10ef7d0e5610dda4032ba9a517b4e298`, lacks this omission case.

### NPE-02: preserve the configured-input and engine limits

Main `packages/scan-source/src/indexer.ts:66–75`, blob `c4f85a42d17c6661792cf45f10aff391074823a3`, constructs a URL and normalizes its unbounded pathname with the repeated-match suffix expression. This work precedes the asynchronous transport. The browser reaches the constructor through consolidation `apps/web/src/lib/scanPrivacy.ts:640–650`.

The browser's checker at `scanPrivacy.ts:122–135` already uses a linear suffix walk, but does not bound length; `sanitizeScanPrivacy:151–168` preserves valid configured values. Settings validation and the URL field at `Settings.tsx:621–623,675–677` add no length budget. `planScan:263–268` confines this mode to supported testnet chain IDs and requires an explicitly configured indexer URL.

Low is reasonable for this optional configured-input availability defect. High confidence attaches to absent bounds, source ordering and reachability. The amount of synchronous delay and actual engine behavior remain unmeasured. Do not describe an ordinary remote RPC reply as controlling this URL or assert a demonstrated browser denial of service. Linear normalization and a documented input budget address the identified concern.

### ZC-CRYPTO-02: restored context is not restored book access

Main `packages/ux-vault/src/vault.ts:189–235`, blob `2cb0dbee41ab47e4bba5dcb3c2246d5547af8bdb`, provides direct evidence: `lock()` clears both context and book, while a pending `changePassword` later assigns the new context unconditionally. `isLocked` checks context alone; `live()` requires both. Consequently the reported lock flag can become false and a `CryptoKey` context can remain retained, while `getBook` and the other ordinary `live()`-guarded operations still reject.

The per-vault serial queue orders writes but does not serialize synchronous `lock()` against an awaited continuation. It therefore does not invalidate this finding. Repository caller search found the constructor in the supporting package's test/documentation use, not an active Pages consumer; the inspected newer integration browser tree also has no constructor use. Keep Low as a supporting lifecycle/correctness issue, with no implication that the browser's separate seller-key or reconciliation vault unlocks after lock. Guarding continuation and making reported/operational lock predicates consistent are appropriate repairs.

### ZC-CHAIN-01: retain both the policy condition and disabled-browser context

Main `GhostPayPolicyRouter.sol:161–177`, blob `56f5ef6ef90c6441812f3695da55916ecce352c4`, sends the buffer to the policy account. `PolicyAccount.sol:172–185,204–242`, blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`, requires an eligible leaf when `limitsRoot` is nonzero and releases value only through delayed withdrawal to the configured destination. Initialization sets the root once; there is no root update, generic execution or rescue route. **A zero root is an explicit unrestricted case**, so “no native leaf” alone is not a sufficient statement of the stranding condition.

The cap is caller-selected, not a protocol guarantee that a stranded value is small. The more general owner-gas statement should mean **not an immediate owner-gas top-up**: an eligible delayed withdrawal could eventually reach an owner that is also the destination. This does not repair a missing native withdrawal permission.

Main and consolidation browser `preparePolicyPayment` pass no buffer. Both deployment verifiers have an empty `PINNED_POLICY_DEPLOYMENTS` map and reject a missing profile; the policy feature also requires its experimental build flag. Low, known residual, supporting-contract classification is appropriate for this reviewed repository. No deployed-instance inspection supports a claim of live stranded funds.

### MC-03: the current TRON token path remains match-conditioned

Main `packages/tron-adapter/src/scan.ts:123–137,150–167`, blob `b7a3ce1fa5c8e87f9af03414ed19a2eba6ee6a50`, performs local viewing-key matching before the token-receipt call. The trusted-token classification occurs afterward. Consolidation `apps/web/src/features/tron/scan.ts:52–62` invokes this iterator without excluding tokens; its later token-count branch runs after the receipt lookup. Consolidation package `rpc.ts:213–229` confirms that the lookup identifies the transaction to the configured node.

Thus a node observing the scan can associate matching token transaction IDs with that request session. No key extraction, arbitrary-party access or broadcast is established, and a range with no matching token candidate does not take this path. Low privacy within the experimental testnet context is supported.

WV-06's prepared fixes remain valid for the named native TRON balance/memo reads and Bitcoin/Solana paths. They cannot support an all-TRON or all-chain “no per-match requests” conclusion. Keep MC-03 as the residual token path, or mark a combined privacy finding partially repaired; avoid counting the same baseline observation twice. This conclusion is separate from the documented default EVM evidence-read tradeoff.

## Component observations

### Backup cleanup merits a Low finding

Main `apps/web/src/components/SecretBackup.tsx:10–17,39–65`, blob `c86f77de050b838204e3f4222cd796ca6e54337a`, tracks backup-copy sequence numbers but never reads current clipboard content before writing an empty string. Cleanup is triggered by hide, timeout, visibility change, lock and unmount (`68–72,135–175`), with activation retries after a refused clear. Another application, manual copy or unrelated component can replace clipboard content without changing those backup-only sequence numbers. A later permitted clear can therefore discard newer unrelated content. This is a concrete integrity/availability effect, not merely a missed memory wipe.

The component is used by BTC, Solana and TRON backup views. Severity is Low: a backup copy must already have armed cleanup, a newer value must exist, and the browser must permit the write. There is no demonstrated theft or disclosure.

Privacy-snapshot `SecretBackup.tsx:40–63`, blob `c92bd4951f23325c854cdd8ca37f1ca1aa1a91b6`, checks shared copy ownership and calls a digest comparison helper. Its `clipboardPrivacy.ts:49–77` refuses to clear changed content and does not fall back to an unconditional write when reading is denied. Keep the existing repair, while retaining its explicit limitation that external clipboard compare/write is not atomic. Do not claim that every newer candidate contains this fix; the exact groups below matter.

### Hidden-page paste/image continuation is a hardening note on this evidence

Main `CameraImporter.tsx:121–144`, blob `f592f573581511d7287608c3da068aae432f5738`, excludes closed disclosures and inactive/unmounted components from `visible()`, but not a hidden document. The visibility handler stops the camera and resets a partial assembler, yet does not stop an isolated pending paste/image operation. `readImage:292–314` can therefore continue to local delivery after document hide. The newer blob `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` adds hidden-document checks and cancels pending local import work.

This is a real lifecycle consistency improvement. The inspected consumers, however, preserve further authorization: main `Pay.tsx:229–263` stages an invoice preview for explicit opening; `SellerKeys.tsx:537–540` stages a validated encrypted keystore; `Settings.tsx:323–327` stages a settings preview; BTC `BtcView.tsx:833–853` updates a destination and clears review. The camera is already stopped. No fresh remote disclosure, decryption without its separate authorization, signing, transfer or actual app-lock bypass was established from tab hiding alone. Record the prepared cancellation improvement as hardening unless a specific stronger consumer consequence is demonstrated.

## Independent identity checks for the later source aliases

The initial `scope-refs.json` pins were checked alongside `main-final` = `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`, `recovered-fixes` = `6c65cc3fd31c9ae361f932bee4a3449d89ed776c`, and `unique-code` = `885b9569e6fc99e43bf01d23305494275e10120e`. These aliases name snapshots, not deployment claims.

| Source condition | Exact alias groups independently confirmed by Git blob identity |
| --- | --- |
| Unconditional backup clipboard cleanup | Present on main, release, consolidation, clipboard, format, erc20-simulation, main-final, recovered-fixes and unique-code. Corrected only on privacy-snapshot and quick-hide. |
| Hidden-page local-import continuation | Present on main, erc20-simulation, main-final and unique-code. Corrected on release, consolidation, privacy-snapshot, quick-hide, clipboard, format and recovered-fixes. |
| Optional receipt-recipient omission behavior | Present on release, consolidation, privacy-snapshot, quick-hide, clipboard and format. Absent in the required-address source on main, erc20-simulation, main-final, recovered-fixes and unique-code. |
| Wallet connection continuation, indexer normalizer, legacy vault rekey and policy buffer conditions | The relevant unchanged helper or exact supporting source blobs remain on all eleven aliases. |
| TRON token receipt disclosure | The package scan blob remains identical on all eleven aliases. |

The later integration labels must not be treated as supersets of every pending feature repair. The coordinator owns the complete status matrix and final coverage reconciliation. No completed dynamic qualification or successful remote publication is asserted here.
