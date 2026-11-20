# Source scope, pinned revisions and completion

## Completion accounting

The selected production-source inventory is complete: **945 reviewed commit/path records, 482 distinct paths, 595 distinct path/blob versions and zero pending records**. There are 114,971 physical source lines counting each path/blob version once. A path reviewed at both baseline pins contributes two revision records; identical blobs do not inflate the distinct-version or line totals. These are source-review counts, not test-coverage percentages.

[source-coverage.json](source-coverage.json) is the authoritative normalized manifest. Each entry contains the full commit SHA, repository path, immutable Git blob, completed review status, review method and original ledger filename. An independent reconstruction of the expected Git inventories matched every normalized record, with no missing, extra or mismatched blobs.

## Frozen source selection

The initial census observed 318 branch heads. The latest consolidated current-beta candidate, current privacy feature and subsequent narrow fixes were selected alongside main. Exact branch metadata, ancestry classifications, byte-different alternatives and source-selection rationale remain in [branch-inventory.json](branch-inventory.json). The broad census uses a runtime-path heuristic and is not itself semantic source review.

| Role | Frozen revision | Branch / PR at selection | Explicit records |
|---|---|---|---:|
| Main baseline | `c977b5d6723f6822c3b5d86cd6b231712c53c395` | `main` | 446 |
| Latest consolidated candidate | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | `integration/ghostpay-completion-20261120`, PR302 | 473 |
| Privacy/quick-hide feature | `137628961463fc5abd8b7927b2efe6b18a0a206a` | `feat/ghostpay-privacy-quick-hide-20261120`, PR300 | 22 |
| Later amount-parser fix | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | `fix/ghostpay-format-validation-20261120`, PR303 | 1 |
| Later ERC-20 simulation fix | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | `automation/20261120T0434Z/bug/erc20-simulation-result`, PR305 | 1 |
| Supplemental clipboard alternative | `04910f65dc0268e41519c4b1a44e83264272f0bf` | `automation/20261120T0115Z/coordinator/clipboard-qualification`, PR297 | 2 |
| **Total** | | | **945** |

The main and integration rows are complete inventories of the selected roots plus the explicit browser-delivery inputs below. The supplementary rows record focused source variants, not six complete repository reviews. The privacy pin has 455 production paths in the selected roots; every path/blob is represented by a complete baseline review or the explicit privacy review. Twenty of those production variants are distinct from both baseline inventories; the 22 explicit privacy records also retain comparisons needed to identify older guards. The privacy feature's selection base was `417f7c71daf8645e1432f2ec8f070110879b80bd`.

The amount-parser and simulation heads each contribute their one production-file correction. The clipboard alternative contributes `Common.tsx` and `clipboardPrivacy.ts`. Tests and documentation at those heads were used as supporting context where useful; their entire repository trees are not claimed reviewed.

## Included source

| Area | Included code and review boundary |
|---|---|
| Browser application | All production `apps/web/src` code: shell, views, components, libraries, i18n runtime/classification, styles, optional feature code, worker paths and registry reference code. |
| Core browser packages | `address-safety`, `core-crypto`, `invoice-schema`, `net-transport`, `payment-uri`, `qr-exchange`, `scan-source`, `secret-box`, `tx-review`, `ux-vault`. All eligible production source under each package's `src` directory. |
| Implemented feature/dependency packages | `btc-silent-payments`, `chain-adapters`, `pir-two-server`, `policy-scheme`, `solana-stealth`, `tron-adapter`, `hygiene`, `metadata-hardening`. All eligible production source under each package's `src` directory, including optional APIs not currently called by the browser. |
| Core contracts | First-party `packages/contracts/src` and `packages/contracts/script` source. Contract findings retain configuration and deployment qualifications. |
| Browser delivery | Public embed SDKs v1/v2, public header/help styling, entry HTML, Vite configuration, scoped CSP/SRI/build-profile/bundle/deployment-validation scripts, workspace build orchestration, Pages workflow/build/serve/verify inputs and lean exclusions where present. The exact path set is in `root-delivery-audit.json` and the normalized manifest. |
| Privacy and focused fixes | Exact variant files listed in `root-branch-variants-audit.json`, with unchanged path/blob versions inherited from the complete baseline inventories. |

