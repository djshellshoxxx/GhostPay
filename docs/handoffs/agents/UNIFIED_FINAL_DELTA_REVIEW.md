# Unified final delta review

Reviewer: independent `final_review2`, 2026-11-16. Documentation branch `codex/unified-final-delta-review`, base `191bbce3c30d94b8f48f767b7ab77ec739e62b9a`. Product sources were read in coordinator and isolated author worktrees. This review changes no product source and preserves the separate evidence in [UNIFIED_FINAL_REVIEW.md](UNIFIED_FINAL_REVIEW.md).

## Scope and current result

This review covers only the final delegated registry signing, escrow supporting model, worker transport/CI repair, browser repairs, and critical Bitcoin source disclosures. It does not reopen unchanged prior implementations or certify a release, deployed runtime, independent external audit, native translations, physical devices, or final hosted CI.

## Source pins and disposition

| Delta | Source | Result |
| --- | --- | --- |
| Required worker transport and native CI compiler | `91ef6b988eab533ff2204b33f00e107bda6569e6`, integrated as `d8bd86ef` | Source cleared; independent workflow 5/5 and privacy/worker/bridge 51/51 passed |
| Bitcoin oracle critical-message integration | `6797fdeed8cd95630a2859962fbf547b8b287fc9` | Source cleared; independent critical-key tests 12/12 passed |
| Delegated registry signing and ERC-1271 acceptance | `7b4c06b2247299455e867ba241011853459811fd`, test follow-ups `4cfe30a762c3311c356bac43eb6ed4bbd724354a` and `ba7deab24afa58ab34064984cb21ff5fb4767589` | Source cleared; independent helper 53/53 and native 9/9 passed (native execution at `4cfe30a7`) |
| Isolated escrow supporting model | `307f900823944f7de59597ba5be550e657c4c5ae` | Source cleared within its design-only scope; independent 19/19 passed |
| Browser focus and invoice fixture; pairing regression diagnostics | `9642e75a11bcc49d1f782e58c5141da2c037c58e` | Source cleared for focus/fixture changes; independent DOM tests 34/34 passed; hosted pairing failure remains unqualified |

## Worker transport and native compiler

`scanForPaymentsInWorker` now requires its `EsploraFetch` argument and rejects a missing non-function transport before creating a Worker. The existing production `BtcView` already passes `services.fetchFn`. This removes the unexpected global network fallback rather than expanding the audited-fetch allowlist. New oracle calls use the same injected bridge transport on the integrated source. The four isolated error-path tests now provide their fixture transport explicitly; their original lifecycle/error assertions remain.

The existing native rest-workspace branch already executes the pinned Solidity 0.8.28 Foundry build. CI now checks the resulting executable compiler and passes `SOLC_BIN` alongside `ANVIL_BIN` and `REQUIRE_ANVIL=1`. Missing compiler execution fails before tests rather than silently skipping native tests. The regression executes the workflow's real shell step against a disposable fake npm/forge fixture, including the missing-compiler failure path.

Independent commands at the author source:

- `node --test scripts/tests/workflows.test.mjs`: **5/5 passed**, zero skips.
- From `apps/web`, `NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/vitest run src/privacyInvariants.test.ts src/features/btc/scanWorker.test.ts src/features/btc/scanWorkerSource.test.ts --maxWorkers=1 --no-file-parallelism --coverage.enabled=false`: **51/51 passed**, three files.

These validate the small repair and fixture behavior, not a completed hosted rerun. Actual compiler download/native quote execution is author evidence; the coordinator owns the final combined CI run.

## Bitcoin source disclosures

All 16 new `btc.oracle.*` messages are explicitly listed in `bitcoinOracleSources`; exhaustive classification and required-key tests cover the additions. English text is copied into the three draft catalogs without changing their machine-draft status or the empty reviewed-locale registry. The updated availability message was already critical. The unchanged translator uses bundled English for unreviewed critical messages.

Disclosures preserve the limitations in the prior source review: block-download bandwidth is unchanged in full mode; light proof binds only exact output/transaction inclusion under checked headers, not witness/input/full consensus/payment completeness; matched transaction requests disclose transaction IDs; spent status remains server-reported; different URLs do not establish independent operators. This closes the prior source review's catalog/classification prerequisite at the source level. Native-language review remains pending.

Independent execution of `src/i18n/securityKeys.test.ts` at the coordinator's integrated locale source passed **12/12** with one worker and coverage disabled.

## Delegated registry signing

`buildRegistryDelegationRequest` uses the canonical checked-in ERC-6538 domain (`ERC6538Registry`, version `1.0`, selected chain, canonical registry), exact ordered `Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)` structure and scheme-1 key encoding. It does not add a nonstandard registrant field. Account binding is left to EOA recovery or the selected contract wallet. Chain IDs are positive safe integers, nonces are uint256 bigints, registrants cannot be zero, and existing strict meta-address validation remains.

Every typed-data object, nested field/type array and returned request is frozen. `signRegistryDelegation` snapshots both callback functions and the validated input before its first asynchronous boundary, bounds and normalizes opaque signature bytes, derives immutable calldata from that snapshot, and requires the injected verifier to return exactly true. Empty and non-65-byte contract-wallet signatures are preserved. Callback failure never returns an authorization.

The verifier's required duties are stated explicitly: verify deployment and chain identity, current nonce, selected registrant/signature, and actual registry simulation. Successful simulation alone cannot authenticate a request's chain/nonce metadata because those values are not supplied as calldata. Verification is point-in-time and does not reserve a nonce; confirmation, a fresh check and eventual broadcast belong to the caller. The helper owns no network client, private key or broadcast path, and delegation remains excluded from UI v1.

