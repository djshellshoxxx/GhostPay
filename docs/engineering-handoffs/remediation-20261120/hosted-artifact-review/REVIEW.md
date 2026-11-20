# Independent verification of PR #292's hosted Pages artifact

Date: 2026-11-19, America/Vancouver. Reviewer: `/root/artifact_security_review`, independent of the Pages promotion-gate implementer.

**Result: the recorded CI artifact passes the bounded integrity and site-safety checks.** The newly integrated build-time verifier produced its receipt, and a separate download and verification reproduced its 16-file success. This does not certify a live deployment, a signed payment deployment manifest, the whole beta, or the later canonical integration source.

## Exact artifact and source

| Item | Verified identity |
| --- | --- |
| Review entry | [PR #292](https://github.com/djshellshoxxx/GhostPay/pull/292) |
| Workflow | [Pages run 44648916609](https://github.com/djshellshoxxx/GhostPay/actions/runs/44648916609) |
| Artifact ID | `14590197888` |
| Artifact name | `pages-site-4b44077fe0ef783f27c390d75472f338266fa410` |
| Associated PR head | `814950a1cf99e68765b85f241e6f4a0fc55ea9c6` |
| Actual build source | `4b44077fe0ef783f27c390d75472f338266fa410` |
| Source tree, identical for build source and PR head | `d58874e0d4bfaace14abec3a41cbbff17d755707` |
| Downloaded ZIP | 798,814 bytes |
| ZIP SHA-256, equal to live GitHub artifact metadata | `aa63d415e514c8729e1c469a50c71857af1e52d8fa6d3d38809870789d61c7a3` |

The reviewer separately fetched both commit objects and compared their trees. The synthetic merge parents are `d74af79ebabdc8cead843361c3497b46d8c421f9` and the associated PR head. The checksum verifier and site-safety verifier were byte-identical to the reviewed PR source: Git blobs `56a1753d5181a6c5f9738ab62fd5f32911b6b516` and `1354549a79a4c550ee55d21ebe6e77f22b2af4ce`, respectively.

## Execution

The ZIP came through the authenticated GitHub connector. Before extraction, its digest was compared with freshly retrieved GitHub metadata. The reviewer checked unique entry names; rejected absolute/traversing paths, backslashes and control characters; allowed only regular files/directories; and bounded the total expanded size to 50 MB. The actual archive had 21 entries: 16 served files and five evidence files.

With Node **22.23.4**, the unchanged independent artifact verifier passed **16/16 files** against the build's `SHA256SUMS`, requiring the exact actual build source. The separate site-safety verifier passed **16 files**. No broad mutation suite was rerun; those original regressions and the new promotion failure cases are recorded in the preceding independent review.

The artifact contains `evidence/artifact-verification.log`, with the exact output:

```text
Pages artifact verified: 16 files match trusted SHA256SUMS.
```

Its output matches this reviewer's independent verification. This receipt is build evidence, not an extra served file; the manifest still covers exactly 16 files.

The reviewer also checked:

- `build-info.json` and `pages-evidence.json` both name the actual build source.
- `paymentsEnabledChainIds` is an empty array.
- Both records carry the SHA-256 of the empty deployment-manifest map, `{}`.
- The evidence's checksum-manifest digest matches the actual `SHA256SUMS` bytes.
- The profile is lean, the status is a payments-disabled demonstration, and `release` is true as the build-script mode.
- The declared origin is `https://djshellshoxxx.github.io`, with `sharedOrigin: true`.

The build's `release: true` field identifies its source/cleanliness mode. It does not represent owner approval, successful publication or whole-product release readiness.

## Scope limits and continuation

This is an authenticated workflow artifact and a reproducible local integrity check. It is not verification of files served by a live website. No payment signing key, deployment signature, testnet payment, origin approval, release approval or external audit is asserted. The shared-origin requirement remains unresolved. Later canonical source, including the coordinator-reported `417f7c71` continuation, requires its own source-pinned artifact and qualification.

Only this report, evidence and an additive ownership claim were written. No product, tests, workflows, remote references or deployment state changed. `evidence/ARTIFACT_IDENTITY.json` preserves API metadata, exact source objects, archive inventory, commands and results. The original checksum manifest, build metadata, generated receipt and independent verification output are included. `SHA256SUMS.json` hashes every committed evidence file.
