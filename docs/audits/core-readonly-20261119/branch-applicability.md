# GhostPay branch applicability

**Scope:** 16 requested findings, seven immutable snapshots, 112 classified cells. All conclusions are static source conclusions. A fixed cell means the correction exists in that snapshot; it does not mean deployed, runtime-tested, or integrated into another branch.

## Snapshot key

| Column | Branch | Immutable commit |
|---|---|---|
| Current main | `main (freshness snapshot)` | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` |
| Release | `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| Completion | `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| Quick-hide | `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| Unique-code | `integration/ghostpay-main-unique-code-20261120` | `885b9569e6fc99e43bf01d23305494275e10120e` |
| Recovered-fixes | `integration/ghostpay-main-recovered-fixes-20261120` | `6c65cc3fd31c9ae361f932bee4a3449d89ed776c` |
| Tor | `feat/ghostpay-tor-completion-20261119` | `14a7526842b3cb055452b721d237a7e68813ff0c` |

## Applicability matrix

**A** = affected; **F** = fixed in source; **N** = defect-specific path/contract not present; **C** = conditional direct-caller/environment gap; **P** = partially corrected. Every cell resolves to full-blob source evidence in the JSON and the evidence section below.

| Finding | Severity | Current main | Release | Completion | Quick-hide | Unique-code | Recovered-fixes | Tor |
|---|---|---|---|---|---|---|---|---|
| CUSTODY-01 — Idle lock retains ordinary authority | Medium | A | F | F | F | A | A | A |
| CUSTODY-02 — Archived receipt issue date exceeds Date range | Low | A | A | A | A | A | A | A |
| SCAN-NET-02 — Private scan loses session-only RPC selections | Medium | N | A | A | A | N | N | N |
| SCAN-NET-01 — Thirty-day privacy count loses partial qualifier | Low | A | F | F | F | F | F | A |
| PUI-01 — RPC receipt identity and status are not fully validated | Medium | A | A | F | A | A | F | A |
| PUI-02 — ERC20 simulation accepts malformed nonempty ABI bool | Low | A | A | A | A | A | F | A |
| PUI-03 — Sweep input edits do not revoke pending review | Medium | A | F | F | F | A | A | A |
| PUI-04 — Page hiding does not revoke pending local imports | Low | A | F | F | F | A | F | A |
| PUI-05 — parseUnits lacks runtime argument guards | Low | C | C | C | C | C | F | C |
| PS2-01 — Privacy WalletAttempts callers omit wallet | Low | N | N | N | A | N | N | N |
| CP-H01 — Rejected conflicting QR chunk refreshes idle expiry | Low | A | A | F | A | A | F | A |
| CP-H02 — Canonical arrays lack dense own-data validation | Informational | C | F | F | F | C | F | C |
| CP-H03 — Base64url decoder lacks runtime string guard | Informational | C | F | F | F | C | F | C |
| CP-H04 — Merchant profile expiry lacks invalid-clock guard | Low | C | F | F | F | C | F | C |
| PUI-06 — QR kind helpers lack complete runtime guards | Informational | C | P | F | P | P | F | C |
| PUI-07 — Multipart QR normalizes ill-formed Unicode | Informational | C | F | F | F | F | F | C |

## Findings that change branch interpretation

- Historical/main wording in older finding files still applies to current main 773a94b: the c977b5d -> 773a94b diff contains documentation and portable-hosting-kit changes only.
- Tor matches current main for every source blob used by this matrix. This statement is limited to the reviewed finding paths.
- Recovered-fixes corrects many small boundaries but retains the original idle-lock and sweep-review implementation. Unique-code also retains those implementations.
- Quick-hide is not a superset of completion: it retains the older RPC receipt validator and QR conflict-expiry order, and adds the WalletAttempts wiring regression.
- SCAN-NET-02 needs readable persisted settings. Its Medium integrity consequence requires an otherwise usable primary, session-only secondary, and plan.useSecondary=true. The missing-primary case is visible fail-closed availability behavior.
- QR kind guards are partial in release, quick-hide and unique-code. The older worker hash-only receipt fix is likewise partial but is outside these seven primary columns.
- PUI-05, PUI-06, PUI-07 and CP-H02/03/04 must keep their direct-caller/environment prerequisites. Source presence alone is not proof of a remotely exploitable denial of service, signature bypass or key disclosure.
- CUSTODY-02 remains in all seven snapshots and requires an authenticated reconciliation archive/history path; it is not an unauthenticated network finding.
- No additional higher-severity claim was established by this independent applicability review. Severity labels are inherited from the scoped source findings with the conditions above retained.

