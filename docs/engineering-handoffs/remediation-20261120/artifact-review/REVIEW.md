# Independent Pages artifact and promotion review

Date: 2026-11-19, America/Vancouver. Reviewer: `/root/artifact_security_review`, separate from the promotion-gate implementer.

## Scope and conclusion

The current hardened artifact verifier satisfies the tested extracted-artifact integrity boundaries. No new defect in the verifier itself was demonstrated. This review identified a separate qualification gap: the builder generated a checksum manifest but never invoked the independent artifact verifier before moving the staged output into its publishable location. Verifier unit tests alone did not exercise actual artifact promotion.

The coordinator's minimal correction in `308dcbb2d40793514ea303a898282578dc17342d` is suitable for integration within this bounded scope. It runs the existing verifier against staged bytes and `SHA256SUMS`, requires the exact builder commit, preserves a successful verification receipt, and promotes the site/evidence only after success. The existing `set -euo pipefail` causes any verification or receipt failure to abort before either final move. No privileged workflow job, permission, dependency, signing identity, deployment configuration, release policy, assertion or existing verifier behavior changed.

This is a release-qualification gap, not a demonstrated remote exploit or a confirmed critical/high-severity vulnerability. The new gate checks integrity against a manifest just produced by the build; it does not authenticate an externally supplied manifest or turn the build into an external audit.

## Source identities

| Item | Identity |
| --- | --- |
| Reviewed canonical candidate | PR #278, `d74af79ebabdc8cead843361c3497b46d8c421f9` |
| Candidate tree | `e76c03d9dba595ff1171577139c1628c4ad45f5b` |
| Original verifier hardening | PR #277, `8cbae85c95fa707210704ee72bb4416b36e5a4d7` |
| Current verifier blob | `56a1753d5181a6c5f9738ab62fd5f32911b6b516` |
| Current 17-group test blob | `d827559a5db32969b955d4f299a65db420010824` |
| New promotion regression commit | `48fd207526cf6611cef272a49ebef038edb77155` |
| Coordinator's production correction | `308dcbb2d40793514ea303a898282578dc17342d` |

The reviewer created a separate frozen checkout of the production correction and executed it directly. Baseline reproduction temporarily placed only the exact new test file in the review checkout of `d74`; the original builder and verifier remained unchanged, and the temporary file was removed in `finally`. The coordinator's worktree and active product source were never modified by this reviewer.

## Fresh hosted artifact verification

This review independently retrieved the artifact from [Pages run 44643709322](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709322), artifact ID `14586739296`, `pages-site-a7ceff94269cddfbc725677dd03737d96a449039`.

- Downloaded ZIP SHA-256: `58077dbda4cad5606bb02a023f5dc86063507f158778513b853101af1b4e2df5`, equal to the authenticated GitHub artifact metadata.
- Artifact source: synthetic merge `a7ceff94269cddfbc725677dd03737d96a449039`, parents `c977b5d6723f6822c3b5d86cd6b231712c53c395` and `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- GitHub's source tree for that merge is exactly `e76c03d9dba595ff1171577139c1628c4ad45f5b`, identical to the reviewed candidate tree.
- Archive paths were checked for absolute paths, traversal, backslashes and symlinks before extraction; expanded bytes were bounded.
- The independent verifier passed **16/16 files** with the actual synthetic merge commit required. The separate site-safety verifier also passed **16 files**.
- Artifact evidence declares **zero payment networks**, lean profile, and a shared `https://djshellshoxxx.github.io` origin. The manifest hash and exact raw build metadata are preserved in the evidence directory.

The artifact's SHA must be checked literally: requesting `d74` fails even though the two source trees match. This is expected exact-source behavior, not a defect. The artifact predates the new promotion gate. It establishes that the existing hardened verifier works with a newly generated real workflow artifact; it does not establish publication, a signed owner deployment manifest, or qualification of a later source commit.

## Executed independent checks

| Check | Actual result |
| --- | --- |
| Existing verifier regressions, Node 24.22.3 | 17 passed, 0 failed, 0 skipped |
| Existing verifier regressions, Node 22.23.4 | 17 passed, 0 failed, 0 skipped |
| New promotion test against original `d74` builder | 0 passed, 7 failed as expected; six corrupt artifacts reached promotion with exit 0, and the valid artifact lacked the required independent-verification receipt |
| New promotion tests plus unchanged verifier tests against frozen `308dcbb2`, Node 22.23.4 | 24 passed, 0 failed, 0 skipped |
| Adversarial CLI controls on copies of the actual hosted artifact, Node 24 and Node 22 | 12 passed on each runtime; overlapping probes, not 24 distinct scenarios |
| Existing site-safety verifier on the real hosted artifact | 16 files passed |
| Full original Pages tooling suite at frozen `308dcbb2`, Node 22.23.4 | **119 passed**, 0 failed, 0 skipped |
| Bash syntax, new test JavaScript syntax, and whitespace checks | Passed |

