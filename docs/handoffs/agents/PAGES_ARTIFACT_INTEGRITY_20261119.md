# Independent GitHub Pages artifact integrity verification — 2026-11-19

## Scope and ownership

- Isolated branch: `chatgpt/ghostpay-pages-artifact-integrity-20261119`
- Starting `main`: `8f56376427c96881f49590920ff0bf8543ec81b4`.
- Changed production file: `scripts/pages/verify-pages-artifact.mjs` (blob `b13870688d722fe5928ed192499ae76be55554ee`, commit `924559411aff83e6de50cb23059dd3976bd9d03a`).
- New tests: `scripts/pages/verify-pages-artifact.test.mjs` (current blob `341e14cfd555a8db44eba8861458b682dedd54ff`, original test commit `35e2b6f92fabdfd5125e5997bdd71ec5c0887934`, CLI-test follow-up `9bf0e1bbf8f083c51fe7924535273857a7a68d72`).
- Existing integration branches, workflows, release settings, testnet manifests, contracts, and deployed Pages content were not modified.

## Purpose

Provide an independent consumer-side check that an extracted Pages release artifact matches an externally trusted `evidence/SHA256SUMS`. This is separate from the producing build's own site verifier. It rejects missing, extra and modified files, noncanonical, malformed, duplicated or out-of-order checksum records, unsafe/traversal paths, and symlinked files or checksum inputs. An optional full 40-hex source commit must match `site/build-info.json`. It checks that `index.html`, `.nojekyll`, and `build-info.json` are present.

## Usage

From the repository root after extracting the approved Pages artifact:

```sh
node scripts/pages/verify-pages-artifact.mjs \
  /path/to/extracted/site \
  /path/to/trusted/evidence/SHA256SUMS \
  --expect-commit <approved-40-hex-source-commit>
```

Exit 0 confirms the file inventory and hashes matched the supplied trusted manifest; exit 1 indicates failed verification; exit 2 indicates invalid CLI usage. Obtain the checksum manifest from the independently approved workflow/release, **not from the same untrusted site**. File hashes alone do not authenticate a publisher, prove the safety of the software, or qualify a deployed site.

## Executed verification

- Node `v22.16.0` run: `node --test verify-pages-artifact.test.mjs` on exact file blobs copied to `/mnt/data/ghostpay-work`.
- Result: **6 test groups passed, 0 failed, 0 skipped**; includes fixture-level positive, integrity failures, path/manifest validation, symlink denial source-commit mismatch, and real CLI exit-code paths.
- Local `git hash-object` of both tested files exactly matches their published GitHub blob SHAs above.
- No full workspace dependency installation or actual published Pages artifact was used in this environment. Repository CI and independent code review remain **pending**, not passed.

## Next integration steps

1. Review this isolated patch independently, including filesystem race and checksum trust assumptions.
2. Run the repository Pages job on the exact candidate. The existing Pages workflow runs `node --test scripts/pages/*.test.mjs`, which includes the new test.
3. Confirm artifact verification on a real fresh Pages artifact. Consider invoking the new checker in the existing Pages validation job after confirming it does not overlap the active release-engineering owners.
4. Refresh against current `main`, obtain exact-source CI and reviewer approval, then merge via the normal PR workflow. No deployment or version tag is authorized by this work.

## Release dependencies not affected

ADR-0029 is still proposed. GP-PAGES-01 dedicated-origin decision and other mandatory owner/external release gates remain open. This task does not enable any payment execution, mainnet, signed manifest, deployment, or public release.

## Actual Pages artifact verification (supplemental, not this PR's own build)

Downloaded the GitHub Actions artifact from the completed Pages run
[44476268665](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476268665)
associated with PR #252, artifact ID `14507875287`.
The archive digest from the GitHub artifacts API is
`sha256:133a610fb8e1973aa227c84ecf4c2803117171ecf72d204c060fa61342479349`;
the locally downloaded ZIP hash matched exactly.

- Built and recorded source: `e959f6ba6e5e868a8edf87a8d5bb42f27eb2e757` (the workflow's pull-request merge source, **not** the PR #252 head or this PR's source).
- `node verify-pages-artifact.mjs site evidence/SHA256SUMS --expect-commit e959f6ba6e5e868a8edf87a8d5bb42f27eb2e757`: **PASS, 16/16 files verified**.
- Repeated with expected commit `4085622463411d3ba27f4efb7b73a70575170535`: **exit 1**, `build-info.json: unexpected source commit`.
- Artifact `pages-evidence.json` reports `paymentsEnabledChainIds: []`, release profile `lean`, and `sharedOrigin: true`. These are artifact metadata observations, not deployment qualification or a separate assertion that the payment UI is unreachable.
- Tests and artifact verification were executed on Node 22.16.0. The actual PR #276 GitHub Actions results remain separately pending and cannot be inferred from this older artifact.

No site was deployed or accessed by this work. The origin-isolation decision remains unresolved.
