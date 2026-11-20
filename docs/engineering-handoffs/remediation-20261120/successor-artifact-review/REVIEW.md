# Independent local artifact check for the integrated successor

Date: 2026-11-19, America/Vancouver. Reviewer: `/root/artifact_security_review`.

**Result: both recorded local artifacts pass the exact-source integrity and site-safety checks; their served bytes reproduce.** This is a bounded same-machine check of the coordinator's completed builds, not hosted CI, live deployment, independent-builder reproducibility, or whole-beta qualification.

## Exact source

- Candidate: `936d054ed067d89c773310d42e33939c1129bbfa`.
- Tree: `02b24c83c14a8af608a97ccdd7ed97b0a3351a87`.
- Ordered parents: `814950a1cf99e68765b85f241e6f4a0fc55ea9c6`, then `417f7c71daf8645e1432f2ec8f070110879b80bd`.

The reviewer independently read the GitHub commit object and compared it with the coordinator's local candidate checkout. The local HEAD and tree matched; the working tree was clean before and after verification. This review did not change that checkout and does not assert that a PR branch was updated or its hosted checks completed.

## Executed checks

The coordinator supplied two completed local builds: `pages-936d054e-a` and `pages-936d054e-b`. The reviewer independently ran the candidate's actual scripts with Node **22.23.4** against each build, requiring the exact candidate commit:

```sh
node scripts/pages/verify-pages-artifact.mjs SITE TRUSTED_BUILD_SHA256SUMS --expect-commit 936d054ed067d89c773310d42e33939c1129bbfa
node scripts/pages/verify-pages-site.mjs SITE LEAN_REPORT --expect-commit 936d054ed067d89c773310d42e33939c1129bbfa
```

| Check | Build a | Build b |
| --- | --- | --- |
| Independent artifact checksum/source verifier | 16 files passed | 16 files passed |
| Separate site-safety verifier | 16 files passed | 16 files passed |
| Automatic build-time verification receipt | Present; 16 files passed | Present; 16 files passed |
| Exact build metadata commit | Candidate SHA | Candidate SHA |
| Enabled payment networks | Empty array | Empty array |
| Deployment-manifest hash | SHA-256 of `{}` | SHA-256 of `{}` |
| Build mode | Lean; release mode | Lean; release mode |
| Origin | `https://djshellshoxxx.github.io` | `https://djshellshoxxx.github.io` |
| Shared origin | `true` | `true` |

Both `SHA256SUMS` files are byte-identical. Their SHA-256 is:

```text
dcd15d9346168f9c948614b957541371203376cc55024135b050a6138be9e7c3
```

The reviewer separately enumerated and hashed all 16 served files from each build; the complete path-to-hash maps are identical. Both builds' metadata checksum digests also match the actual manifest bytes. The build-generated receipt in each artifact matches the independently observed successful verification message.

These are repeated builds on the same machine with the same source and dependency/toolchain environment. No broader mutation suite was rerun. Earlier regression results remain separately recorded. The `release` metadata flag represents the builder's mode; it does not represent deployment or owner approval.

## Evidence and boundaries

`evidence/QUALIFICATION.json` records the independently retrieved source identity, candidate verifier blobs/hashes, exact commands, outputs, metadata, and all served-file hashes. The two original checksum manifests, build metadata, generated verification receipts and independent verifier logs are retained. `SHA256SUMS.json` hashes every committed report/evidence file.

This check does not authenticate an externally supplied checksum manifest: it tests artifacts generated in the coordinator's controlled local build environment. It does not establish hosted qualification, a live website match, an approved signing identity, a signed payment deployment manifest, testnet acceptance, external review or dedicated-origin approval. The recorded shared origin remains a separate release requirement.

The earlier [PR #292 hosted artifact review](../hosted-artifact-review/REVIEW.md) remains valid for its distinct `814950a1` / `4b44077f` source. Its evidence has not been replaced or relabelled as qualification of this successor.

Only this report, evidence and an additive ownership claim changed. No product, tests, workflow, coordinator artifact, remote reference, release or deployment state was modified.
