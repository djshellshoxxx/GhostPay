# GhostPay audit findings and observations

**Final static catalogue — November 19, 2026 (America/Los_Angeles).**

All in-scope source units in the frozen 24-snapshot scope have a final disposition. This catalogue contains **58 records**, including defects, conditional protocol risks, operational issues, assurance gaps, design constraints, branch hardening and a retired hypothesis. It is not a count of 58 demonstrated vulnerabilities. No High or Critical finding was established by this static review.

The [scope and method](README.md), [exact branch matrix](branch-applicability.md), [coverage ledger](coverage.json) and [independent quality review](findings-quality-review.md) bound these conclusions. “Fixed” means the correction is present in the named source snapshot, not merged, deployed or tested by this audit. Acceptance criteria below are proposed future checks; none was executed here.

Duplicate handling: CP-C01 is CUSTODY-02; ROOT-02 is PS2-02; HOST-CAND-01 is superseded by HOST-LEGACY-01. CP-O03 remains retired as an active Pages vulnerability. Older lane wording and incomplete queues are historical checkpoints.

## Index

| ID | Severity label | Record |
|---|---|---|
| [CUSTODY-01](#custody-01) | Medium | Main idle lock retains ordinary seller-key authority when the sole copy must be kept |
| [PUI-01](#pui-01) | Medium | Receipt polling accepts a receipt without binding it to the requested transaction |
| [PUI-03](#pui-03) | Medium | Main sweep operations do not revoke an in-flight signing review when visible inputs change |
| [SCAN-NET-02](#scan-net-02) | Medium | Private scanning drops session-only RPC selections, including a chosen independent secondary provider |
| [CUSTODY-02](#custody-02) | Low | Out-of-range archived receipt issue time can fail history rendering |
| [PUI-02](#pui-02) | Low | Malformed ERC20 simulation output is classified as a successful dry run |
| [PUI-04](#pui-04) | Low | Page hiding does not revoke pending local imports in the main camera/import component |
| [SCAN-NET-01](#scan-net-01) | Low | Thirty-day privacy-set count can be presented without its partial-range qualifier |
| [PS2-01](#ps2-01) | Low | Privacy branches never pass the connected wallet to WalletAttempts |
| [PS2-02](#ps2-02) | Low | Bill print stylesheet hides receipt print content |
| [CP-01](#cp-01) | Low | Temporary secret buffers are not consistently cleared on exceptional exits |
| [CP-02](#cp-02) | Low | QR image pixel bounds can be checked only after native allocation for unsupported headers |
| [CP-H01](#cp-h01) | Low | Rejected conflicting QR chunks refresh the idle deadline on older baselines |
| [PUI-05](#pui-05) | Low | parseUnits runtime arguments are not validated in main/integration |
| [PUI-06](#pui-06) | Informational | QR classification helpers rely on compile-time union types in older versions |
| [PUI-07](#pui-07) | Informational | Older multipart QR encoding silently normalizes ill-formed Unicode input |
| [CP-H02](#cp-h02) | Informational | Canonical arrays were not restricted to dense own data properties on main |
| [CP-H03](#cp-h03) | Informational | Base64url decoder lacks an explicit runtime string guard on main |
| [CP-H04](#cp-h04) | Low | Merchant profile expiry accepts an invalid caller clock on older baselines |
| [CW2-K01](#cw2-k01) | Medium | Nonzero factory fees retain an immutable fee-token availability dependency |
| [CW2-K02](#cw2-k02) | Medium | Reusable public policy hashes expose a payment correlation identifier |
| [CW2-K03](#cw2-k03) | Medium | Policy asset restrictions can leave funded assets without an eligible withdrawal |
| [CW2-K04](#cw2-k04) | Low | Fee waiver assumptions do not distinguish sender-controlled transfer vetoes |
| [CW2-K05](#cw2-k05) | Medium | Immutable fee-recipient acceptance remains a payment availability dependency |
| [CW2-K06](#cw2-k06) | Low | Sponsored sweeps retain relayer execution-cost and owner-state risks |
| [CP-O01](#cp-o01) | Low | SDK merchant response size limit follows full body materialization |
| [CP-O02](#cp-o02) | Informational | SDK invoice-status responses are not bound to the requested nonce |
| [PS2-03](#ps2-03) | Low | Merchant export duplicate invoice detection depends on sort adjacency |
| [PS2-04](#ps2-04) | Low | Experimental PolicyPay input edits do not invalidate an in-flight review guard |
| [CUSTODY-S1](#custody-s1) | Low | Older supplemental backup cleanup can erase newer unrelated clipboard content |
| [HOST-LATEST-01](#host-latest-01) | Medium | Failed rollback cleanup can delete a retained recovery backup |
| [HOST-LATEST-02](#host-latest-02) | Low | Generated operator guide incorrectly groups a subpath with separate browser origins |
| [HOST-LEGACY-01](#host-legacy-01) | Low | Legacy selfhost validates env-file inputs while Compose can use shell overrides |
| [CT3-01](#ct3-01) | Low | Development-key refusal depends on raw key spelling |
| [CT3-02](#ct3-02) | Low | Rehearsal cleanup can remove earlier deployment records |
| [ROOT-I01](#root-i01) | Low | Legacy image recipes omit the build helper |
| [ROOT-I02](#root-i02) | Informational | Legacy Tor example names a missing listener path |
| [CW2-01](#cw2-01) | Low | Router invariant handler can discard invalid-metadata acceptance evidence |
| [CT3-O01](#ct3-o01) | Informational | QR mutation property does not enforce its stated successful-parse condition |
| [ROOT-01](#root-01) | Low | Independent lean report verification tolerates incomplete module evidence |
| [ROOT-Q01](#root-q01) | Informational | Pages devnet qualification omits its canonical ERC-20 checkout path |
| [ROOT-Q03](#root-q03) | Low | Local qualification can succeed with no checks |
| [CW2-O01](#cw2-o01) | Informational | CREATE2 documentation overstates cross-chain address separation |
| [CW2-O02](#cw2-o02) | Informational | Predeploy static checks do not have the claimed checksum parity |
| [CW2-O03](#cw2-o03) | Informational | NatSpec gate omits the policy router |
| [DEP-01](#dep-01) | Low | Development dependency graph retains two advisory families |
| [CW2-H01](#cw2-h01) | Not rated | Main policy signing helper lacked the current canonical policy-only boundary |
| [CW2-H02](#cw2-h02) | Not rated | Main policy proofs lacked the current stored-field binding checks |
| [CW2-H03](#cw2-h03) | Not rated | Main policy calldata decoder lacked current canonical and metadata checks |
| [CW2-H04](#cw2-h04) | Not rated | Main viewing-secret cleanup did not cover earlier validation failures |
| [CW2-H05](#cw2-h05) | Not rated | Main Mythril output handling lacked the latest completeness evidence |
| [ROOT-H01](#root-h01) | Informational | Branch-dependent root hardening differs |
| [CUSTODY-N1](#custody-n1) | Informational | Backup-only idle retention deliberately preserves recovery without a prior credential for a sole copy |
| [CW2-D01](#cw2-d01) | Informational | Fee rounding and native-buffer exemptions are explicit economic semantics |
| [CW2-D02](#cw2-d02) | Informational | Announcement syntax does not by itself establish payment authenticity |
| [ROOT-O01](#root-o01) | Informational | Tight CSP controls are not wired through the stock Pages workflow |
| [ROOT-Q02](#root-q02) | Informational | Clipboard cleanup remains best effort |
| [CP-O03](#cp-o03) | Informational | Permit domain name/version are outside the tx-review intent comparison |


## Browser and shared-library findings


<a id="custody-01"></a>

### CUSTODY-01 — Main idle lock retains ordinary seller-key authority when the sole copy must be kept

**Severity/class:** Medium; Session authority lifecycle.

**Disposition:** current_main: affected; release: fixed; completion: fixed; quick_hide: fixed; unique_code: affected; recovered_fixes: affected; tor: affected

**Required conditions**

Loaded seller keys reach idle expiry. Ordinary authority is not synchronously revoked while custody is checked; if there is no verified recoverable copy, keys remain usable through ordinary secret APIs.

**Impact**

Tag vault and view inputs lock, but ordinary secret APIs can still use the retained seller keys. The retained state therefore lacks the authority suspension now provided by latest code. No live compromise or runtime reproduction is claimed.

**Impact limit**

This is a local session-authority lifecycle gap. Fixed snapshots deliberately preserve narrow encrypted-backup recovery for a sole copy; that retained recovery is not an additional ordinary-session bypass.

**Remediation**

Backport latest synchronous suspension, expiry checks and stale async guard invalidation before treating main idle timeout as an authority lock. Keep sole-copy recovery narrow.

**Future acceptance criteria**

Safe lifecycle tests show ordinary signing/scanning/raw export and old guards reject immediately at expiry despite unresolved custody storage; encrypted recovery remains available.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/AppShell.tsx:145–168](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/AppShell.tsx#L145-L168) at `c977b5d6723f` | `22c6d0b76c97584bd7059f830ae6aa8134a4a3a9` | No-recoverable-copy branch returns without revoking seller authority. |
| [apps/web/src/lib/session.ts:312–348](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts#L312-L348) at `c977b5d6723f` | `4b5d36e9ed7651d1d6f3e4b63e805b41667e8f0a` | Secret access checks only current keys; version guard has no expiry/suspension check. |
| [apps/web/src/AppShell.tsx:257–272](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/AppShell.tsx#L257-L272) at `e22c1748a3de` | `8e2006a8309403f336efda82c1cc6eb6699f04c4` | suspendSession at 263 precedes asynchronous custody. |
| [apps/web/src/lib/session.ts:383–451](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/session.ts#L383-L451) at `e22c1748a3de` | `9440ec16a0283f70b8fc317f13f98db0de0194e0` | Latest ordinary access rejects suspension; separate backup-only guard. |
| [apps/web/src/AppShell.tsx:145–168](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/AppShell.tsx#L145-L168) at `773a94be1c83` | `22c6d0b76c97584bd7059f830ae6aa8134a4a3a9` | Idle lock awaits custody without suspension; the unrecoverable sole-copy branch returns with the seller session retained. |
| [apps/web/src/lib/session.ts:312–359](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/session.ts#L312-L359) at `773a94be1c83` | `4b5d36e9ed7651d1d6f3e4b63e805b41667e8f0a` | Ordinary secret access and guards check key-holder/revision presence without an idle suspension check. |
| [apps/web/src/AppShell.tsx:276–291](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/AppShell.tsx#L276-L291) at `137628961463` | `ae90814b2edb359cf1d72d0a728cfb619870933f` | Privacy variant preserves the same synchronous authority suspension. |
| [apps/web/src/lib/session.ts:104–146, 383–451](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/session.ts#L104-L146) at `e22c1748a3de` | `9440ec16a0283f70b8fc317f13f98db0de0194e0` | Ordinary APIs evaluate expiry and suspension; pre-lock revisions fail, while a separately named encrypted-backup-only guard permits retained recovery. |

Originating record: [custody_privacy_review](lanes/custody_privacy_review.json).


<a id="pui-01"></a>

### PUI-01 — Receipt polling accepts a receipt without binding it to the requested transaction

**Severity/class:** Medium; RPC result integrity.

**Disposition:** current_main: affected; release: affected; completion: fixed; quick_hide: affected; unique_code: affected; recovered_fixes: fixed; tor: affected

**Finding**

The older pollReceipt reads destination, status and blockNumber without validating transactionHash, and maps every status except 1 to reverted. The latest integration requires a valid matching transactionHash and status exactly 0 or 1.

**Required conditions**

The selected RPC returns a receipt with missing/mismatched transactionHash or a parsed status outside the two defined outcomes.

**Impact**

Payment confirmation or revert presentation can be attributed to a receipt that does not identify the requested transaction. This is a boundary-validation defect under inconsistent RPC data, not proof of chain-state forgery or theft.

**Impact limit**

Payment outcome presentation can be attributed to inconsistent data. This does not establish chain-state forgery or theft. Both identity and status checks are required for fixed status.

**Remediation**

Retain the strict hash and status validation from the integration version across all shipped branches; retain the original known transaction hash and an unresolved outcome when validation fails.

**Future acceptance criteria**

Read-only/unit validation should establish that missing or mismatched receipt identity and out-of-domain status cannot produce success/reverted, while the original transaction remains trackable. No live endpoint or transaction is required.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/wallet.ts:478–503](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/wallet.ts#L478-L503) at `c977b5d6723f` | `fb1d864f3223ce007e35d81c19a308df88657121` |  |
| [apps/web/src/lib/wallet.ts:490–508](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/wallet.ts#L490-L508) at `e22c1748a3de` | `800cfa90810b887898d4184ff3f5ccfb2601c971` |  |
| [apps/web/src/lib/wallet.ts:492–500](https://github.com/djshellshoxxx/GhostPay/blob/acbf39ee21ad35e9d14df958fa16fbcc2e230cae/apps/web/src/lib/wallet.ts#L492-L500) at `acbf39ee21ad` | `3320a5650eab89763e16649e05ba8b4fa2ddeab9` |  |
| [apps/web/src/lib/wallet.ts:478–503](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/wallet.ts#L478-L503) at `773a94be1c83` | `fb1d864f3223ce007e35d81c19a308df88657121` | pollReceipt does not bind transactionHash and maps every parsed status other than one to reverted. |
| [apps/web/src/lib/wallet.ts:483–513](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/wallet.ts#L483-L513) at `e22c1748a3de` | `800cfa90810b887898d4184ff3f5ccfb2601c971` | pollReceipt requires a valid matching transactionHash and an exactly zero-or-one status. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="pui-03"></a>

### PUI-03 — Main sweep operations do not revoke an in-flight signing review when visible inputs change

**Severity/class:** Medium; Consent and asynchronous state binding.

**Disposition:** current_main: affected; release: fixed; completion: fixed; quick_hide: fixed; unique_code: affected; recovered_fixes: affected; tor: affected

**Finding**

Main guard captures session/authEpoch only. The main direct/relayed helpers are called without a UI assertReviewCurrent capability; directSweep checks the seller session but not the current UI review before signing and handoff. The editable destination remains available while busy. Latest view binds balance and quote scopes, aborts on context changes and passes assertReviewCurrent through the helper to handoff.

**Required conditions**

A user begins a sweep with a valid session, then changes destination, mode, or the review context while preparation/signing is awaiting completion.

**Impact**

A transaction can continue using the earlier captured destination/context after the interface presents changed input. This is stale consent, not arbitrary recipient injection. No fund-loss magnitude is asserted.

**Impact limit**

The earlier captured transaction context can continue despite changed visible inputs. This is stale consent, not arbitrary recipient injection. No fund-loss magnitude or live signing result is asserted.

**Remediation**

Preserve scope-bound cancellation and review guards from release/integration, checking before and after asynchronous preparation, immediately before signing, and before handoff. Preserve truthful tracking once a handoff has already occurred.

**Future acceptance criteria**

With local stubbed dependencies, changing a review field or leaving the view before handoff must prevent later signing/handoff; a response after an actual handoff must keep the original transaction/order tracked. Native confirmation must remain single-use, scoped and time-bounded.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/views/Sweep.tsx:138–157, 176–209, 241–264](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L138-L157) at `c977b5d6723f` | `75ea26cfa62a08cbfe001d6ac02c68c6bc210566` |  |
| [apps/web/src/lib/sweep.ts:562–570, 645–664](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweep.ts#L562-L570) at `c977b5d6723f` | `ef73a7ec629cf33da5dba4fa8b3d9f80913bbb1a` |  |
| [apps/web/src/views/Sweep.tsx:134–161, 298–329, 405–469](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Sweep.tsx#L134-L161) at `e22c1748a3de` | `6da18522b825c99b4073fd238174f63a8a2b7b38` |  |
| [apps/web/src/lib/sweep.ts:955–985](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L955-L985) at `e22c1748a3de` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` |  |
| [apps/web/src/views/Sweep.tsx:80–86, 138–157, 190–209, 241–264, 355](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/views/Sweep.tsx#L80-L86) at `773a94be1c83` | `75ea26cfa62a08cbfe001d6ac02c68c6bc210566` | UI guard does not bind destination/mode/review revision; destination remains editable and helpers receive no assertReviewCurrent capability. |
| [apps/web/src/lib/sweep.ts:562–573, 645–664](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/sweep.ts#L562-L573) at `773a94be1c83` | `ef73a7ec629cf33da5dba4fa8b3d9f80913bbb1a` | Direct sweep checks seller-session identity before signing/handoff but cannot check the live UI review. |
| [apps/web/src/lib/sweep.ts:955–980](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L955-L980) at `e22c1748a3de` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` | Direct submission checks the caller review capability alongside session identity immediately before signing and handoff. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="scan-net-02"></a>

### SCAN-NET-02 — Private scanning drops session-only RPC selections, including a chosen independent secondary provider

**Severity/class:** Medium; Browser and shared-library findings.

**Disposition:** current_main: not-present; release: affected; completion: affected; quick_hide: affected; unique_code: not-present; recovered_fixes: not-present; tor: not-present

**Required conditions**

Production privateScanStore is enabled, current-tab endpoint settings are saved with session-only retention, and persisted settings remain readable. The integrity consequence additionally requires a usable primary, a chosen session-only secondary, and plan.useSecondary=true.

**Impact**

A normally saved primary plus same-tab session-only secondary results in scanning without the chosen independent cross-check. No forged payment or fund loss is established. A session-only primary with no custom scan endpoint instead fails visibly and closed (Low availability aspect).

**Impact limit**

The chosen independent secondary may be silently omitted. A session-only primary with no usable custom scan endpoint fails visibly and closed. Read denial/absent browser storage uses the in-memory fallback. No forged payment or fund loss is established.

**Remediation**

Use a single current-revision selected endpoint snapshot that retains validated current-tab session-only primary and secondary entries. Preserve the chosen secondary requirement and refuse if that selected provider cannot be opened. Do not persist its credential-bearing URL.

**Future acceptance criteria**

- Same-tab Settings save with session-only primary remains usable by production privateScanStore flow without localStorage retention.
- Session-only secondary with plan.useSecondary=true is used alongside the selected primary; unusable selected secondary blocks scanning.
- Cross-tab stale persisted revisions still revoke/reload rather than reusing obsolete session-only selections.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/views/Settings.tsx:101–109](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Settings.tsx#L101-L109) at `e22c1748a3de` | `fb144d734ef2e05825735e01aaeb3243d43085f7` | Validated endpoint maps enter current app settings after session-only retention choices are registered. |
| [apps/web/src/views/Settings.tsx:111–119](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Settings.tsx#L111-L119) at `137628961463` | `83a8148de6a30fe4e34a287af19d72e2a7dd05fc` | Privacy settings variant preserves the retention registration and current app-settings update. |
| [apps/web/src/AppShell.tsx:421–436](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/AppShell.tsx#L421-L436) at `e22c1748a3de` | `8e2006a8309403f336efda82c1cc6eb6699f04c4` | Current React settings retain the submitted maps while saveSettings writes the stripped persisted representation. |
| [apps/web/src/AppShell.tsx:440–461](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/AppShell.tsx#L440-L461) at `137628961463` | `ae90814b2edb359cf1d72d0a728cfb619870933f` | An execution-settings change retains the full current maps then saves the stripped representation; UI-only privacy saves have a separate shortcut. |
| [apps/web/src/lib/settings.ts:185–204](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/settings.ts#L185-L204) at `e22c1748a3de` | `5d73dc4b122d8d418f3f912d3b7008d1a11ef4d4` | loadSettings reads stored preferences only; saveSettings removes primary and secondary session-only URLs. |
| [apps/web/src/lib/settings.ts:227–251](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/lib/settings.ts#L227-L251) at `137628961463` | `666aff245eac46a61633b74257bc65c39fb6093e` | Privacy preferences are separate, but execution-settings load still reads only storage and save strips session-only URLs. |
| [apps/web/src/views/Scan.tsx:92–98, 166–175, 434–467](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L92-L98) at `e22c1748a3de` | `d92f0f2df98b2452a9285c5d4e4687d4096a0834` | Private scanning prefers readable persisted settings. Missing primary fails visibly; an omitted secondary is skipped even when the plan permits its use. |
| [apps/web/src/views/Scan.tsx:93–99, 167–176, 435–468](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Scan.tsx#L93-L99) at `137628961463` | `ad2bc9f8ef82de6151b8d769ad468d0761a9026e` | Privacy variant has the same persisted-settings preference and missing-secondary behavior. |
| [apps/web/src/lib/defaultServices.ts:113–119](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/defaultServices.ts#L113-L119) at `e22c1748a3de` | `2487789e2b88f73bceaf5ac5dc464a531e659dcb` | Production services enable privateScanStore. |
| [apps/web/src/lib/defaultServices.ts:40–46](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/defaultServices.ts#L40-L46) at `773a94be1c83` | `49158fb4ffec9b1d1eb55bcce21f081dbc9c8d4d` | Older production services do not include privateScanStore. |
| [apps/web/src/views/Scan.tsx:212–224](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/views/Scan.tsx#L212-L224) at `773a94be1c83` | `eed9daf882711659720a577138b3e08554ce9fe9` | Older scan uses app.getSecondaryRpc directly; the defect-specific persisted-settings private path is absent. |

Originating record: [scan_network_wave2](lanes/scan_network_wave2.json).


<a id="custody-02"></a>

### CUSTODY-02 — Out-of-range archived receipt issue time can fail history rendering

**Severity/class:** Low; still current in main and all selected recent snapshots.

**Disposition:** current_main: affected; release: affected; completion: affected; quick_hide: affected; unique_code: affected; recovered_fixes: affected; tor: affected

**Required conditions**

An authenticated same-seller/same-chain reconciliation archive contains a positive safe-integer issuedAt outside the representable JavaScript Date range in seconds, and the receipt history is rendered.

**Impact**

Import accepts the value and history calls unguarded toISOString, which can throw RangeError and interrupt that UI. No fund impact or stored-byte corruption established; this is not an unauthenticated network path.

**Impact limit**

History rendering can throw; no fund movement, remote unauthenticated path, or stored-byte corruption is established. In the privacy branch the history may additionally require its reveal action.

**Remediation**

Bound issuedAt at schema/import to representable seconds, and safely render existing incompatible records without throwing or discarding valid unrelated records. A Date-converted positive value may not exceed 8,640,000,000,000 seconds.

**Future acceptance criteria**

Valid boundary timestamps display; invalid values are refused before commit or safely represented from old storage. History does not throw and valid records remain available.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/invoice-schema/src/receipts.ts:90–95](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L90-L95) at `e22c1748a3de` | `a991e6aa7ac6bb2cea5758a1d79409c513758311` | issuedAt at line93 is positive safe integer only. |
| [packages/invoice-schema/src/receipts.ts:86–94](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/receipts.ts#L86-L94) at `c977b5d6723f` | `af7f5ffe10ef7d0e5610dda4032ba9a517b4e298` | Same missing bound at line90. |
| [packages/ux-vault/src/reconciliation-portable.ts:527–542](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/ux-vault/src/reconciliation-portable.ts#L527-L542) at `e22c1748a3de` | `78d7b8ec843514d3446b69fa22b84e35b178a694` | Import bounds archivedAt only, not issuedAt. |
| [packages/ux-vault/src/reconciliation-portable.ts:1045–1083](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/ux-vault/src/reconciliation-portable.ts#L1045-L1083) at `e22c1748a3de` | `78d7b8ec843514d3446b69fa22b84e35b178a694` | Preview/activation use document validator without another issue-time bound. |
| [apps/web/src/components/ReconciliationLedger.tsx:751–757](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/ReconciliationLedger.tsx#L751-L757) at `e22c1748a3de` | `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67` | Date(receipt.issuedAt*1000).toISOString at757. |
| [packages/invoice-schema/src/receipts.ts:86–94](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/packages/invoice-schema/src/receipts.ts#L86-L94) at `773a94be1c83` | `af7f5ffe10ef7d0e5610dda4032ba9a517b4e298` | issuedAt has a positive-safe-integer check, without a representable JavaScript Date upper bound in seconds. |
| [packages/invoice-schema/src/receipts.ts:90–98](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L90-L98) at `e22c1748a3de` | `a991e6aa7ac6bb2cea5758a1d79409c513758311` | The optional-address receipt variant retains the same issue-time validation gap. |
| [packages/ux-vault/src/reconciliation-portable.ts:527–542, 1045–1083](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/ux-vault/src/reconciliation-portable.ts#L527-L542) at `e22c1748a3de` | `78d7b8ec843514d3446b69fa22b84e35b178a694` | Authenticated archive import delegates issue-time validation to the receipt schema; the explicit Date-range bound applies only to archivedAt. |
| [apps/web/src/components/ReconciliationLedger.tsx:756–762](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/ReconciliationLedger.tsx#L756-L762) at `137628961463` | `07e736bb80b10e16b49e9e09b2aff9d3085a2a82` | Privacy-wrapped history retains the same unguarded issue-date rendering. |

Originating record: [custody_privacy_review](lanes/custody_privacy_review.json).


<a id="pui-02"></a>

### PUI-02 — Malformed ERC20 simulation output is classified as a successful dry run

**Severity/class:** Low; Preflight result integrity.

**Disposition:** current_main: affected; release: affected; completion: affected; quick_hide: affected; unique_code: affected; recovered_fixes: fixed; tor: affected

**Finding**

The older helper rejects only a 32-byte zero result. Every other syntactically hex result returns ok. PR305 classifies nonempty output with the wrong width or value as unavailable.

**Required conditions**

simulateCall is used with expectBool=true and receives nonempty syntactically valid hex that is not a canonical ABI boolean.

**Impact**

The interface can omit the unavailable-simulation warning despite lacking a meaningful affirmative simulation result. A dry run is not a guarantee of execution, and the product deliberately allows unavailable simulation with a warning; this finding does not demonstrate a bypass that directly moves funds to an unintended recipient.

**Impact limit**

The UI can omit its unavailable-simulation warning. The product already permits unavailable simulations with a warning; no direct unintended-transfer bypass is established.

**Remediation**

Integrate the PR305 canonical boolean check without losing legacy empty-return compatibility or the explicit false-return refusal.

**Future acceptance criteria**

Validate that canonical true is ok, canonical false refuses, empty legacy output follows its documented policy, and all other nonempty boolean-domain output is unavailable. Verify caller warning propagation for both submitted and unknown-after-handoff outcomes.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/txGuard.ts:111–128](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/txGuard.ts#L111-L128) at `c977b5d6723f` | `abba792709126a191cbd589f2023351a7b9e1c66` |  |
| [apps/web/src/lib/txGuard.ts:124–135](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/lib/txGuard.ts#L124-L135) at `87cf6c603338` | `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23` |  |
| [apps/web/src/lib/sweep.ts:774–778](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L774-L778) at `e22c1748a3de` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` |  |
| [apps/web/src/lib/txGuard.ts:111–128](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/txGuard.ts#L111-L128) at `773a94be1c83` | `abba792709126a191cbd589f2023351a7b9e1c66` | expectBool simulation rejects canonical false but treats other syntactically valid nonempty hex as ok. |
| [apps/web/src/lib/txGuard.ts:111–135](https://github.com/djshellshoxxx/GhostPay/blob/6c65cc3fd31c9ae361f932bee4a3449d89ed776c/apps/web/src/lib/txGuard.ts#L111-L135) at `6c65cc3fd31c` | `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23` | Nonempty expectBool output must be one 32-byte word equal to zero or one; malformed output is unavailable, and empty legacy output is preserved. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="pui-04"></a>

### PUI-04 — Page hiding does not revoke pending local imports in the main camera/import component

**Severity/class:** Low; Consent lifecycle.

**Disposition:** current_main: affected; release: fixed; completion: fixed; quick_hide: fixed; unique_code: affected; recovered_fixes: fixed; tor: affected

**Finding**

Main visibilityChanged invokes stop only for a camera; visible does not check document visibility; deliver invokes the consumer callback before its first cancellation/visibility check. Latest also stops localImport work, includes document visibility in visible(), and checks before the callback.

**Required conditions**

A local paste/image import remains pending when the page is hidden with no active camera.

**Impact**

An import consumer can receive content after the page has hidden and the intended local action lifetime should have ended. Consumer-specific checks may limit downstream effects; no secret exfiltration or unauthorized signing was established here.

**Impact limit**

The consumer callback can receive content after the action lifetime should end. Downstream consumer checks can limit effects; no secret disclosure or unauthorized signing is established.

**Remediation**

Retain the latest cancellation and pre-delivery checks; consumers must also recheck their supplied signal before committing any asynchronous state.

**Future acceptance criteria**

Pending paste and image operations must be cancelled when hidden; becoming visible must require a fresh user action. Hidden/aborted callbacks must not commit imported state.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/components/CameraImporter.tsx:121–143, 158–168](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/components/CameraImporter.tsx#L121-L143) at `c977b5d6723f` | `f592f573581511d7287608c3da068aae432f5738` |  |
| [apps/web/src/components/CameraImporter.tsx:121–145, 160–170](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/CameraImporter.tsx#L121-L145) at `e22c1748a3de` | `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` |  |
| [apps/web/src/components/CameraImporter.tsx:121–143, 158–168](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/components/CameraImporter.tsx#L121-L143) at `773a94be1c83` | `f592f573581511d7287608c3da068aae432f5738` | Hidden-page handler cancels camera work only; visible omits document visibility and deliver calls the consumer before its cancellation check. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="scan-net-01"></a>

### SCAN-NET-01 — Thirty-day privacy-set count can be presented without its partial-range qualifier

**Severity/class:** Low; Browser and shared-library findings.

**Disposition:** current_main: affected; release: fixed; completion: fixed; quick_hide: fixed; unique_code: fixed; recovered_fixes: fixed; tor: affected

**Required conditions**

The scan covers the recent seven-day interval but not the whole available thirty-day interval, while reporting both counts.

**Impact**

A scan covering the recent seven days but not the thirty-day range can render the thirty-day count without the lower-bound qualifier, understating the sampled privacy set and implying complete coverage. No spending authority impact.

**Impact limit**

The thirty-day count can be presented as complete when it is a lower bound. Spending authority is unaffected.

**Remediation**

Retain latest from30 partial-range calculation; static regression criterion should cover seven-to-thirty-day scan starts.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/scanSpam.ts:170–196](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/scanSpam.ts#L170-L196) at `773a94be1c83` | `0cf63cb855bb80e1dcf1e2b9f511c8758b124558` | The shared partial flag checks from7 despite also reporting count30d. |
| [apps/web/src/lib/scanSpam.ts:170–196](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanSpam.ts#L170-L196) at `e22c1748a3de` | `da35b619ad1aa7efa8607e0ab9ce8278b585bd61` | The shared partial flag checks the full available from30 range. |

Originating record: [scan_network_wave2](lanes/scan_network_wave2.json).


<a id="ps2-01"></a>

### PS2-01 — Privacy branches never pass the connected wallet to WalletAttempts

**Severity/class:** Low; Availability / recovery UI regression.

**Disposition:** current_main: not-present; release: not-present; completion: not-present; quick_hide: affected; unique_code: not-present; recovered_fixes: not-present; tor: not-present

**Finding**

The privacy implementation filters the journal by an optional wallet prop and hides all account/hash/clear controls when it is absent. Every production caller still renders WalletAttempts without that prop. Connecting a wallet therefore cannot reveal those journal rows or their explicit-clear action.

**Required conditions**

The privacy WalletAttempts implementation has journal entries, but its production Pay/Registry callers omit the optional wallet account/chain scope even after connection.

**Impact**

Journal history and recovery controls are unavailable in the affected branches. The duplicate-attempt journal still blocks retries, so unresolved attempts can leave users stuck without the intended recovery action. A transaction hash may still be visible in the current transaction view. No theft, false success or loss of journal protection is established.

**Impact limit**

History and its explicit-clear recovery action are unavailable. Duplicate-attempt protection remains active, and the current transaction view may still display a hash. No false success or theft is established.

**Remediation**

Pass the live connected account and chain from every caller, remove the scope immediately on disconnect/account/chain changes, and preserve the separate PrivateHistory reveal and explicit-clear consent.

**Future acceptance criteria**

- Route-level tests for Pay and Registry must exercise the actual caller wiring: disconnected journal stays masked; connecting the matching account/chain makes only its rows eligible for a deliberate reveal; changing identity hides them again.
- An unknown attempt must continue blocking a duplicate request until the explicit clear action is confirmed; privacy controls must not silently clear journal state.

**Qualification**

Existing Pay and PolicyView route/guard tests already assert clear/retry behavior. They were read but not executed. A component test that manually supplies wallet does not establish that production callers pass it; this is not a claim that all route coverage is absent.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/components/WalletAttempts.tsx:10–40](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/WalletAttempts.tsx#L10-L40) at `137628961463` | `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563` | Optional wallet prop controls visibility and clear controls. |
| [apps/web/src/views/Pay.tsx:1059](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1059-L1059) at `137628961463` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | Invoice-load caller omits wallet. |
| [apps/web/src/views/Pay.tsx:1127](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1127-L1127) at `137628961463` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | Payment caller omits wallet. |
| [apps/web/src/features/registry/RegistryView.tsx:272](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/features/registry/RegistryView.tsx#L272-L272) at `137628961463` | `5ca89f54457128b887eb9107fc4eac66ce8c0530` | Registry caller omits wallet. |
| [apps/web/src/features/policy/PolicyPay.tsx:129](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/features/policy/PolicyPay.tsx#L129-L129) at `137628961463` | `2c29b545732754997b4ac0c3fb93096f125ee511` | Experimental policy caller also omits wallet. |
| [apps/web/src/components/WalletAttempts.test.tsx:11–52](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/WalletAttempts.test.tsx#L11-L52) at `137628961463` | `d7fda34e0967a86ecd591892076d9883903c19cd` | Component tests supply wallet manually and therefore do not cover the missing route integration. |
| [apps/web/src/views/Pay.test.tsx:647–663](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.test.tsx#L647-L663) at `137628961463` | `7ef3db702caa56538a7fd4e82e63eafb895debd5` | Existing route clear/retry expectations; source read, not run. |
| [apps/web/src/features/policy/PolicyView.guard.test.tsx:238–252, 300–330](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/features/policy/PolicyView.guard.test.tsx#L238-L252) at `137628961463` | `9ccdadb0fd50fed4112e5abc399c0598ba26f93d` | Existing guard and clear/retry expectations; source read, not run. |
| [apps/web/src/views/Pay.tsx:1059, 1127](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1059-L1059) at `137628961463` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | Both production Pay render paths omit the wallet prop. |
| [apps/web/src/components/WalletAttempts.tsx:8–34](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/components/WalletAttempts.tsx#L8-L34) at `773a94be1c83` | `70ba12b8ae8d07460266c07f4dbd25e6126bfb80` | Older component has no wallet-prop contract and directly renders available journal rows and clear controls, so the privacy regression is not present. |

Originating record: [payment_surfaces_wave2](lanes/payment_surfaces_wave2.json).


<a id="ps2-02"></a>

### PS2-02 — Bill print stylesheet hides receipt print content

**Severity/class:** Low; Product correctness; no security impact established.

**Disposition:** Confirmed CSS cascade and import-chain conflict; browser print not executed

**Finding**

AppShell eagerly imports Pay; Pay imports PrintBillButton; PrintableBill statically imports print.css. Its print-media body descendant rule hides every element with !important and restores visibility only for bill-sheet. The receipt-print visibility rule in app.css lacks !important. ReceiptPanel calls window.print directly for receipt-print content, so that content remains hidden under the globally loaded bill stylesheet, regardless of stylesheet ordering.

**Impact**

Receipt print output has no visible receipt content (blank output is the expected browser result). On-screen receipt data, JSON export and signatures are unaffected by this cascade finding. No browser or printer reproduction was performed.

**Remediation**

Use an explicit active print target or a shared print stylesheet that scopes visibility rules to the selected bill or receipt. Ensure only the chosen print target is restored.

**Future acceptance criteria**

- Validate the computed print-media visibility and generated output of both bill and receipt actions in the same application bundle.
- The selected bill/receipt must print; unrelated page content, raw JSON and action controls must remain excluded.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/AppShell.tsx:15](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/AppShell.tsx#L15-L15) at `e22c1748a3de` | `8e2006a8309403f336efda82c1cc6eb6699f04c4` | Eager import of Pay. |
| [apps/web/src/views/Pay.tsx:35](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Pay.tsx#L35-L35) at `e22c1748a3de` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | Static import of PrintBillButton. |
| [apps/web/src/components/PrintableBill.tsx:8](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/PrintableBill.tsx#L8-L8) at `e22c1748a3de` | `64ba221722b1c88adb74c6c68960e95e48855c98` | Global static import of print.css. |
| [apps/web/src/styles/print.css:4–21](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/styles/print.css#L4-L21) at `e22c1748a3de` | `5c803193b91431c4dd96f6421ae41b5e92740046` | Important global hidden rule and bill-only visibility exception. |
| [apps/web/src/styles/app.css:247–253](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/styles/app.css#L247-L253) at `e22c1748a3de` | `a1951f57c00346323b6306c3af46867dae6d6262` | Receipt visibility exception is non-important. |
| [apps/web/src/components/ReceiptPanel.tsx:301–318](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/ReceiptPanel.tsx#L301-L318) at `e22c1748a3de` | `b6cc91507f78283db57a7bb5f99b28f27711fffc` | Receipt uses receipt-print and a direct window.print action. |
| [apps/web/src/components/PrintableBill.test.tsx:1–111](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/PrintableBill.test.tsx#L1-L111) at `e22c1748a3de` | `4e80b81546f6d10464ef2dd25464036113d0e817` | Existing test body checks bill output/style text and print invocation, not the combined receipt CSS cascade. |

Originating record: [payment_surfaces_wave2](lanes/payment_surfaces_wave2.json).


<a id="cp-01"></a>

### CP-01 — Temporary secret buffers are not consistently cleared on exceptional exits

**Severity/class:** Low; Browser and shared-library findings.

**Disposition:** confirmed; existing defense-in-depth gap; all reviewed baselines

**Required conditions**

generateKeySet creates the spending scalar before creating the viewing scalar; a subsequent RNG or public-key operation can throw before ownership is returned. In the bearer-encrypted invoice path, the generated AES key is cleared only after successful encryption, and the decrypt path does not clear its temporary decoded key or plaintext byte array.

**Impact**

These temporary byte arrays remain eligible for garbage collection rather than being explicitly overwritten. This is a best-effort memory-hygiene gap. No remote read primitive, disclosure, signature bypass, or fund-loss path was established. JavaScript strings and runtime copies cannot be guaranteed to be erased.

**Remediation**

Use an exception-safe scope/try-finally for newly created secret buffers. Transfer ownership only on successful key-set construction. Retain and clear the temporary AES key and plaintext arrays after use, while documenting unavoidable string/runtime copies.

**Future acceptance criteria**

With a controlled failing dependency, already-created temporary buffers are cleared on each failure path; successful key generation retains the returned secrets. Assess through ordinary isolated unit assertions, without live targets or crafted attack files.

**Qualification**

The core key-generation part was already recorded as I-02. SecretScope and SecretBox provide working cleanup patterns, and their source tests were read. This finding does not imply SecretBox itself exposes its stored bytes.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/core-crypto/src/keys.ts:45–58](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/core-crypto/src/keys.ts#L45-L58) at `e22c1748a3de` | `086e80c73f79107c33dcc036f60577874cb7c279` |  |
| [packages/invoice-schema/src/envelope.ts:242–259](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L242-L259) at `e22c1748a3de` | `cc6b9dd6fc20fb93ecb22b00e8391338bfd6a0e4` |  |
| [packages/invoice-schema/src/envelope.ts:570–594](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/envelope.ts#L570-L594) at `e22c1748a3de` | `cc6b9dd6fc20fb93ecb22b00e8391338bfd6a0e4` |  |
| [docs/audits/05/crypto-core.md:24–31](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/audits/05/crypto-core.md#L24-L31) at `c977b5d6723f` | `10428c018451ed7ee8600b443c3899656694c45c` |  |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="cp-02"></a>

### CP-02 — QR image pixel bounds can be checked only after native allocation for unsupported headers

**Severity/class:** Low; Browser and shared-library findings.

**Disposition:** confirmed limitation; all reviewed baselines

**Required conditions**

The file picker accepts raster image MIME types beyond the PNG/GIF/JPEG/WebP headers inspected by imageHeaderDimensions. For an unrecognized header, decodeQrImage calls createImageBitmap before checking the universal pixel cap.

**Impact**

A user-selected image in a platform-supported format whose header is not inspected may consume native decoder resources before the 40-million-pixel limit rejects it. The input still has a 10 MiB compressed-file cap and decoded resources are closed. Actual browser memory behavior was not measured; this is a local availability limitation, not a demonstrated remote exploit.

**Remediation**

Restrict imports to formats with a reliable pre-decode dimension check, extend supported header inspection, or use an appropriately resource-bounded image decoding path. Keep the post-decode check as a second control.

**Future acceptance criteria**

Every accepted file format is rejected or dimension-checked before the native decoder allocates its full bitmap. Existing small stubbed decoder assertions can verify ordering; no oversized image need be generated or opened.

**Qualification**

The existing test explicitly documents post-decode fallback for HEIC/AVIF. No image was generated, opened, or used to reproduce resource exhaustion.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/qr-exchange/src/readers.ts:120–125](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/readers.ts#L120-L125) at `e22c1748a3de` | `caea9b8a3bbfeb9e626814e5db3882e22e568921` |  |
| [packages/qr-exchange/src/readers.ts:137–181](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/readers.ts#L137-L181) at `e22c1748a3de` | `caea9b8a3bbfeb9e626814e5db3882e22e568921` |  |
| [packages/qr-exchange/src/readers.ts:226–260](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/readers.ts#L226-L260) at `e22c1748a3de` | `caea9b8a3bbfeb9e626814e5db3882e22e568921` |  |
| [packages/qr-exchange/src/readers.test.ts:203–207](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/readers.test.ts#L203-L207) at `e22c1748a3de` | `58769a945594dc2b1c95d4e96f80832fed3551e7` |  |
| [apps/web/src/components/CameraImporter.tsx:310](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/CameraImporter.tsx#L310-L310) at `e22c1748a3de` | `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` |  |
| [apps/web/src/components/CameraImporter.tsx:348](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/CameraImporter.tsx#L348-L348) at `e22c1748a3de` | `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` |  |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="cp-h01"></a>

### CP-H01 — Rejected conflicting QR chunks refresh the idle deadline on older baselines

**Severity/class:** Low; Browser and shared-library findings.

**Disposition:** current_main: affected; release: affected; completion: fixed; quick_hide: affected; unique_code: affected; recovered_fixes: fixed; tor: affected

**Required conditions**

An incomplete bounded multipart QR session receives a conflicting chunk before its existing idle deadline.

**Impact**

Rejected input can prolong a bounded partial QR session beyond the intended idle deadline. This does not bypass final payload integrity or authentication and does not create unbounded storage.

**Impact limit**

Rejected input refreshes the deadline. Final payload integrity/authentication and storage bounds remain in force; no unbounded-storage or authentication bypass is established.

**Remediation**

Retain the latest ordering, where only accepted activity refreshes the deadline.

**Future acceptance criteria**

A rejected conflict preserves the previous deadline; the next operation after that deadline reports session expiry. Accepted duplicates retain their explicitly intended refresh behavior.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/qr-exchange/src/assembler.ts:63–86](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/qr-exchange/src/assembler.ts#L63-L86) at `c977b5d6723f` | `8e8d12e447265e682597edf2887e5a2f6afd55db` |  |
| [packages/qr-exchange/src/assembler.ts:63–88](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/assembler.ts#L63-L88) at `e22c1748a3de` | `144dd8ec67e8aaeffc5c3d90f6a06234d770abcd` |  |
| [packages/qr-exchange/src/assembler.test.ts:71–127](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/assembler.test.ts#L71-L127) at `e22c1748a3de` | `ee613b41e23d1d77ebe9caf3151ecef014bd22cd` |  |
| [packages/qr-exchange/src/assembler.ts:63–87](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/packages/qr-exchange/src/assembler.ts#L63-L87) at `773a94be1c83` | `8e8d12e447265e682597edf2887e5a2f6afd55db` | Assembler refreshes lastActivity before it rejects a conflicting chunk in an incomplete session. |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="pui-05"></a>

### PUI-05 — parseUnits runtime arguments are not validated in main/integration

**Severity/class:** Low; Robustness; no demonstrated external security reachability.

**Disposition:** current_main: conditional; release: conditional; completion: conditional; quick_hide: conditional; unique_code: conditional; recovered_fixes: fixed; tor: conditional

**Finding**

The old function calls text.trim(), BigInt(decimals), exponentiation and padEnd without runtime argument checks, despite documenting undefined for unexpected input. The standalone correction bounds decimal precision to 0..36 and validates type before arithmetic.

**Required conditions**

A direct runtime caller violates the TypeScript amount/decimal-precision contract.

**Impact**

Unexpected exceptions or excessive work are possible at the utility boundary. No network-controlled production input path to unbounded decimal precision was established; do not present this as a remotely exploitable denial of service.

**Impact limit**

The utility can throw or perform excessive work, but reviewed normal production callers use strings and configured precision. No network-controlled unbounded-precision path is established.

**Remediation**

Retain the narrow type/range guard in PR301/303.

**Future acceptance criteria**

Unexpected runtime type or precision is rejected predictably without coercion, rounding, excessive allocation or arithmetic exceptions. Valid configured amounts preserve exact bigint behavior.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/format.ts:16–24](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/format.ts#L16-L24) at `c977b5d6723f` | `18dad7e4235c922bb7f197312317cc86557a12c2` |  |
| [apps/web/src/lib/format.ts:16–25](https://github.com/djshellshoxxx/GhostPay/blob/a9e0715573f7247d7a16f9d1d030cf0232708fb2/apps/web/src/lib/format.ts#L16-L25) at `a9e0715573f7` | `9ba8ea7b418eab5cf18e900923572cf3e255aedd` |  |
| [apps/web/src/lib/format.ts:16–24](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/format.ts#L16-L24) at `773a94be1c83` | `18dad7e4235c922bb7f197312317cc86557a12c2` | parseUnits uses trim, BigInt precision, exponentiation and padding without runtime argument validation. |
| [apps/web/src/lib/format.ts:16–25](https://github.com/djshellshoxxx/GhostPay/blob/6c65cc3fd31c9ae361f932bee4a3449d89ed776c/apps/web/src/lib/format.ts#L16-L25) at `6c65cc3fd31c` | `9ba8ea7b418eab5cf18e900923572cf3e255aedd` | parseUnits checks string input and integer decimals in the closed range 0..36 before arithmetic. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="pui-06"></a>

### PUI-06 — QR classification helpers rely on compile-time union types in older versions

**Severity/class:** Informational; Defensive runtime hardening; no demonstrated external exposure.

**Disposition:** current_main: conditional; release: partial; completion: fixed; quick_hide: partial; unique_code: partial; recovered_fixes: fixed; tor: conditional

**Finding**

Main reads PAYLOAD_KIND[type] directly and constructs class names without validation. Intermediate own-property validation still permits property-key coercion. Latest checks string type and an own key before classification.

**Required conditions**

A runtime caller supplies an out-of-domain kind/payload argument or a non-string property key.

**Impact**

Unexpected classification, missing handling rules or rendering failures are possible for invalid internal input. No demonstrated route lets imported QR data select a privileged secret-handling kind; do not claim key disclosure.

**Impact limit**

Normal reviewed callers use typed constants; no imported-QR route to privileged secret handling or key disclosure is established.

**Remediation**

Preserve latest runtime string and own-key checks and keep secret/bearer handling stronger than generic caution flags.

**Future acceptance criteria**

Out-of-domain and non-string kind/payload arguments fail before coercion or property access. Legitimate secret/bearer payloads retain their handling regardless of caution flags.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/qrKinds.ts:178–181, 232–236](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/qrKinds.ts#L178-L181) at `c977b5d6723f` | `eb60ac5a6a8e774333d12a53df4cb2c26ee5e7b9` |  |
| [apps/web/src/lib/qrKinds.ts:178–182, 233–240](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/qrKinds.ts#L178-L182) at `e22c1748a3de` | `a85e1011cdface74c87683146ff7428654b7830d` |  |
| [apps/web/src/lib/qrKinds.ts:178–181, 232–236](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/qrKinds.ts#L178-L181) at `773a94be1c83` | `eb60ac5a6a8e774333d12a53df4cb2c26ee5e7b9` | QR classification lacks own-key and runtime string checks. |
| [apps/web/src/lib/qrKinds.ts:178–182, 233–240](https://github.com/djshellshoxxx/GhostPay/blob/417f7c71daf8645e1432f2ec8f070110879b80bd/apps/web/src/lib/qrKinds.ts#L178-L182) at `417f7c71daf8` | `68de6518783cc57bd7f3a66d0588d530e27d21b6` | Intermediate guards require own keys but still allow JavaScript property-key coercion of non-string arguments. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="pui-07"></a>

### PUI-07 — Older multipart QR encoding silently normalizes ill-formed Unicode input

**Severity/class:** Informational; Encoding integrity; production reachability not established.

**Disposition:** current_main: conditional; release: fixed; completion: fixed; quick_hide: fixed; unique_code: fixed; recovered_fixes: fixed; tor: conditional

**Finding**

Main delegates straight to TextEncoder, which replaces such code units. Latest rejects them before encoding.

**Required conditions**

A direct multipart caller supplies text containing an unpaired UTF-16 surrogate.

**Impact**

The multipart payload can differ from the caller-provided text; no valid signed invoice/key corruption flow was established. This is a library integrity edge case rather than a demonstrated remote vulnerability.

**Impact limit**

Encoded text may differ from caller input. Reviewed invoice/key producers emit structured encoded text; no valid signed-invoice/key corruption flow is established.

**Remediation**

Retain the latest pre-encoding rejection and consistent byte-preservation behavior across single and multipart QR paths.

**Future acceptance criteria**

Ill-formed Unicode is rejected before generating parts, while valid Unicode round-trips byte-for-byte.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/qrMultipart.ts:19–30](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/qrMultipart.ts#L19-L30) at `c977b5d6723f` | `48032d32ea18fa660ac72c342263d741ceb7cc0d` |  |
| [apps/web/src/lib/qrMultipart.ts:19–32](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/qrMultipart.ts#L19-L32) at `e22c1748a3de` | `d8c9a8cc2d6eb90f1a6a45fe463a6f8e7ab1abb3` |  |
| [apps/web/src/lib/qrMultipart.ts:19–30](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/apps/web/src/lib/qrMultipart.ts#L19-L30) at `773a94be1c83` | `48032d32ea18fa660ac72c342263d741ceb7cc0d` | Multipart encoding passes text directly to TextEncoder, which normalizes unpaired UTF-16 surrogates. |

Originating record: [payment_ui_review](lanes/payment_ui_review.json).


<a id="cp-h02"></a>

### CP-H02 — Canonical arrays were not restricted to dense own data properties on main

**Severity/class:** Informational; Browser and shared-library findings.

**Disposition:** current_main: conditional; release: fixed; completion: fixed; quick_hide: fixed; unique_code: conditional; recovered_fixes: fixed; tor: conditional

**Required conditions**

A direct JavaScript caller supplies a sparse, decorated, accessor-bearing, or otherwise malformed array to canonicalize.

**Impact**

Malformed JavaScript API inputs can have unexpected or ambiguous canonical representations. A reachable signature bypass through the strict JSON invoice parser was not established; parsed JSON supplies ordinary dense arrays.

**Impact limit**

Unexpected canonical representations are possible at the API boundary. Strict parsed JSON supplies ordinary dense arrays; no reachable signature bypass is established. Descriptor snapshotting does not imply arbitrary proxy objects can never run any trap.

**Remediation**

Retain the descriptor-based latest implementation and its regression tests.

**Future acceptance criteria**

Malformed sparse/decorated/accessor arrays fail closed; supported dense arrays retain identical canonical bytes and array membership/value traps are not invoked.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/invoice-schema/src/json.ts:191–205](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/json.ts#L191-L205) at `c977b5d6723f` | `b7a34bb5176ec72daf0026a59991863421bdb341` |  |
| [packages/invoice-schema/src/json.ts:192–218](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/json.ts#L192-L218) at `e22c1748a3de` | `8ed01592d487c356a72d51e240e5cc63fb470a3a` |  |
| [packages/invoice-schema/src/json.test.ts:128–228](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/json.test.ts#L128-L228) at `e22c1748a3de` | `2ffdfe70a8814762b14721ac640fc82cab0b9e54` |  |
| [packages/invoice-schema/src/json.ts:191–205](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/packages/invoice-schema/src/json.ts#L191-L205) at `773a94be1c83` | `b7a34bb5176ec72daf0026a59991863421bdb341` | Canonicalizer calls the input array map method without requiring dense own data properties. |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="cp-h03"></a>

### CP-H03 — Base64url decoder lacks an explicit runtime string guard on main

**Severity/class:** Informational; Browser and shared-library findings.

**Disposition:** current_main: conditional; release: fixed; completion: fixed; quick_hide: fixed; unique_code: conditional; recovered_fixes: fixed; tor: conditional

**Required conditions**

A direct runtime caller supplies a non-string decoder argument.

**Impact**

Malformed direct JavaScript caller inputs can be accepted as empty data or produce inconsistent errors. The invoice fragment entry point already checks its string input, so no remote invoice-verification bypass was established.

**Impact limit**

Behavior/errors can be inconsistent, but the invoice-fragment entry point already checks string input. No external verification bypass is established.

**Remediation**

Retain the latest explicit string guard and fixed decoder error.

**Future acceptance criteria**

All non-string direct API inputs receive the same typed decoder failure before allocation or iteration.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/invoice-schema/src/base64url.ts:52–60](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/base64url.ts#L52-L60) at `c977b5d6723f` | `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb` |  |
| [packages/invoice-schema/src/base64url.ts:52–61](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/base64url.ts#L52-L61) at `e22c1748a3de` | `5466ee0b99925dedd23e753636ae7ab3f6f48234` |  |
| [packages/invoice-schema/src/base64url.test.ts:27–40](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/base64url.test.ts#L27-L40) at `e22c1748a3de` | `8d959c2b144182d0d0f576214dc7b761b7166c47` |  |
| [packages/invoice-schema/src/base64url.ts:52–65](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/packages/invoice-schema/src/base64url.ts#L52-L65) at `773a94be1c83` | `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb` | Decoder reads length and charCodeAt without an explicit runtime string guard. |
| [packages/invoice-schema/src/base64url.ts:52–66](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/base64url.ts#L52-L66) at `e22c1748a3de` | `5466ee0b99925dedd23e753636ae7ab3f6f48234` | Decoder rejects non-string runtime input before reading its length or allocating output. |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="cp-h04"></a>

### CP-H04 — Merchant profile expiry accepts an invalid caller clock on older baselines

**Severity/class:** Low; Browser and shared-library findings.

**Disposition:** current_main: conditional; release: fixed; completion: fixed; quick_hide: fixed; unique_code: conditional; recovered_fixes: fixed; tor: conditional

**Required conditions**

The caller/environment supplies a non-finite or negative nowSec; some invalid clock values allow a correctly signed profile to pass without meaningful expiry evaluation.

**Impact**

A caller supplying an invalid clock can receive a valid result for an otherwise correctly signed profile whose expiry cannot be meaningfully evaluated. Control of the clock is a caller/environment prerequisite; no external clock-control path was established.

**Impact limit**

Clock control is a caller/environment prerequisite; no external clock-control path is established. Fixed status covers the explicit non-finite/negative-clock check.

**Remediation**

Retain the latest clock guard.

**Future acceptance criteria**

Invalid clocks fail with a format result; correct clocks preserve the exclusive expiry boundary.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/invoice-schema/src/merchantProfile.ts:156–182](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/merchantProfile.ts#L156-L182) at `c977b5d6723f` | `a75124bb35d2c319e6936097ef6b4048ac59ec76` |  |
| [packages/invoice-schema/src/merchantProfile.ts:156–158](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/merchantProfile.ts#L156-L158) at `e22c1748a3de` | `a4269dec888518799aa4b3e8cc82d2ff9cc21d77` |  |
| [packages/invoice-schema/src/merchantProfile.test.ts:48–54](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/merchantProfile.test.ts#L48-L54) at `e22c1748a3de` | `a1299d9ceedefeefb5784d287d556008531af02f` |  |
| [packages/invoice-schema/src/merchantProfile.ts:156–182](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/packages/invoice-schema/src/merchantProfile.ts#L156-L182) at `773a94be1c83` | `a75124bb35d2c319e6936097ef6b4048ac59ec76` | Verifier evaluates signed-profile expiry using the caller clock without first rejecting non-finite or negative values. |
| [packages/invoice-schema/src/merchantProfile.ts:156–184](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/merchantProfile.ts#L156-L184) at `e22c1748a3de` | `a4269dec888518799aa4b3e8cc82d2ff9cc21d77` | Verifier rejects non-finite and negative caller clocks before parsing/signature work. |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


## Known conditional contract risks


<a id="cw2-k01"></a>

### CW2-K01 — Nonzero factory fees retain an immutable fee-token availability dependency

**Severity/class:** Medium; retained-known.

**Disposition:** Known conditional design/configuration risk

**Finding**

Fee collection occurs before account creation. Fee-token balance or allowance views that revert, or transfer behavior that violates the exact balance-delta checks, can prevent deployment to already-funded counterfactual policy addresses. The latest deployment script adds an explicit acknowledgement of this residual risk; it does not change the immutable factory. Ordinary clean transfer refusal can be waived under the factory conditions, so it would be inaccurate to say every blacklist or transfer refusal freezes deployment. Deployment is permissionless: another eligible payer can materialize the same account. A payer-specific balance or allowance failure alone does not establish an account-wide lock; the serious availability case requires incompatibility that prevents every usable deployment route.

**Required conditions**

FLAT_FEE is nonzero, an undeployed policy address already holds funds, and the chosen fee token becomes incompatible with the required views or deltas. This concerns supporting policy/direct integrations. The reviewed experimental web deployment helper rejects nonzero factory fees; this path is not a shipped lean-Pages feature. Distinguish a failure affecting one payer from unavailability across all eligible payers.

**Remediation**

Prefer a zero-fee factory where fee-token independence is required. Any future fee-bearing design should preserve policy materialization when the fee token is unavailable, while retaining policy authorization. Existing immutable deployments require an explicit migration or funding restriction strategy.

**Future acceptance criteria**

Every offered funding path has a documented means to materialize and withdraw the resulting policy account under the stated token assumptions; an acknowledgement alone must not be represented as a technical fix.

**Prior tracking:** N1, R-11, SEC-E2-01.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/PolicyAccountFactory.sol:101–117, 128–163](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccountFactory.sol#L101-L117) at `e22c1748a3de` | `d456eec25c744e1e992ca786b2f21eefdbdf81a7` |  |
| [packages/contracts/script/DeployPolicy.s.sol:23–29, 72–77](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/script/DeployPolicy.s.sol#L23-L29) at `e22c1748a3de` | `c20b4f85726f3634d91be71372cdcafda778ce4b` |  |
| [apps/web/src/features/policy/withdraw.ts:147–151](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/withdraw.ts#L147-L151) at `e22c1748a3de` | `292f043fa2966470785cb1a5119af0faac655fc3` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-k02"></a>

### CW2-K02 — Reusable public policy hashes expose a payment correlation identifier

**Severity/class:** Medium; retained-known.

**Disposition:** Known conditional design/configuration risk

**Finding**

The policy router exposes a public policy hash, and the factory computes that hash from destination, delay and limits root. Reusing those policy values retains the same public identifier even when one-time owner addresses differ. This supports correlation of payments sharing a policy; it does not alone prove a real-world identity or ownership. Equal hashes establish a shared-policy correlation identifier, not common ownership, receiver identity or deanonymization by themselves.

**Required conditions**

A receiver reuses the same policy values across scheme-2 payments. This is supporting policy functionality, not this specific field in the scheme-1 core payment path.

**Remediation**

Ensure privacy claims describe policy-level linkability. If policy-payment unlinkability is a requirement, review a protocol commitment design that does not publish a stable reused identifier.

**Future acceptance criteria**

Privacy documentation must match the identifiers actually emitted, and any revised commitment scheme must preserve payment-to-policy binding without an unintended stable public identifier.

**Prior tracking:** AUD24-01, N-01 regression.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/GhostPayPolicyRouter.sol:17–19, 93–104](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayPolicyRouter.sol#L17-L19) at `e22c1748a3de` | `56f5ef6ef90c6441812f3695da55916ecce352c4` |  |
| [packages/contracts/src/PolicyAccountFactory.sol:180–190](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccountFactory.sol#L180-L190) at `e22c1748a3de` | `d456eec25c744e1e992ca786b2f21eefdbdf81a7` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-k03"></a>

### CW2-K03 — Policy asset restrictions can leave funded assets without an eligible withdrawal

**Severity/class:** Medium; retained-known.

**Disposition:** Known conditional design/configuration risk

**Finding**

The policy router may send a native buffer into a policy account, while a nonzero limits root requires a matching asset leaf to authorize withdrawal. The payment builder receives the policy hash, not the policy contents needed to establish native-asset eligibility. A policy without an eligible native leaf can therefore retain an unusable native buffer. More generally, missing asset leaves and tokens incompatible with exact withdrawal deltas can strand direct deposits under the immutable policy. The native buffer is held by the policy account; it is not transaction gas delivered to the owner EOA. An immutable missing eligible leaf and temporarily incompatible token behavior have different persistence: the latter establishes inability to withdraw under that behavior, not unconditional permanent loss. A native buffer held by the account is not gas already held by the owner EOA.

**Required conditions**

A restricted policy lacks the necessary asset eligibility, or funded token behavior violates withdrawal requirements. The native-buffer issue is conditional on selecting that payment option for such a policy.

**Remediation**

Require authenticated policy eligibility before offering native buffers or assets, explain the buffer purpose accurately, and reject unsupported asset funding paths in clients. Evaluate any future owner-authorized recovery design separately against the existing restrictions.

**Future acceptance criteria**

Every asset and buffer option offered by an integration is withdrawable under the authenticated policy and supported token behavior; recovery claims must account for immutable policy restrictions.

**Prior tracking:** CONTRACTS-CORE-01, Policy audit P-02.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/GhostPayPolicyRouter.sol:160–177](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayPolicyRouter.sol#L160-L177) at `e22c1748a3de` | `56f5ef6ef90c6441812f3695da55916ecce352c4` |  |
| [packages/contracts/src/PolicyAccount.sol:26–43, 170–185, 220–239](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccount.sol#L26-L43) at `e22c1748a3de` | `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4` |  |
| [packages/policy-scheme/src/router.ts:40–41, 128–137](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/policy-scheme/src/router.ts#L40-L41) at `e22c1748a3de` | `35f20d3f07e02f42fac244552f4b50bce292402f` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-k04"></a>

### CW2-K04 — Fee waiver assumptions do not distinguish sender-controlled transfer vetoes

**Severity/class:** Low; retained-known.

**Disposition:** Known conditional design/configuration risk

**Finding**

The factory allows fee-free deployment after a clean failed transfer when the prior fee balance and allowance are sufficient and observable state remains unchanged. A fee token with a payer-controlled sender hook can make that failure indistinguishable from the issuer-side refusal the waiver is intended to tolerate. The resulting risk is missed deployment-fee revenue, not policy ownership bypass or withdrawal of another owner's funds.

**Required conditions**

An integration selects a nonzero factory fee and a fee token with suitable sender-controlled transfer behavior. The reviewed web helper only supports zero-fee factories.

**Remediation**

Explicitly qualify fee-token behavior, prefer zero fees where that qualification cannot be maintained, or redesign fee collection and liveness together.

**Future acceptance criteria**

Fee-token assumptions must address who can veto a transfer; accounting and availability expectations must remain consistent under all supported token behaviors.

**Prior tracking:** AUD24-02.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/PolicyAccountFactory.sol:128–163](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccountFactory.sol#L128-L163) at `e22c1748a3de` | `d456eec25c744e1e992ca786b2f21eefdbdf81a7` |  |
| [apps/web/src/features/policy/withdraw.ts:147–151](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/withdraw.ts#L147-L151) at `e22c1748a3de` | `292f043fa2966470785cb1a5119af0faac655fc3` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-k05"></a>

### CW2-K05 — Immutable fee-recipient acceptance remains a payment availability dependency

**Severity/class:** Medium; retained-known.

**Disposition:** Known conditional design/configuration risk

**Finding**

Core and policy router transfers atomically deliver a nonzero fee to an immutable recipient. If that recipient cannot receive the relevant native or token payment, the transaction reverts. Token restrictions on the recipient or a native-rejecting recipient contract can therefore disable affected nonzero-fee payment paths. Atomic rollback prevents this from retaining the attempted payer funds in a partially completed payment.

**Required conditions**

The computed fee is nonzero and the configured fee recipient becomes unable to receive the chosen asset. There is no mutable recipient repair path in these contracts.

**Remediation**

Qualify the recipient and assets at deployment, monitor the supported payment assumptions, and maintain clear client handling and deployment migration procedures. Any future resilience mechanism must preserve transparent fee routing.

**Future acceptance criteria**

Unavailable recipient/asset combinations are detected and surfaced before users rely on a successful payment; migration expectations reflect contract immutability.

**Prior tracking:** Router audit R-01.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/GhostPayRouter.sol:54–66, 121–128, 179–197](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol#L54-L66) at `e22c1748a3de` | `bc6369fffe44ebcad5548ae731860161444e7998` |  |
| [packages/contracts/src/GhostPayPolicyRouter.sol:109–139, 150–156, 208–229](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayPolicyRouter.sol#L109-L139) at `e22c1748a3de` | `56f5ef6ef90c6441812f3695da55916ecce352c4` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-k06"></a>

### CW2-K06 — Sponsored sweeps retain relayer execution-cost and owner-state risks

**Severity/class:** Low; retained-known.

**Disposition:** Known conditional design/configuration risk

**Finding**

Sweep execution calls token code and depends on owner state at execution time. A sponsor can incur transaction costs when token behavior, owner balance or allowance differs from the state it previously checked. The sweep signature binds the fee recipient and withdrawal destination, and unused token allowance alone does not authorize a new sweep. This is a protocol sponsorship assumption; this worker did not establish that a current relayer service lacks the relevant controls. No deficient production relayer-service control was established; that service implementation is outside this audit scope.

**Required conditions**

A service sponsors transactions based on permissionless owner requests, and its supported token or execution policy permits costly failures or stale owner state.

**Remediation**

Apply supported-token qualification, fresh authorization/state checks, bounded gas expenditure and an explicit failed-transaction budget in the sponsoring service.

**Future acceptance criteria**

Sponsor economics must account for failed execution, and any production service claim must be checked in that service rather than inferred from the contract alone.

**Prior tracking:** Sweep audit S-01, Sweep audit S-05.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/GhostPaySweepRelayer.sol:46–59, 118–143](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPaySweepRelayer.sol#L46-L59) at `e22c1748a3de` | `3095160e30f5bcc109e7786ec410ab81741dadd4` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


## Optional or inactive component findings


<a id="cp-o01"></a>

### CP-O01 — SDK merchant response size limit follows full body materialization

**Severity/class:** Low; Optional or inactive component findings.

**Disposition:** confirmed implementation limitation; outside active Pages runtime

**Finding**

merchant.ts awaits res.text() before enforcing MAX_RESPONSE_CHARS, and has only an optional caller-provided abort signal. A configured service or faulty endpoint can consume response-body memory/time before rejection. No SDK import was found in apps/web/src or apps/web/public at completion. No service was contacted.

**Remediation**

Before enabling this SDK transport, use a bounded streaming read and an explicit timeout/abort policy. An injected transport should expose equivalent resource limits.

**Future acceptance criteria**

The client aborts reading at its configured byte budget and deadline without materializing an unbounded body.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/sdk/src/merchant.ts:163–195](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/sdk/src/merchant.ts#L163-L195) at `e22c1748a3de` | `17e7eb97c6820fd176f180f57a849e2460a8d664` |  |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="cp-o02"></a>

### CP-O02 — SDK invoice-status responses are not bound to the requested nonce

**Severity/class:** Informational; Optional or inactive component findings.

**Disposition:** confirmed API consistency gap; outside active Pages runtime

**Finding**

getInvoiceStatus and registerInvoice parse the returned nonce shape but do not compare it to the requested invoice nonce. A faulty or misrouted API response can be returned for the wrong invoice. A malicious API already controls the reported payment status; independent payment authenticity is not established by this SDK transport.

**Remediation**

Require returned nonce equality for status/register responses and make callers retain their independently selected invoice identity.

**Future acceptance criteria**

A well-formed response for a different nonce is rejected as a response mismatch.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/sdk/src/merchant.ts:208–216](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/sdk/src/merchant.ts#L208-L216) at `e22c1748a3de` | `17e7eb97c6820fd176f180f57a849e2460a8d664` |  |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).


<a id="ps2-03"></a>

### PS2-03 — Merchant export duplicate invoice detection depends on sort adjacency

**Severity/class:** Low; Accounting data integrity in ancillary package.

**Disposition:** Confirmed source-level defect; no web consumer found

**Finding**

resolveAll sorts invoices primarily by createdAt and only compares adjacent ids. Duplicate ids at different timestamps can be separated by another invoice after sorting and escape the advertised duplicate-invoice rejection. All export formats and the tax summary consume resolveAll.

**Impact**

Callers can receive repeated invoice identifiers and duplicated totals in exports or summaries. Current repository consumers are in the paused CLI; no apps/web import was found. This is not an established current web payment vulnerability.

**Remediation**

Check invoice-id uniqueness with a set or map independently of the output sort, then keep the deterministic date/id ordering.

**Future acceptance criteria**

- Duplicate identifiers must be rejected independent of input order, differing creation dates and intervening records.
- Every exporter and taxSummary must enforce the same uniqueness invariant.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/merchant-ledger/src/export.ts:118–123](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/export.ts#L118-L123) at `e22c1748a3de` | `00217cc059a213a9b6dc34f8aca29aed81a109ca` | Date-first ordering with adjacent-only duplicate check. |
| [packages/merchant-ledger/src/export.ts:128–147](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/export.ts#L128-L147) at `e22c1748a3de` | `00217cc059a213a9b6dc34f8aca29aed81a109ca` | CSV uses the affected resolver. |
| [packages/merchant-ledger/src/export.ts:240–256](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/export.ts#L240-L256) at `e22c1748a3de` | `00217cc059a213a9b6dc34f8aca29aed81a109ca` | Tax totals use the same affected resolver. |
| [packages/merchant-ledger/src/ledger.test.ts:283–289](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/ledger.test.ts#L283-L289) at `e22c1748a3de` | `ee0270fc6fbd7402262c89b33f4213a03bd294e3` | Existing duplicate test covers adjacent equal-date duplicates. |
| [packages/cli/src/commands/export.ts:1–11](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/cli/src/commands/export.ts#L1-L11) at `e22c1748a3de` | `474d8ecc1a03cd1f8db87947ad1f8012c266177b` | Only discovered production importer belongs to the paused CLI. |

Originating record: [payment_surfaces_wave2](lanes/payment_surfaces_wave2.json).


<a id="ps2-04"></a>

### PS2-04 — Experimental PolicyPay input edits do not invalidate an in-flight review guard

**Severity/class:** Low; Conditional review/consent consistency.

**Disposition:** Source-level observation; production activation blocked

**Finding**

PolicyPay captures a prepared transaction and a guard bound to session and deployment. After send begins and awaits RPC/other work, the meta-address, token and amount fields remain editable. Their handlers clear rendered reviewed state but do not invalidate the captured guard or prepared object used by the existing send closure. Reviewing again also does not advance a guard revision. The send library checks captured transaction bytes against its captured review, not against the new visible inputs.

**Impact**

If the policy feature is activated with a deployment, an operation already in progress can continue with an older review after the user edits the displayed terms. Wallet confirmation still exists; this is not a proven bypass of wallet approval. No active production exposure is claimed because PINNED_POLICY_DEPLOYMENTS is empty.

**Remediation**

Before activation, bind each review/send operation to a live UI revision and invalidate it on input change, replacement review and unmount; alternatively prevent edits throughout the pre-handoff operation. Check the revision immediately before wallet handoff and preserve truthful post-handoff outcomes.

**Future acceptance criteria**

- An edit to recipient/meta-address, token or amount while awaiting authorization/RPC/allowance work must prevent any subsequent wallet request for the superseded review.
- A newer review must not revive an older in-flight operation, and a response from a request already handed to the wallet must still be journaled truthfully.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/features/policy/PolicyPay.tsx:43–75](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/PolicyPay.tsx#L43-L75) at `e22c1748a3de` | `2c29b545732754997b4ac0c3fb93096f125ee511` | Review guard captures only session/deployment and send retains captured review across awaits. |
| [apps/web/src/features/policy/PolicyPay.tsx:95–117](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/PolicyPay.tsx#L95-L117) at `e22c1748a3de` | `2c29b545732754997b4ac0c3fb93096f125ee511` | Payment inputs and Review remain enabled during busy; input handlers only clear React state. |
| [apps/web/src/features/policy/send.ts:89–141](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/send.ts#L89-L141) at `e22c1748a3de` | `04ac08be009c2942b394f35975171325738ce12a` | Downstream checks use the captured guard and review. |
| [apps/web/src/features/policy/chain.ts:30–34](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/chain.ts#L30-L34) at `e22c1748a3de` | `758e19ef20d5f1ad2d3388979fb2d59e9db6578c` | Empty production deployment allowlist limits current reachability. |
| [apps/web/src/features/policy/flag.ts:1–13](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/flag.ts#L1-L13) at `e22c1748a3de` | `0102c120e4a94724919e6e5ea7e097f04d60e802` | Experimental feature remains off by default. |

Originating record: [payment_surfaces_wave2](lanes/payment_surfaces_wave2.json).


<a id="custody-s1"></a>

### CUSTODY-S1 — Older supplemental backup cleanup can erase newer unrelated clipboard content

**Severity/class:** Low; full-profile supplemental helper; fixed in quick-hide/privacy snapshot, still present in main/release/completion/clipboard-only heads.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Required conditions**

After backup copy, another application/page replaces clipboard before Hide/Lock/unmount or a delayed retry.

**Impact**

App-local generation alone does not establish current clipboard ownership; unconditional empty write removes newer unrelated content.

**Remediation**

Backport conditional clearing where the supplemental helper remains supported. Preserve unrelated content on changed/denied reads.

**Future acceptance criteria**

Safe mocked-clipboard tests verify changed content and denied reads never cause clearing writes. External OS read/write races remain best effort.

**Qualification**

SecretBackup serves the preserved Bitcoin/Solana/TRON test-wallet helpers outside core lean mode. This shared-helper finding is not a core release blocker by itself.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/components/SecretBackup.tsx:24–65](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/SecretBackup.tsx#L24-L65) at `e22c1748a3de` | `c86f77de050b838204e3f4222cd796ca6e54337a` | Retry and cleanup use unconditional writeText at59. |
| [apps/web/src/components/SecretBackup.tsx:68–72](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/SecretBackup.tsx#L68-L72) at `e22c1748a3de` | `c86f77de050b838204e3f4222cd796ca6e54337a` | Global lock retries after originating view is gone. |
| [apps/web/src/lib/clipboardPrivacy.ts:48–77](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/lib/clipboardPrivacy.ts#L48-L77) at `137628961463` | `cfb9e13bb3548d48f65b2578a76d2888553a0b35` | Current helper stores digest and requires matching reads plus ownership; denied reads do not clear. |

Originating record: [custody_privacy_review](lanes/custody_privacy_review.json).


## Hosting and deployment operations


<a id="host-latest-01"></a>

### HOST-LATEST-01 — Failed rollback cleanup can delete a retained recovery backup

**Severity/class:** Medium; reliability / artifact recovery.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

rollback() deliberately retains a non-null backup after a failed restore, but commitFilesAtomic() then unconditionally removes every remaining non-null backup in its catch cleanup. packageSite() commits the archive and sidecar through this helper. An error can therefore leave new archive bytes next to an old sidecar while discarding the prior archive recovery copy.

**Required conditions**

Replacing multiple existing output files fails after at least one target has been replaced; restoring that target from its backup also fails, while later removal of the backup succeeds. No attacker prerequisite is needed; a second filesystem error or destination interference suffices.

**Impact**

The helper-created recovery copy can be lost and output files can remain inconsistent after the stated replacement, restore and cleanup sequence. This does not establish loss of every operator backup, arbitrary deletion, a remote compromise or an observed outage. The new wrapper uses a fresh output destination, which limits exposure to this prior-file scenario.

**Remediation**

Track restoration success per target. Preserve any backup whose restore failed, report its exact recovery location together with the original and rollback errors, and remove only temporary files and backups proven redundant after a completed commit or successful restore. Narrow the all-or-nothing/crash-safe documentation to the guarantees actually implemented.

**Future acceptance criteria**

- A unit-level fake filesystem can report one commit rename failure and a separate restore rename failure; the original bytes remain available at a reported backup path.
- A successful rollback restores old archive and sidecar bytes and removes only redundant temporary paths.
- The ordinary success path still publishes matching archive and sidecar bytes.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [tools/portable-hosting-kit/src/core/atomic.mjs:122–135](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/core/atomic.mjs#L122-L135) at `773a94be1c83` | `d6099cdbaffc8767c13de1532d399b0f1d4eec46` |  |
| [tools/portable-hosting-kit/src/core/atomic.mjs:144–169](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/core/atomic.mjs#L144-L169) at `773a94be1c83` | `d6099cdbaffc8767c13de1532d399b0f1d4eec46` |  |
| [tools/portable-hosting-kit/src/core/package.mjs:178–180](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/core/package.mjs#L178-L180) at `773a94be1c83` | `cd7207c96ed47f9c3b1effae9997eedbecab2d6b` |  |
| [tools/portable-hosting-kit/test/core/atomic.test.mjs:19–55](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/test/core/atomic.test.mjs#L19-L55) at `773a94be1c83` | `8afd9fdac31e3c71f72894b2f833ea92a1abead9` |  |
| [tools/portable-hosting-kit/test/core/helpers.mjs:100–110](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/test/core/helpers.mjs#L100-L110) at `773a94be1c83` | `c07bcf322c360fc7f1b3cc56568384bd5bd2c37b` |  |

Originating record: [hosting_latest_review](lanes/hosting_latest_review.json).


<a id="host-latest-02"></a>

### HOST-LATEST-02 — Generated operator guide incorrectly groups a subpath with separate browser origins

**Severity/class:** Low; operator documentation / origin isolation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

operatorGuide() lists clearnet, onion, I2P, and subpath together as mirror origins with separate storage, sessions, and wallet permissions. The kit README and CLI correctly state that subpaths share an origin and require explicit acknowledgement.

**Required conditions**

An operator reads OPERATOR.md packaged by the kit and interprets a subpath mirror as providing independent browser storage or wallet permissions.

**Remediation**

State that separation is by scheme/host/port. Explicitly say different URL paths on one origin share origin-scoped storage and permissions, preserve the dedicated-origin recommendation, and align generated OPERATOR.md with README and the CLI guard.

**Future acceptance criteria**

- Generated operator documentation explicitly states that subpaths on one origin share browser storage and permissions.
- Documentation and existing shared-origin refusal/acknowledgement behavior remain consistent.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [tools/portable-hosting-kit/src/package-docs.mjs:46–55](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/package-docs.mjs#L46-L55) at `773a94be1c83` | `edcbcdb2aa709a8cc3b12ddcde0925dc8e6320a8` |  |
| [tools/portable-hosting-kit/README.md:104–107](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/README.md#L104-L107) at `773a94be1c83` | `af59c25cb5507830967defad216ddf9c5c2b223a` |  |
| [tools/portable-hosting-kit/src/cli.mjs:769–770](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/cli.mjs#L769-L770) at `773a94be1c83` | `5b4445881537af302d3d94e6cd0c4e41aa7adaa1` |  |

Originating record: [hosting_latest_review](lanes/hosting_latest_review.json).


<a id="host-legacy-01"></a>

### HOST-LEGACY-01 — Legacy selfhost validates env-file inputs while Compose can use shell overrides

**Severity/class:** Low; legacy-operational-validation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

selfhost envval reads only the selected file and validates/installs that web-dist directory. Compose then inherits ambient variables, while its configuration interpolates web-dist, port, image and UID values. Official Docker documentation gives shell variables precedence over --env-file. The validated plan and effective model can differ.

**Required conditions**

A differing interpolation variable exists in the invoking operator environment. This is a local configuration condition, not a third-party attacker premise.

**Impact**

The checked/installed path or settings can differ from those used by Compose. config -q checks model validity, not equality with the helper plan. No service was started; new static Tor preparation is separate.

**Remediation**

Resolve and validate the effective model once, or supply a controlled environment of validated inputs. Keep displayed, installed and served paths equal.

**Future acceptance criteria**

Conflicting ambient project variables produce the same validated model or explicit refusal.

**Qualification**

Supersedes HOST-CAND-01 after root checked Docker's official interpolation rules. This applies to the legacy selfhost path, not the new static Tor wrapper.

**External rule:** https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [deploy/selfhost.sh:110–118, 146–161, 280–285, 394–398](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/deploy/selfhost.sh#L110-L118) at `773a94be1c83` | `e353f5537e8f5571e0c3e085c6e25d1e1af59cb1` |  |
| [deploy/docker-compose.yml:21–22, 53–64, 82–83](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/deploy/docker-compose.yml#L21-L22) at `773a94be1c83` | `2020e2031560bb3e7eaf16475e00be5eac9970f7` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="ct3-01"></a>

### CT3-01 — Development-key refusal depends on raw key spelling

**Severity/class:** Low; deployment-tooling / local configuration.

**Disposition:** confirmed static validation mismatch across all original 20 selected heads; no deployment or runtime reproduction

**Finding**

The testnet deployment driver accepts more than one textual representation of a 32-byte signing key, but its explicit refusal of the known public development key compares the input with one raw string. The spelling check does not establish that the effective signing key is different. The keystore branch also does not inspect signer identity. The documented rejection is therefore narrower than the accepted signer representations.

**Required conditions**

An operator explicitly enables a supported public-testnet broadcast and supplies the public development signer in an accepted representation or via a keystore. A mistakenly funded publicly known signer would remain publicly controllable. This helper accepts only the listed testnets; this review does not establish a mainnet deployment path or an active Pages wallet/payment vulnerability.

**Remediation**

Apply the development-signer restriction to the effective signer identity for both raw-key and keystore paths. Normalize and validate key bytes before equality decisions, and check the derived public address before signing. Preserve explicit broadcast confirmation.

**Future acceptance criteria**

Source review shows that all accepted raw-key representations and all signer-selection paths reach the same identity check before a broadcast operation. Future isolated fixture tests can assert identity equivalence without loading a funded account, connecting to RPC or sending transactions.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [scripts/testnet/deploy.sh:89–100](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/testnet/deploy.sh#L89-L100) at `e22c1748a3de` | `74ff0683949f4d7cad791a8ea76abff57989b810` |  |
| [scripts/testnet/deploy.sh:31–40](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/testnet/deploy.sh#L31-L40) at `e22c1748a3de` | `74ff0683949f4d7cad791a8ea76abff57989b810` | Supported network restriction limits assessed exposure to testnet deployment tooling |

Originating record: [crypto_tests_wave3](lanes/crypto_tests_wave3.json).


<a id="ct3-02"></a>

### CT3-02 — Rehearsal cleanup can remove earlier deployment records

**Severity/class:** Low; deployment-tooling / local artifact retention.

**Disposition:** confirmed static cleanup scope across all original 20 selected heads; no files deleted or reproduction executed

**Finding**

Before a local rehearsal, the driver refuses only when run-latest.json already exists. Its EXIT cleanup removes every regular file at the top level of the selected chain broadcast directory. Pre-existing timestamped or otherwise retained deployment records can exist without run-latest.json and are consequently within the cleanup selection even though the rehearsal did not create them. Cleanup also runs after a failed rehearsal.

**Required conditions**

The operator invokes rehearsal while the chain-specific broadcast directory contains earlier regular files and no run-latest.json. This can remove local deployment provenance and recovery information. It does not delete blockchain state or directly move user funds.

**Remediation**

Give rehearsal an isolated temporary broadcast and cache destination, then remove only that owned directory. If tool constraints require a shared destination, record its initial contents and remove only files created by the current operation; never sweep all pre-existing top-level records.

**Future acceptance criteria**

A static ownership check shows cleanup confined to a newly allocated rehearsal directory. An isolated temporary-file fixture may confirm that a pre-existing sentinel record remains byte-for-byte unchanged after both success and failure cleanup, without running a node, deploying a contract or using a real broadcast directory.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [scripts/testnet/deploy.sh:45–56](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/testnet/deploy.sh#L45-L56) at `e22c1748a3de` | `74ff0683949f4d7cad791a8ea76abff57989b810` |  |
| [scripts/testnet/deploy.sh:64–70](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/testnet/deploy.sh#L64-L70) at `e22c1748a3de` | `74ff0683949f4d7cad791a8ea76abff57989b810` | Rehearsal reuses the normal broadcast location before cleanup |

Originating record: [crypto_tests_wave3](lanes/crypto_tests_wave3.json).


<a id="root-i01"></a>

### ROOT-I01 — Legacy image recipes omit the build helper

**Severity/class:** Low; supporting-observation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Low availability, supplemental legacy infrastructure. `infra/web/Dockerfile:15–21` and `infra/devnet/Dockerfile.web:5–8` copy package files, packages and the web app, then invoke `npm run build:libs`. Root package.json defines that as `node scripts/build-workspaces.mjs --libraries`; neither recipe copies scripts. The helper is absent from the build-stage filesystem. These unverified recipes are separate from current Pages and portable Tor paths. No build was run or active outage claimed. Copy required inputs and qualify the exact recipe, or retire it.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [infra/web/Dockerfile:15–21](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/infra/web/Dockerfile#L15-L21) at `773a94be1c83` | `392a01a256e49f0b5c786791b258196544ea8a88` |  |
| [infra/devnet/Dockerfile.web:5–8](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/infra/devnet/Dockerfile.web#L5-L8) at `773a94be1c83` | `c7abd58b4194e91b0db12b6b717e012f6938997a` |  |
| [package.json](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/package.json) at `773a94be1c83` | `a4b3282474dbf3b55e1945c201d4a862aeb13670` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="root-i02"></a>

### ROOT-I02 — Legacy Tor example names a missing listener path

**Severity/class:** Informational; legacy-documentation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

infra/publish/torrc.example line 3 names infra/proxy/Caddyfile.static; the committed listener is infra/web/Caddyfile.static. Correct the reference; this is not the current portable Tor recipe.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [infra/publish/torrc.example:3](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/infra/publish/torrc.example#L3-L3) at `773a94be1c83` | `204866aae5285f30b5c5facc8a5a9eb4731d0fd9` |  |
| [infra/web/Caddyfile.static](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/infra/web/Caddyfile.static) at `773a94be1c83` | `302e7b0567ff420b9a14ac042dae3220a66982a5` |  |

Originating record: [root-findings](lanes/root-findings.json).


## Verification assurance, dependency metadata and documentation


<a id="cw2-01"></a>

### CW2-01 — Router invariant handler can discard invalid-metadata acceptance evidence

**Severity/class:** Low; current-new.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

The payBadMetadata handler reverts from its successful external-call branch when the router accepts invalid metadata. The invariant configuration sets fail_on_revert=false. That handler revert rolls back the successful router operation and can be discarded by the invariant campaign; it leaves no persistent acceptance flag for an invariant to inspect. This weakens this stateful property. Separate router unit and fuzz tests still cover metadata rejection, and no production acceptance defect was established.

**Required conditions**

A future regression accepts the malformed metadata exercised by this handler, and the campaign uses the checked-in invariant configuration. The finding concerns verification assurance, not an established current fund-loss path.

**Remediation**

Record unexpected acceptance in persistent handler state and assert that it remains zero, or distinguish expected protocol reverts from handler assertion failures so every assertion failure fails the campaign.

**Future acceptance criteria**

Every unexpected acceptance must produce a campaign failure; normal rejected calls may remain admissible exploration outcomes. Review that state rollback cannot erase the violation indicator.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/test/GhostPayRouter.invariant.t.sol:103–118](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/test/GhostPayRouter.invariant.t.sol#L103-L118) at `e22c1748a3de` | `bd526370803a3098359f8e3d70661edf26edd2be` |  |
| [packages/contracts/foundry.toml:23–26](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/foundry.toml#L23-L26) at `e22c1748a3de` | `59bf7337ea5fe8526869f22e9595e022027b4712` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="ct3-o01"></a>

### CT3-O01 — QR mutation property does not enforce its stated successful-parse condition

**Severity/class:** Informational; verification-assurance.

**Disposition:** confirmed in source across all 20 selected heads; not a demonstrated production vulnerability

**Finding**

The multipart test names its property as rejection of a changed chunk or preservation of the same session. Its successful branch calls parseChunk but discards the return value and performs no session or protected-field assertion. Only thrown errors are checked. A future parser regression that accepts changed protected data could therefore pass this particular property. Separate deterministic CRC, conflict, size and final-integrity tests are present, so this does not establish that current production parsing accepts such data.

**Required conditions**

A future parser regression succeeds on a mutated input and the project relies on this property to verify the named successful-parse constraint. This affects verification assurance rather than an established current payment or signature bypass.

**Remediation**

Assert the intended invariant on every successful parse and keep the typed-error assertion on rejected input. Name the test according to the exact property it checks.

**Future acceptance criteria**

A code review can trace every successful and failed branch to an explicit assertion of the named property; ordinary isolated unit assertions confirm a successful parse cannot skip the invariant check. No live target, oversized artifact or exploit recipe is needed.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/qr-exchange/src/multipart.test.ts:209–220](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/multipart.test.ts#L209-L220) at `e22c1748a3de` | `d8440e0d772d7ecbe5e4fba62d908f437bc3a64d` |  |
| [packages/qr-exchange/src/multipart.test.ts:128–170, 179–199](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/qr-exchange/src/multipart.test.ts#L128-L170) at `e22c1748a3de` | `d8440e0d772d7ecbe5e4fba62d908f437bc3a64d` | Existing separate rejection/integrity assertions limit the finding |

Originating record: [crypto_tests_wave3](lanes/crypto_tests_wave3.json).


<a id="root-01"></a>

### ROOT-01 — Independent lean report verification tolerates incomplete module evidence

**Severity/class:** Low; verification-assurance.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Severity: Low assurance/defense-in-depth, not an established deployment bypass. Present on main and integration.

At integration e22c1748a3de6eb02f5be3abe27d634b238c67c6, scripts/pages/verify-pages-site.mjs:186–203 checks format/profile and nonempty top-level chunks/workers, then treats absent per-chunk modules and per-worker chunks as empty lists. It does not validate complete chunk provenance, file names, correspondence to site output, or finite nonnegative rendered lengths. The later integration variant of apps/web/scripts/scan-bundle.mjs uses a similarly permissive traversal of optional lean report data; the main variant lacks that traversal. In contrast, apps/web/scripts/localBuildProfile.mjs validates the actual bundler metadata and worker evidence before producing a normal report. Its tests explicitly require nonempty provenance for executable chunks and valid rendered lengths.

Impact: the nominally independent downstream checks provide weaker assurance if their evidence is incomplete or supplied incorrectly. The regular producer remains a control; no path from an untrusted external user to a deployed artifact was established. Checksums alone authenticate neither a hostile build nor a hostile report.

Remediation: share a strict evidence schema, require all executable app and worker chunks to have matching provenance, validate finite nonnegative lengths and required exports, and reject missing evidence before exclusions are assessed. Keep legitimate zero-length tree-shaken modules distinct from absent records. Validation should assert schema rejection and artifact/report correspondence without attack payloads or live deployment.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [scripts/pages/verify-pages-site.mjs:186–203](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/verify-pages-site.mjs#L186-L203) at `e22c1748a3de` | `1354549a79a4c550ee55d21ebe6e77f22b2af4ce` |  |
| [apps/web/scripts/localBuildProfile.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/localBuildProfile.mjs) at `e22c1748a3de` | `65c1b1690763f34c64262643e94cdd672f0f057b` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="root-q01"></a>

### ROOT-Q01 — Pages devnet qualification omits its canonical ERC-20 checkout path

**Severity/class:** Informational; verification-assurance.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Informational, known qualification gap. `apps/web/e2e/pages-devnet.spec.ts` explains that the harness deploys different test tokens from the compile-time allowlist, so supported canonical ERC-20 checkout is not exercised. The same test separately asserts that gas-buffer policy is intentionally unavailable in lean because it requires invoice v2; this is a profile restriction, not a missing required lean feature. Unit tests and mocked token journeys exist. This is an end-to-end acceptance gap, not evidence that production token payment fails.

Future qualification should use mutually consistent deployed tokens, allowlists and signed manifests and verify supported token checkout. Record exact source/artifact identities and report any skipped scenario separately from a pass. This audit did not run or construct that scenario.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/e2e/pages-devnet.spec.ts:427–445](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/e2e/pages-devnet.spec.ts#L427-L445) at `e22c1748a3de` | `90b905165b9b6457585635022bc9e64dab674521` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="root-q03"></a>

### ROOT-Q03 — Local qualification can succeed with no checks

**Severity/class:** Low; verification-assurance.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Low assurance. `scripts/dev/local-ci.sh` accepts arbitrary `--only` names (24–38), matches a fixed step list (40–45), initializes failure to zero (75) and returns it (76–87). An unsupported selection can match no step and still print `DONE fail=0` and return success. Blob: `9fded4999dea9bc50835fe10a4c1d817fa8b7cc8`. No reproduction was run.

The header and developer README also claim parity with CI/every package, while the array at 18–22 omits current package, contract and browser gates. Actual hosted CI is a separate control. Reject unknown names, require a nonempty executed selection outside listing mode, and reconcile the catalogue or narrow the parity claim. Report exact executed/skipped checks. No remote release bypass is established.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [scripts/dev/local-ci.sh:18–45, 75–87](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/scripts/dev/local-ci.sh#L18-L45) at `773a94be1c83` | `9fded4999dea9bc50835fe10a4c1d817fa8b7cc8` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="cw2-o01"></a>

### CW2-O01 — CREATE2 documentation overstates cross-chain address separation

**Severity/class:** Informational; current-observation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

The factory documentation says a different chain yields a different account address. Its address calculation includes the factory, implementation and owner/policy salt, with no chain identifier. Equal addresses and inputs on two chains can therefore produce equal account addresses. Policy signatures remain chain-bound, so this is a documentation defect rather than a demonstrated signature replay flaw.

**Required conditions**

Identical factory and implementation addresses and identical owner/policy inputs exist on multiple chains. Integrators rely on the stronger documentation claim.

**Remediation**

Document the actual CREATE2 inputs and distinguish account address derivation from the chain-bound EIP-712 signature domain.

**Future acceptance criteria**

The documented prediction formula must match the implementation; cross-chain isolation claims must identify the particular domain-binding mechanism.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/PolicyAccountFactory.sol:18–21, 109–110, 170–190](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccountFactory.sol#L18-L21) at `e22c1748a3de` | `d456eec25c744e1e992ca786b2f21eefdbdf81a7` |  |
| [packages/contracts/src/PolicyAccount.sol:29–31, 354–360](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccount.sol#L29-L31) at `e22c1748a3de` | `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-o02"></a>

### CW2-O02 — Predeploy static checks do not have the claimed checksum parity

**Severity/class:** Informational; current-observation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

The shell predeploy script claims the same static checks as the Forge scripts, but accepts any letter case in a 40-digit hexadecimal address. DeployBase requires the exact checksummed spelling. Without the optional Forge dry run, the preflight can print all checks passed before the deployment script rejects the configuration. The deployment checksum guard itself remains intact.

**Required conditions**

An operator uses the static preflight with an address spelling rejected by DeployBase and does not enable the optional dry run.

**Remediation**

Share the checksum validation or describe the shell checks as format checks and make the remaining validation requirement explicit.

**Future acceptance criteria**

Preflight and deployment agree on accepted address spelling, or the preflight result precisely states the checks it omitted.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/scripts/pre-deploy-check.sh:2–3, 23, 46–48, 138–150](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/scripts/pre-deploy-check.sh#L2-L3) at `e22c1748a3de` | `eb882038fe26a25cd117cbb67292c606fdec1a8d` |  |
| [packages/contracts/script/DeployBase.s.sol:38–48](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/script/DeployBase.s.sol#L38-L48) at `e22c1748a3de` | `8be0210512826f28aaec9a8be08baed672fb7056` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-o03"></a>

### CW2-O03 — NatSpec gate omits the policy router

**Severity/class:** Informational; current-observation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

The NatSpec script describes coverage of production contracts but its explicit contract array omits GhostPayPolicyRouter. Existing documentation on that router does not repair the gate omission; later missing documentation in this production contract would be outside the stated gate.

**Required conditions**

A documentation regression occurs only in GhostPayPolicyRouter and the project relies on this script for production-contract NatSpec coverage.

**Remediation**

Include GhostPayPolicyRouter and derive or reconcile the contract list against an authoritative production-contract inventory.

**Future acceptance criteria**

All five first-party core production contracts are included in the stated documentation gate.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/scripts/check-natspec.sh:2–8](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/scripts/check-natspec.sh#L2-L8) at `e22c1748a3de` | `aa9af794d11a2e0dc29c53d10a65770f2bac0387` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="dep-01"></a>

### DEP-01 — Development dependency graph retains two advisory families

**Severity/class:** Low; dependency-advisory-metadata.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Read-only npm audit --package-lock-only --ignore-scripts was run on the exact main lock and integration lock, separately for production-only and all dependencies. No installs or fixes were run.

Main: production 286 / all 814 dependency entries. Integration: production 286 / all 820. Both production scans report zero known vulnerabilities. Both all-dependency scans report 17 low-severity affected package entries from two underlying advisory records (cookie GHSA-pxg6-pf52-xh8x, elliptic GHSA-848j-6mx2-7j84), via Hardhat/development dependency trees. No moderate/high/critical advisories reported. These are registry results at audit time, not proof of runtime safety; separate the development and excluded confidential-contracts tooling from the active browser application.

All lock records were structurally checked for resolution/integrity: main 815 package records, integration 821; 678/684 nonlink resolved artifacts respectively, all HTTPS registry.npmjs.org with SHA-512 integrity. The three install-script indicators are fsevents, keccak, secp256k1. Vendored dependency implementations are outside this first-party review.

**Registry evidence:** [dependency-audit-main.json](evidence/dependency-audit-main.json), [dependency-audit-all.json](evidence/dependency-audit-all.json), [dependency-audit-candidate-production.json](evidence/dependency-audit-candidate-production.json), [dependency-audit-candidate-all.json](evidence/dependency-audit-candidate-all.json)

Originating record: [root-findings](lanes/root-findings.json).


## Branch hardening, design constraints and retired hypotheses


<a id="cw2-h01"></a>

### CW2-H01 — Main policy signing helper lacked the current canonical policy-only boundary

**Severity/class:** Not rated; branch-dependent hardening.

**Disposition:** Branch hardening: the cited older helper remains in original/current main; the cited correction is present in completion e22c174. No global merge or deployed fix is asserted.

**Finding**

Main checked a caller-provided typed-data digest without restricting the domain and type structure to this package's policy structs, and read the caller digest again during signing. The release/latest implementation reconstructs the digest from validated canonical policy fields once and signs that local value. The inspected web withdrawal and cancel helpers construct their own typed data, so an externally reachable main-web path supplying arbitrary typed-data objects was not established.

**Required conditions**

Historical exposure requires a caller able to supply an untrusted typed-data object to the secret-bearing library helper. The changed library boundary must not be presented as an established remote compromise of the web app.

**Remediation**

Retain the canonical policy-only reconstruction and one-time input capture on branches that ship this helper.

**Future acceptance criteria**

Only the exact supported domain, type and message fields reach the signer; subsequent mutation of caller-owned objects cannot alter the digest being signed.

**Qualification**

“Latest” in the originating lane means the specifically inspected completion/release implementation. Refer to immutable evidence and the coverage ledger for other branch membership. This record is not counted as a newly demonstrated browser vulnerability.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/policy-scheme/src/eip712.ts:321–364](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/policy-scheme/src/eip712.ts#L321-L364) at `c977b5d6723f` | `5a300009bf3bd95e3c0bc808acffaa00ac366f36` |  |
| [packages/policy-scheme/src/eip712.ts:352–385, 413–439](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/policy-scheme/src/eip712.ts#L352-L385) at `e22c1748a3de` | `2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7` |  |
| [apps/web/src/features/policy/withdraw.ts:129–144](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/withdraw.ts#L129-L144) at `e22c1748a3de` | `292f043fa2966470785cb1a5119af0faac655fc3` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-h02"></a>

### CW2-H02 — Main policy proofs lacked the current stored-field binding checks

**Severity/class:** Not rated; branch-dependent hardening.

**Disposition:** Branch hardening: the cited older helper remains in original/current main; the cited correction is present in completion e22c174. No global merge or deployed fix is asserted.

**Finding**

The historical library verified stored Merkle membership without all of the current recomputation checks tying token, limit and window fields to the stored leaf. Latest code adds that binding in proof retrieval and withdrawal construction. The on-chain account already recomputes and verifies the leaf, so this historical weakness supports client misplanning or rejected requests rather than an on-chain limit bypass.

**Required conditions**

Untrusted or corrupted restored policy-tree data reaches historical client helpers.

**Remediation**

Retain stored-leaf recomputation and withdrawal-field binding when restoring policy data and building requests.

**Future acceptance criteria**

Every accepted proof has a leaf recomputed from its stated token, limit and window, and malformed stored data is rejected before signing.

**Qualification**

“Latest” in the originating lane means the specifically inspected completion/release implementation. Refer to immutable evidence and the coverage ledger for other branch membership. This record is not counted as a newly demonstrated browser vulnerability.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/policy-scheme/src/limits.ts:147–183](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/policy-scheme/src/limits.ts#L147-L183) at `c977b5d6723f` | `b25c1fa2a7b50ccb800c5eedfca2f927c33697a9` |  |
| [packages/policy-scheme/src/limits.ts:149–163](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/policy-scheme/src/limits.ts#L149-L163) at `e22c1748a3de` | `2836251024e902ab3bbfd203b90f6ebacd42a9db` |  |
| [packages/policy-scheme/src/eip712.ts:223–272](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/policy-scheme/src/eip712.ts#L223-L272) at `e22c1748a3de` | `2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7` |  |
| [packages/contracts/src/PolicyAccount.sol:170–185](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/PolicyAccount.sol#L170-L185) at `e22c1748a3de` | `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-h03"></a>

### CW2-H03 — Main policy calldata decoder lacked current canonical and metadata checks

**Severity/class:** Not rated; branch-dependent hardening.

**Disposition:** Branch hardening: the cited older helper remains in original/current main; the cited correction is present in completion e22c174. No global merge or deployed fix is asserted.

**Finding**

The historical decoder parsed the expected method and bound the predicted account, while latest additionally requires canonical re-encoding, full ephemeral-point parsing and metadata consistency with payment asset and amount. These are strengthened decoder checks. Even the current decoder cannot establish that a separately supplied receiver policy is authentic; integrations must preserve that independent binding.

**Required conditions**

Historical callers rely on this helper to validate untrusted payment calldata or treat successful decoding as broader payee authentication.

**Remediation**

Retain the latest canonical decoder and keep receiver-policy authentication explicit in the caller.

**Future acceptance criteria**

Accepted calldata is canonical and internally consistent, and successful decoding is not equated with authenticated receiver ownership.

**Qualification**

“Latest” in the originating lane means the specifically inspected completion/release implementation. Refer to immutable evidence and the coverage ledger for other branch membership. This record is not counted as a newly demonstrated browser vulnerability.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/policy-scheme/src/router.ts:164–187](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/policy-scheme/src/router.ts#L164-L187) at `c977b5d6723f` | `3e1af8ed068229466ec14478a39aa07bc5aaccb1` |  |
| [packages/policy-scheme/src/router.ts:168–227](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/policy-scheme/src/router.ts#L168-L227) at `e22c1748a3de` | `35f20d3f07e02f42fac244552f4b50bce292402f` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-h04"></a>

### CW2-H04 — Main viewing-secret cleanup did not cover earlier validation failures

**Severity/class:** Not rated; branch-dependent hardening.

**Disposition:** Branch hardening: the cited older helper remains in original/current main; the cited correction is present in completion e22c174. No global merge or deployed fix is asserted.

**Finding**

The historical policy derivation helper copied the viewing secret before validations outside its cleanup region. The latest helper validates the nonsecret inputs first and protects the secret-copy lifetime. This is a best-effort memory-hygiene improvement in JavaScript; no remote secret-exfiltration path was established.

**Required conditions**

A historical helper invocation fails validation after creating the temporary secret copy.

**Remediation**

Retain the latest ordering and ensure all secret-copy lifetimes enter guaranteed cleanup immediately.

**Future acceptance criteria**

Every local secret copy is covered by cleanup on successful and exceptional exits, with no stronger memory-erasure guarantee than the runtime can provide.

**Qualification**

“Latest” in the originating lane means the specifically inspected completion/release implementation. Refer to immutable evidence and the coverage ledger for other branch membership. This record is not counted as a newly demonstrated browser vulnerability.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/policy-scheme/src/derive.ts:175–181](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/policy-scheme/src/derive.ts#L175-L181) at `c977b5d6723f` | `d70af630f3dfe38100f4714b1e8f5c38ab4d4e89` |  |
| [packages/policy-scheme/src/derive.ts:176–184](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/policy-scheme/src/derive.ts#L176-L184) at `e22c1748a3de` | `ce4be42c09dec5e77b34f185c2af717687143330` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-h05"></a>

### CW2-H05 — Main Mythril output handling lacked the latest completeness evidence

**Severity/class:** Not rated; branch-dependent hardening.

**Disposition:** Branch hardening: the cited older helper remains in original/current main; the cited correction is present in completion e22c174. No global merge or deployed fix is asserted.

**Finding**

The historical wrapper and compatibility launcher lacked the current per-run completeness telemetry and strict evidence checks. Latest code requires fresh exclusive telemetry, ready state, a single report and zero recorded exceptions/timeouts/errors, and records source/tool identity. These changes strengthen evidence that the requested bounded analysis completed; neither version constitutes proof that the contracts have no vulnerabilities. No analyzer was executed in this audit.

**Required conditions**

A historical analysis result is treated as a complete successful run despite missing completeness evidence.

**Remediation**

Retain the latest fail-closed evidence path, strict parsing and source/tool identity checks; keep conclusions bounded to the actual analysis performed.

**Future acceptance criteria**

Missing, duplicate, malformed, stale or incomplete analysis evidence cannot be presented as a successful completed security analysis.

**Qualification**

“Latest” in the originating lane means the specifically inspected completion/release implementation. Refer to immutable evidence and the coverage ledger for other branch membership. This record is not counted as a newly demonstrated browser vulnerability.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/scripts/run-mythril.sh:1–36](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/contracts/scripts/run-mythril.sh#L1-L36) at `c977b5d6723f` | `7ad37efb96f6b5e1f54ffbdfc8a644ef3b03ab4e` |  |
| [packages/contracts/scripts/mythril-compat.py:1–15](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/contracts/scripts/mythril-compat.py#L1-L15) at `c977b5d6723f` | `bd78f6b0cecc1f9b43c2a933a44981d38e403521` |  |
| [packages/contracts/scripts/run-mythril.sh:1–54](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/scripts/run-mythril.sh#L1-L54) at `e22c1748a3de` | `a277ff0061e0d08f9850957f3dd9d96a59ad17ec` |  |
| [packages/contracts/scripts/mythril-compat.py:1–113](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/scripts/mythril-compat.py#L1-L113) at `e22c1748a3de` | `4604d3055535ac85274c0bf83afdee8e6becbd9a` |  |
| [packages/contracts/scripts/capture-mythril-evidence.py:1–210](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/scripts/capture-mythril-evidence.py#L1-L210) at `e22c1748a3de` | `e0d317c8462e9119a1564106562ca7db5afe92d9` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="root-h01"></a>

### ROOT-H01 — Branch-dependent root hardening differs

**Severity/class:** Informational; hardening-difference.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

- Release/completion add frame/origin guards; main has no equivalent. The origin guard protects accidental copies, not an attacker able to modify the app.
- Release/completion use fixed React root error labels instead of logging arbitrary error messages.
- Production release key configuration rejects known public test signing keys in later branches; main lacks this denylist if an operator configures such a key. No actual compromised release key was found.
- Later setup-forge checks the pinned solc binary hash; main does not verify the cached binary in that action.
- Later Pages workflow binds deployment to file checksums/attestation, and integration verifies assembled artifact integrity before promotion. These differences do not themselves establish a malicious artifact or an active bypass.
- Latest networking adds scoped authorization/revocation. Custody/network reviewer owns impact analysis.
- Main's legacy manifest loader is exported but default app services already use strict bundled signed manifests. Do not label this as an active unsigned-manifest bypass without a reachable default caller.

Clarification: current main uses the React default root behavior without the later fixed-label handlers. No explicitly logged secret, compromised release key or malicious artifact was established.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/frameGuard.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/frameGuard.ts) at `e22c1748a3de` | `e1f2279c35ca58966f3a4aa270378da48b78ee94` |  |
| [apps/web/src/main.tsx](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/main.tsx) at `e22c1748a3de` | `290ba486b19ad7a36139b8559130fd6c6b498e1e` |  |
| [apps/web/scripts/validate-deployments.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/validate-deployments.mjs) at `e22c1748a3de` | `76a6132fcc692a18e657c3880427c8f60739c6b8` |  |
| [.github/actions/setup-forge/action.yml](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/.github/actions/setup-forge/action.yml) at `e22c1748a3de` | `3015f5ef9122e72d2452b1e78de960c970910618` |  |
| [.github/workflows/pages.yml](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/.github/workflows/pages.yml) at `e22c1748a3de` | `552e4221da41f57b47a2f1dd816f6f3aa45b52ee` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="custody-n1"></a>

### CUSTODY-N1 — Backup-only idle retention deliberately preserves recovery without a prior credential for a sole copy

**Severity/class:** Informational; current documented design tradeoff; not an additional ordinary-session bypass.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Required conditions**

Retained sole-copy keys have no verified recoverable copy or existing tied encrypted-vault credential.

**Impact**

Encrypted backup/save remains available with a newly chosen backup passphrase. This protects recoverability but is not full confidentiality against someone controlling the already-open tab. Ordinary signing/scanning/raw/payment export are separately revoked.

**Remediation**

Use precise retained-recovery language. If full unattended-tab confidentiality is required, establish a wrapping credential before sole-copy payment use or require completed backup. Do not destroy the sole copy to achieve a lock label.

**Future acceptance criteria**

UI accurately discloses retained recovery, ordinary authority remains revoked, and ordinary reuse requires defined import/unlock.

**Qualification**

This design note describes the suspended, backup-only implementation in release/completion and the carrying privacy/clipboard branches. Current main-derived implementations that retain ordinary authority are covered separately by CUSTODY-01.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/lib/session.ts:442–451](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/session.ts#L442-L451) at `e22c1748a3de` | `9440ec16a0283f70b8fc317f13f98db0de0194e0` | Deliberate backup-only retained-holder guard. |
| [apps/web/src/lib/keyVault.ts:260–271](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/keyVault.ts#L260-L271) at `e22c1748a3de` | `000be25182a877bbab96cc3b6a0e5ac9038790ca` | Existing-vault proof only required when record exists. |
| [apps/web/src/views/SellerKeys.tsx:208–227, 564–577](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/SellerKeys.tsx#L208-L227) at `e22c1748a3de` | `2c17d389ad6d108a68470e075caf98d0a987cd33` | Encrypted recovery flow remains available. |
| [apps/web/src/lib/session.idleLock.test.ts:247–309](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/session.idleLock.test.ts#L247-L309) at `e22c1748a3de` | `8ae759c2e2eb6f20df73bb658a5b97fe4f4477fa` | Explicitly permits recovery and rejects ordinary/raw/payment exports. |

Originating record: [custody_privacy_review](lanes/custody_privacy_review.json).


<a id="cw2-d01"></a>

### CW2-D01 — Fee rounding and native-buffer exemptions are explicit economic semantics

**Severity/class:** Informational; design-boundary.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

The percentage fee uses integer flooring, and the native buffer attached to a token payment is not included in that percentage fee. These are existing contract semantics rather than a newly identified authorization defect. Claims that all transmitted native value is charged would need to account for the buffer exemption and small-payment rounding.

**Required conditions**

A product or economic claim assumes fees on all value, including native buffers or amounts that round below a fee unit.

**Remediation**

Align fee documentation, displays and revenue assumptions with the actual computation. Treat changes to the exemption as protocol changes.

**Future acceptance criteria**

Client explanations and accounting agree with the contract fee formula for each payment type.

**Prior tracking:** CONTRACTS-CORE-02, existing dust-fee tests.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/GhostPayRouter.sol:132–146, 215–218](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol#L132-L146) at `e22c1748a3de` | `bc6369fffe44ebcad5548ae731860161444e7998` |  |
| [packages/contracts/src/GhostPayPolicyRouter.sol:33–34, 160–177](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayPolicyRouter.sol#L33-L34) at `e22c1748a3de` | `56f5ef6ef90c6441812f3695da55916ecce352c4` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="cw2-d02"></a>

### CW2-D02 — Announcement syntax does not by itself establish payment authenticity

**Severity/class:** Informational; design-boundary.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

The router enforces the public-key encoding length and prefix and a structured metadata format; callers still choose assets and announcement inputs. Integrations must perform the remaining point, derivation, asset and actual-payment checks. The predecessor crypto review covered the relevant point-validation code. No current client spoofing path was established by this worker.

**Required conditions**

An integration treats announcement appearance alone as authenticated payment or receiver ownership.

**Remediation**

Preserve full key/derivation checks, supported-asset policy and transaction-result verification at the receiving integration boundary.

**Future acceptance criteria**

Receiver credit and payment presentation must depend on verified payment facts, not only event shape or a candidate address.

**Prior tracking:** Router audit R-03.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/contracts/src/GhostPayRouter.sol:220–226](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol#L220-L226) at `e22c1748a3de` | `bc6369fffe44ebcad5548ae731860161444e7998` |  |

Originating record: [contracts_policy_wave2](lanes/contracts_policy_wave2.json).


<a id="root-o01"></a>

### ROOT-O01 — Tight CSP controls are not wired through the stock Pages workflow

**Severity/class:** Informational; supporting-observation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Informational configuration limitation, not a demonstrated confidentiality issue. Integration build-pages.sh supports GHOSTPAY_CONNECT_ORIGINS and GHOSTPAY_REQUIRE_TIGHT_CSP, but .github/workflows/pages.yml does not pass these repository settings into the build environment. The ordinary default remains connect-src allowing HTTPS and WSS, needed for arbitrary user-configured endpoints. An operator must change the workflow or invoke the script with these settings to enable a narrow deployment-specific policy. Do not present broad CSP alone as an XSS finding.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [scripts/pages/build-pages.sh](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/build-pages.sh) at `e22c1748a3de` | `2022cf30a0f18535131c2f9651d292226550835b` |  |
| [.github/workflows/pages.yml](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/.github/workflows/pages.yml) at `e22c1748a3de` | `552e4221da41f57b47a2f1dd816f6f3aa45b52ee` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="root-q02"></a>

### ROOT-Q02 — Clipboard cleanup remains best effort

**Severity/class:** Informational; supporting-observation.

**Disposition:** Static source observation in the cited scope; no runtime reproduction

**Finding**

Informational characterization, not a new exploitable defect. Newer tests cover stale ordinary-copy completion and matching-value cleanup. A second clipboard read followed by a write is not an atomic compare-and-clear operation with respect to external application writes. Describe cleanup as best effort and retain the ownership checks; do not promise guaranteed removal or preservation under every external race. The older unconditional supplemental helper remains CUSTODY-S1.

All 172 lines of the privacy-branch `Common.clipboardPrivacy.test.tsx` version were read; its full blob is in the ledger. No clipboard operation was performed.

**Qualification**

The cited clipboard test blob is carried by the pinned privacy snapshot and quick-hide branch, not by recovered-fixes. Its 172 lines were fully read.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [apps/web/src/components/Common.clipboardPrivacy.test.tsx](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/Common.clipboardPrivacy.test.tsx) at `137628961463` | `8f4a9246266ee4565a9cbbce32e526f09e27b888` |  |

Originating record: [root-findings](lanes/root-findings.json).


<a id="cp-o03"></a>

### CP-O03 — Permit domain name/version are outside the tx-review intent comparison

**Severity/class:** Informational; Branch hardening, design constraints and retired hypotheses.

**Disposition:** Retired as an active Pages vulnerability; retained only as an API-boundary note.

**Finding**

decodeTypedData requires nonempty permit name/version but omits them from PermitSigIntent. The current Pages permit path separately builds and checks the domain through buildPermit and the on-chain DOMAIN_SEPARATOR comparison before signing. No active ungated caller was established. Consumers using tx-review alone should retain this separate domain check.

**Remediation**

Document the required domain check for standalone consumers, or include a trusted expected domain in the review contract if the library is intended to provide that guarantee.

**Future acceptance criteria**

Any supported signing path validates the complete permit domain before requesting a signature.

**Immutable source evidence**

| Source | Blob | Supports |
|---|---|---|
| [packages/tx-review/src/decode.ts:200–232](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/tx-review/src/decode.ts#L200-L232) at `e22c1748a3de` | `ac87d665d0fa50510f40dc17c037589b60a957ec` |  |
| [packages/tx-review/src/review.ts:45–50](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/tx-review/src/review.ts#L45-L50) at `e22c1748a3de` | `584996185bee03a25bea873b4e7211d61bd1b38d` |  |
| [apps/web/src/lib/pay.ts:488–504](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/pay.ts#L488-L504) at `e22c1748a3de` | `479341df5a6a5a5f90038520d3934fe2d4fcdea8` |  |
| [apps/web/src/lib/pay.ts:589–604](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/pay.ts#L589-L604) at `e22c1748a3de` | `479341df5a6a5a5f90038520d3934fe2d4fcdea8` |  |
| [packages/chain-adapters/src/sweep.ts:275–286](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/chain-adapters/src/sweep.ts#L275-L286) at `e22c1748a3de` | `8a8004d1a19be56426e8d19663d438ce69516077` |  |
| [apps/web/src/lib/sweep.ts:333–360](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L333-L360) at `e22c1748a3de` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` |  |

Originating record: [crypto_protocol_review](lanes/crypto_protocol_review.json).
