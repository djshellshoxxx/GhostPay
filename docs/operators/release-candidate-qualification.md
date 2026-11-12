# Release-candidate qualification

Audience: the maintainer qualifying a release candidate (RC) before the draft GitHub release is published.
Related: `docs/operators/release-and-verify.md` (pipeline and end-user verification), `.github/release-signers/README.md`
(trust root).

This is a repeatable, numbered procedure. Run every step in order and record the output (commands, exit codes,
hashes) in the release notes or the release issue. Any failure stops the procedure: go to step 12 (rollback). Do
steps 1-9 on a machine **other than** the one that holds the signing key and **other than** any host serving the app.

Notation: `TAG=v1.2.3-rc.1` (or the final `v1.2.3`), `REPO=<owner>/<repo>`.

## Human-only gates

These cannot be automated or delegated to an agent:

| Gate | Who | Where |
|---|---|---|
| G1. Custody of the release-signing private key; adding/rotating/revoking its public key in `.github/release-signers/allowed_signers` (reviewed PR to the default branch) and publishing the fingerprint out of band | Owner | `.github/release-signers/README.md` |
| G2. Creating and pushing the signed tag | Maintainer holding the key | step 2 |
| G3. Approving the `release` environment for `build` and for `draft-release` | Required reviewers | GitHub Environments |
| G4. Publishing the draft release (and any hosting decision, which stays disabled without an ADR) | Owner | step 11 |
| G5. Repository settings: tag ruleset for `v*`, required reviewers on `release`, owner review for `.github/release-signers/**` and `scripts/verify-tag.sh` | Owner | Settings |

Until G1 is done, the `verify` job fails at "Verify tag signature" with `no release-signing keys are pinned`; that is
expected and is the correct behavior.

## Procedure

1. **Clean checkout of the candidate commit.**
   ```
   git clone <repo-url> gp-rc && cd gp-rc
   git checkout --detach <candidate-commit>
   git status --porcelain            # must print nothing
   node --version; npm --version     # Node 22 / npm 10, as in CI
   npm ci --ignore-scripts --no-audit --no-fund
   ```
   The candidate commit must be on the default branch (`git merge-base --is-ancestor <commit> origin/main`).

2. **Tag (gate G2).** On the key holder's machine, sign an annotated tag on exactly that commit and verify it before
   pushing:
   ```
   git tag -s "$TAG" -m "GhostPay $TAG" <candidate-commit>
   bash scripts/verify-tag.sh --ancestor-of origin/main "$TAG" <candidate-commit>
   git push origin "$TAG"
   ```
   Never move or re-push a tag after the workflow started; cut a new RC number instead.

3. **Gates.** Confirm the CI run for the commit is green (typecheck, lint, tests incl. anvil e2e, contracts, Slither,
   secret scan, pinned actions) and that the latest nightly (fuzz, audit, reproducibility) is green. Locally:
   ```
   npm run typecheck && npm run lint && npm test
   node --test scripts/tests/release-*.test.mjs
   bash scripts/scan-secrets.sh && bash scripts/check-actions-pinned.sh
   npm audit --omit=dev --audit-level=high
   ```
   Contract checks need Foundry (`forge fmt --check && forge build --sizes && forge test` in `packages/contracts`);
   if it is not installed locally, rely on the CI run for this commit and record its URL.

4. **Local release build.** With the tag fetched (`git fetch origin tag "$TAG"`) and the tree clean:
   ```
   VERSION="$TAG" GP_REQUIRE_RELEASE=1 OUT_DIR="$PWD/../rc-local" bash scripts/release-build.sh
   ```
   It must end with `channel=release`. Record the three lines of `SHA256SUMS`. (About 35 s after `npm ci` with
   `GP_SKIP_INSTALL=1` on a typical Linux host.)

5. **Reproducibility.**
   ```
   bash scripts/repro-check.sh --head
   ```
   Must print `REPRODUCIBLE`. It builds twice in fresh clones with different directory names (about 2 minutes,
   including two `npm ci`). Then compare the local tarball hash from step 4 with the one in the draft (step 7).

