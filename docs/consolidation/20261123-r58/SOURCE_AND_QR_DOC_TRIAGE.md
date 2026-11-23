# GhostPay R58 — source-pinned integration and QR historical-document triage

Checked 2026-11-23 UTC against **current** main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Historical QR donor: `repair/ghostpay-qr-surrogates-20261119` at `ac7b7a11f00896d105fa7a06e44e218046bdc56c`. This is a preservation/qualification record, **not** a claim of published behavior or an authorization to restore historical release instructions into current user docs.

## Newly verified production-main integration (not performed by this worker)

GitHub merge commit `8ddb344973e80b8e1eda6821e970ee6a2b808b29` has parents `eb59d93cffed7848c4aac37d0e9650b87239c6da` and `d0814403c69e1cc18960a0ce2df75c1c49e96e44`, integrating the receipt boundary fixes in linear stack #449 → #450 → #452. Immutable compare HEADs against **new main**:

| Source PR / branch head | compare main...head | outcome |
| --- | --- | --- |
| #449 `ff8c800a495f1cc4d2df704d321b3d22e6f67a78` | behind 9, ahead 0, merge-base equals source | merged PR #449; ancestry in main |
| #450 `5aa0194f1a27ab3d6ba96a28e62fe604d8d8451d` | behind 5, ahead 0, merge-base equals source | ancestry in main **but PR remains open**, do not claim it merged |
| #452 `d0814403c69e1cc18960a0ce2df75c1c49e96e44` | behind 1, ahead 0, merge-base equals source | merged PR #452; ancestry in main |

This is **three newly source-proven, fully main-integrated branch histories**, not three PRs merged during this worker execution. Follow-up for #450's owner: reconcile the still-open stacked PR after the protected-main adoption, without closing it on another owner's behalf. New main workflow runs 45126815282, 45126815201, 45126814661 reported success for that SHA; **not** a claim about other unmerged security, browser or payment-safety PRs.

## Integration lock source