The native fixture deploys a test-only ERC-1271 wallet that approves an exact digest and opaque byte hash and can deliberately return wrong magic or revert. Tests demonstrate successful delegated registration, nonce consumption, replay rejection, invalidation and renewed authority with empty, 4-byte and 65-byte signatures. Domain and account negatives are tested separately from nonce freshness. An inaccurate wrong-chain test comment was corrected and strengthened with an actual wrong-chain signature against the correct-chain request; a final test-only follow-up adds an actual wrong-signer signature over the same request. No production defect was found in this delta.

Independent executions:

- `vitest run src/registryDelegation.test.ts --maxWorkers=1 --no-file-parallelism --coverage.enabled=false` from `packages/chain-adapters`: **53/53 passed** at `7b4c06b2`.
- `ANVIL_BIN=/tmp/ghostpay-analyzers/bin/anvil SOLC_BIN=/tmp/ghostpay-analyzers/bin/solc REQUIRE_ANVIL=1 NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/vitest run src/features/registry/registry.anvil.test.ts --maxWorkers=1 --no-file-parallelism --coverage.enabled=false` from `apps/web`: **9/9 passed**, zero skips, final independent execution at `4cfe30a7`.

The two-line `ba7deab2` test strengthening was source-reviewed; its execution is author evidence. None of these local reference-contract tests establish public deployment provenance, wallet compatibility or external operational acceptance.

## Isolated escrow support

The model requires explicit release (`mutual` or `timeout`) and dispute (`mutual` or `fixed-arbiter`) choices, with no default that silently selects authority. Stage terms bind chain, per-stage escrow identity, token, amount, parties, destinations, terms commitment, timing and policy. Its abstract statement additionally binds current state, action payload, nonce and deadline. Accepted transitions consume one nonce; all failures leave the model state unchanged under the documented pure-state/trusted-verifier assumptions.

Only exact initial funding changes the modeled funded amount. A terminal transition moves the full balance to one committed destination exactly once, and terminal states have no successors. The dispute window closes exactly when ordinary release becomes eligible. A dispute freezes normal release/refund; a favorable dispute decision still cannot bypass the release lock. The explicit timeout proposal is permissionless only after that window. Mutual resolution can deadlock, and an authorized arbiter can favor either party; tests preserve both limitations.

The README clearly limits the model to its own unchanged states, an abstract synchronous authentication oracle, caller-supplied canonical inclusion history and exact successful token transfers. It does not claim EIP-712/EOA/ERC-1271 implementation, reentrancy or token safety, fair arbitration, guaranteed exit, an accepted custody model, a production import or an enabled funds path. The historical reuse survey's conflicting administrator and shared milestone assumptions are marked unaccepted.

Independent `node --test --experimental-test-coverage scripts/experimental/milestone-escrow/model.test.mjs` at `307f9008` passed **19/19**, zero skips, with **100% model line/branch/function coverage**. The bounded exploration reported **15,444 attempted transitions and 396 reachable states** across four variants. This is useful executable design support, not a proof of a production protocol or spec-17 implementation completion.

## Browser repairs and remaining browser evidence

The full application previously rendered `MerchantProfilePanel` before `AppShell`, placing its focusable summary ahead of the skip link and outside the main landmark. `App` now passes it through an optional `mainPrelude` slot rendered inside `main`, after the existing skip link/header/navigation. The core shell takes only a `ReactNode`; it does not import the full-profile feature into lean builds. A focused regression presses Tab from initial load, verifies the skip link receives focus first, activates it and checks main focus plus merchant-panel landmark containment. No focus assertion or accessibility threshold was removed.

The browser reconciliation mock now accepts an explicit canonical header timestamp, and the signed-invoice scenario fixes that timestamp to the actual signed quote window. It does not manufacture payment time from scan wall-clock time or relax production matching. Scenarios without supplied time continue returning no header timestamp.

The seller pairing follow-up adds checks that the version mutation really occurred, the textarea holds it, unsupported input produces the existing alert, and no untrusted preview appears. Its existing generic QR rejection assertion remains. The new no-loaded-keys DOM regression confirms rejection followed by a fresh valid preview without applying keys. These additions clarify the hosted failure but are not proof it has been repaired. The prior hosted-only generic-status failure remains pending actual browser rerun. Review of `SellerPairing`/`CameraImporter` found no additional demonstrated source defect, and native Chromium launch is unavailable in this environment due to its socket restriction.

Independent execution from the browser author worktree at `9642e75a`: `NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/vitest run src/App.test.tsx src/views/SellerPairing.test.tsx --maxWorkers=1 --no-file-parallelism --coverage.enabled=false` passed **34/34**, two files.

## Handoff and limits

No blocking source defect was found in the reviewed deltas. One native-test claim was made precise and strengthened during review. The hosted pairing test has an unresolved observed failure until a real rerun establishes its outcome; this review does not clear that gate. The coordinator must qualify the exact integrated candidate, including full/lean bundles, whole-workspace checks, browser journeys and analyzer execution. Existing deployment pins, signing authority, native translations, external wallets/devices, independent audit and unaccepted guardian/escrow architecture remain their original separate gates.

All independent reviewer test processes finished. Results are scoped to the table's exact revisions; overlapping author and reviewer counts must not be added. No private keys, production network activity, fund operation, merge, release signing or deployment occurred in this review. Next action: integrate the documented reviewed source commits, then use the final hosted result to resolve the browser pairing observation and update the master ledger.
