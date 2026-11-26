# Pages artifact verifier race repair — 2026-11-19

## Scope and source identities

- Worker: `clock_hosting_review`; independent reviewer: `strict_json_review`.
- New branch: `repair/ghostpay-276-artifact-races-20261119`.
- Sole publication parent: PR #276 `f39a9dd36c09f8b02d937c5f3d19676d334976d6`.
- Parent tree: `69c3e149c815b37df8e2d7eba4e58e067b0fadac`.
- Parent verifier: `b13870688d722fe5928ed192499ae76be55554ee`.
- Parent six-group test: `341e14cfd555a8db44eba8861458b682dedd54ff`.
- Repaired verifier: `56a1753d5181a6c5f9738ab62fd5f32911b6b516`.
- Final 17-group test: `d827559a5db32969b955d4f299a65db420010824`.

The original #276 branch remains read-only. This follow-up changes only its
verifier and test, this handoff, and an additive ownership claim. It retains
all six original test groups, including CLI coverage; the CLI test now uses
`fileURLToPath` so escaped filesystem paths are decoded correctly. Publication
uses the exact parent tree, not the local source-subset repository's synthetic
baseline commit. All other parent files and ownership claims are preserved.

## Reproduced defects and repair

The parent read `build-info.json` once for hashing and again for its commit.
A deterministic mutation between those reads accepted commit B although the
trusted checksum bound commit A. Separately, replacing an inventoried regular
file with an external symlink before its read accepted the external target
when its bytes matched the trusted hash. Both problems require mutable inputs;
the observations do not establish a static path-traversal bypass.

Commit validation now parses only the buffer whose digest matched the trusted
manifest. Each manifest/artifact read opens a descriptor with `O_NOFOLLOW` and
`O_NONBLOCK`, validates that the opened object is the same regular file, reads
once, and checks descriptor/path identity and metadata afterward. Every opened
descriptor closes in `finally`, including rejected object and read failures.
Bigint snapshots compare device, inode, mode, link count, size, modification
time and change time; access time is excluded because reads can update it.
A final inventory and input-identity pass rejects observed later changes.

Independent review also reproduced static filename aliasing through lossy
UTF-8 decoding: an unlisted raw `0xFF.js` filename collapsed into a trusted
valid `U+FFFD.js` filename. The same issue occurred for malformed manifest
filename bytes. Directory entries are now read as buffers and must round-trip
through UTF-8 before path construction; manifest bytes must round-trip before
record parsing. Valid Unicode filenames, including U+FFFD itself, remain valid.
These two encoding checks apply even when all filesystem inputs are stable.

## Filesystem and platform boundary

The caller must obtain `SHA256SUMS` from an independently trusted source and
keep the extracted tree, manifest, and their ancestors private and stable
through verification and subsequent use. Existing aliases in caller-supplied
parent paths are resolved once; a symlink as the final site root or manifest
is rejected. Artifact symlinks and non-regular files remain rejected.

These checks are mutation detection, not an atomic filesystem snapshot or a
guarantee against an arbitrary concurrent writer. `O_NOFOLLOW` protects the
final component only. The portable Node path APIs do not provide descriptor-
relative directory traversal, and metadata checks cannot rule out every
transient change or changes after return. Do not promote a mutable tree on
the strength of an earlier verification result. No `/proc` or platform-specific
`openat` emulation is introduced.

Platforms without positive integer `O_NOFOLLOW` and `O_NONBLOCK` constants
return a verification problem before reading inputs. There is no silently
weaker fallback. The native run below was on Linux; Windows support and a
native unsupported-platform run are not claimed.

## Executed evidence

Node `v24.22.3`, with `NODE_OPTIONS=--max-old-space-size=128`:

```sh
node --test scripts/pages/verify-pages-artifact.test.mjs
node --check scripts/pages/verify-pages-artifact.mjs
node --check scripts/pages/verify-pages-artifact.test.mjs
git diff --check
```

1. Before changing the verifier, the six original groups passed and both new
   race regressions failed with `problems: []`: **6 passed, 2 failed, 0 skipped**.
   The independent reviewer reproduced that result against the parent blob.
2. The raw directory-name regression failed before its guard: **15 passed,
   1 failed, 0 skipped** on verifier blob `067882fa174788f75247ecff70d24978bd442e16`.
   The distinct manifest-encoding regression then failed before its guard:
   **16 passed, 1 failed, 0 skipped** on blob `81b3aa077bd29bee657b6058337f45cf4c516a5b`.
3. Final source: **17 passed, 0 failed, 0 skipped**. The suite covers both
   reproduced races, one metadata read, descriptor cleanup on success/failure,
   actual no-follow refusal of artifact/manifest swaps immediately before open,
   pre-read rejection and closure of changed/non-regular descriptors, manifest
   replacement, late unlisted files, stable parent aliases, root symlink denial,
   an artifact parent-directory symlink swap, and both lossy filename-decoding
   boundaries with valid Unicode controls.
4. Both syntax checks and `git diff --check` passed. Test hooks assert the
   mutation occurred and recognize actual descriptor reads; restoration uses
   `finally`. They do not rely on sleeps, network access, or probabilistic races.

No dependency installation, application build, browser, package lint, hosted CI,
or real Pages artifact verification was run for this repair. Parent #276's
older-artifact evidence does not qualify this new source. A final candidate
still needs its normal hosted gates and an actual trusted artifact check.

## Integration

Keep the repair draft until independent review and exact-source qualification
are recorded. The consolidation coordinator owns integration and any further
reconciliation with #276 or main. No workflow, release gate, deployment, tag,
payment execution, chain manifest or contract change is part of this repair.
