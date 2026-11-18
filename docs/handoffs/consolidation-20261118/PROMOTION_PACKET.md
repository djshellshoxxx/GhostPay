# Protected-main promotion packet (2026-11-18)

**Result: a consolidated candidate with named blockers, not a finished release.** All application, browser,
Pages, beta, integration, hosting and CLI qualification checks are green on the candidate source, and Echidna now
passes in CI. Mythril remains red by design (no suppression exists or was added), so the enforced release gate
blocks any release until the owner decides how the eleven dispositioned records are handled. No promotion,
deployment, signing, publication, Wiki publication or branch deletion was performed.

## Source identity

| Item | Value |
|---|---|
| PR | [djshellshoxxx/GhostPay#203](https://github.com/djshellshoxxx/GhostPay/pull/203) (draft), head branch `nodata/wizardly-allen-qwol6u`, base `main` |
| Last product-source commit | `cfb482f9340e74a479f27adbb2f5074d9b532494`, tree `45815e10af739c48475107d5d6b0620aede1c31a` |
| Qualified head (CI below) | `d91ae16a9bcdfc13341e39e4c83e194af7ac8ab7`, tree `1bc755739acb9ba481a5764bf9cca969e1162805`; differs from `cfb482f9` only under `docs/` |
| Later commits | Documentation only (this packet); verify with `git diff --name-only d91ae16a <PR head>` |
| Base | `main` `cfaebeeae22f292cb0bb3074619b2603cb738367`, an ancestor of the candidate (1,482 commits ahead; fast-forwardable) |
| Foundation | unified #187 `beb525dddcca103de9eda447b55cddf7ee2f428c`, tree `36177d29c0ec7a44504cc248837f70c4ddf3cb52` |

## Checks on the qualified head

There are no required checks configured on `main` (no branch protection or rulesets; see blockers). The checks the
repository's own workflows run on the PR, which a protected promotion should require:

| Workflow (run) | Jobs | Outcome on `d91ae16a` |
|---|---|---|
| CI (44231986652) | 24 | **success, 24/24**, including typecheck, lint, all `ts-test` shards, relayer, contracts (fmt, build, test, snapshot, coverage, NatSpec, Slither, static, extra packages), secrets-and-egress, lean candidate, e2e (full) **78 passed / 1 skipped** and e2e (lean) **66 passed / 3 skipped** |
| Pages (44231986644) | 5 | success (build/verify site and Pages artifact on anvil; 3 deploy/smoke/release jobs skipped by design on PRs) |
| Beta acceptance (44231986665) | 1 | success (lib + CLI + browser on anvil) |
| Integration (44231986622) | 1 | success (anvil + bitcoind regtest + solana-test-validator) |
| Hosting kit (44231986619) | 2 | success |
| CLI operator qualification (44231986608) | 3 | success |
| Contract analysis (44231986631) | 2 | **Echidna success; Mythril failure (expected, see below)** |
| CodeQL (PR #203 check suite 44231983061) | — | success |

Earlier candidate evidence: [VALIDATION_MATRIX.md](VALIDATION_MATRIX.md).

## Analyzer evidence and security dispositions

| Analyzer | Source | Run / artifact | Outcome |
|---|---|---|---|
| Echidna 2.2.7 (Router, Sweep, Policy; 4 workers, 300k calls each) | qualified head `d91ae16a` | Contract analysis 44231986631, artifact 14396468280, report sha256 `e9d5acf5351d678a262e6c4a547f630fc4e2346496ffb47e72bae7ad0a26971b` | **success**, runner exit 0, requested commit `d91ae16a`; 13 safety properties passing; all 11 canaries reached (Router 300,062, Sweep 300,034, Policy 300,044 calls). Also green on `08ef4eb1` (run 44228685328, report `f9153ed5…`) |
| Mythril 0.24.8 | `beb525dd` (contract source unchanged since) | Contract analysis 43981233671, artifact 14290880802, report sha256 `f5a03aea77cff52a996e67202893f6dd51f8b85bce2f9ad8e41a05ebc7f158f8` | **failure by design**: 11 records (3 Medium, 8 Low). Each is dispositioned with focused tests and an independent review: three SWC-116 intended signed-deadline checks; eight PolicyAccountFactory false positives or intended fail-closed paths. No suppression. On the qualified head (run 44231986631, artifact 14398747387, report sha256 `475b27ec3adae0ccdc2d7fbcd8c30c4a1b819616f65b80f2863de5d7c307cdcb`) Mythril reported 10 of those same records (identical contract, function, SWC and PC); R8 (SWC-113 at PC 1781) was not reported, as in the local rerun, so it remains dispositioned but timeout-dependent. No new record |
| Slither, Foundry tests, coverage, static checks | qualified head | CI 44231986652 contract jobs | success |
| CodeQL | PR #203 | check runs on the PR | Two pattern alerts on the bundle scanner and its test, resolved in `b441cc64`/`5ddb042a` |

Records: [expiry](../../audits/mythril-14290880802-expiry-dispositions.md),
[factory](../../audits/mythril-14290880802-factory-dispositions.md), [review findings](REVIEW_FINDINGS.md).

## Named blockers (owner actions or external gates)

1. **Repository protection** (owner): `main` has no branch protection (API 404 "Branch not protected"), no rulesets
   and no `v*` tag ruleset; `release`/`github-pages` environment reviewers could not be read (403). Enable protection
   with the checks above required, add the tag ruleset, and confirm environment reviewers.
2. **Mythril policy** (owner): Mythril 0.24.8 cannot suppress individual findings. Either approve a separately
   reviewed, finding-specific, source-matched disposition mechanism (keyed to contract, function, SWC, PC/source map
   and compiler/source hash, failing when that code changes), or keep releases blocked until the contracts change.
   AI review is not an external audit.
3. **Fee-token freeze residual** (owner, before any production scheme-2 deployment): choose a zero-fee factory for
   upgradeable or fee-switch tokens, or a specified fail-open change to `_collectFee` (spec update required).
4. **Release trust root and origin** (owner): release-signer `allowed_signers` is empty by design; Git-tag SSH/PGP
   signing and secp256k1 deployment-manifest signing are separate trust roots; ADR-0029 dedicated origin undecided.
5. **Deployment evidence** (external): 73 unverified release cells in the chain matrix (42 chain, 27 token, 4 feed);
   Sepolia first, then Base Sepolia, from authenticated deployments only.
6. **Private security inventories** (owner access): CodeQL/Dependabot alert APIs 403, secret-scanning API blocked;
   no Sonar inventory.
7. **External acceptance**: real wallets, devices, WebKit/Firefox, screen readers, native-language review and an
   independent security audit.
8. **Coordination**: open draft PR #204 (another session) conflicts with this candidate in `.github/workflows/ci.yml`
   and `CLAUDE.md`; whichever merges second resolves them.

## Proposed next action (requires the owner)

1. Configure protection on `main` (blocker 1), requiring the checks listed above.
2. Mark PR #203 ready for review and merge it into `main` with a **merge commit or fast-forward, not a squash**, so
   the 1,482 commits of preserved provenance remain reachable. Mythril being red does not affect `main`; it blocks
   releases through the enforced release gate.
3. After the merge, re-run the census against the new `main` and apply [RETIREMENT_PLAN.md](RETIREMENT_PLAN.md)
   only with explicit approval (close #187 and the contained Pages/spec PRs with comments naming retained commits;
   preserve every non-ancestor head before any branch deletion; keep `gh-pages` outside source merges).
4. Decide blockers 2–4, then start the [next-phase queue](NEXT_PHASE_QUEUE.md) with spec 18 key portability (K01) and
   the Sepolia-first beta packet (B01).
