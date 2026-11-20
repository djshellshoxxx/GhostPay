# Remaining-source review, fresh generation 5

## Result

No additional required static-EVM or Pages runtime behavior was established from the three selected source heads at frozen candidate **53f4253bd9afc33bea43a7bdfe95ae287e035bf7**. No product change is proposed.

The lean-core milestone and early security proposals are preserved or superseded in the inspected source. The documentation-recovery branch has no independent runtime delta against its actual PR base, but its historical archive/provenance artifacts and some documentation additions are not present as equivalent files. Preserve that branch; do not describe it as wholly superseded.

| Source scope | Source-pinned disposition | Required runtime addition |
| --- | --- | --- |
| PR #151, lean-core milestone | SUPERSEDED / EQUIVALENT for its eight proposals; original source gate retained with explicit pending-owner dependency lists | None established |
| PR #40, early security audit | EQUIVALENT relocated descriptor loader; inherited AR2/D3 retained and B2R superseded conservatively | None established |
| PR #259, documentation recovery | No unique runtime delta; unique historical artifact containers, partially retained live guidance; whole archive-text overlap remains UNKNOWN | None established |

This is a branch-proposal preservation review, not repository-wide correctness, security, release or CI clearance. Tests were inspected as source and were **not executed**.

## Selection, ownership and evidence

Worker: /root/remaining_sources_gen5. Dedicated branch: review/ghostpay-remaining-sources-gen5-20261120, based on the frozen candidate. Claim commit: **2ddec55717d630ea27d70d06b2b3753aa5cadc69**. Owned writes are the additive claim in docs/ai/ACTIVE_WORK.md and this report directory only.

The prior remaining-source continuation at docs/engineering-handoffs/continuous-20261119/generation-5-remaining-uniqueness/CONTINUATION.md left broader #151 source, early security and documentation recovery unresolved. The later four-small-source review was also consulted in the original checkout at **13088d3c12366e96bb4c800a2277170116d07bbf**, under docs/engineering-handoffs/continuous-20261120/generation-5-small-unknown/. It already handled secret aliases, the Settings hint test, historical consolidation and gifted-planck AR2/D3/B2R. Those four reviews were not repeated as new findings.

Live refs were checked before and after the analysis. [SOURCE_PINS.json](SOURCE_PINS.json) records full source/current entries, every best merge base, declared PR bases, affected paths and author attribution. [SOURCE_PRS.json](SOURCE_PRS.json) records the freshly read PR metadata. [live-refs-initial.txt](live-refs-initial.txt) and [live-refs-final.txt](live-refs-final.txt) retain the read-only ref observations.

| Branch | Live source SHA | Actual PR base | Every best merge base with frozen candidate |
| --- | --- | --- | --- |
| claude/ghostpay-lean-core-milestone-t5lwox | 2527d6b9367887508d7d8f678a18564132652a03 | bd2652bf1853948594522140a6a0fe0cbe54e32b | bd2652bf1853948594522140a6a0fe0cbe54e32b |
| codex/ghostpay-security-audit-20261030 | 63994db6cff8b3b3ca698427eee9e95904230546 | 1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78 | dfd5cbdd94d982985c73551355906723ac70a97e |
| integration/ghostpay-docs-recovery-20261119 | 4ff80733a3b36019e2f12fc21a8448e7666b6049 | ffd982a7aea2856c186b40ef236a39720a1b81f5 | ffd982a7aea2856c186b40ef236a39720a1b81f5; bb193849a5688bb604e3e32dc83e1647e37fe447 |

Main remained **c977b5d6723f6822c3b5d86cd6b231712c53c395**; canonical PR #278's branch remained **417f7c71daf8645e1432f2ec8f070110879b80bd**. #151 and #40 were closed at the observed metadata; #259 was an open draft. These status observations are not branch-retirement authorization.

