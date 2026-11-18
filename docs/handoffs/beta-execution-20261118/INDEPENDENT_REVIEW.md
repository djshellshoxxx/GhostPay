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

The updated snapshot contains 40 records:32 pre-existing PRs plus eight repair PRs. There are 35 open PRs excluding this report:27 pre-existing plus eight repairs. All eight repair heads have queued checks. No product source head moved during the PR/CI refresh at 2026-11-18 12:28:52 UTC (04:28:52 America/Los_Angeles). Main remains dfc75ef2087fa6463ae59e0818abec01796c578d.

The reported 32 pre-existing PRs are accounted for as 27 open, two marked merged (#206 direct; #204 automatic through ancestry), and three closed as superseded (#127,#42,#49). Corrected branch census: 239 actual remote branch heads = 164 heads contained in main and 75 not contained, captured before the report branch update. The symbolic origin/HEAD alias is excluded from branch totals. The snapshot includes the previously published report head; its own later documentation update cannot be self-referentially embedded. Non-contained does not by itself mean missing or safe-to-merge work.

No additional tests were run solely for this documentation review. Source repairs, relevant tests, meaningful static-build reproducibility, audit failures and unexecuted checks are recorded in EXECUTION_REPORT.md and the source handoffs.

## Late browser-fixture review

A final refresh identified the original #222 Pages failure. #233 was then authored and independently reviewed. The privacy reviewer ran 3 helper tests at fixture source 6dc3ae7c and found no blocker; coordinator reviewed the exact helper and E2E diff, including receipt rebinding. Author 49 focused tests, typecheck and lint passed; discovery collected 14 tests and executed none. Final cf13b9be adds documentation only. Runtime/privacy defaults, existing security assertions, package files and gates were preserved. Old hosted 11 pass/2 fail/3 unrun is retained as failed evidence, not relabeled as a pass. All eight local-to-remote published tree identities were checked at publication. The final security reviewer independently checked the late delta, including PR arithmetic, source-tree equality and test boundaries; this review caught and removed the symbolic-ref alias from the branch census.
