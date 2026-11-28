# GhostPay consolidation continuation — 2026-11-28

This checkpoint records substantive qualification, source review, stop-scope enforcement and an evidence-availability failure during publication. **No main merge, integration-lease acquisition, product-source change, deployment, branch deletion, force push or automation change was performed by this continuation.** The existing #380 ledger receives only this additive checkpoint.

## Current integration state

Direct main readback at **11:52:56 UTC / 03:52:56 Pacific** is `0934ea094cb1db90293b74d2d1e9d9324e09a883`, tree `1ffed94d3568537da2d0d370136b53f3bb116b9d`. This is the earlier #768 merge by another writer; it is not a merge performed here.

Main's dynamic CodeQL run [46136039661](https://github.com/djshellshoxxx/GhostPay/actions/runs/46136039661) and Hosting [46136039735](https://github.com/djshellshoxxx/GhostPay/actions/runs/46136039735) have succeeded. The 11:52:56 UTC generic snapshot still has main CI [46136039738](https://github.com/djshellshoxxx/GhostPay/actions/runs/46136039738) queued. A separately triggered Pages run [46140248213](https://github.com/djshellshoxxx/GhostPay/actions/runs/46140248213) and newly discovered scheduled Nightly run [46141798914](https://github.com/djshellshoxxx/GhostPay/actions/runs/46141798914) are also queued. There are seven successful and 32 queued discovered checks; later jobs can still appear. This is not resulting-main qualification. Earlier recovered snapshots retain their older counts as historical observations.

The lock subsequently read at `489f8d50b8382433381b981d00ad9b170197d7e2` is **generation 79, held by `claude-cloud-lead-ghostpay-6a`**, with base main `0934ea09...`. Its recorded acquisition is 11:22:51 UTC and expiry 12:07:51 UTC. Preserve that owner's control. Earlier generation-78/released observations are historical; expiry alone never authorizes takeover. This continuation did not acquire or release either lock.

Current main `AGENTS.md`, `docs/ai/STOP_WORK_20261125.md`, `WORKFLOW.md`, `HANDOFF.md` and ownership records were read. The live owner tracker was rechecked earlier in the continuation; the binding stop scope remained unchanged. No newly read private tracker content or metadata is published here. Existing historical public archive records remain intact.

## Work completed and preserved

### #761: qualified candidate, ready, still unmerged

