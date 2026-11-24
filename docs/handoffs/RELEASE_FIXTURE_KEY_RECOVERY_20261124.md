# Release fixture-key boundary recovery — 2026-11-24

## Source and independent review

The four-file unit from `21fdd4350d1a4a2fa04198d7e11e922cd7f3da31` was
recovered with attribution as `02f71c11d064f9ab3e28a104b6aeba38453423e7`, tree
`7a191ef78fe75346019cf5faeb0ece9ea0e7f6cc`. The integration base was
`ac2e7ef6a0c712d82a6a8efa4ad9d1e9cba64d28`; an additive ownership claim
preceded source selection.

Independent `historical_review` approved this coherent four-file scope before
recovery. All three existing files exactly matched the donor's parent blobs;
the new regression file was absent. The coordinator verified that all four
recovered blobs and file modes exactly match the reviewed donor. The unrelated
historical parent stack is not merged or represented as approved.

## Behavior and compatibility

The existing release-key parser now rejects a finite list of known public
fixture keys when the build is classified as a release. It preserves key-count,
compressed-key-shape, whitespace and case-normalization rules and existing
manifest-signature verification. An empty key configuration remains valid and
does not authorize an unsigned manifest.

The classification is explicit `production` when supplied; otherwise it uses a
full lowercase forty-character `GP_COMMIT` and absence of
`GHOSTPAY_PAGES_DEV=1`. This is release provenance classification, not Vite mode
or `NODE_ENV`. The existing Pages shell already validates that development flag,
requires a full commit, and enforces the clean/current source tree in release
mode.

Both Pages hunks are required. The shell invokes the parser with its validated
release/development decision before a manifest build, then passes the validated
development flag through the existing sanitized environment. Development builds
also receive a full commit; omitting this propagation would make Vite reject
the intended development fixture. The finite list does not establish that an
unlisted key is securely generated or privately held.

All other clean-tree, origin, shared-origin, manifest-directory, signature,
bundle and artifact checks remain. No signing implementation, runtime feature,
dependency, workflow or release-channel classification changes are part of this
recovery.

## Qualification on the exact recovered source

| Check | Observed result |
|---|---|
| Original five donor compatibility cases plus current build/validator/scanner suites | **78 tests in four files passed**, no skips |
| `bash -n scripts/pages/build-pages.sh` | Passed |
| Clean release-mode Pages build using the existing authored synthetic fixture | Refused specifically at the known-fixture key check; no site produced |
| Development-mode Pages build with the same fixture and full commit | Passed through typecheck, Vite, bundle scanning and artifact verification |
| Development artifact hashes | All **16 emitted files** matched `SHA256SUMS` |

The unit command, from `apps/web`, was:

```sh
../../node_modules/.bin/vitest run src/releaseKeyDenylist.test.ts src/buildScripts.test.ts src/validateDeploymentsScript.test.ts src/scanBundle.test.ts --maxWorkers=1
```

The actual boundary checks used only `prepareManifestFixture` and its authored
fake deployment. Release mode used the exact clean checkout commit and a valid
synthetic HTTPS origin. Its expected refusal was not a dirty-tree, origin or
signature-setup failure. Development mode then used the same fixture and commit
with the validated flag set to `1`; its artifact explicitly records
`release: false` and the synthetic testnet fixture. No site was deployed, no
wallet connected and no payment or real signing material used.

Source-pinned command records and raw logs are in the coordinator's
`release-key-qualification/` receipt directory. Final combined web lint,
typecheck, normal no-manifest Pages build and hosted results are recorded in
the follow-up integration report; they are not implied by these bounded
checks. Native browser qualification is not claimed by this handoff.
