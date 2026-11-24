# Isolated follow-up composition — 2026-11-24

## Result and source pins

The second local composition is implemented, independently source-reviewed, and qualified by the bounded native checks recorded below. No local qualification blocker remains. New published-head CI and the coordinator's current ownership/integration checks remain required.

- Branch: `integration/ghostpay-followup-fixes-20261124-68c82b9`.
- Worktree: `/workspace/scratch/68c82b9dbbbb/GhostPay-followup`.
- Worker: `/root/branch_metadata`; independent reviewer: `/root/package_review`.
- Exact local base: `d6b56d7f062bb3de1aa7392fb2c7882b47a0ee13`, tree `2842cdf77fb811720b82dcda81f8830ddb18fa08`.
- Coordinator-reported equivalent published base: `70970c3b739dcba51c0fb6cd0b1b75f73f6aae95`, same tree. This worker did not query or modify remote refs.
- Initial composed source: `807ff0940c0387cbf1c70ee29331cc44e6c9dacb`, tree `a6724b81e83ab894b4dbaee4889c9cb27dec85f7`.
- Final qualified product source: **`f02d8afd8660e59447f253f4fdea807a0e2cd385`**, tree **`e1b5f2f04e4fe2d5cbb88f5c1463d48112fcd377`**.
- Subsequent handoff/evidence changes are documentation and the independently reviewed local acceptance harness; production and regression source are frozen at the final product pin.

## Preserved donors and scope

All ten heads below and the local base are ancestors. Original branches were untouched.

| Source | Exact head | Resulting behavior |
| --- | --- | --- |
| #531 | `e9e9d60dacb6458796f3e1b5d704f1afdca62ae0` | Connect the existing web deployment-manifest validator to its documented package command; retain the generated package map and real command tests. |
| #557 | `5f280cab9c252cf57a68e2c2d156c07b36d2b018` | Accept the complete valid uint256 decimal range while retaining numeric and precision bounds. |
| #516 | `c86d5a32e02efbee14d935548c821b27e287f507` | Keep unreadable reminder records within the existing typed result contract. |
| #536 | `1f3d230be9f5ab67e5314c5084dc1f4b5e141472` | Classify shared Japanese kana letters consistently using script extensions. |
| #538 | `41ddd0f21986d3ec65d43ead73fafda39a4a2f4d` | Preserve independent address and label duplicate-group findings. |
| #507 | `7e618aef8e9c84055f445b4959a339e7ad470cbf` | Validate and serialize Solana reference observations in one bounded traversal. |
| #593 | `97cb98591a2a2e95c8d9a701d0eb60e4e2bc7a4b` | Preserve TRON optional-input snapshots and the latest qualification handoff. |
| Explicit TRON child | `9fdb87fe59748a7463e4de5b92dc0ff3396ea7ce` | Snapshot network selection and apply its default only when absent. Both TRON heads are preserved. |
| #509 | `59b5bbfc6f6dc3cc83d24c1fccbe87b15cd72d0c` | Require native CryptoKey identity before accepting object key material; retain raw-byte imports. |
| #567 | `f0171888c95b48005a6809aedf1e625bf86dfe83` | Preserve canonical array descriptor snapshots, existing sparse/decorated-array rejection, and thirteen additional cases. |

#511 was excluded: the base already has the stronger quote snapshot/parser behavior, and its six old exact-message expectations conflict with the existing result contract.

Each merge retained its donor as a parent. Ownership conflicts were resolved with additive unions, checked against the nonblank-line multiplicities of both parents. #567's two source/test conflicts initially took exact approved blobs `8ed01592d487c356a72d51e240e5cc63fb470a3a` and `813286cc5317177fffcd5e7eac0a1907a45e5f9e`. The Solana handoff changed only by removing one trailing space. Full per-donor proof is in [composition-final.json](../qa/followup-composition-20261124/composition-final.json).

## Concrete qualification repairs

Actual package lint on the initial source found three violations: two intentional array deletions in the imported JSON regression and the native getter extraction in `seal.ts`. The coordinator authorized minimal repairs after these failures were reported.

- Both `delete value[1]` fixture statements became `Reflect.deleteProperty(value, '1')`. The affected properties are ordinary configurable array entries, so the deliberate holes and assertions are preserved. Production `json.ts` remains exactly the approved descriptor-snapshot blob.
- The CryptoKey property descriptor is retained, and its getter is invoked as `nativeType.get.call(material)`. This preserves the native getter, receiver and fail-closed absence/catch behavior while satisfying typed lint.

The initial combined coverage run was stopped with exit 130 before a final result to avoid qualifying mixed source. It is not counted as a pass. Fresh full package coverage, corrected lint/type checks, the rebuilt preset module and real Chromium acceptance all passed on the corrected source. No assertion, coverage threshold, KDF parameter or gate was weakened. Before/after source identities and original failures are retained in the evidence directory.

## Executed native qualification

Runtime: Node 24.22.3, npm 11.19.1, pinned Vitest/coverage-v8 5.0.5. `npm ci --offline --ignore-scripts --no-audit --no-fund` passed: 722 packages in 22 seconds. Root manifest, lockfile and all 66 library manifests matched before ordinary copies of 58 unchanged dependency `dist` directories. Their complete package source trees also match the base and final source. No symlinks or hard links to mutable build output were used. All seven affected libraries were rebuilt; the corrected presets module was rebuilt again. Dependency versions and lockfile are unchanged.

