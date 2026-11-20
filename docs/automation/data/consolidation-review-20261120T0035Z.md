# GhostPay pinned consolidation audit

Read-only independent native worker `/root/ci_and_consolidation_audit`. No source branches modified, no PR closure or merge.

Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Candidate #278: `d74af79ebabdc8cead843361c3497b46d8c421f9`.

## Conclusions

All eleven requested production fixes are already present in candidate #278 either by full-head ancestry or matching runtime/test blobs. This does not make their entire PRs redundant. Candidate #278 remains unqualified because browser jobs failed, security qualification was incomplete, and branch-protection requirements were not readable.

| PR | Head | Source disposition in #278 | Unmerged documentation |
|---|---|---|---|
| #289 | `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` | Exact runtime blob; only test difference removes unused fixture parameter in existing repair1c1369c1 | `docs/handoffs/BASE64URL_INPUT_TYPE_20261119.md` |
| #285 | `89942105c48df03b9351f777278b6a992e35a95e` | Exact runtime and test blobs; reconstructed, not full-head ancestry | `docs/handoffs/QR_KIND_FAILCLOSED_20261119.md` |
| #282 | `9fbf3312cb8e65083f604cc0bf0512d59c83f141` | Exact runtime and test blobs; reconstructed, not full-head ancestry | `docs/handoffs/MERCHANT_PIN_STRICT_JSON_20261119.md` |
| #281 | `0041514a630398c89693498d9b5e44ef562d9c61` | Exact runtime and test blobs; reconstructed, not full-head ancestry | `docs/handoffs/SCAN_SPAM_PARTIAL_30D_20261119.md` |
| #280 | `25c380f253e3338c0e6b79e8d052cdf8950f9e88` | Exact runtime and test blobs; reconstructed, not full-head ancestry | `docs/handoffs/BUILD_PROFILE_FAILCLOSED_20261119.md` |
| #279 | `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0` | Exact runtime and test blobs; head ancestor | Only different combined ACTIVE_WORK content; historical handoff preserved |
| #274 | `a4c6f945adef0438bfd0b347fb7c11057e3973ce` | Exact runtime and test blobs; head ancestor | Only different combined ACTIVE_WORK content; historical handoff preserved |
| #268 | `ddfc8cfafa44b09103ced821f160c1d37fdfe552` | Exact runtime and test blobs; head ancestor | Only different combined ACTIVE_WORK content; historical handoff preserved |
| #265 | `c591b54078febcf24cba01b29bc173b2fac1f9cb` | Head ancestor; stronger descriptor/accessor/Proxy array hardening from #270 | Only different combined ACTIVE_WORK content; historical handoff preserved |
| #258 | `84398a79e18673f3e371a405931bc464e1cca99a` | Exact runtime and test blobs; head ancestor | Only different combined ACTIVE_WORK content; historical handoff preserved |
| #261 | `61f2b3729fa4b78c90d43a1ecd8c351e9c22f577` | Exact integration-lock runtime and test blobs; head not ancestor | 16 canonical automation ledger/data files absent in #278 |

## Preserve branches and evidence

- #289 repair already exists at `1c1369c1d5a86d6db42ddc72bf7b910a2ca2a0f8`. Its runtime blob is `5466ee0b99925dedd23e753636ae7ab3f6f48234`. Do not implement the same guard again.
- #261 contributes 16 automation ledger/data files still absent in #278; retain these on the existing canonical ledger lineage.
- #262 contains 155 changed documentation/evidence files absent from #278 and five differing documentation blobs. The two nonancestor nonmerge commits are documentation/evidence; do not delete them as duplicate.
- #264 has 96 changed documentation/evidence files absent from #278 and 17 differing documentation blobs, plus122 differing source paths. Preserve for semantic review; this audit does not certify those changes safe or unique by function.
- #269/#270 exact heads are ancestors of #278; later refinements create differing blobs. Do not overwrite the later combined source.
- A different ACTIVE_WORK blob is expected after combined claims; it is not proof every old claim remains live or every line is missing.

## CI and integration gates

- #289 original head:34 successful check runs,2 failed (`ts-lint`, aggregate `typescript`),3 deployment-only skipped. Sole lint error: unused `_index` in `packages/invoice-schema/src/base64url.test.ts:36:33`. Five successful workflow runs and failing core CI44631965189.
- #285 original head:36 successful check runs,3 deployment-only skipped; all6 workflows successful and Snyk successful.
- #278 d74af79: lean browser115 passed/1failed/5skipped; full128passed/1failed/2skipped. Both fail invoice replacement request-count assertion at `apps/web/e2e/network-authorization.spec.ts:172`, expected9 received15. Separate observed active preflight-observation owner; no competing edit.
- #278 ts-lint/typecheck pass; Echidna pass; Mythril and remaining CI jobs were in progress at audit snapshot.
- Integration lock `d6839d7c48edf5e71ddd35d3e87446b69c196b04` is released generation4; no lock acquired.
- Branch-protection API returns403; rulesets empty. Required-check policy cannot be certified, therefore no merge eligibility claim.
- Pages only deploys through explicit main workflow_dispatch deploy=true; release only v* tags; paid research jobs exclude PR events. No workflow changed or triggered.

## Wiki ownership

The [ownership snapshot](open-pr-ownership-20261120T0035Z.json) inventories all 73 open branches and matching exact-branch ownership claims. Wiki owners include #215 (User/Developer/Home/Architecture/Verification), #140 (Codebase/QR/User/Developer/Home/Verification), #259 and #273 (all nine maintained pages including Sidebar), plus #238/#262/#264/#278 (Verification). Preserve these ownership boundaries.

## Evidence files

- [Consolidation evidence](consolidation-review-20261120T0035Z.json): compact source-pinned branch/blob and missing-documentation inventory used for these conclusions.
- [CI evidence](ci-review-20261120T0035Z.json): exact runs, checks, failures and lock snapshot.
- [Ownership evidence](open-pr-ownership-20261120T0035Z.json): all 73 open PR branches and claims.
- The optional 2.28 MB exhaustive scratch blob map is not included in this checkpoint. It can be regenerated from the pinned source/target SHAs; it is not a durable accompanying artifact or a prerequisite for the conclusions retained in the compact evidence.