## Conditions and practical limits

### CUSTODY-01 — Idle lock retains ordinary authority

**Condition:** Loaded seller keys reach idle expiry. Ordinary authority is not synchronously revoked while custody is checked; if there is no verified recoverable copy, keys remain usable through ordinary secret APIs.

**Limit:** This is a local session-authority lifecycle gap. Fixed snapshots deliberately preserve narrow encrypted-backup recovery for a sole copy; that retained recovery is not an additional ordinary-session bypass.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Unique-code, Recovered-fixes, Tor | C1-A, C1-B |
| fixed — Release, Completion | C1-C, C1-E |
| fixed — Quick-hide | C1-D, C1-E |

### CUSTODY-02 — Archived receipt issue date exceeds Date range

**Condition:** An authenticated same-seller/same-chain reconciliation archive contains a positive safe-integer issuedAt outside the representable JavaScript Date range in seconds, and the receipt history is rendered.

**Limit:** History rendering can throw; no fund movement, remote unauthenticated path, or stored-byte corruption is established. In the privacy branch the history may additionally require its reveal action.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Unique-code, Recovered-fixes, Tor | C2-A, C2-C, C2-D |
| affected — Release, Completion | C2-B, C2-C, C2-D |
| affected — Quick-hide | C2-B, C2-C, C2-E |

### SCAN-NET-02 — Private scan loses session-only RPC selections

**Condition:** Production privateScanStore is enabled, current-tab endpoint settings are saved with session-only retention, and persisted settings remain readable. The integrity consequence additionally requires a usable primary, a chosen session-only secondary, and plan.useSecondary=true.

**Limit:** The chosen independent secondary may be silently omitted. A session-only primary with no usable custom scan endpoint fails visibly and closed. Read denial/absent browser storage uses the in-memory fallback. No forged payment or fund loss is established.

| Status and snapshots | Exact source evidence |
|---|---|
| not-present — Current main, Unique-code, Recovered-fixes, Tor | SN2-J, SN2-K |
| affected — Release, Completion | SN2-A, SN2-C, SN2-E, SN2-G, SN2-I |
| affected — Quick-hide | SN2-B, SN2-D, SN2-F, SN2-H, SN2-I |

### SCAN-NET-01 — Thirty-day privacy count loses partial qualifier

**Condition:** The scan covers the recent seven-day interval but not the whole available thirty-day interval, while reporting both counts.

**Limit:** The thirty-day count can be presented as complete when it is a lower bound. Spending authority is unaffected.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Tor | SN1-A |
| fixed — Release, Completion, Quick-hide, Unique-code, Recovered-fixes | SN1-B |

### PUI-01 — RPC receipt identity and status are not fully validated

**Condition:** The selected RPC returns a receipt with missing/mismatched transactionHash or a parsed status outside the two defined outcomes.

**Limit:** Payment outcome presentation can be attributed to inconsistent data. This does not establish chain-state forgery or theft. Both identity and status checks are required for fixed status.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Release, Quick-hide, Unique-code, Tor | P1-A |
| fixed — Completion, Recovered-fixes | P1-B |

### PUI-02 — ERC20 simulation accepts malformed nonempty ABI bool

**Condition:** simulateCall is used with expectBool=true and receives nonempty syntactically valid hex that is not a canonical ABI boolean.

**Limit:** The UI can omit its unavailable-simulation warning. The product already permits unavailable simulations with a warning; no direct unintended-transfer bypass is established.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Release, Completion, Quick-hide, Unique-code, Tor | P2-A |
| fixed — Recovered-fixes | P2-B |

### PUI-03 — Sweep input edits do not revoke pending review

