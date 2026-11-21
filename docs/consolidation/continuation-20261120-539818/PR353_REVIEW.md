# PR #353 independent qualification and canonical relayer expectations

20 November 2026 (Pacific). Worker: `/root/scan_fix_review`; coordinator:
`539818ee134f-root`. Local branch: `review/ghostpay-pr353-539818`.

**Result: the original two tests fail on incorrect expected relayer URL spelling.
Correcting exactly those two expected strings yields 21 passing tests across
three complete files. Production source is unchanged.**

## Source and bounded correction

Reviewed [PR #353](https://github.com/djshellshoxxx/GhostPay/pull/353) head:
`a8c10a965f726a6c2dc8eb7391f495df833b3e9b`. Its parent is integration PR #307
at `5a745d4b5fba69b66a9779f88aefc63c253a4f27`; this is not a main-based change.
The existing PR adds one two-case test file and two coordination documents.

Both original cases reach their final explicit Save assertion, then fail because
they expect a persisted relayer URL ending in `/`. The existing
`checkRelayerUrl` in `apps/web/src/lib/settings.ts` deliberately returns the URL
origin plus its path with trailing slashes removed. Existing
`lib/settings.test.ts` explicitly checks that canonical form; the existing
Settings exchange fixtures and save assertions use the same form.

The coordinator approved a scope extension before edits. Only two expected
persisted values in `Settings.partialImportDrafts.test.tsx` change:

| Original expectation | Correct expectation |
| --- | --- |
| `https://pending-relayer.example/` | `https://pending-relayer.example` |
| `https://draft-relayer.example/` | `https://draft-relayer.example` |

All draft inputs, assertions, production files, configuration, timeouts,
dependencies and coverage thresholds remain unchanged. The original test blob
is `5a9e21c68feb7279f233bbf1351d1d719f02a26c`; the corrected blob is
`e96c2777139f70e8368529b83e5accaf0f93b157`.

## Independent scenario review

The preferences case uses the real default preferences-only export. It preserves
unsaved primary/secondary RPC, relayer and signer inputs, checks that import does
not silently persist those unselected drafts, then verifies that an explicit Save
persists the drafts together with the imported theme.

The RPC-only case explicitly supplies supported chain IDs to the v2 exporter,
selects the imported endpoint section, and accepts the existing trust dialog.
It preserves unsaved theme, relayer and signer edits, checks their absence from
saved state before Save, then verifies the combined saved result.

Current Settings production source updates only the selected section's form
state after import. Its saved-settings effect invalidates RPC test results but
does not reset the whole form. The two new scenarios target that current contract.
The observed failures are test expectations inconsistent with established URL
canonicalization; no production draft-loss defect was demonstrated in this run.

## Actual execution

Original configuration, Node `v24.22.3`, Vitest `5.0.5`, one worker, 256 MiB heap:

| Invocation | Result |
| --- | --- |
| Five differing required package builds | Exit 0 |
| Original complete `Settings.partialImportDrafts.test.tsx` | 2 failed / 0 passed; exit 1 |
| Corrected partial-import file plus complete `lib/settings.test.ts` and `Settings.exchange.test.tsx` | **21 passed, 0 failed, 0 skipped; 3 files; exit 0** |

The successful test run took 8.95 seconds. From `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=256 ../../node_modules/.bin/vitest run src/views/Settings.partialImportDrafts.test.tsx src/lib/settings.test.ts src/views/Settings.exchange.test.tsx --maxWorkers=1
```

[PR353_EXECUTION.json](PR353_EXECUTION.json) preserves every command, source blob,
exit code, complete baseline/build/corrected output, and original output SHA-256.
The failed baseline remains intact; no retry or environment substitution is
represented as a baseline pass.

## Dependency provenance

The lock is byte-identical to the already verified PR #350 installation:
SHA-256 `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.
That verification compared all 647 present root packages and 44,635 files against
lock-integrity cached tarballs, with 24 optional platform entries absent. It is
reused evidence, not a second execution of the tarball comparison.

Immutable external dependency files were hardlinked into this isolated checkout;
all 68 workspace links were localized and Vite caches isolated. Twenty-seven
compiled workspace outputs were copied only after complete tracked-input equality.
The differing required `invoice-schema`, `chain-adapters`, `payment-uri`,
`qr-exchange` and `tron-adapter` packages were built from this exact source with
their original scripts at 256 MiB. The differing metadata-hardening package is
outside the web import closure and was not copied or compiled for this selection.

## Remaining gates and ownership

This is bounded jsdom/Vitest evidence. No full web coverage, whole-web compiler,
lint, production build, native browser or combined integration pass is claimed.
The separately owned request-file failure on #307 and its #344 successor remain
outside this correction. An older-source draft-loss reproduction was not rerun.

The reviewed author head's returned workflow collection showed Pages and Beta
acceptance successful, with CI, Tor and Hosting queued. Those results do not
qualify the corrected local successor. Require applicable checks on the actual
published source and the eventual composition.

No remote branch, PR, workflow, shared integration record, lease, release or
deployment was changed by this worker. PR #354 remains frozen. Root owns fresh
independent review, publication and any qualified integration decision.