- PR: [#761](https://github.com/djshellshoxxx/GhostPay/pull/761), `test/quick-hide-donor-300-20261127`.
- Exact head: `c5a4e07ce7129a525f857d7c5a4e35c44b92422e`; tree `2a1baa84d3665a81d80f223dbde8c9b85a74ce8c`.
- Reviewed prospective composition with current main: tree `e8e52390e112ce80d098765229658e95ad40f566`.
- Three changed paths only: the 14-case donor300 privacy regression suite, handoff and additive ownership entry. No production, dependency, contract or workflow changes.

A separate AI-assisted source reviewer compared all 5,059 leaf entries against the parents/common base. The only common changed path was `ACTIVE_WORK.md`, resolved by preserving main's 11-line prefix and the candidate's seven-line append. This is independent source review, not a formal GitHub or human approval submission. GitHub's reviews collection remains empty.

Before the evidence-availability event, the exact prospective tree passed pinned `npm ci --ignore-scripts`, the all-library build, **43/43 mounted privacy tests with no skips**, typed changed-file lint and whitespace checks. A separate extracted-handler matrix passed **2,304 synthetic cases: ten accepts and 2,294 rejects**. No new local browser qualification was performed. The commands/results were durably recorded in [comment 7238167453](https://github.com/djshellshoxxx/GhostPay/pull/761#issuecomment-7238167453); the local logs and complete proof files are currently unavailable, as explained below.

Fresh generic Actions/check-run reads after recovery still show **five successful workflows and 37 successful / three intentional publishing-only skipped checks**, with no pending or failed candidate checks. These include CI, Pages, Beta acceptance, Hosting and dynamic CodeQL. Earlier inspection of hosted job [140914489795](https://github.com/djshellshoxxx/GhostPay/actions/runs/46124012136/job/140914489795) verified the 14 donor cases, 4,833 passed / one skipped web cases and the separate three-test batch; full/lean E2E and Pages Anvil checks succeeded.

This continuation marked #761 ready for review without changing its head. It remains open and unmerged. Current-main gates, fresh overlap review, any applicable review requirements and the held cooperative lock prevent integration now. Preserve original donor #300 and the separate #766 tooltip owner. Missing local proof files must be recovered or regenerated before relying on them as available merge evidence; a narrative hash is not an available proof file.

Known strict Mythril findings remain unresolved. The unchanged contract-analysis path filters are not triggered by these three test/docs paths; that distinction does not waive a contract/release gate.

### #753: artifact qualification and new-head preservation review

The previous head `1af4e9539839fdf8d82caa7b342da63c17293e66`, tree `6ef712d11fbd93ac9cc787f3701fa79d39f40b49`, received independent verification of six immutable ERC-20 artifact ZIPs. Their SHA-256 values matched GitHub metadata; the reports contained all **48 expected case executions**, eight cases in each plain/permit × Chromium/Firefox/WebKit lane, with no skips/retries and the correct source/tree/lock binding. This was validation of historical hosted reports, not 48 newly executed local browser cases. The exact collector/config regression sources independently passed **63/63 local tests**. [Durable review](https://github.com/djshellshoxxx/GhostPay/pull/753#issuecomment-7238173317).

The branch advanced during this continuation to `6bb0d3de76d863470d66040f184b7f961072f0df`, tree `5385de1faa4fe246615170d2070227be00832dee`, with parents the old candidate and main `0934ea09...`. Synthetic PR checkout `7ad43a97fb7ea928071c9c7c20608bd61229acb7` has that exact tree.

A separate reviewer checked all 5,067 tree entries with no unexpected substitutions. Four incoming static-guide/application-test files match main, and the ownership registry preserves main's full prefix and the complete prior registry. Collector, suites, helpers, workflow, Playwright configuration, served-file verifier and lockfile are byte-identical. The 63-case evidence remains scoped to unchanged inputs. **The old browser artifacts do not qualify the new build**, because entry/help/privacy HTML changed. [New-head review](https://github.com/djshellshoxxx/GhostPay/pull/753#issuecomment-7238609261).

Latest fresh readback still has the same head, open and draft. CI `46138154585` is pending; Beta `46138154482` is in progress; ERC-20 `46138154461`, Pages `46138154528`, Mobile `46138157950` and dynamic CodeQL `46138150900` are queued. Preserve the existing owner. No demonstrated failure currently justifies a repair or rerun. The recovered review objects retain the earlier 11:27:50 UTC snapshot separately from these later observations.

### #764 / #665: keep evidence and ownership boundaries

The separate qualification worker verified two immutable #764 W5 sanitized reports, 24 scenarios in each, and **17/17 local collector regressions**. These were evidence checks, with original positive controls and ambiguity limits retained. #764 head `0ee71f2b4e82897ed0a0a1ab868f06c1d02ed5fd` retains the owner's evidence-only/do-not-merge disposition. This does not newly approve separately owned #665 at `db6f3da67737346c28edf2ed9d8bae44e86bce56`, claim access to unavailable private raw traces or replace W5-specific qualification with ordinary CI. The original ZIP/log files are currently unavailable locally.

### #243 and #248: preserve unique test intent with existing owners

[Comment 7238201451](https://github.com/djshellshoxxx/GhostPay/pull/243#issuecomment-7238201451) records unique core named-seller selection and the preserved #386 test successor `5d5301eb323dd2ead39f8391354d530afe23b98d`: Continue may be absent or disabled after revocation, while warning and selected-seller assertions remain. #243 at `841ce4b7d22cf2ef48cf07e0833461fce7415ab9` is not redundant and remains owned. No new failure was reproduced and no stale Pay implementation was imported.

[Comment 7238515372](https://github.com/djshellshoxxx/GhostPay/pull/248#issuecomment-7238515372) preserves #655's composition-specific private-checkpoint fixture intent for the active #248 owner at `9105b2198ccca6c5068fd1aac1a6453952525651`. It identifies the unchanged `SessionPresentationBoundary` blob `e1398c251d7253b18c804aeb549751f3288e4ff5` on main/#655 and retains durable-byte, late-result masking, runner-count, disarm and explicit-restart assertions. Direct cancellation's Paused behavior remains distinct from a low-level lock notification with deliberately retained keys. No feature tests or current-head failure were claimed. Preserve closed #655 and its original refs.

### #636: mixed F04 work held; new head recorded

This continuation changed only the PR title/body to **[HOLD] F04 dashboard and containment changes — owner stop**, preserving its entire prior description. At that action the source was `0d548b9acb9236cb09c150e36be21596a01423d6` and the PR was draft. Source review found mixed F04 implementation/activation/qualification and containment work; main already had #715 exclusion guards, with no newly necessary standalone containment repair established.

Later fresh readback found another writer had advanced the source to `b05addc2fa9e353b34e959f0e1b345d4baaeeaff` and made the PR ready. It is a normal merge of the old source and main `0934ea09...`; the uncapped current-main comparison still contains 49 mixed paths. The HOLD remains in the title/body and was reinforced with [comment 7238786972](https://github.com/djshellshoxxx/GhostPay/pull/636#issuecomment-7238786972), pinning the new head. The frozen archive remains `57505cb294cf1780036ff004d60e3fcb7b75917a`. No dashboard source, activation, tests, refs or workflow gates were changed here. A branch-local claimed exception does not authenticate an owner reversal.

## Branch comparison work and count limits

Before the availability failure, the independent census worker reported a completed refresh with **876 refs / 837 distinct heads / 162 open PRs**, pinned to main `0934ea09...`. Ref collection ended 11:10:02.167890 UTC and PR collection 11:09:55.714874 UTC; these are separate observations, not an atomic snapshot. The final classification was frozen at 11:34:03.341404 UTC.

The reported partition was:

| Relationship or disposition | Refs |
| --- | ---: |
| Main ancestors | 498 |
| Nonancestors: established archive/hold/evidence/supersession | 309 |
| Nonancestors: refs associated with open PRs | 33 |
| Nonancestors: preserved in open-PR ancestry | 21 |
| Nonancestors: residual source review | 15 |
| Total | 876 |

The 378 nonancestors included 367 divergent refs, eight ahead with zero behind and three unrelated coordination/generated histories. The 33 open-PR associations comprise 32 exact snapshot-head matches and the separately recorded #779 head race. **Ten older-equivalence revalidations are within the 309 established dispositions**, not additional refs. All 34 frozen archive refs were reported unchanged. The refinement reduced 35 residual rows / 11 revalidations to 15 / ten. These are source classifications, not counts of unfinished behavioral requirements. **The global unresolved behavioral-obligation count remains unknown.**

The eight new/advanced heads relative to the earlier 872-ref snapshot were reported cross-checked with uncapped API comparisons and local ancestry/tree checks. Four advances were fast-forwards, with no deleted refs. PRs #779–#782 were newly open; #355/#569 had left the open set through other writers. #779's PR metadata head `954ccf5d030c3f37deadba15707b1a6086c0dcfe` differed from its newer branch head `3abf5528af087b18177c996cceca8c5ed94e41d0`; the latter requires fresh qualification. #753's new head was in the later snapshot. The subsequent #636 advance and lock change described above occurred outside that snapshot's source observations.

**Availability qualification:** those final per-ref semantic files and full source-comparison bytes were not yet published when the original local directories became unavailable. They must not be represented as present in this archive merely because their counts or historical digests survived. The recovered census record explains which actual cached snapshots are restored and which final outputs remain missing. These reported counts do not establish a new exhaustive completion proof.

The preceding source work found:

- Twelve automation refs: nine represented/superseded on main, one evidence tail and two owner-dependent fixture obligations (#243/#248).
- Lucid donor `d6f6617e595bbba7e83a1fcdec585bedb9adaf0f`: all 18 authored non-doc paths received represented/superseded dispositions, including calendar validation and bounded RPC retry handling; no stopped-feature work was resumed.
- Twelve core residual refs: eleven supported dispositions and one broad unresolved sweep-consent composition at `2748c9bfd55bd226c7801c15a7acdd955ab70339`.
- #577's original valid-credential export-denial regression was identified exactly on main, including both guarded calls, with block SHA-256 `212368c170f290edc37f12704126621df29962febbffecc55943e3b674a12ec2` and introducing ancestor `2a70c04124cba1d8c2d5145ef5a4ba4bcb6c2911`.
- Receipt-test Git blob `aab9cb5ca382b5df8f08858e452c8b6d5f20106f` was recovered from a partial-clone omission and hash-verified. Its assertions remain; the comparison differed by an explicit microtask flush. The small metadata proof was recovered exactly after the availability failure. The broad composition still needs semantic reconciliation; blob access was not its remaining blocker.

No additional unique, unowned, merge-ready implementation was established. Preserve all donor-only regression obligations even where production code is superseded.

## Evidence availability and recovery

At publication preparation, the current executor no longer contained `ghostpay`, `qualify_761`, `census_ownership`, `review_761`, `qualification_candidates` or `consolidation_evidence`. The packing script and an empty output directory remained. All three workers independently confirmed the absent directories; a bounded named-file search found no copies. **The cause is unknown.** No deletion was requested or performed by this continuation.

Recovery salvaged actual cached API/source objects, exact remote comment readbacks, live gates, PR metadata and one small proof whose 985-byte serialization matches its previously observed SHA-256 `b90958a915983c235889e691ce43de93114b05a2878d2f0aca0d7a535feb1fff`. Recovered JSON objects are reserialized values, not claims of original HTTP wire bytes. Source-specific recovery manifests distinguish original recoverable values from missing augmented proofs and logs. The archive manifest hashes only bytes actually present now.

The census worker recovered **28 cached payloads**, including complete pagination for the earlier **872-ref / 833-distinct-head / 160-open-PR snapshot**, with terminal empty pages retained. Six recovered source-text payloads match their original Git blob identities. Historical rechecking of that recovered snapshot confirms 34/34 frozen archive refs; this does not replace a later live ref check. The verified census bundle contains 36 members and has SHA-256 `bc3169c822382648d61212abe17498b21a9f69a5833c1ac0ba8e79660e5d94c5`. The later 876-ref proof was not recovered.

The original large per-ref semantic proof, full comparison, mounted-test logs, handler program/result, collector execution logs and downloaded artifact ZIPs were not silently recreated. Earlier public comments still provide durable qualification statements and source/run locators. Re-download immutable GitHub artifacts or regenerate local comparison/test evidence on exact heads when needed, explicitly labeling any such later operation. Do not promote a stored digest to a claim that the corresponding file is available.

The previously published November 24 census remains preserved independently at commit `464a7cb4c3cd0a6d23cee82643ca8efd95c067f0`, path `docs/consolidation/branch-comparison-20261124-68c82b9/BRANCH_COMPARISON.json.gz`, Git blob `eec638085f8812445507d19eeb71426a6043cbdf`. This continuation neither rewrites nor duplicates it as new work.

## Next executable steps

1. Refresh main, #761 head, current-main Actions/checks, active #766 overlap and the held integration lock. Do not take the lock while another owner holds it or merely because it expires. Recover/regenerate the exact merge evidence before integration. Once every applicable gate and review requirement is met, coordinate normal exact-head integration, verify the resulting tree and resulting-main push checks, and promptly release only a lock acquired by this worker.
2. Leave #753 with its owner. Validate fresh artifacts for head `6bb0d3de...`, checkout `7ad43a97...`, tree `5385de1f...` and all applicable general/static-guide/Pages/Beta/Mobile/security gates. Preserve old and new evidence as separate qualifications. Repair only demonstrated failures.
3. Preserve #243/#248 owner coordination and #764's evidence-only boundary. Keep #636 and other mixed stopped-feature compositions held. Do not revive #614/#616/#617 as the old broad integration sequence.
4. Recover final classification/proof files if an original copy becomes available. Continue from already versioned ledgers and recovered source snapshots, preserving the availability limitation. Prioritize the broad `2748c9b` sweep-consent comparison, `63994db6`/`1d28f24d` guard-preservation pair and `371d235c` recovery checkpoint after fresh ownership review. They are source-review targets, not automatically authorized product changes.
5. Refresh later refs before any exhaustive final audit. Do not declare completion or disable the consolidation automation: unresolved semantic/qualification/ownership obligations and release findings remain.

All ten owner-stopped products remain excluded. Core privacy/payment/recovery retention and release-exclusion checks remain required, within the original task scope and bounded synthetic local testing constraints.

## Published checkpoint files

- [Recovered 872-ref source snapshot](branches-872-recovered.json).
- [Census recovery boundary](CENSUS_RECOVERY.md), [prior reported final analysis](PRIOR_REPORTED_FINAL_ANALYSIS.json), and [verified census cache archive](census-cache-recovery.tar.xz).
- [Qualification and live-readback archive](qualification-evidence.tar.xz), including source-specific recovery manifests and unavailable-file records.
- [Review-object recovery](REVIEW_RECOVERY.md) and [qualification-file availability](QUALIFICATION_RECOVERY.md).
- [Independent documentation review](INDEPENDENT_REVIEW.md) and [resolved review findings](REVIEW_RESPONSE.md).
- [Additive checkpoint ownership](OWNERSHIP.md), [archive payload manifest](EVIDENCE_MANIFEST.json), and [published file digests](SHA256SUMS.json).

The census archive preserves its own original 35-file hash index plus the index file. The qualification archive preserves its actual recovered files and a separate internal manifest. No missing 876-ref complete semantic ledger is included or implied.