**Condition:** A user begins a sweep with a valid session, then changes destination, mode, or the review context while preparation/signing is awaiting completion.

**Limit:** The earlier captured transaction context can continue despite changed visible inputs. This is stale consent, not arbitrary recipient injection. No fund-loss magnitude or live signing result is asserted.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Unique-code, Recovered-fixes, Tor | P3-A, P3-B |
| fixed — Release, Completion, Quick-hide | P3-C, P3-D |

### PUI-04 — Page hiding does not revoke pending local imports

**Condition:** A local paste/image import remains pending when the page is hidden with no active camera.

**Limit:** The consumer callback can receive content after the action lifetime should end. Downstream consumer checks can limit effects; no secret disclosure or unauthorized signing is established.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Unique-code, Tor | P4-A |
| fixed — Release, Completion, Quick-hide, Recovered-fixes | P4-B |

### PUI-05 — parseUnits lacks runtime argument guards

**Condition:** A direct runtime caller violates the TypeScript amount/decimal-precision contract.

**Limit:** The utility can throw or perform excessive work, but reviewed normal production callers use strings and configured precision. No network-controlled unbounded-precision path is established.

| Status and snapshots | Exact source evidence |
|---|---|
| conditional — Current main, Release, Completion, Quick-hide, Unique-code, Tor | P5-A |
| fixed — Recovered-fixes | P5-B |

### PS2-01 — Privacy WalletAttempts callers omit wallet

**Condition:** The privacy WalletAttempts implementation has journal entries, but its production Pay/Registry callers omit the optional wallet account/chain scope even after connection.

**Limit:** History and its explicit-clear recovery action are unavailable. Duplicate-attempt protection remains active, and the current transaction view may still display a hash. No false success or theft is established.

| Status and snapshots | Exact source evidence |
|---|---|
| not-present — Current main, Unique-code, Recovered-fixes, Tor | PS1-E |
| not-present — Release, Completion | PS1-B, PS1-C, PS1-D, PS1-E |
| affected — Quick-hide | PS1-A, PS1-B, PS1-C, PS1-D |

### CP-H01 — Rejected conflicting QR chunk refreshes idle expiry

**Condition:** An incomplete bounded multipart QR session receives a conflicting chunk before its existing idle deadline.

**Limit:** Rejected input refreshes the deadline. Final payload integrity/authentication and storage bounds remain in force; no unbounded-storage or authentication bypass is established.

| Status and snapshots | Exact source evidence |
|---|---|
| affected — Current main, Release, Quick-hide, Unique-code, Tor | H1-A |
| fixed — Completion, Recovered-fixes | H1-B |

### CP-H02 — Canonical arrays lack dense own-data validation

**Condition:** A direct JavaScript caller supplies a sparse, decorated, accessor-bearing, or otherwise malformed array to canonicalize.

**Limit:** Unexpected canonical representations are possible at the API boundary. Strict parsed JSON supplies ordinary dense arrays; no reachable signature bypass is established. Descriptor snapshotting does not imply arbitrary proxy objects can never run any trap.

| Status and snapshots | Exact source evidence |
|---|---|
| conditional — Current main, Unique-code, Tor | H2-A |
| fixed — Release, Completion, Quick-hide, Recovered-fixes | H2-B |

### CP-H03 — Base64url decoder lacks runtime string guard

**Condition:** A direct runtime caller supplies a non-string decoder argument.

**Limit:** Behavior/errors can be inconsistent, but the invoice-fragment entry point already checks string input. No external verification bypass is established.

| Status and snapshots | Exact source evidence |
|---|---|
| conditional — Current main, Unique-code, Tor | H3-A |
| fixed — Release, Completion, Quick-hide, Recovered-fixes | H3-B |

### CP-H04 — Merchant profile expiry lacks invalid-clock guard

**Condition:** The caller/environment supplies a non-finite or negative nowSec; some invalid clock values allow a correctly signed profile to pass without meaningful expiry evaluation.

**Limit:** Clock control is a caller/environment prerequisite; no external clock-control path is established. Fixed status covers the explicit non-finite/negative-clock check.