The former metadata ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` (generation 11, held) and current metadata ref `082e754f44944ebb4be283f89176b966bf8f7b4f` (generation 12, released) each have a **complete, untruncated one-file Git tree** containing only `integration-lock.json`, blob SHA `97523a9ce00231ac883b32178ab48a547eb0dd8f` versus `5004209200c97ae989d721c9ee6a8266aeed2329`. No executable source or tests changed on this coordination branch. A released lock **does not supply independent approval** or branch-protection permissions. Branch-protection REST read still returned 403.

## QR-surrogate historical donor — twelve previously unmatched documentation paths

The R57 [uncapped code/test investigation](../20261123-r57/QR_SURROGATE_DONOR_TRIAGE.md) checked all 4,675 donor blobs, including 19 initially unmatched executable paths, against main and precise owner heads. Seventeen additional executable blobs have exact matches in #264/#269/#270, and the final two sweep/test differences are stricter in owner-held #372. No **known unmatched executable feature** warrants overwriting current code. The twelve remaining docs were inspected directly at immutable donor SHA in this round, compared with current main paths and with complete untruncated Git trees for #264/#269/#270/#278/#290/#307/#310/#367/#372. Their historical words are **not** byte-identical to the current same-path owner docs; preserve provenance rather than pretending they were merged.

| Historical path | Donor Git blob | Current main status | Disposition / preservation |
| --- | --- | --- | --- |
| `docs/release/BRANCH_CONSOLIDATION.md` | `dd5e590cb3d82a698718f993e5cc2ab0888d2f94` | absent | historical branch/SHA mapping at 2026-11-19; source snapshot, not present-day ownership |
| `docs/release/DEPLOYMENT_READINESS.md` | `d6684b7bc159fc1da87443548a1b0fb7b6694b1f` | absent | payments-disabled demo and signed testnet activation prerequisites, **blocked** |
| `docs/release/FEATURE_MATRIX.md` | `62a52da88e99e4389b407e8d363de7456621ede5` | absent | historical feature boundaries, **0/12 final-browser E2E** at that cutoff |
| `docs/release/FINAL_HANDOFF.md` | `e0ad4bf4345cfa01b8c8f4dca085570fd15427cb` | absent | historical release checkpoint, **not completed release** |
| `docs/release/RELEASE_BLOCKERS.md` | `c458ee16d4a318fd42f1554d74d09b3656983069` | absent | qualified native fee review, exact-source Mythril/CodeQL and external review still open **then** |
| `docs/release/RELEASE_NOTES.md` | `7a09c8bccb3949776ea771c728b62f6e6f47571e` | absent | **unpublished** draft; not evidence that beta was released |
| `docs/release/SECURITY_AUDIT.md` | `776be0af5376a6f7b9c279c2e9919c6a4f9c85ff` | absent | old regression and risk receipts; prior 490 Foundry tests do **not** clear symbolic-analysis or current-release gates |
| `docs/release/TEST_RESULTS.md` | `57258da9bdf806d55cfed212e84177ee79368a90` | absent | old source-pinned test/CI and browser-launch failure receipts; **not** a current exact-head pass |
| `docs/release/PUBLICATION_MAP.json` | `4f6566be6865807eacf1c1709dba79d55dbc9065` | absent | historic local→remote commit/tree/parent map; source identity, not release publication |
| `docs/pages/README.md` | `ab332f3533e821ae90990b937e7171bdf4713d09` | `79b900217a29c946a768327d9867981308cf5c81` | newer donor caveats about RPC/own-node/CSP, review expiration, native gas preview, origin/build attestations, and browser embedding; current-main and owner docs not byte-identical |
| `docs/user/sweep-and-gas-privacy.md` | `200b97ae356f8970edea9e3db10633b60f2c0102` | `922fa6f745b68b8f998ff07ae39a02713fa27aa4` | newer donor text on explicit balance consent, 60s fee review, uncertain broadcast, destination-history limits and privacy; current-main doc not identical |
| `docs/ai/ACTIVE_WORK.md` | `ff5fe8fcc5fdf33ca53522e3a10c79a658c73d98` | `f2a757cbaebd758cc2af1f21e24bd83f42ab499a` | stale worker leases; **do not** restore over current claims |

The nine `docs/release/` files are *not* in new main; PRs #278/#290/#372 retain versions of those paths with **different SHA**, so there is no byte-equivalence claim. Their historical facts and original blobs remain recoverable through the immutable donor ref and the above Git hashes. They are archival release-gate evidence, not qualified feature implementation. In particular the donor's fee review, scanner/network constraints and test results require fresh verification on the eventual merge candidate.

## Safety statements requiring current-source reconciliation before promotion

1. Source-pinned historical documentation requires a dedicated-origin, payments-disabled Pages demonstration by default; signed testnet manifests, testnet deployment, exact artifact verification and independent review are separate gates. Do not imply that historical unpublished beta notes are live release notes.
2. Native sweep review should bind user consent to destination, amount/balance, nonce, gas limit and fee caps, reserve and transaction replacement. The historical donor describes a 60-second review and renewed consent on changed facts, but **this is an obligation to verify on current code**, not an assertion of current success.
3. Preserve session-only destination history limits; false negatives across tabs/devices and chain-observable links remain privacy risks. A successful local unit suite cannot prove Tor routing, CSP, browser acceptance or real-wallet readiness.
4. The donor distinguishes a recorded **uncertain broadcast** from a failed payment and requires reconciliation before attempting another send. Dedicated P0 wallet-journal PR #500 now owns this area and remains draft; **do not duplicate or edit its source**.
5. Original `ACTIVE_WORK.md` is historical evidence of workers, not a live lease. Do not replace the current main registry or current PR ownership.

**Disposition:** the QR donor remains **unresolved** because the historical user-facing Pages/Sweep wording and archival release gate evidence have now been identified but not independently reviewed or qualified for the current beta. This document preserves the material obligations and source hashes without silently declaring them integrated. Follow up with a scoped docs owner or demonstrate current-source supersession, then finalize once all remaining useful differences have an accountable disposition. Do not merge the historical release snapshot wholesale.

## Snapshot limitations

This investigation performed authenticated GitHub source/tree review. No fresh local Node, TypeScript, web browser, Tor, Foundry, real-wallet or real-funds tests were executed. Local Git clone still fails DNS resolution; no deployment, release or protected-branch merge was attempted.