The 119-test run used read-only links to the coordinator’s unchanged dependency installation and workspace output. Libraries had been built under Node 24 and were exercised by the reviewer under Node 22. This was not a new dependency installation or fresh full builder run.

The 24 fixed groups include the 17 unchanged verifier groups and seven new promotion groups. Do not add these overlapping counts together. The promotion harness executes the actual final shell block with the real verifier and staged fixture files; it does not rerun Vite seven times or claim a full application build. The coordinator owns fresh complete builds and final integrated qualification.

The independent real-artifact probe tests intact source, a different source SHA despite an equal tree, modified bytes, an extra executable file, a missing required file, a symlink pointing to matching bytes, duplicate records, traversal records, CRLF records, a symlinked checksum manifest, an invalid source argument, and the usage exit code. Rejections return exit 1; usage returns 2. The original tests additionally cover file-identity swaps, descriptor cleanup, read failures, late additions, ancestor mutation detection, and lossless UTF-8 path and manifest handling.

## Trust and remaining gates

The checksum manifest must come from a trusted release/workflow independently of a potentially compromised website. This review obtained an authenticated workflow artifact and checked its archive digest before examining its internal checksums. No release signature or attestation is fabricated.

Keep the source tree, manifest and their ancestors private and stable during verification and use. The verifier detects observed filesystem changes; it is not an atomic filesystem snapshot against an arbitrary concurrent writer. The implementation explicitly requires supported `O_NOFOLLOW` and `O_NONBLOCK` flags. Only Linux execution is qualified here. Resource consumption scales with artifact size.

The builder correction does not resolve full browser qualification, outstanding analyzer/security acceptance, dedicated-origin policy, owner signing identity, deployment approval, real-wallet/testnet acceptance, or external review. Whole-product release readiness must be decided against the current complete matrix, not these bounded passing checks.

## Reproduction

Use Node 22 with the repository's unchanged dependencies and source revision. Run:

```sh
node --test scripts/pages/build-pages-artifact-gate.test.mjs scripts/pages/verify-pages-artifact.test.mjs
node scripts/pages/verify-pages-artifact.mjs /path/to/site /path/to/trusted/SHA256SUMS --expect-commit ACTUAL_FULL_BUILD_SHA
node scripts/pages/verify-pages-site.mjs /path/to/site /path/to/ghostpay-lean-build.json --expect-commit ACTUAL_FULL_BUILD_SHA
node docs/engineering-handoffs/remediation-20261120/artifact-review/evidence/hosted-artifact-probes.mjs /path/to/extracted-artifact scripts/pages/verify-pages-artifact.mjs
```

The hosted probe intentionally pins the specific recorded artifact source. A new artifact requires a newly recorded source identity and reviewed corresponding fixture constant. Raw logs, metadata, checksums, source hashes and the reviewer-owned probe are included under `evidence/`.


## Additional independent CodeQL fixture review

The coordinator separately requested review of `008ccdcf05b703cea51ffc4fdaa42fc279281d81`. Its two test-only changes construct intentionally malformed fixed inputs directly instead of using single-occurrence replacement. The production parser, scanner, assertions, analyzer configuration and workflow gates are unchanged. No alert was suppressed or dismissed.

The reviewer parsed the actual frozen original/new TypeScript and JavaScript source, extracted the two expressions and their real fixture-producing declarations with the TypeScript AST, evaluated those expressions, and compared the resulting bytes. This verifies the specific fixture domains; it does not claim the transforms are interchangeable for arbitrary strings.

| Actual hostile fixture | Equal original/new byte identity | Preserved security case |
| --- | --- | --- |
| Manifest | 760 bytes, SHA-256 `a98b16b14e498d5598beb530caeaa0d1273e59ced23b19f8fff158bf7fd90281` | Parsed object retains its own `__proto__` key; the original rejection assertion remains |
| CSP meta tag | 250 bytes, SHA-256 `8d1df43e5446dde7b518b47c8f8fd1b399669c7f8ba8b7080afc7d18ef70386a` | Exactly two `content` attributes remain; the original scanner rejection assertion remains |

The original deployment test file passed **13/13** on both `d74` and `008ccdcf`; the original CSP bundle test file passed **49/49** on both. All used Node 22.23.4 with unchanged test configuration. These are focused checks, not whole-package coverage or CodeQL execution. The fixture clarification is suitable for integration in this bounded scope. **Fresh hosted CodeQL remains required.** No confirmed runtime vulnerability or analyzer clearance is asserted.

`evidence/codeql-fixture-equivalence.mjs.txt` preserves the reproducible independent source-extraction probe without adding another executable repository test or introducing test-fixture constructs into the analyzer’s normal source set. `codeql-fixture-equivalence.json` records the exact source expressions and byte hashes; `codeql-focused-tests.json` and compressed logs record the independently executed suites.
