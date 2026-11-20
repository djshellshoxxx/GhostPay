> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# E2E source review — round 6

## Outcome

Reviewed **43 of 61 immutable path/blob variants (14,131 of 15,439 source lines)**. The remaining **18 variants / 1,308 lines** are listed exactly below and in the JSON companion. This worker stopped at a completed-file boundary before compaction.

**No new application security defect was established.** One test-harness fidelity defect, two qualification gaps, and one corrected historical fixture defect are recorded separately. Source assertions were inspected; no test result is claimed.

Pinned main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. Assignment SHA-256: `fb2405add1c46871b9288e567b6c5eae7e020b27d579210d966f1fd7802bfdb4`.

All 61 assignment SHA:path, blob and line-count entries were verified through immutable Git object reads. No target code, tests, build, server, RPC, probe, PoC, transaction or network operation ran. No repository file or Git state was changed.

## Confirmed test-harness defect

### E2E-Q01 — Non-Pages devnet RPC proxy always returns HTTP 200

Severity: low; scope: test-support fidelity; present at both pinned main and candidate. This is not classified as an application vulnerability.

The generic devnet post helper resolves only response-body text and discards the upstream HTTP status. DevnetNetwork.forward then fulfills every completed upstream response with status 200. A non-2xx response therefore reaches the application with a different transport status in this harness. PagesNetwork carries status and body and has a test asserting propagation of an upstream failure status.

The generic devnet journeys cannot establish HTTP-status handling fidelity for the deployed application. This is a test-harness defect, not evidence that the application mishandles production HTTP errors.

Evidence: `apps/web/e2e/devnet/chain.ts`, blob `6e5b1b352349a6f3f1bab8ff971e23b62388e7cb`, lines 48–58 and 125–131. The separate status-preserving path is `apps/web/e2e/devnet/pages.ts`, blob `8a0f66d2a53db85cbb47638d16e2b46cd98f0ecb`, lines 24–34 and 121–127; its acceptance test is `apps/web/e2e/pages-devnet.spec.ts`, blob `90b905165b9b6457585635022bc9e64dab674521`, lines 135–165.

Use a shared status-preserving response representation for both devnet proxy helpers and retain a focused transport-fidelity assertion.

## Qualification gaps

### E2E-G01 — Pages qualification explicitly excludes a successful real-chain ERC-20 payment path

The Pages c2 test expressly asserts that the local deployment tokens are absent from the compiled token choices and the allowlisted token addresses have no code on that chain. Its real-chain checkout journey uses the native asset. Separate ERC-20 scan/sweep tests rely on authored RPC fixtures.

A successful Pages/devnet run of these tests would provide native-asset journey evidence; it would not qualify successful ERC-20 checkout, approval/permit, or real token-transfer behavior through the same browser artifact.

Track native and ERC-20 qualification separately, and add independently reviewable local real-chain ERC-20 acceptance evidence using a fixture deployment aligned with the compiled token configuration. No execution was performed in this review.

Evidence: `apps/web/e2e/pages-devnet.spec.ts` at blob `90b905165b9b6457585635022bc9e64dab674521`, lines 427–445.

Evidence: `apps/web/e2e/devnet-journey.spec.ts` at blob `639a3fa4e4bfb6a051fdc0cd583cfde63777e520`, lines 71–131.

Evidence: `apps/web/e2e/sweep.spec.ts` at blob `1947eb0399a1f16eddfa595a6ea7a9a7fd16f9ed`, lines 53–102.

### E2E-G02 — Export leak guard samples persistent storage at the end of the journey

recordLeaks records request/console/error/download events as they occur, but its URL/history/storage/IndexedDB/cache inspection is performed by snapshot(). The secret-leak scenario calls that snapshot once after completing multiple export and recovery actions.

The assertions establish absence of the selected synthetic secret markers at that sampled state. They do not establish that no transient plaintext storage write occurred and was removed earlier. No transient write or application leakage was established by this source review.

If continuous absence is part of the intended acceptance claim, observe sensitive storage writes using synthetic fixture markers or add checks at the individual credential/export transitions. Keep the reported evidence limited to the channels and moments actually inspected.

Evidence: `apps/web/e2e/stealthExportFixtures.ts` at blob `97044edcd17c4ead4f16b6e5a852a85480121987`, lines 264–339.

Evidence: `apps/web/e2e/stealth-export.spec.ts` at blob `7914f00fd505121edb5271e7040603b2dc2a847a`, lines 359–416.

## Historical fixture observation

E2E-H01: the older network-authorization blob `e072d3cbf199ea53c9f8bd26bd43ed390153b2e3` returned quantity-shaped values for ERC-20 balance calls. The candidate blob `19055300a98c8c9d9099baf02cc50246696b6e7b` corrects both values to ABI-encoded uint256 results (lines 279–298). This is not an open candidate defect; no test was run.