6. **Workflow run.** Watch `release.yml` for `$TAG`. `verify` must show
   `OK: $TAG ... signed by pinned signer ... reachable from refs/remotes/origin/main`. Approve `build` (gate G3) only
   after `verify` passed; `build` re-verifies the tag and must log `channel=release` and `RESULT: hash checks passed`.
   Approve `draft-release` (gate G3) only after `build` passed.

7. **Download the draft and verify it** (separate machine, fresh directory):
   ```
   gh release download "$TAG" --repo "$REPO" --dir rc-dl
   commit="$(git rev-parse "$TAG^{commit}")"
   bash scripts/verify-release.sh "rc-dl/ghostpay-web-$TAG.tar.gz" rc-dl/SHA256SUMS "$commit" rc-dl/release-manifest.json
   ```
   (If your `gh` cannot see the draft, download the `release-artifacts` upload of the `build` job instead.)
   Must end `RESULT: hash checks passed`. Then compare: the draft's tarball and SBOM sha256 must equal the local
   build from step 4 (`diff <(grep -v manifest rc-dl/SHA256SUMS) <(grep -v manifest ../rc-local/SHA256SUMS)`; the
   manifest differs only in tool versions and CI run URL).

8. **Attestation.**
   ```
   for f in rc-dl/ghostpay-web-"$TAG".tar.gz rc-dl/sbom.cdx.json rc-dl/release-manifest.json; do
     gh attestation verify "$f" --repo "$REPO" --source-ref "refs/tags/$TAG" \
       --signer-workflow "$REPO/.github/workflows/release.yml"
   done
   ```
   Every file must verify. A failure means the bytes were not produced by this repository's release workflow at this
   tag.

9. **Tag verification against the independently published key.** Build an allowed-signers file from the fingerprint
   published out of band (not from the repository), then:
   ```
   bash scripts/verify-tag.sh --allowed-signers ~/ghostpay_allowed_signers "$TAG" "$commit"
   git diff "$TAG" -- .github/release-signers/      # compare the pinned file with what you expect
   ```

10. **Draft release review.** Check the draft page: title `$TAG`, exactly four assets (`ghostpay-web-$TAG.tar.gz`,
    `SHA256SUMS`, `sbom.cdx.json`, `release-manifest.json`), notes list open audit findings (`docs/audits`), the
    manifest's `channel` is `release`, `commit` equals `$commit`, `publication.status` is `not-published`, and
    `chains.deploymentManifests` addresses match the independently published addresses. Review the SBOM for
    unexpected production dependencies compared with the previous release.

11. **Publish (gate G4).** Only the owner publishes the draft, by hand. Hosting/IPFS/ENS/Tor stay disabled unless an
    ADR records the decision. Record the qualification evidence (steps 1-10) in the release issue.

12. **Rollback / abort.** Any failure before publication: delete the draft release
    (`gh release delete "$TAG" --repo "$REPO"`, keep the tag for forensics or delete it with
    `git push origin :refs/tags/$TAG` if it was never announced), fix on the default branch, and cut the next RC number;
    never reuse or move a tag. After publication: mark the release as not recommended in its notes, publish a new
    patch release, and follow `docs/operators/incident-response.md` if the cause is a compromise (rotate the signing
    key via G1 and `valid-before=` on the old key line).

## What each step defends against

| Step | Catches |
|---|---|
| 2, 6, 9 | Unsigned/forged tags, tags signed by an unpinned key, tags re-named or moved, tags on unreviewed commits |
| 4, 7 | Development or dirty builds labelled as releases, wrong commit, mismatched version, tampered or incomplete assets, unsafe archive entries |
| 5, 7 | Non-reproducible output; a runner that produced different bytes than the source |
| 8 | Assets not produced by this repository's release workflow at this tag |
| 10 | Wrong deployment addresses, unexpected dependencies, accidental publication settings |