The baseline production filter includes `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.css` and `.sol`, and excludes test/spec files, test utilities, fixture directories and `__tests__` trees. The explicit delivery ledger adds required inputs outside those extensions/roots, such as HTML, shell, YAML, declaration files and response-header configuration. No claim depends on counting generated build output.

All four locale catalogs at both baseline pins were parsed and their source keys classified. JSON catalogs are supporting data outside the production-source count; native-language translation quality was not assessed. Four supplementary chain build/deployment input paths at each baseline were also inspected and are recorded in the chain ledger/report outside the production completeness count.

Generated ABI and protobuf source received structural/usage review. That does not establish generated-descriptor equivalence, regenerate the files, or prove the underlying protocol. Cryptographic source review and selected tests do not constitute a formal proof or certification.

## Deliberate scope boundaries

The review does not extend to every file on all 318 branches. The census retains 64 historical or independent heads, including 24 recent heads with byte-different variants, without claiming that they are semantically superseded. The selected current-beta integration and focused feature heads define this audit's latest-feature scope. Later-created refs are not implicitly included.

Separate CLI, relayer-service, native-app, deferred pool/FHE/future-architecture implementations, unrelated packages and independent historical branches are outside this browser-core scope. The browser's relayer client and its bounded transport are included. Vendor dependencies, generated distribution output, comprehensive test-source auditing and the entire repository CI/tooling estate are outside scope. Existing tests and selected deployment/build inputs were read or executed as evidence where relevant.

Implemented Bitcoin, Solana, TRON and policy source was reviewed even though those optional features are excluded from the lean build. A successful lean build does not qualify their full-profile browser flows. Policy source has no production deployment pins; the corresponding findings remain explicitly conditional or latent.

## Review provenance and continuation

Original machine-readable ledgers are retained in [review-ledgers](review-ledgers/). The manifest's `reviewer_evidence` field is a ledger filename; it resolves within that directory rather than relative to the manifest itself. Later completed records replace partial records by the same `(commit, path)` key. Only `reviewed` records enter the completion total, and duplicate records must agree on the Git blob.

| Review lane | Retained completed evidence |
|---|---|
| Core packages | `core-package-audit.json`; expands each file's explicitly recorded per-pin versions. |
| Components and i18n | `components-audit.json`. |
| Web libraries | `web-library-audit.json`, then fresh `web-library-continuation-audit.json`. |
| Chain adapters, hygiene, metadata and contracts | `chain-core-audit.json`. |
| Multi-chain packages | `multichain-packages-audit.json`, fresh `btc-packages-continuation-audit.json`, then fresh `btc-spend-final-audit.json`. |
| Multi-chain browser features | `multichain-views-audit.json`, then fresh `btc-views-continuation-audit.json`. |
| Coordinator views, variants and delivery | `root-ui-audit.json`, `root-branch-variants-audit.json`, `root-delivery-audit.json`. |

Fresh continuation workers received immutable pins, completed-file records, exact remaining paths/ranges, known candidate dispositions and explicit instructions to preserve application source. The BTC package continuation completed 66 records; the final spend reviewer completed the remaining two. The BTC views continuation is an aggregate of 94 records: it retains the earlier 83 and closes 11 unfinished records, including completion of the previously partial view. It is not 94 additional reviews. Historical handoff documents remain for provenance and are marked superseded by completed coverage.

Independent review checked the receipt-print cascade, privacy-history wiring, settings behavior and embed popup semantics, and corrected imprecise traces before consolidation. Final coverage reconciliation rebuilt the expected source set from Git rather than inferring completion from worker prose. [VALIDATION.md](VALIDATION.md) separately records what actually ran.

The fresh [final publication QA](review-ledgers/final-publication-qa.md) found no publication blockers after checking counts, pinned blobs, line totals, validation logs, evidence hygiene and document links. Its link/file counts describe the notes at the time of that check, before adding the QA record itself.

## Main movement during the audit

At the final drift comparison, main was `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Every one of the **446 audited baseline paths** had the same Git blob as `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The 17 intervening changed paths concern documentation and the separate portable-hosting toolkit's static-export timestamp work.

[main-drift-check.json](main-drift-check.json) records the comparison and all intervening paths. The audit branch can incorporate that main advancement without changing the audited core. Validation remains reported against its original immutable test/build pins; no broader claim is inferred from the newer main revision.