| Status and snapshots | Exact source evidence |
|---|---|
| conditional — Current main, Unique-code, Tor | H4-A |
| fixed — Release, Completion, Quick-hide, Recovered-fixes | H4-B |

### PUI-06 — QR kind helpers lack complete runtime guards

**Condition:** A runtime caller supplies an out-of-domain kind/payload argument or a non-string property key.

**Limit:** Normal reviewed callers use typed constants; no imported-QR route to privileged secret handling or key disclosure is established.

| Status and snapshots | Exact source evidence |
|---|---|
| conditional — Current main, Tor | P6-A |
| partial — Release, Quick-hide, Unique-code | P6-B |
| fixed — Completion, Recovered-fixes | P6-C |

### PUI-07 — Multipart QR normalizes ill-formed Unicode

**Condition:** A direct multipart caller supplies text containing an unpaired UTF-16 surrogate.

**Limit:** Encoded text may differ from caller input. Reviewed invoice/key producers emit structured encoded text; no valid signed-invoice/key corruption flow is established.

| Status and snapshots | Exact source evidence |
|---|---|
| conditional — Current main, Tor | P7-A |
| fixed — Release, Completion, Quick-hide, Unique-code, Recovered-fixes | P7-B |

## Exact source evidence

Each ID identifies a path, full Git blob, and line anchors independently inspected here. A representative immutable commit is provided in the JSON. Other listed snapshots contain the identical whole blob; line anchors therefore transfer unchanged.

