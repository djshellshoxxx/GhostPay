> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# E2E remaining source review — round 7

## Outcome

**Completed all 18 remaining immutable path/blob variants: 1,308 of 1,308 source lines. No remaining entries.** Combined with round 6, the original E2E assignment is fully covered: **61 variants / 15,439 lines**, with no overlap or missing assignment row.

**No new application security defect or confirmed test-harness defect was established.** One additional test qualification gap, E2E-G03, is recorded separately below. Existing BROWSER-01, PN-01–PN-05, SN-K01 and round-6 E2E-Q01/G01/G02/H01 are not duplicated.

All 18 assigned variants use source SHA `87cf6c603338ad64ec02300fe42b96c3e0a205b9`. Every `SHA:path` resolution, blob identifier, source line count and original assignment index was validated. Each of these blobs is also identical at pinned main `c977b5d6723f6822c3b5d86cd6b231712c53c395` and candidate `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

Predecessor ledger SHA-256: `113b0d7780aa303ee715a872b6d25d51c8d6e7fcd6bc755ff433d8513793539a`. Original assignment SHA-256: `fb2405add1c46871b9288e567b6c5eae7e020b27d579210d966f1fd7802bfdb4`.

Only immutable Git reads and scratch audit notes were used. No target code, tests, build, installation, server, browser, probe, RPC, transaction or PoC was executed. No repository file or Git state was changed. Source assertions described here are unexecuted.

## New qualification gap

### E2E-G03 — Camera lifecycle assertions lose visibility when video elements are removed

**Classification:** test qualification gap, high confidence from source; present in the same test blobs at both pinned main and candidate. This is not a production vulnerability finding.

The single-camera liveTracks observer enumerates document.querySelectorAll(video) and counts only live tracks on those current elements' srcObject streams. The multipart test uses the same current-DOM strategy. Zero live tracks is therefore also returned when the relevant video is removed or its srcObject is cleared; the assertions retain no reference to previously acquired streams. The navigation, stop and completion assertions cannot independently establish that all earlier capture tracks reached ended.

These assertions establish that no live track remains reachable through the currently queried video elements. They do not fully qualify capture teardown after navigation or preview completion. A future regression that detaches a video while retaining a live stream could escape this particular observation. No actual application camera leak, failed stop operation, unauthorized capture or production vulnerability was established.

**Defensive remediation:** In the test harness, retain observational references to streams returned by the real mediaDevices.getUserMedia call, establish successful acquisition on the successful path, and assert that every acquired video track reaches ended after explicit stop, route teardown and successful completion. Preserve the separate explicit-click and denied-permission checks.

**Evidence:**

- [apps/web/e2e/qr-camera.spec.ts, lines 23–27](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/qr-camera.spec.ts#L23-L27), blob `8c8b940002179e448bdba20b260c55d11837769b`.
- [apps/web/e2e/qr-camera.spec.ts, lines 33–54](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/qr-camera.spec.ts#L33-L54), blob `8c8b940002179e448bdba20b260c55d11837769b`.
- [apps/web/e2e/qr-camera-multipart.spec.ts, lines 35–43](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/e2e/qr-camera-multipart.spec.ts#L35-L43), blob `34286ecda0ec4ca376baf5900652c997e7786b0d`.

No camera operation was executed and no actual detached live stream was observed.

## Positive source evidence and its limits

### Accessibility and responsive layout

The audit requires axe to be injected and to evaluate at least one passing rule, blocks serious/critical violations, and retains rule metadata without DOM/HTML/invoice payloads. Route tests assert keyboard focus, malformed-input refusal, 320-CSS-pixel reflow with enlarged text, forced colors and reduced motion. Native assistive-technology review is explicitly unresolved. Device checks confirm the configured viewport/mobile flag and route-specific headings; their comments limit evidence to Chromium emulation.

Source: `apps/web/e2e/accessibility-audit.ts` 22–59; `apps/web/e2e/accessibility.spec.ts` 9–137; `apps/web/e2e/devices.spec.ts` 4–52.

### Contextual and static help

Source covers keyboard dismissal/focus return, QR dialog focus confinement, unchanged QR geometry under RTL, pointer/touch click delivery below expanding help, local help assets at three widths, skip navigation and JavaScript-disabled help access. The help-click tests deliberately intercept form submission to observe activation; they do not qualify decryption in those cases.

Source: `apps/web/e2e/contextual-help.spec.ts` 20–135; `apps/web/e2e/static-help.spec.ts` 6–46.

### Passphrase invoice and saved vault gates

The invoice case asserts that protected item/memo text is absent before unlock and after a wrong passphrase, then appears after the correct phrase. The saved-vault case wipes memory, reloads, rejects the wrong phrase, restores the same public identity on successful unlock and checks passphrase clearing.

Source: `apps/web/e2e/passphrase-vault.spec.ts` 4–65.

### Restricted manifest fixture preparation

The helper checks three authored fake deployment addresses, uses explicitly public deterministic test material, verifies the resulting signature through the deployment parser, writes a fresh temporary fixture with exclusive creation and mode 0600, removes the temporary directory on write failure and clears the temporary key array. Its declared interface returns only the directory and public key.

Source: `apps/web/e2e/prepare-manifest.mjs` 12–41; `apps/web/e2e/prepare-manifest.d.mts` 1–10.

### QR preview and virtual-camera boundary

Single-code source asserts explicit click before scanning, untrusted public-config preview without key installation, permission-denial messaging and paste fallback. Multipart source assembles an app-created invoice and requires explicit Open scanned invoice before ordinary review, with a non-local request assertion. The video generator and launcher supply authored local frames; comments explicitly exclude physical-device acceptance. Track-teardown qualification is limited by E2E-G03.

Source: `apps/web/e2e/qr-camera.spec.ts` 30–72; `apps/web/e2e/qr-camera-multipart.spec.ts` 12–45; `apps/web/e2e/camera-browser.ts` 14–29; `apps/web/e2e/qr-video.mjs` 1–66; `apps/web/e2e/qr-video.d.mts` 1–3.

### Backup retry and lean receipt policy

The full-profile tag-archive regression reuses the original downloaded archive twice without reloading and checks that the file input resets and the apply step disappears. Its authored archive is empty. The receipt test checks the validated-invoice input in both profiles, absence of manual digest mode and refusal to sign without a validated invoice in lean, and the explicit manual-mode explanation in full.

Source: `apps/web/e2e/product-backup-retry.spec.ts` 7–34; `apps/web/e2e/receipt-lean.spec.ts` 8–38.

### Encrypted reconciliation and preview invalidation

Source preserves the invoice digest and observation meaning across language changes, checks that the encrypted export lacks the plaintext digest, suppresses a diagnostic marker from errors, invalidates an import preview when the same file is picked again, clears preview/input on lock and removes ledger availability after reload loses memory-only keys.

Source: `apps/web/e2e/reconciliation.spec.ts` 12–96.

### Independent-context recovery and occupied vault preservation

The recovery observer aborts attempted IndexedDB upgrades and uses a readonly transaction. Tests assert encrypted envelope metadata, exact public identity after import, memory-only import before explicit save, re-encryption under a new phrase, wrong-phrase refusal without ciphertext changes, damaged/malformed backup refusal, and preservation of an occupied destination vault through import/reload. The independent environments are browser contexts in the supplied browser; this source alone does not establish separate browser-engine acceptance. Web-storage secret checks are sampled assertions, not continuous monitoring.

Source: `apps/web/e2e/recovery.spec.ts` 25–113, 180–316.

### Public seller pairing remains an untrusted preview

Source rejects an unsupported config version, previews a config from a separate context without loading keys, repeats the same file after clear, and verifies that a reload clears preview/memory-only identity while a subsequent public-config preview still loads no keys. The export check searches for selected secret-related field labels; it is not characterized as a proof of absence of all possible secret encodings.

Source: `apps/web/e2e/sellerpairing.spec.ts` 5–63.

## Exact completed coverage

All rows were read in full directly from immutable Git blobs. Each range is 1 through the recorded line count; no diff inheritance was needed. Exact SHA, path, blob, line count, status, method and ranges are recorded per row in the JSON companion.

| Original index | Path | Blob | Reviewed lines | Status |
|---:|---|---|---:|---|
| 0 | `apps/web/e2e/accessibility-audit.ts` | `75433aa655dd355fe6bfb45beddacaa278bf04f3` | 1–59 | reviewed |
| 1 | `apps/web/e2e/accessibility.spec.ts` | `72f569249469b17bc998c2dd97e905e85dd178d7` | 1–137 | reviewed |
| 3 | `apps/web/e2e/camera-browser.ts` | `56cc23161c34dc3c4be0864677e5e1eb7818fefb` | 1–29 | reviewed |
| 4 | `apps/web/e2e/contextual-help.spec.ts` | `849cb60756ecb75c148feac0018b183ae9431b44` | 1–135 | reviewed |
| 6 | `apps/web/e2e/devices.spec.ts` | `cdfc3fdf6b02233b9c7d67c987f4ba6a6b0be76b` | 1–52 | reviewed |
| 18 | `apps/web/e2e/passphrase-vault.spec.ts` | `b6402185bde44ff518a31afcfdaada6382167096` | 1–65 | reviewed |
| 19 | `apps/web/e2e/prepare-manifest.d.mts` | `41bcb7ba40f229e1220da1002ccd8d741ceff84b` | 1–10 | reviewed |
| 20 | `apps/web/e2e/prepare-manifest.mjs` | `fe0bf91fd0da467c88d8053a08c061499aa3bc95` | 1–42 | reviewed |
| 21 | `apps/web/e2e/product-backup-retry.spec.ts` | `b57cf8b38ad991c45c51226bba87bd61dfded8bc` | 1–34 | reviewed |
| 22 | `apps/web/e2e/qr-camera-multipart.spec.ts` | `34286ecda0ec4ca376baf5900652c997e7786b0d` | 1–45 | reviewed |
| 23 | `apps/web/e2e/qr-camera.spec.ts` | `8c8b940002179e448bdba20b260c55d11837769b` | 1–72 | reviewed |
| 24 | `apps/web/e2e/qr-video.d.mts` | `9123033fb25bebec7eaf984a524771a9c57a3750` | 1–3 | reviewed |
| 25 | `apps/web/e2e/qr-video.mjs` | `1fbde954b3ff32c023958255bbee77e3a60fb57a` | 1–66 | reviewed |
| 26 | `apps/web/e2e/receipt-lean.spec.ts` | `6a866d34f24e6ae323164cda736d2541bf936c40` | 1–38 | reviewed |
| 27 | `apps/web/e2e/reconciliation.spec.ts` | `44f5517f2929db43295211a654c7c6f633387df6` | 1–96 | reviewed |
| 28 | `apps/web/e2e/recovery.spec.ts` | `4f839e2b7c3b2608742e51842097c6fa56938083` | 1–316 | reviewed |
| 29 | `apps/web/e2e/sellerpairing.spec.ts` | `a97fad1a362556d88c5826ba37b55f6449017d77` | 1–63 | reviewed |
| 30 | `apps/web/e2e/static-help.spec.ts` | `1d0b950296a48f70b5a61fd110ffdcf9696cc95c` | 1–46 | reviewed |

## Read completeness and reconciliation

All assigned source was read directly from immutable Git blobs with line numbers in three complete batches (remaining indices 0-4, 5-14, 15-17). No source output in those batches was truncated. Initial verbose predecessor-ledger output was truncated; exact remaining metadata, substantive predecessor findings/gaps and the complete predecessor Markdown were subsequently re-read in compact complete output. No truncated output was used as source coverage.

The round-6 reviewed set and this remainder are disjoint; their union exactly equals all original 61 assignment entries, including the SHA/path/blob/line-count tuple. The source ledger and original assignment were left unchanged. The final JSON contains an empty `remaining` array.