All seven complete package suites ran with their original coverage configurations and `--maxWorkers=1`: **1,906 passed across 79 files**, with no failed or skipped tests.

| Workspace | Passed tests / files | Coverage %: statements / branches / functions / lines |
| --- | --- | --- |
| `@ghostpay/invoice-schema` | 744 / 13 | 98.13 / 97.8 / 100.0 / 99.27 |
| `@ghostpay/payment-uri` | 274 / 14 | 97.63 / 97.23 / 100.0 / 99.13 |
| `@ghostpay/merchant-billing` | 290 / 12 | 99.69 / 99.66 / 100.0 / 99.8 |
| `@ghostpay/ux-notify` | 119 / 11 | 99.81 / 99.16 / 98.88 / 99.77 |
| `@ghostpay/ux-intake` | 106 / 11 | 99.68 / 99.06 / 100.0 / 99.79 |
| `@ghostpay/ux-vault` | 306 / 11 | 96.38 / 93.37 / 99.68 / 98.67 |
| `@ghostpay/ux-presets` | 67 / 7 | 98.83 / 98.19 / 98.46 / 100.0 |

Additional executed checks:

- All eight directly affected workspace typechecks passed. The two corrected workspaces were rechecked, and the final web build repeated its own typecheck.
- All eight workspace lint scopes passed after the two bounded corrections. Initial failures and successful reruns are retained separately.
- Focused web manifest/command tests: **22 passed in two files**. This targeted run did not collect coverage.
- Actual `npm run validate:deployments -w @ghostpay/web`: passed (`deployments/: ok`).
- Corrected-source web build and postbuild scan: passed, **19 artifact files**. Existing chunk-size/dynamic-import warnings remain visible in the log.
- Generated package-map check: current. Workspace graph/map suite: **12 passed**. Affected-workspace analysis found eight direct and twenty-one transitive workspaces with no unmapped changes.
- Secret scan: passed. Pinned Actions check: **111 references**, passed. `tx.origin` check: **39 Solidity files**, passed. Source diff whitespace check: passed.

Commands, sources and outcomes are recorded in [qualification.json](../qa/followup-composition-20261124/qualification.json). Exact raw logs are retained as deterministic gzip archives with uncompressed SHA-256 hashes in [log-manifest.json](../qa/followup-composition-20261124/log-manifest.json).

## Native CryptoKey browser acceptance

The existing full ux-presets suite uses native Node WebCrypto and exercises genuine nonextractable keys, imports, seal/open and store behavior. A separate local-only browser harness imports the actual built `seal.js` and `types.js` from a loopback server. It passed **eleven checks in Chromium 156.0.8078.4**, both before and after the getter correction: secure/native realm, native key identity, nonextractable raw import, fresh IVs and successful round trips for both key forms, authenticated slot binding, and typed rejection of invalid key material. No key bytes or ciphertext are retained in the output.

The harness blocks page requests outside its loopback origin, propagates failures, closes the server/browser and prints module hashes and browser version. The final built-module hashes were independently matched to the reviewer-visible `dist` files. See [browser result](../qa/followup-composition-20261124/cryptokey-chromium-final.json) and [reproducible harness](../qa/followup-composition-20261124/cryptokey-chromium-acceptance.mjs).

## Independent review and remaining gates

`/root/package_review` independently approved both the original composition and corrected product pin, including exact donor ancestry/source retention, existing test preservation, ownership unions, the two corrective changes and the browser harness. The harness SHA-256 is `d2bfa1cad3140bce9cc7e073c31483dc1940f4d27b6e22ca6ac8ad4c9842860a`. This is independent AI-assisted engineering review, not a submitted GitHub approval. The reviewer did not execute tests; this worker owns the recorded execution results.

No full web coverage suite, complete twenty-one-workspace transitive qualification, Firefox/WebKit/device run or hosted CI was performed here. Root owns publication, current remote-head/ownership checks, fresh published-head CI and any main merge. No remote writes, deployment, wallet interaction, chain operation or real funds were used. Preserve all donor histories when mapping the local base to its equivalent published tree.

## Live-ref census evidence

The coordinator-supplied live-delta report joins the original **686 refs** with **nine new refs** and **two replaced heads**, yielding **695 refs**; replacing an existing head does not increase the count. Its snapshot still pins main to `706188000c38b3dde5a3a362370a530870aa7587`. This is a recorded census, not a fresh remote observation by this worker. The exact report is retained in [live-delta-dispositions.json.gz](../qa/followup-composition-20261124/live-delta-dispositions.json.gz); its deterministic gzip parameters, byte counts, SHA-256 checksums and disposition overrides are in [the archive manifest](../qa/followup-composition-20261124/live-delta-dispositions.manifest.json).

The coordinator's final disposition overrides the archived report's preservation-only wording for the extra #511 fiat pair on `100de4006569ee1f65736adce8d111446dfafa59`: first/second composition quote snapshot/parser behavior already supersedes that change, and six original assertions expect incompatible error text. The pair remains excluded; the archived statement is not merge approval. QR #605 versus #581/#614 remains unresolved, with owner/runtime obligations open. This addition changes documentation only and does not require source qualification reruns.