Path inventories use all-best-base unions with rename detection disabled. #151 has 15 rename-aware diff records but **16 affected path names**, because both the old executable-workflow name and new disabled-text destination must be retained. It has five exact surviving file entries plus the same absent old workflow. #40 has 15 union paths, with only three paths in its actual stacked PR delta. #259 has 72 union paths but only 20 paths in its actual PR delta, all documentation. Absent commits, differing filenames and broad merge-base unions are not used as uniqueness proofs.

## PR #151: all proposed behaviors accounted for

Source head is authored by Claude, dated 2026-11-14; original proposal commits are preserved in SOURCE_PINS.json. All current path/line citations in this section refer to **53f4253b**, not a moving working branch.

| Original proposal | Current source evidence | Disposition |
| --- | --- | --- |
| A5-2: move the bare-step openai-agents YAML out of executable workflows (6cb957a7) | .github/workflows/openai-agents.yml is absent at both heads. .github/agent-prompts/openai-agents.steps.disabled.yml.txt is exact blob c276287dfc4a575944b897666d619147980d4109. scripts/tests/workflow-files.test.mjs:8–18 is also exact and retains the top-level workflow-shape assertions. | EQUIVALENT, including the deletion; no old paid-agent steps should be activated |
| A5-1: same-repository, author, current-head independent human approval and pinned merge checks (215f98d8) | .github/workflows/ghostpay-codex-cloud.yml:70–78 filters same repository, main base and owner/Actions authors; 81–97 reads actual named GitHub Actions checks; 98–112 checks paths; 113–136 requires the latest current-head APPROVED review from a non-author/non-bot authorized reviewer, checks write/maintain/admin and pins the merge SHA. scripts/tests/ghostpay-codex-cloud-workflow.test.mjs:16–40 retains the original gate assertions with eligibility syntax adapted. | SUPERSEDED by the current gate implementation; this is not a fresh comprehensive automation audit |
| A5-3: named key/API-prefix scanner patterns and substring-only public development key exemption (dd5be2e2, 7fa75889) | scripts/scan-secrets.sh is byte-identical; lines 19–24 retain the patterns and rematch after removing only the allowlisted substring. scripts/tests/scan-secrets.test.mjs is byte-identical, including its same-line second-secret assertion at 67–72. | EQUIVALENT |
| Run scripts/tests in CI (ebf92147) | .github/workflows/ci.yml:192–194 still includes scripts/tests/*.test.mjs in the zero rest shard and now includes additional agent/recovery suites. | EQUIVALENT behavior, later CI organization |
| A3-2: invoice/fiat/buffer expiry before final payment and bounded router/permit deadlines (cede5cfd) | apps/web/src/lib/pay.ts:359–366 checks prepared buffer expiry; 379–402 checks invoice/fiat expiry and caps at expiresAt minus one; 408–419 refuses an explicit oversized deadline. payExec.ts:252–267 shares the deadline with the permit and rechecks after signing; 295–319 rechecks the fresh invoice/buffer clock across preparation and submission awaits. Original test intent remains in pay.test.ts:586–615, payExec.test.ts:90–115, and views/Pay.test.tsx:1247–1273; additional payment-boundary regressions are at payExec.test.ts:861–964. | SUPERSEDED conservatively: last payable second, explicit-bound refusal and preserved post-request evidence |
| A7-2/A7-3: deployment and manifest-flow fail-closed tests (4c4baf27) | apps/web/src/lib/deployment.test.ts is byte-identical. The original verifyManifestForFlow cases remain at manifest.test.ts:52–69. The current manifest module's 76–81 still rejects loaded state without an RPC; deployment.ts:21–27 rejects absent/unreadable verification. The current suite additionally covers strict bundled signed manifests and origin restrictions. | EQUIVALENT original tests; broader manifest loading was subsequently hardened |
| Lean reachability/source-boundary gate (2527d6b9) | scripts/tests/lean-core-reachability.test.mjs:51–110 retains the original WEB_REVIEWED and RELAYER_REVIEWED lists, adds separately named PENDING_OWNER_REVIEW entries, and requires their exact disjoint union. Lines 141–169 retain the core view/lib/component deferred-import walk; 172–180 recognize App.tsx plus extracted AppShell.tsx. Port provenance is 45535eadbd4fde5b3c853436b28298e53bb203e3 and docs/consolidation/LEAN_CORE_GATE_PORT_2026-11-14.md. | SUPERSEDED by an explicit port, not missing; pending-owner dependencies remain pending |

The reachability disposition does **not** approve the named pending dependencies or establish artifact exclusion. The original assertion was about source dependency closure and imports. Current source intentionally distinguishes the prior reviewed set from later additions; a fresh owner decision and actual artifact qualification remain separate. Neither gate configuration nor pending lists were changed by this review.

## PR #40: unique loader retained; inherited changes separated

A distinct read-only worker, /root/remaining_sources_gen5/early_source_compare, inspected the complete 15-path all-base delta. Its result was checked against the frozen blobs; the main worker independently compared the loader's relocated implementation and existing regression bodies. The source head, authored by sheldon, is immediately based on gifted-planck **1d28f24d**. PR #40's unique delta is only apps/relayer/src/secrets.ts, apps/relayer/src/secrets.test.ts and docs/audits/25-security-triage-2026-10-30.md.

### Unique proposal: descriptor-bound secret loading

Current packages/relayer-guard/src/secrets.ts:43–94 retains the implementation: a single descriptor, descriptor metadata validation, bounded 4097-byte read with 4096-byte rejection threshold, and finally-close. Comparing the original apps/relayer/src/secrets.ts to the shared file shows only the Node-only module comment and relocation of relayer-specific constants. Those constants remain in apps/relayer/src/secrets.ts:6–14, with re-exports at 1–4; packages/relayer-guard/package.json:15–18 exports the secrets subpath.

The original pathname-replacement, symlink and growth regressions remain in packages/relayer-guard/src/secrets.test.ts:44–65. The original triage document remains exact blob **240c9137d9689c2a0a73b10688e8e36e48f45cba**. Port **80371be9313cc9024eff542a77ffec9eb90c0562** and relocation **4388560cd38b07c611f01d569034e7db3ed7d851** preserve authorship/provenance. This Node service behavior is outside the static Pages runtime and is not being activated.

### Inherited proposals, not attributed anew to PR #40

| Proposal | Current evidence at 53f4253b | Disposition |
| --- | --- | --- |
| AR2 scanner served-range evidence (97787665) | packages/chain-adapters/src/logs.ts:325–334,474–477 resets evidence on actual growth; scanHardening.test.ts:404–435 retains the original dense-after-sparse regression, with cap-specific coverage at 437–467. Port 79ae3ea2; refinement 990a847a. | Preserved with later cap refinement |
| B2R plain-revert operator-fee fallback (8daa03cf) | errors.ts:34–42 and rpc.ts:370–375 use positive executionReverted evidence; apps/web/src/lib/opStackFee.ts:36–42 permits zero only on that flag; sweep.ts:720,740 uses the shared helper. Original halt cases remain in sweep.test.ts:777–783 and rpc.test.ts:239–255, plus transport-to-sweep cases at 737–767. | SUPERSEDED conservatively; a bare code-3/no-message error now fails closed rather than assuming zero |
| D3 queued-sweep deadline precedence (363bb43a) | apps/relayer/src/service.ts:814–820,858–861 checks expiry around reconciliation/order state. Original regression remains in api.test.ts:512–533, with expanded queued cases at 490–510. Ports de3ea97e and 9006b9f2. | Preserved and extended; service source only |
| Inherited documentation | docs/developer/api/chain-adapters.md:28–37 documents the current positive revert flag; docs/handoffs/HANDOFF_FOR_NEXT_AGENT_2026-10-29.md:135–140 records D3/B2R and AR2 disposition. | Preserved historical meaning, current representation supersedes old names |

Current shared-loader blobs are **d519892bdb89efbfdf44b4ccb1b435e50b16635a** (implementation) and **ba997aa9b5a2762dcb7f543d945cc26b81ba4f8b** (tests); current fee-helper blob is **2f55a4af5b36ff10f279c66e0b13dcf83e87b1bb**. Filename-only comparison would have missed both relocations.

## PR #259: documentation-only uniqueness, with precise limits

The true declared PR base is **ffd982a7**, which is an ancestor of 53f4253b. A direct no-renames comparison from that base to **4ff80733** changes exactly **20 docs/** paths and no runtime, dependency, contract or workflow path. The alternative best base **bb193849** produces a larger inherited union; it does not create independent runtime changes in this PR.

The seven files below do not exist in the frozen candidate, and no exact source blob for them exists under any other path in its full Git tree:

- docs/handoffs/docs-recovery-20261119/README.md
- docs/handoffs/docs-recovery-20261119/archive/pr139-historical-evidence.md
- docs/handoffs/docs-recovery-20261119/archive/pr140-historical-evidence.md
- docs/handoffs/docs-recovery-20261119/archive/pr153-historical-evidence.md
- docs/handoffs/docs-recovery-20261119/provenance.json
- docs/handoffs/docs-recovery-20261119/publication.json
- docs/handoffs/docs-recovery-20261119/verification.json

These are distinct historical artifact containers. Their source README claims **158** extracted sections from #139/#140/#153 (42/75/41), with source pins, line boundaries and hashes in provenance.json. This review checked the container presence, metadata schema and representative content, **not all section hashes or all text overlap with differently named candidate documents**. Therefore the historical text's complete uniqueness remains UNKNOWN; do not turn eight absent filenames into a claim that 158 sections are all missing.

The separate docs/wiki/Current-Status.md is also absent. Several live guide/status additions remain outside the candidate: eight touched documentation entries still equal their pre-proposal base, while the maintenance/status/ownership ledgers have other subsequent changes. They should not be bulk imported as current guidance.

Two sampled behavior-to-guidance comparisons establish that missing prose is not a missing implementation:

- The QR warning-precedence paragraph from the source is already verbatim in current docs/design/qr-colors.md:16; later input validation is documented at 18–24. The design document is superseded rather than lost.
- Source docs/wiki/Developer-Guide.md:87–109 describes locale fallback, cancellation and reviewed approval wording. Current apps/web/src/i18n/context.tsx:70–103,114–118 retains fallback/cancellation/in-session preference; languages.ts:46–54 keeps the reviewed registry explicit; translator.ts:66–87 uses reviewed security layers plus bundled English. The source guidance is distinct prose, not an unimplemented localization feature.

The source's older invoice/quote-expiry guidance is likewise backed by the stricter payment paths inspected for #151. Source snapshots cite their historical heads; none is relabeled as qualification of 53f4253b.

## Fresh handoff and completion limits

Root has started fresh worker **/root/archive_recovery_gen6**. The source/base pins, seven archive paths, unchanged-runtime proof and unverified section-overlap boundary were handed over directly. Its bounded successor task is to independently validate historical section provenance and compare actual text with 53f4253b before selectively preserving genuinely missing evidence. Keep historical author/source attribution and avoid importing Current-Status, active ownership or dated wiki guidance as current directions.

Remaining large recovery/privacy/server scopes are outside these three comparisons. The actively owned original privacy worktree was read only for prior handoff evidence and was not changed. No runtime tests, builds, probes, dependency installation, external workflow dispatch, remote writes, source-branch modification, contracts, fees, deployment or CI-gate change occurred in this lane. Documentation JSON parsing, exact Git object comparisons and whitespace checks are the only new local verification.

The evidence is sufficient to avoid replaying #151 or #40 into the frozen product candidate. It is insufficient to retire #259 or claim exhaustive repository consolidation.
