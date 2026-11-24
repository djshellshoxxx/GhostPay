# Additional reviewed GhostPay composition — 2026-11-24

## Result and source pins

Six bounded corrections are composed with the completed follow-up, preserving both histories and every earlier product change. The older #511 production wrapper is excluded because the existing rate parser supplies the required error boundary. Its outer-layer regression coverage is retained against the current error contract.

| Identity | Exact pin |
| --- | --- |
| Local branch | `integration/ghostpay-additional-reviewed-20261124-68c82b9` |
| Worker | `/root/historical_review`, delegated by the current root coordinator |
| Local base | `61ac0c9ac58b0e92fcc1f88fce333edeeb47d188` |
| Base tree | `2444833284a33b868e0c30047434b8b2d9bbd27d` |
| Published equivalent base, #616 | `7c4987650faf32322d7ded48ad669130aba7e63b`, same tree |
| Claim before source edits | `43fb7e54715dfe05a597ece6196d9474080cf7c4` |
| Source integration retained | `100de4006569ee1f65736adce8d111446dfafa59` |
| **Qualified and approved product** | **`48319ceeb6f658d32d94ce1debe4aac09a249f4c`** |
| **Qualified product tree** | **`384d8d4b02e4bbea3c9aa627523cbb881db90aea`** |

The product merge has the claim and `100de400` as parents; the local base is an ancestor. The later handoff/evidence commit changes documentation only. Root owns publication with the agreed exact-tree mapping to published #616 plus `100de400`; this worker made no remote mutation.

## Source preservation

Exactly thirteen non-documentation paths differ from the base: twelve byte-identical donor blobs in six pairs, plus the adapted fiat regression.

| Pair | Bounded result |
| --- | --- |
| `apps/web/src/lib/qrKinds{,.test}.ts` | Primitive string keys; all declared mappings, secret/bearer priority and frame classes retained. |
| `apps/web/src/lib/sanitize{,.marker-script.test}.ts` | Mixed-script checks use original text; rendered markers and replacement counts retained. |
| `packages/chain-adapters/src/deployments{,.test}.ts` | Actual calendar-day validation within the existing manifest boundary. |
| `packages/chain-adapters/src/rpc{,.test}.ts` | Finite retry bounds and explicit credential/referrer/cache policy. |
| `packages/merchant-billing/src/refunds{,.uncertain.test}.ts` | Only never-submitted plans may fail and release reservations. Submitted reservations remain. |
| `packages/metadata-hardening/src/web{,.anchor-attributes.test}.ts` | Real attribute-name recognition within the documented regex lint aid. |

The corrected C2 `seal.ts`, JSON source and sparse-array tests, `rate.ts`, and `view.ts` are unchanged. Every other base product/test entry remains unchanged. Both complete ownership registries survive verbatim in order, including the committed claim. [composition-final.json](../qa/additional-composition-20261124/composition-final.json) records paths, modes, blobs and ancestry.

The refund API remains plan-only and does not verify chain evidence or implement execution. The donor's larger lifecycle and settlement implementation remains unresolved. QR #605 versus #581/#614 remains a parallel decoder choice. No decoder alternative, dependency, lockfile, project contract source or release setting changed.

## #511 regression reconciliation

The pre-adaptation source was pinned as tree `e076d1cbffc7458ad3c17825535f68e0bbe600d2`. Its inherited fiat test produced **six failures and one passing control**: expected `quote could not be read`, received the existing parser's `quote fields could not be read`. Invalid state and error code were already correct.

Only two expected-message literals changed, covering five parameterized cases and one proxy case. Every other test byte, typed proxy return and assertion was preserved. The same focused command then passed **7/7**. Final test blob: `2a71a8eae3b64a6272a56d2eca89f0435fbd6fe9`. No production parser, view or error contract changed. Both runs and lossless original logs are retained.

## Qualification on the frozen product

| Complete package suite | Passing tests | Files | Final skips |
| --- | ---: | ---: | ---: |
| chain-adapters | 574 | 26 | 0 |
| merchant-billing | 292 | 13 | 0 |
| metadata-hardening | 125 | 13 | 0 |
| ux-fiat | 88 | 7 | 0 |
| **Total** | **1,079** | **59** | **0** |

Existing coverage thresholds passed unchanged. Final statement/branch coverage: chain-adapters 97.40%/96.67%; merchant-billing 99.69%/99.66%; metadata-hardening 99.48%/98.85%; ux-fiat 100%/99.36%.

Also passed:

- **137/137 tests in eleven focused web files**, covering QR consumers and display sanitization; zero skips.
- Builds, TypeScript checks and typed lint for all four affected packages. Builds also rebuilt core-crypto and invoice-schema.
- Typed lint for all four changed web source/test files.
- Original full-profile web TypeScript, Vite build and postbuild scan; nineteen files passed the scan. Existing nonfatal build diagnostics remain recorded.
- Repository secret and whitespace checks.

[qualification.json](../qa/additional-composition-20261124/qualification.json) retains commands, pins and results. The focused seven-case fiat run is part of the full fiat suite and is not counted twice.

### Twenty-two native skips resolved

