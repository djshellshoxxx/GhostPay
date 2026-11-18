# GhostPay Pages consolidation reconciliation — 2026-11-13

Status: documentation-only, no release or deployment authorization. Source of truth is exact GitHub PR heads and CI, not this snapshot.

## Verified ancestry

- PR #135 combined beta candidate precedes PR #137 Pages candidate.
- Compare d725469c...ac08062ec540d429a0bfb24f3aab042be5d212eb: ahead 17, behind 0.
- Compare ac08062ec540d429a0bfb24f3aab042be5d212eb...ba135a08368b125db991a36b8bfcb475054b96f0 (PR #145 recorded handoff head): ahead 17, behind 0.
- Therefore do not cherry-pick #138/#141/#142/#143/#144/#145 blindly onto #137; compare the *latest* exact heads and preserve ancestry.

## Consolidation ownership / order

1. Refresh PR #135 and #137 exact heads and confirm their base ancestry. PR #136 is a documentation dependency and must not be merged independently of #135.
2. Owner-controlled GP-PAGES-02 backup verification and GP-PAGES-04 sleep-aware locking are explicitly still under review in #137. Do not overwrite or declare them integrated.
3. Pages browser verification stack: #138 verifier, #141 HTTP-status acceptance, #142 out-of-project smoke, #143 combined verification, #144 fee-manifest fail-closed, #145 IndexedDB retry. Later stacked PRs include earlier changes; reconcile by comparing head SHAs, not by treating them as independent feature branches.
4. #139 audit ledger and #140 wiki/docs are separate documentation streams; incorporate after source qualification, without treating docs CI as application qualification.
5. Preserve non-Pages functionality in source history; do not add relayer, native, CLI, policy accounts, or production deployments to the Pages release profile.

## Required qualification

- Run exact-head application, Pages, beta and hosting checks on the *final combined SHA*. A previously green source SHA does not qualify later handoff commits.
- Confirm all owner-controlled browser fixes are integrated and reviewed; run browser recovery, lock, smoke, release verifier, and local Anvil acceptance tests.
- SonarCloud Security Rating A, ADR-0029 owner decision, dedicated origin, approved signed testnet manifests and keys, independent security review, public testnet/external-wallet acceptance, and explicit owner authorization remain release gates.
- No automatic merge to main, deployment, or release.

## Current verified source references

- PR #137: https://github.com/djshellshoxxx/GhostPay/pull/137
- PR #143: https://github.com/djshellshoxxx/GhostPay/pull/143
- PR #144: https://github.com/djshellshoxxx/GhostPay/pull/144
- PR #145: https://github.com/djshellshoxxx/GhostPay/pull/145
- Consolidated beta handoff: docs/handoffs/BETA_CANDIDATE_LATEST.md on nodata/jolly-rubin-u4zd45

This reconciliation is intentionally read-only with respect to the active owner integration branch.