## Assertion coverage inspected

- **Chained core journey.** Source asserts prior-stage product outputs across invoice, payment, scanner, bound receipt, sweep, backup and independent restore; separate cases exercise expiry, same-key session replacement, reorg withdrawal and unknown/late outcomes. Assertions are unexecuted.
- **Network authorization.** Source observes dispatched HTTP(S) browser requests and includes persisted-policy refusal, cancellation, renewed grant replacement, second-tab endpoint changes, explicit balance-read consent and own-node refusal.
- **Signer trust.** Source separates selected named pins from other named/legacy pins, invalidates stale confirmation across tabs, exercises offline verification and passphrase-policy recheck, and removes trusted review after idle lock.
- **Export and sweep authority.** Source checks credential gates, exact saved-file recovery, secret marker absence in observed channels, discarded in-flight exports after lock/wipe, durable pre-broadcast journal state and duplicate-sweep refusal through reload.
- **Existing wallet clear coverage.** The flows suite already contains a late-wallet-hash and explicit confirmed-clear scenario. It was read and was not reported as missing coverage. Predecessor-owned BROWSER-01, PN-01 through PN-05 and SN-K01 were not duplicated.

Complete coverage entries include exact path, blob, SHA, line count, full reviewed range and method in the JSON companion. For changed variants, the counterpart and the complete added/deleted diff are recorded. All counted source output was complete. The initial verbose assignment display was repaired by an exhaustive compact row read and object validation; an unrelated truncated reviewer-ledger print was not counted.

## Exact remaining source

Each remaining row is unchanged from the original assignment, has no reviewed source range, and belongs to SHA `87cf6c603338ad64ec02300fe42b96c3e0a205b9`. These are the only outstanding rows for this assignment.

| Index | Path | Blob | Lines |
|---:|---|---|---:|
| 0 | `apps/web/e2e/accessibility-audit.ts` | `75433aa655dd355fe6bfb45beddacaa278bf04f3` | 59 |
| 1 | `apps/web/e2e/accessibility.spec.ts` | `72f569249469b17bc998c2dd97e905e85dd178d7` | 137 |
| 3 | `apps/web/e2e/camera-browser.ts` | `56cc23161c34dc3c4be0864677e5e1eb7818fefb` | 29 |
| 4 | `apps/web/e2e/contextual-help.spec.ts` | `849cb60756ecb75c148feac0018b183ae9431b44` | 135 |
| 6 | `apps/web/e2e/devices.spec.ts` | `cdfc3fdf6b02233b9c7d67c987f4ba6a6b0be76b` | 52 |
| 18 | `apps/web/e2e/passphrase-vault.spec.ts` | `b6402185bde44ff518a31afcfdaada6382167096` | 65 |
| 19 | `apps/web/e2e/prepare-manifest.d.mts` | `41bcb7ba40f229e1220da1002ccd8d741ceff84b` | 10 |
| 20 | `apps/web/e2e/prepare-manifest.mjs` | `fe0bf91fd0da467c88d8053a08c061499aa3bc95` | 42 |
| 21 | `apps/web/e2e/product-backup-retry.spec.ts` | `b57cf8b38ad991c45c51226bba87bd61dfded8bc` | 34 |
| 22 | `apps/web/e2e/qr-camera-multipart.spec.ts` | `34286ecda0ec4ca376baf5900652c997e7786b0d` | 45 |
| 23 | `apps/web/e2e/qr-camera.spec.ts` | `8c8b940002179e448bdba20b260c55d11837769b` | 72 |
| 24 | `apps/web/e2e/qr-video.d.mts` | `9123033fb25bebec7eaf984a524771a9c57a3750` | 3 |
| 25 | `apps/web/e2e/qr-video.mjs` | `1fbde954b3ff32c023958255bbee77e3a60fb57a` | 66 |
| 26 | `apps/web/e2e/receipt-lean.spec.ts` | `6a866d34f24e6ae323164cda736d2541bf936c40` | 38 |
| 27 | `apps/web/e2e/reconciliation.spec.ts` | `44f5517f2929db43295211a654c7c6f633387df6` | 96 |
| 28 | `apps/web/e2e/recovery.spec.ts` | `4f839e2b7c3b2608742e51842097c6fa56938083` | 316 |
| 29 | `apps/web/e2e/sellerpairing.spec.ts` | `a97fad1a362556d88c5826ba37b55f6449017d77` | 63 |
| 30 | `apps/web/e2e/static-help.spec.ts` | `1d0b950296a48f70b5a61fd110ffdcf9696cc95c` | 46 |

The JSON companion retains the full original reference lists for these remaining rows. The next fresh reviewer should read complete immutable source for them. Previously owned BROWSER-01, PN-01 through PN-05 and SN-K01 were not duplicated. Existing Pay clear/retry coverage remains acknowledged; runtime validation is unperformed.