| Evidence ID | Source path and anchors | Full blob | Identical snapshots |
|---|---|---|---|
| C1-A | `apps/web/src/AppShell.tsx`:145-168 | `22c6d0b76c97584bd7059f830ae6aa8134a4a3a9` | Current main, Unique-code, Recovered-fixes, Tor |
| C1-B | `apps/web/src/lib/session.ts`:312-359 | `4b5d36e9ed7651d1d6f3e4b63e805b41667e8f0a` | Current main, Unique-code, Recovered-fixes, Tor |
| C1-C | `apps/web/src/AppShell.tsx`:257-272 | `8e2006a8309403f336efda82c1cc6eb6699f04c4` | Release, Completion |
| C1-D | `apps/web/src/AppShell.tsx`:276-291 | `ae90814b2edb359cf1d72d0a728cfb619870933f` | Quick-hide |
| C1-E | `apps/web/src/lib/session.ts`:104-146, 383-451 | `9440ec16a0283f70b8fc317f13f98db0de0194e0` | Release, Completion, Quick-hide |
| C2-A | `packages/invoice-schema/src/receipts.ts`:86-94 | `af7f5ffe10ef7d0e5610dda4032ba9a517b4e298` | Current main, Unique-code, Recovered-fixes, Tor |
| C2-B | `packages/invoice-schema/src/receipts.ts`:90-98 | `a991e6aa7ac6bb2cea5758a1d79409c513758311` | Release, Completion, Quick-hide |
| C2-C | `packages/ux-vault/src/reconciliation-portable.ts`:527-542, 1045-1083 | `78d7b8ec843514d3446b69fa22b84e35b178a694` | Current main, Release, Completion, Quick-hide, Unique-code, Recovered-fixes, Tor |
| C2-D | `apps/web/src/components/ReconciliationLedger.tsx`:751-757 | `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67` | Current main, Release, Completion, Unique-code, Recovered-fixes, Tor |
| C2-E | `apps/web/src/components/ReconciliationLedger.tsx`:756-762 | `07e736bb80b10e16b49e9e09b2aff9d3085a2a82` | Quick-hide |
| SN2-A | `apps/web/src/views/Settings.tsx`:101-109 | `fb144d734ef2e05825735e01aaeb3243d43085f7` | Release, Completion |
| SN2-B | `apps/web/src/views/Settings.tsx`:111-119 | `83a8148de6a30fe4e34a287af19d72e2a7dd05fc` | Quick-hide |
| SN2-C | `apps/web/src/AppShell.tsx`:421-436 | `8e2006a8309403f336efda82c1cc6eb6699f04c4` | Release, Completion |
| SN2-D | `apps/web/src/AppShell.tsx`:440-461 | `ae90814b2edb359cf1d72d0a728cfb619870933f` | Quick-hide |
| SN2-E | `apps/web/src/lib/settings.ts`:185-204 | `5d73dc4b122d8d418f3f912d3b7008d1a11ef4d4` | Release, Completion |
| SN2-F | `apps/web/src/lib/settings.ts`:227-251 | `666aff245eac46a61633b74257bc65c39fb6093e` | Quick-hide |
| SN2-G | `apps/web/src/views/Scan.tsx`:92-98, 166-175, 434-467 | `d92f0f2df98b2452a9285c5d4e4687d4096a0834` | Release, Completion |
| SN2-H | `apps/web/src/views/Scan.tsx`:93-99, 167-176, 435-468 | `ad2bc9f8ef82de6151b8d769ad468d0761a9026e` | Quick-hide |
| SN2-I | `apps/web/src/lib/defaultServices.ts`:113-119 | `2487789e2b88f73bceaf5ac5dc464a531e659dcb` | Release, Completion, Quick-hide |
| SN2-J | `apps/web/src/lib/defaultServices.ts`:40-46 | `49158fb4ffec9b1d1eb55bcce21f081dbc9c8d4d` | Current main, Unique-code, Recovered-fixes, Tor |
| SN2-K | `apps/web/src/views/Scan.tsx`:212-224 | `eed9daf882711659720a577138b3e08554ce9fe9` | Current main, Unique-code, Recovered-fixes, Tor |
| SN1-A | `apps/web/src/lib/scanSpam.ts`:170-196 | `0cf63cb855bb80e1dcf1e2b9f511c8758b124558` | Current main, Tor |
| SN1-B | `apps/web/src/lib/scanSpam.ts`:170-196 | `da35b619ad1aa7efa8607e0ab9ce8278b585bd61` | Release, Completion, Quick-hide, Unique-code, Recovered-fixes |
| P1-A | `apps/web/src/lib/wallet.ts`:478-503 | `fb1d864f3223ce007e35d81c19a308df88657121` | Current main, Release, Quick-hide, Unique-code, Tor |
| P1-B | `apps/web/src/lib/wallet.ts`:483-513 | `800cfa90810b887898d4184ff3f5ccfb2601c971` | Completion, Recovered-fixes |
| P2-A | `apps/web/src/lib/txGuard.ts`:111-128 | `abba792709126a191cbd589f2023351a7b9e1c66` | Current main, Release, Completion, Quick-hide, Unique-code, Tor |
| P2-B | `apps/web/src/lib/txGuard.ts`:111-135 | `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23` | Recovered-fixes |
| P3-A | `apps/web/src/views/Sweep.tsx`:80-86, 138-157, 190-209, 241-264, 355 | `75ea26cfa62a08cbfe001d6ac02c68c6bc210566` | Current main, Unique-code, Recovered-fixes, Tor |
| P3-B | `apps/web/src/lib/sweep.ts`:562-573, 645-664 | `ef73a7ec629cf33da5dba4fa8b3d9f80913bbb1a` | Current main, Unique-code, Recovered-fixes, Tor |
| P3-C | `apps/web/src/views/Sweep.tsx`:134-161, 298-329, 405-469 | `6da18522b825c99b4073fd238174f63a8a2b7b38` | Release, Completion, Quick-hide |
| P3-D | `apps/web/src/lib/sweep.ts`:955-980 | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` | Release, Completion, Quick-hide |
| P4-A | `apps/web/src/components/CameraImporter.tsx`:121-143, 158-168 | `f592f573581511d7287608c3da068aae432f5738` | Current main, Unique-code, Tor |
| P4-B | `apps/web/src/components/CameraImporter.tsx`:121-145, 160-170 | `255e318fb120ef769687e0c2dfb38f2bceb9e7d9` | Release, Completion, Quick-hide, Recovered-fixes |
| P5-A | `apps/web/src/lib/format.ts`:16-24 | `18dad7e4235c922bb7f197312317cc86557a12c2` | Current main, Release, Completion, Quick-hide, Unique-code, Tor |
| P5-B | `apps/web/src/lib/format.ts`:16-25 | `9ba8ea7b418eab5cf18e900923572cf3e255aedd` | Recovered-fixes |
| PS1-A | `apps/web/src/components/WalletAttempts.tsx`:10-40 | `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563` | Quick-hide |
| PS1-B | `apps/web/src/views/Pay.tsx`:1059, 1127 | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | Release, Completion, Quick-hide |
| PS1-C | `apps/web/src/features/registry/RegistryView.tsx`:272 | `5ca89f54457128b887eb9107fc4eac66ce8c0530` | Release, Completion, Quick-hide |
| PS1-D | `apps/web/src/features/policy/PolicyPay.tsx`:129 | `2c29b545732754997b4ac0c3fb93096f125ee511` | Release, Completion, Quick-hide |
| PS1-E | `apps/web/src/components/WalletAttempts.tsx`:8-34 | `70ba12b8ae8d07460266c07f4dbd25e6126bfb80` | Current main, Release, Completion, Unique-code, Recovered-fixes, Tor |
| H1-A | `packages/qr-exchange/src/assembler.ts`:63-87 | `8e8d12e447265e682597edf2887e5a2f6afd55db` | Current main, Release, Quick-hide, Unique-code, Tor |
| H1-B | `packages/qr-exchange/src/assembler.ts`:63-88 | `144dd8ec67e8aaeffc5c3d90f6a06234d770abcd` | Completion, Recovered-fixes |
| H2-A | `packages/invoice-schema/src/json.ts`:191-205 | `b7a34bb5176ec72daf0026a59991863421bdb341` | Current main, Unique-code, Tor |
| H2-B | `packages/invoice-schema/src/json.ts`:192-218 | `8ed01592d487c356a72d51e240e5cc63fb470a3a` | Release, Completion, Quick-hide, Recovered-fixes |
| H3-A | `packages/invoice-schema/src/base64url.ts`:52-65 | `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb` | Current main, Unique-code, Tor |
| H3-B | `packages/invoice-schema/src/base64url.ts`:52-66 | `5466ee0b99925dedd23e753636ae7ab3f6f48234` | Release, Completion, Quick-hide, Recovered-fixes |
| H4-A | `packages/invoice-schema/src/merchantProfile.ts`:156-182 | `a75124bb35d2c319e6936097ef6b4048ac59ec76` | Current main, Unique-code, Tor |
| H4-B | `packages/invoice-schema/src/merchantProfile.ts`:156-184 | `a4269dec888518799aa4b3e8cc82d2ff9cc21d77` | Release, Completion, Quick-hide, Recovered-fixes |
| P6-A | `apps/web/src/lib/qrKinds.ts`:178-181, 232-236 | `eb60ac5a6a8e774333d12a53df4cb2c26ee5e7b9` | Current main, Tor |
| P6-B | `apps/web/src/lib/qrKinds.ts`:178-182, 233-240 | `68de6518783cc57bd7f3a66d0588d530e27d21b6` | Release, Quick-hide, Unique-code |
| P6-C | `apps/web/src/lib/qrKinds.ts`:178-182, 233-240 | `a85e1011cdface74c87683146ff7428654b7830d` | Completion, Recovered-fixes |
| P7-A | `apps/web/src/lib/qrMultipart.ts`:19-30 | `48032d32ea18fa660ac72c342263d741ceb7cc0d` | Current main, Tor |
| P7-B | `apps/web/src/lib/qrMultipart.ts`:19-32 | `d8c9a8cc2d6eb90f1a6a45fe463a6f8e7ab1abb3` | Release, Completion, Quick-hide, Unique-code, Recovered-fixes |

## Method and execution boundary

Read-only git source/diff and tree metadata inspection; targeted independent reading of relevant source ranges and complete narrow correction hunks; identical whole blobs share findings. Existing full-file review coverage is supplied by unified-coverage.json.

No application source, target tests, analyzers, scanners, browser, payloads, live endpoints, or transactions were executed. No target source or repository documents were changed.

This matrix contributes exact-snippet applicability revalidation, not additional whole-file coverage or runtime testing.

Other findings in the source review files are outside this focused 16-row matrix; their omission here is not a disposition or severity change.
