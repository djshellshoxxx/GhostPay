# Reproducible-build second-builder check

Base: HEAD 90d4b265de5bf643183f6d5d353238288da9cf69, SOURCE_DATE_EPOCH=1792608402, worktree snapshot (tracked + untracked-not-ignored), Node v22.22.0, npm 10.9.4, forge 1.8.5, solc 0.8.28 (static binary, sha256 9a0fb7e0...6f25). Scratch: /tmp/claude-0/assure-repro/.

## Result summary

| Check | Result |
|---|---|
| Web tarball, 2 clean copies, different dir/umask/TZ/mtime/LANG, full `npm ci` + `scripts/release-build.sh` | IDENTICAL `ad12c63de316519482e568dd4d842c3d10c865d6322a56430c1c5bfa833d743b` |
| All 115 files under `packages/*/dist` + `apps/web/dist` | IDENTICAL (per-file sha256 diff empty) |
| `sbom.cdx.json` in the same two copies | DIFFERENT (finding F1) |
| `scripts/repro-check.sh --head` and `--worktree` | both REPRODUCIBLE (tarball and SBOM SAME; SBOM ca05b687...8e5ca... see below) |
| Contracts: 2 clean `forge build`, 150 artifacts compared (creation + runtime bytecode) | IDENTICAL, 0 differing |
| `verify-release.sh` dry run (positive, wrong commit, unlisted tarball) | PASS / FAIL / FAIL as expected |

## Method

Build A: `/tmp/claude-0/assure-repro/A/x`, umask 022, TZ=UTC, LANG=C.UTF-8, all file mtimes 2020-01-01, HOME separate.
Build B: `.../B/deeper/path/y`, umask 077, TZ=Pacific/Kiritimati, LANG=en_US.UTF-8 (locale not installed; fell back to C, so locale variation was NOT really exercised), mtimes 2031-06-15.
Both with `VERSION=repro SOURCE_DATE_EPOCH=1792608402 GP_COMMIT=<HEAD>` and no `GP_SKIP_INSTALL` (so `npm ci --ignore-scripts` ran in each). Driver: `/tmp/claude-0/assure-repro/build.sh`. Note release-build.sh itself forces `TZ=UTC LC_ALL=C`, so TZ/locale variation is overridden by design; umask/mtime/dir path were the effective variables.

Repro: `bash build.sh A <dir> 022 UTC C.UTF-8 2020-01-01` and `... B <otherdir> 077 Pacific/Kiritimati en_US.UTF-8 2031-06-15`, then `sha256sum */release-out/*`.

## Findings

### F1 (low/medium) SBOM is not path-independent: root component name = checkout directory basename
- Evidence: A vs B `sbom.cdx.json` differ at `metadata.component.name` (`"x"` vs `"y"`), sha256 9d184484... vs b297841b...; manifest differs only through the SBOM sha256 line. Tarball identical.
- Cause: `npm sbom` names the root component after the directory, not `package.json` name (`ghostpay`). `scripts/normalize-sbom.mjs` normalizes only `serialNumber` and `metadata.timestamp`.
- Why it was not caught: `scripts/repro-check.sh` always builds in directories both named `ghostpay` (`$tmp/a-first/ghostpay`, `$tmp/b-second/nested/ghostpay`), so basename is equal. A third-party verifier cloning into e.g. `ghostpay-main/` or `ghostpay-v1.0.0/` will get a different SBOM and SHA256SUMS/manifest hash and a false "not reproducible" for those files (tarball still matches). Also the CI release job checkout dir name (`<repo>`) may differ from a local clone.
- Fix (verified): in `normalize-sbom.mjs`, before serialising, add
  `if (sbom.metadata?.component) sbom.metadata.component.name = 'ghostpay';` (better: read name from root `package.json`). Tested on both copies with a patched normalizer at `/tmp/claude-0/assure-repro/fix/normalize-sbom.mjs`: both give sha256 ca05b687a58708a4d038f6c587409e1fa8d611b0ef5d92e50105fbdc8a465e8c, which equals the repro-check SBOM hash from the `ghostpay`-named dirs. Also change repro-check.sh to use differently named leaf dirs (e.g. `a-first/ghostpay-a`) so it would have detected this; docs/operators/release-and-verify.md should say the checkout dir name is irrelevant once fixed.
- Repro: build in two dirs with different basenames; `diff A/release-out/sbom.cdx.json B/release-out/sbom.cdx.json`.

