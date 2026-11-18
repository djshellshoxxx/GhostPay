# Independent review and final verification

The parallel reviews below are AI-assisted source/evidence reviews, not an external human security audit. The coordinator owns publication and integration.

- Privacy review verified all seven local tree identities and checked main versus unmerged behavior, RPC defaults, own-node protocol scope, retry limits, memory history, idle sole-copy protection and privacy actor observations.
- Recovery review verified all seven published tree/parent identities against fetched Git objects and checked the recovery and Sweep command/count/source distinctions.
- Security review independently recomputed the Mythril ZIP/report hashes, all eleven saved finding records, superseded dependency-entry hash, audit scopes, #206 ancestry/check evidence and initial PR accounting.

Accepted corrections before publication:

1. The optional relayer is reachable from core EVM Sweep in lean Pages; it is not a full-profile-only capability. It is unconfigured by default and no infrastructure was deployed.
2. #231 governs preliminary balance-display refresh. Signing/status queries and already-dispatched transport retries keep their existing behavior.
3. Invoice creation evidence is a web-app unit test, not a browser run.
4. Restore/storage milestone language does not credit unexecuted cross-browser or process-crash acceptance.
5. Main's empty default endpoint maps and corrupt/inaccessible privacy-setting fallback are distinct from valid required-proxy blocking and the new cached EVM-client guard.
6. The idle policy deliberately retains an unverified sole EVM key copy in memory.
7. Recovery typecheck/build/final-disclosure pins remain distinct. Local Foundry1.5.1 evidence does not qualify pinned1.8.5.
8. Literal pipes in the picomatch requirement table are escaped.

The final snapshot contains39 records:32 pre-existing PRs plus seven repair PRs. There are34 open PRs before publishing this report:27 pre-existing plus seven repairs. The report PR is excluded from that capture. All seven repair heads have queued checks; no source head moved during the final refresh at2026-11-18 12:04:52 UTC (04:04:52 America/Los_Angeles). Main remainsdfc75ef2087fa6463ae59e0818abec01796c578d.

The reported32 pre-existing PRs are accounted for as27 open, two marked merged (#206 direct; #204 automatic through ancestry), and three closed as superseded (#127,#42,#49). Branch census238 =165 heads contained in main and73 not contained, captured before this report branch is published. Non-contained does not by itself mean missing or safe-to-merge work.

No additional tests were run solely for this documentation review. Source repairs, relevant tests, meaningful static-build reproducibility, audit failures and unexecuted checks are recorded in EXECUTION_REPORT.md and the source handoffs.