The first package run passed 552 chain-adapter cases and skipped twenty-two existing conditional cases: sixteen payment-evidence cases, four quote cases and two router-fee cases. Binaries were absent from the initial PATH and the isolated checkout had no generated artifacts. No skip condition or configuration changed.

The coordinator's artifacts were at `GhostPay/packages/contracts/out`. Contract tree `a84815152b8f07c854197c84b5613b02f7939882` is identical in first product `9d8edf06`, the C2 base and this product; the source worktree had no tracked contract changes. Three artifacts were ordinary-copied with different inodes. All nineteen Solidity metadata source hashes matched actual source bytes. Existing Anvil 1.8.5 and solc 0.8.28 were selected with `REQUIRE_ANVIL=1`; the complete suite then passed **574/574**, no skips, with normal coverage gates.

The unchanged quote test compiled its own synthetic aggregator. All native RPC, fixture wallets and contract instances used disposable loopback Anvil. No project contract source was edited, public chain or external service contacted, or real funds/production deployment involved. [native-skip-resolution.json](../qa/additional-composition-20261124/native-skip-resolution.json) names every resolved case and links the full compressed JSON report; [native-prerequisites.json](../qa/additional-composition-20261124/native-prerequisites.json) binds tools, source and artifact hashes.

## Environment and independent review

An independent offline exact-lock install completed with 722 packages. Runtime: Node 24.22.3/npm 11.19.1, TypeScript 5.9.3, Vitest/coverage-v8 5.0.5, ESLint 10.15.0 and Vite 8.3.5. All sixty-eight workspace links resolve into this checkout. No shared `node_modules` or mutable outputs were used.

Sixty-one unchanged library output directories, 2,094 files, were ordinary-copied from completed C2 after full tracked package-tree and root-input equality checks. Every copied file was byte-compared and inode-distinct. The four changed package trees rebuilt locally. [dependency-reuse.json](../qa/additional-composition-20261124/dependency-reuse.json) records the proof.

One TypeScript command did not start because the external log wrapper attempted concurrent Git metadata writes. Metadata capture changed to read-only frozen-tree lookup; the original TypeScript command then passed. This setup attempt is retained separately, not counted as a product failure or passing test. No repository source, gate, timeout or assertion changed for it.

`/root/package_review` independently **approved** the exact product and tree above. The reviewer verified ancestry, thirteen-path scope, twelve exact donor blobs, two literal substitutions, preserved C2 source/tests and complete ordered registries. Of 952 preexisting test/spec files, 949 were unchanged; the three existing changed files were the approved QR-kind/deployment/RPC extensions, retaining prior assertions. The reviewer ran no tests or mutations. [independent-review.json](../qa/additional-composition-20261124/independent-review.json) is source review, not a submitted GitHub approval or external audit.

Text log companions trim trailing whitespace only. Deterministic gzip copies retain every original byte, bound by raw/archive hashes in [log-provenance.json](../qa/additional-composition-20261124/log-provenance.json). Original fiat failures and initial native skips remain alongside final successes.

## Earlier evidence and branch accounting

The coordinator's [first-composition archive](../qa/branch-comparison-20261124/qualification.json) preserves all sixteen original logs, hashes and failures/retries. Its 4,469 package tests and six focused browser cases per profile belong to first product `9d8edf06da09dcb287a14b2aad26c439e9d7b7a5`, as attributed by that coordinator. They are not runs on this newer product; the browser selection was not the complete multi-project suite.

The final read-only [ref refresh](../qa/additional-composition-20261124/remote-ref-refresh.json), cutoff `2026-11-24T10:23:49.014463Z`, records **696 refs**: only published #616 was new, one ledger advanced with documentation only, 694 were unchanged and none deleted. Original SHA-256: `0a3b380dacb92b51c44521424162d720e78ed901f5721d18760d633259be3d4c`. It joins the earlier baseline and delta without discarding dispositions.

The coordinator's [cumulative ancestry manifest](../qa/additional-composition-20261124/cumulative-preserved-heads.manifest.json) binds the lossless report: 124, 135 and 140 previously non-main heads preserved through the first, second and third cumulative unions, excluding the coordinator's own integration refs. These are history-retention counts, not feature counts or behavioral completion.

## Integration sequencing and remaining gates

The existing consolidation owner stated at 10:05Z in [the #615 coordination comment](https://github.com/djshellshoxxx/GhostPay/pull/615#issuecomment-7128311667) that canonical **#614 has priority once its checks and reviews pass**. Then #615 must be requalified against the resulting main, preserving both its extra formatter guards and the QR implementation. Root supplied this observed coordination fact; main still remained `706188000c38b3dde5a3a362370a530870aa7587`. Do not compete for a lock or main merge, overwrite #614 ownership, or import QR alternatives into this frozen product. The existing consolidation automation retains its full mission and schedule.

No local blocker remains within this scoped qualification. This product did not run browser journeys, a lean build, full web coverage or the entire workspace suite locally. Fresh exact-head hosted CI and applicable browser/release gates remain required, including qualification of any composition changed by the #614-first sequence. Earlier-product results do not substitute for those gates.

Root owns publication with the agreed parents, current ownership/main/head checks, cooperative lease and normal merge. The worker acquired no lease and changed no remote or other source branch. Broader refund and QR alternative obligations remain open.