### F2 (info) SBOM and manifest embed tool versions
`sbom.metadata.tools` records `npm cli 10.9.4`; the manifest records tool versions (documented as excluded from comparison). A verifier on a different npm minor will see a different SBOM hash. Docs claim reproducibility only for same Node/npm major (release-and-verify.md line ~84); the SBOM is stricter (npm exact version). Suggest normalizing/removing `metadata.tools` in normalize-sbom.mjs or documenting. Not exercised here (single npm version).

### F3 (low) `packages/contracts/foundry.toml` at HEAD points `solc` at `/home/user/tools/solc`
That path does not exist in this sandbox (`forge build` fails: `solc "/home/user/tools/solc" does not exist`); the file is tracked at HEAD (introduced 307d7fe). CI rewrites it via sed in `.github/actions/setup-forge/action.yml`. Impact: a verifier running `forge build` from a clean clone fails unless they replicate the sed; the reproducibility claim for contracts depends on solc 0.8.28 + settings (optimizer 200, cancun, `bytecode_hash=none`, `cbor_metadata=false`), all of which are pinned in the file apart from the solc selection. Fix: commit `solc_version = "0.8.28"` as default and keep the sandbox path in an untracked profile/env (`FOUNDRY_SOLC_VERSION`/`FOUNDRY_SOLC`). I did not modify the file.

### F4 (info) No pinned expected bytecode hashes in scripts/
`packages/contracts/scripts/pre-deploy-check.sh` only compares an operator-supplied `EXPECTED_ANNOUNCER_CODEHASH`; there is no in-repo golden codehash for Router/SweepRelayer/Policy contracts, and `deployments/*.json` `bytecodeHashes` are read from chain after deploy (deployments/README.md). So "compare to scripts/ expectations" had no expectation to compare against. Suggest committing and CI-checking `codehashes.json` for the production contracts. Reference values from this run (runtime bytecode `cast keccak`, solc 0.8.28, repo settings):
- GhostPayRouter 0xe91d5a9557521862a5b129c6e403eb9ac9310e48d05c67d069152fe2beb8bfb4 (4749 bytes)
- GhostPaySweepRelayer 0xff5ad04262262f07c80a4c304d6e898528abf6eb6929208b300de225018d3a60 (5146 bytes)
Caveat: Router constructor immutables (if any) are embedded in runtime code, so on-chain codehash may differ per deployment arguments.

## Contracts detail

Two copies of `src script lib test foundry.toml remappings.txt` in `C1/` and `C2/deeper/nest/` (different depth, separate copies of the solc binary at different paths, umask 022 vs 077, mtimes 2031-01-01, TZ UTC vs Pacific/Kiritimati, separate FOUNDRY_OUT/FOUNDRY_CACHE_PATH). Only change vs repo: `solc =` line pointed to the scratch solc copies. `forge build` in each; compared `bytecode.object` and `deployedBytecode.object` of all 150 artifacts: sets equal, 0 differ. GhostPayRouter, GhostPaySweepRelayer, GhostPayPolicyRouter, PolicyAccountFactory, PolicyAccount runtime bytecode also equals existing `packages/contracts/out` (built by another agent). Metadata hash is off (`bytecode_hash=none`, `cbor_metadata=false`) so source paths do not leak into bytecode. forge emitted lint notes only (environment-read-across-mutation), no build errors.

## Script dry-runs

- `scripts/repro-check.sh --worktree` (TMPDIR in scratch): `SAME` tarball ad12c63d..., `SAME` SBOM ca05b687..., "REPRODUCIBLE", rc 0.
- `scripts/repro-check.sh --head`: same hashes, rc 0. (HEAD-clone and worktree produce the same tarball, so uncommitted changes in the snapshot did not affect `apps/web/dist`.)
- `scripts/verify-release.sh` on build A output with correct commit and manifest: all 9 checks PASS. With commit `000...0`: `FAIL manifest commit ... != expected`, RESULT FAILED. With a tarball not named in SHA256SUMS: `FAIL ... is not listed`, RESULT FAILED. (An early `| head` pipe gave rc 141 from SIGPIPE; that was my pipe, not the script.) Attestation / signed-tag steps are checklist text only; not runnable.

## Not run
- Different Node/npm versions, macOS, or a different host (only one Linux host; the "second builder" is a second clean directory/env, not independent infrastructure).
- True locale variation (en_US.UTF-8 not installed); release-build.sh pins TZ/LC_ALL anyway.
- Downloading solc 0.8.28 fresh (binaries.soliditylang.org blocked by proxy); used the local static binary.
- Relayer/other apps' builds beyond libs (release only packages apps/web).
- `gh attestation verify`, `git verify-tag` (no tag/attestation exists).
