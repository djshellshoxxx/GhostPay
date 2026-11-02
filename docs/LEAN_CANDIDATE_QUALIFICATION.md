# Lean candidate build qualification

On hosted CI with the pinned Node/npm toolchain, Git, GNU tar, gzip and public npm
registry access, run from a clean committed checkout:

```sh
bash scripts/qualify-lean.sh "$RUNNER_TEMP/ghostpay-lean-qualification"
```

The destination must be a new absolute directory outside the checkout. The script
checks HEAD/tree and GITHUB_SHA when set, then clones that exact commit into two
different clean paths. Each copy invokes the existing release build, including
npm ci, rebuilt workspace libraries, web type checks and the postbuild scan.
The profile is forced to lean with empty deployment manifests and verification
keys. It creates an unsigned, unconfigured CI candidate, not a production release.
It does not create a tag, signature, attestation, deployment or publication.

The tarball (including its embedded module/Worker report), normalized npm SBOM,
release manifest, separate module report and checksums must all match byte for
byte. The first candidate and both logs are retained with qualification.json,
which records source commit/tree, lockfile digest, toolchain and artifact hashes.
Temporary clones are removed. Failures retain logs without a passing receipt.
CI should upload the output directory for review without publishing a release.

Existing full-profile builds/tests, coverage thresholds, KDF/fuzz budgets,
configured-manifest tests, browser route/Worker/error/configuration smokes and
license review remain required. The npm production-dependency SBOM is broader
than emitted lean modules and is not vulnerability or licensing clearance. Two
builds on one runner do not establish independent or cross-platform reproducibility.

Local verification is shell syntax and source review only. Restricted dependency
cache, network and child-process access prevent a real local build comparison;
hosted execution is required before claiming this qualification passed.
