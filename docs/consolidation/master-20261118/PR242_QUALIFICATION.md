# PR #242 final qualification and observed merge

Observed at 2026-11-19 06:54:51 UTC. The independent reviewer made no remote mutation. The final read found the PR already merged at 06:54:41 UTC; merge ownership remains with the integration lead.

| Identity | SHA / result |
|---|---|
| [PR #242](https://github.com/djshellshoxxx/GhostPay/pull/242) head | `ab4e0da2cfe2a18adac0424896fba0b40fac81a8` |
| Base immediately before merge | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` |
| Tested synthetic merge | `7524f6f0ab64bbf88bf7261539c41c42470241af` |
| Observed final main merge | `e454de6abfefda70d82784fafc1d8949b277c334` |
| Head, synthetic merge and final merge tree | `eb8fc38c83a67fe3b1b4889ebd9371f5fddbbd17` in all three |
| Synthetic and final merge parents | `[58d89b39..., ab4e0da2...]` in that order |

The exact head has 39 check runs: **36 success, three intended skips, no failures or pending checks**. [CI run 44471454978](https://github.com/djshellshoxxx/GhostPay/actions/runs/44471454978) completed successfully at 06:53:51 UTC. All applicable TypeScript, web, lint/typecheck, full/lean browser, contract and other product jobs passed, including the final `typescript` aggregate. The separate `security/snyk (djshellshoxxx)` status is successful.

The skipped checks are Pages publication, the post-deployment smoke test, and the release-only duplicate gate. These are intentional for a PR event; their skip does not imply a deployment or release pass. The repository workflows inspected during the earlier review do not automatically deploy on a main push/merge. Manual Pages publication and tag-triggered draft release remain separate actions.

The actual [checkout job 135381673658](https://github.com/djshellshoxxx/GhostPay/actions/runs/44471454978/job/135381673658) log fetches and checks out `7524f6f0...`; the copied log is `pr242-checkout.log`. The final main merge tree is identical to that tested tree. PR #237 was already in the base through the concurrent writer's `58d89b39` merge; this review does not attribute that earlier merge to the integration lead.

Fresh public branch metadata reports `protected: false`, enforcement `off`, and no configured required status contexts. Repository rulesets return `[]`. The administrative branch-protection read returns HTTP 403 (`Resource not accessible by integration`), so this is not a complete administrator-policy attestation. Formal GitHub reviews return `[]`; no requested reviewers or teams remain. These facts were recorded, not used to waive any source, test or security gate.

The machine receipt `pr242-final-qualification.json` contains exact check IDs, conclusions, timestamps, URLs, status, merge identities and permission limits. Qualification applies only to this focused PR head/tree. The broader consolidation candidate still needs its own complete exact-head qualification. The retained strict Mythril findings are unchanged; absence of a path-filtered analyzer run on this focused PR is not analyzer success or finding closure.
