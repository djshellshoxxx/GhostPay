> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Browser/UI test review — round 5

**Clean checkpoint:** 39 immutable test versions / 4,690 version-lines reviewed. The remaining 41 versions / 5,504 version-lines are untouched and listed exactly in the JSON handoff. Five explicitly noncore versions were excluded.

Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Primary candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

## Result

No new production vulnerability or behavior defect was established from this test-only batch. The two observations below concern what individual test assertions demonstrate; they are not production findings or execution results. Existing BROWSER-01 was not duplicated, and no assertion is made that a catching Pay route test is absent.

The completed work covers all assigned `apps/web/src/lib/` tests from build-profile through tag concurrency except clipboard privacy, plus build-script variants, bundle scanning, release-key denylisting, the Pages tamper-fixture test, and deployment CLI tests. QR-kind variants were reviewed from a complete base and every changed or deleted diff line.

## Test assurance observations

### BROWSER-TEST-ASSURANCE-01: Lookup-token test does not isolate key dependence from salt dependence

**Informational; high confidence.** The test title claims a keyed rather than plain-hash lookup token. It checks equality across repeated writes in one vault and inequality after creating a separate store with a different key. The separate-store comparison also changes the salt, explicitly acknowledged by the source comment. These assertions establish stable tokens within a profile and different tokens across these two profiles, but they do not independently establish key dependence.

**Suggested mitigation:** Add a deterministic test that holds salt and normalized address constant while changing the key, with an independently derived expected token or a fixed known-answer vector. Preserve the existing cross-profile and fresh-IV assertions.

This is a bounded observation about the reviewed test. It does not assert that the production derivation is unkeyed or that the complete repository lacks additional coverage.

- `apps/web/src/lib/tags.test.ts` at `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, blob `cabeff3806d9ee2a2ed44b4d60679db071e70aec`, lines 69–80.

The relevant test assertions are present on both the reviewed main and primary candidate heads.

### BROWSER-TEST-ASSURANCE-02: KDF preflight test infers zero derivation work from elapsed time

**Informational; high confidence.** The test requires invalid parameter variants to reject with the fixed validation message and requires the entire loop to finish within two seconds. Its title and trailing comment additionally claim rejection before any derivation. Elapsed time is not a direct assertion of the number of KDF calls, and it varies with the execution environment.

**Suggested mitigation:** Observe the KDF boundary through an injected dependency or mock and explicitly assert zero invocations for invalid parameter variants; retain a separate bounded-work check if useful.

The actual validation ordering may already be correct. This review neither ran the tests nor re-audited the production KDF implementation.

- `apps/web/src/lib/hardening.test.ts` at `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, blob `582a53936fc57d9a483f8ee26b0a20eec45f4c4e`, lines 23–31.
- `apps/web/src/lib/hardening.test.ts` at `a9e0715573f7247d7a16f9d1d030cf0232708fb2`, blob `4a307ce33712965404fa7b4e5cc60cd2c2db6d59`, lines 23–31.

The relevant test assertions are present on both the reviewed main and primary candidate heads.

## Coverage and constraints

Every completed row has full-file coverage: either complete immutable source or a complete already-read counterpart plus the full added/deleted diff. Truncated QR classifier, QR-kind diff and merchant-pin output was explicitly repaired before recording completion. Read-only identity checks confirmed all 39 SHA/path/blob associations and line counts.

No target tests, builds, proof-of-concept execution, probes, transactions, dependency changes, source/config edits, git mutations or pushes were performed. English catalogs and CSS resources were not read. Imported production functions were not run.

| Path | Blob | Version lines | Method |
| --- | --- | ---: | --- |
| `apps/web/src/buildScripts.test.ts` | `c4fdf3db1ac2c010eb99ae4ea95bf2fe13ce9c8d` | 196 | Complete source |
| `apps/web/src/lib/buildProfile.test.ts` | `34530f5260e2b9ea52713d09b9229218ccf39b73` | 42 | Complete source |
| `apps/web/src/lib/deployment.test.ts` | `be90aa64969b62e5616161b848ef35e0b12b9804` | 48 | Complete source |
| `apps/web/src/lib/displayText.test.ts` | `89477a9f474c448793f8b81bde7b46d5e6b3c562` | 40 | Complete source |
| `apps/web/src/lib/errors.i18n.test.ts` | `ccc190ea14d14195449cfaa2d43fb2f975338107` | 72 | Complete source |
| `apps/web/src/lib/errors.test.ts` | `f484634879a3fa21ce53bf6844c5e160921d778a` | 25 | Complete source |
| `apps/web/src/lib/fragment.test.ts` | `d3b8dc4682bee893ead90a8c0b9ce3669d4262d3` | 34 | Complete source |
| `apps/web/src/lib/hardening.test.ts` | `582a53936fc57d9a483f8ee26b0a20eec45f4c4e` | 202 | Complete source |
| `apps/web/src/lib/jitter.test.ts` | `7790a713ce6fb5434b06370638d2f364b4f9f3f9` | 132 | Complete source |
| `apps/web/src/lib/manifest.test.ts` | `0de9d50db4e0816f1fc7783919e45031a93bb38b` | 140 | Complete source |
| `apps/web/src/lib/merchantIdentity.test.ts` | `c26773145f2fdc22ff05871157c34b7021a644f4` | 137 | Complete source |
| `apps/web/src/lib/qr.test.ts` | `bb3a921720b5d5ee7394693127d9054699e87f0f` | 69 | Complete source |
| `apps/web/src/lib/qrClassify.fuzz.test.ts` | `198909c9d308d304306e0942ee15a9eb57f160b9` | 113 | Complete source |
| `apps/web/src/lib/qrClassify.test.ts` | `39d4161426183bfc2dd4412ac9be27454dabd095` | 418 | Complete source |
| `apps/web/src/lib/qrContrast.test.ts` | `217cc4d2bbb789767c5d7a769b9ee4929e85fb66` | 18 | Complete source |
| `apps/web/src/lib/qrKinds.test.ts` | `990d723ee8877c6de7f9f604a3e7e183bb6ff358` | 107 | Complete source |
| `apps/web/src/lib/qrMultipart.test.ts` | `4fd6b1e458b8d79a4828254f7b21982bf245a01e` | 41 | Complete source |
| `apps/web/src/lib/qrPayload.test.ts` | `aa45d2174751052a1dc1dfa1069297be75be634a` | 16 | Complete source |
| `apps/web/src/lib/registry.test.ts` | `e4c676a05e4e35da35ced6e02a57acbdae5fc752` | 17 | Complete source |
| `apps/web/src/lib/release.test.ts` | `c815c8cab8e867c9100d6bc45d6518a8dce5a7d8` | 151 | Complete source |
| `apps/web/src/lib/tags.test.ts` | `cabeff3806d9ee2a2ed44b4d60679db071e70aec` | 240 | Complete source |
| `apps/web/src/lib/tagsConcurrency.test.ts` | `1729f7dcc4f9330278a40572c87719babb987268` | 118 | Complete source |
| `apps/web/src/scanBundle.test.ts` | `a694b8763fc5deb418f65d7ff3a6f13e9295d3ee` | 171 | Complete source |
| `apps/web/src/buildScripts.test.ts` | `0f8b02996765ea90a47d3737d2350567c6f8e84d` | 242 | Complete counterpart + full diff |
| `apps/web/src/lib/buildProfile.test.ts` | `315e4cc3fd4cdaa60b965bcf552aa9e3ce5b3477` | 49 | Complete counterpart + full diff |
| `apps/web/src/lib/displayText.test.ts` | `1c410d6723a9fc81615fac1929401f8e98757e41` | 40 | Complete counterpart + full diff |
| `apps/web/src/lib/hardening.test.ts` | `4a307ce33712965404fa7b4e5cc60cd2c2db6d59` | 202 | Complete counterpart + full diff |
| `apps/web/src/lib/jitter.test.ts` | `ff652c1d81720c9e45157479058e6b7b0edcaad2` | 150 | Complete counterpart + full diff |
| `apps/web/src/lib/manifest.test.ts` | `2ac9bc61dbebd721aecab2fedf1eb3e50d501d68` | 116 | Complete counterpart + full diff |
| `apps/web/src/lib/merchantIdentity.test.ts` | `957027808890f366f337c375e52b5c081206dae7` | 157 | Complete counterpart + full diff |
| `apps/web/src/lib/qrKinds.test.ts` | `257b634250f033ddec042b67941fec23ffba1323` | 203 | Complete counterpart + full diff |
| `apps/web/src/lib/qrMultipart.test.ts` | `45992f537d1f226dd20e57d96a246c6f18419395` | 51 | Complete counterpart + full diff |
| `apps/web/src/releaseKeyDenylist.test.ts` | `dd3bbb86ae01f2075fc59818d79b40ff03f14fae` | 52 | Complete source |
| `apps/web/src/scanBundle.test.ts` | `bc071b59356c76180430773e3b6c2064bdd12705` | 240 | Complete counterpart + full diff |
| `apps/web/src/test/pagesInvoiceTamper.test.ts` | `49af26769c4e3bb5820865b2b16f416fdd013a01` | 42 | Complete source |
| `apps/web/src/validateDeploymentsScript.test.ts` | `813431c540a31671352025d0d44052102f33d82f` | 122 | Complete source |
| `apps/web/src/lib/qrKinds.test.ts` | `e918e36848f4e01322afbdf41cf561b3222cc14a` | 119 | Complete counterpart + full diff |
| `apps/web/src/lib/qrKinds.test.ts` | `af5ef89f6fba0cea13b18884df387875f064ad34` | 194 | Complete counterpart + full diff |
| `apps/web/src/lib/qrKinds.test.ts` | `3eaea811d82c9a1913313fc1c0d587147b68fd16` | 164 | Complete counterpart + full diff |

## Exact remaining untouched work

Representative SHAs, full blobs, kinds, references and pending status are preserved in `remaining_untouched` in the JSON file. No partially reviewed file is carried forward.

| Path | Blob | Version lines |
| --- | --- | ---: |
| `apps/web/src/components/CameraImporter.behavior.test.tsx` | `4c6e955619e147baca36ad0ba8fecc48c806d640` | 142 |
| `apps/web/src/components/CameraImporter.i18n.test.tsx` | `5cd833b00369917e7e2caf62f9e1b3bb673623b8` | 137 |
| `apps/web/src/components/CameraImporter.lifecycle.test.tsx` | `9e66a8f7cccd7a5e9cd4cec94f79b6ddeb70926e` | 278 |
| `apps/web/src/components/CameraImporter.multipart.test.tsx` | `58833ea84270b29d5b21eb5fb10ccb5a9928187b` | 401 |
| `apps/web/src/components/CameraImporter.test.tsx` | `9de1420a4ffd86d57aff5500da6db386565efd23` | 158 |
| `apps/web/src/components/ContextHelp.test.tsx` | `6c282bff7a223286c431c41514351ba6c6d2b2c2` | 145 |
| `apps/web/src/components/ErrorBoundary.test.tsx` | `b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76` | 65 |
| `apps/web/src/components/PaymentRequestQr.test.tsx` | `167776cdc0703bed151715ff619197649da0d2fe` | 138 |
| `apps/web/src/components/PrintableBill.test.tsx` | `4e80b81546f6d10464ef2dd25464036113d0e817` | 111 |
| `apps/web/src/components/QrFrame.i18n.test.tsx` | `31c15bcb5a18296b67942bf93cdc30c32426d2c3` | 42 |
| `apps/web/src/components/QrFrame.largeWarning.test.tsx` | `7c8c1cf7150a88a5487a8b0db9496c7287c22af3` | 21 |
| `apps/web/src/components/QrFrame.security.test.tsx` | `642a51e40607844f2af9e5d59a3e1a0e752b3c4f` | 106 |
| `apps/web/src/components/QrFrame.test.tsx` | `6f84f7e43f15afae4bc1f292a95510ead7bd2123` | 162 |
| `apps/web/src/components/QrView.i18n.test.tsx` | `474affeda6d8f7e68a0bd4d4a976350b92a8291f` | 56 |
| `apps/web/src/components/QrView.test.tsx` | `8dc103ff3c081a63bc631aa9e532fdf2de2e3bd0` | 21 |
| `apps/web/src/components/SharedComponents.i18n.test.tsx` | `a48fbe04da171154ba009ce11132e30ffbcaf80f` | 238 |
| `apps/web/src/features/registry/RegistryView.export.test.tsx` | `10fc44d00152be737dbf4f3a172624cce0337b1d` | 71 |
| `apps/web/src/features/registry/RegistryView.i18n.test.tsx` | `03180167b4e9ae29e8294d1cee73028cb360de46` | 87 |
| `apps/web/src/features/registry/RegistryView.test.tsx` | `fb79a7398af4872f6cb129914dfea12b96cb8d6d` | 291 |
| `apps/web/src/features/registry/ref/Registry1271Wallet.test.sol` | `051aec1851c392ab9c5040bd34e8137d01ac1d6a` | 34 |
| `apps/web/src/features/registry/registry.anvil.test.ts` | `a49f0439dc4ffdec9449df3fee32fc92ba114c8d` | 252 |
| `apps/web/src/i18n/LanguagePicker.test.tsx` | `8b492301d0bd857770581acf17de66ec82883053` | 73 |
| `apps/web/src/i18n/Trans.test.tsx` | `39a69e994819cacf23d3e03c2d8f1f464302a552` | 54 |
| `apps/web/src/i18n/catalog.test.ts` | `cebbbc60c3f01698d90ddf24c08de95d8f98e8c5` | 45 |
| `apps/web/src/i18n/context.test.tsx` | `1ec8e02639c038ec458e762886d45cbb20ea1ca1` | 67 |
| `apps/web/src/i18n/languages.test.ts` | `68d1fed519cb0a86b8f9804bbe8f063fda455e1d` | 82 |
| `apps/web/src/i18n/message.test.ts` | `6bc2e91cdf4ed5402f895f8cc8d2a296702fff1b` | 216 |
| `apps/web/src/i18n/securityKeys.test.ts` | `5efd78ea6c77a1e161a0716199e853d57138cacb` | 215 |
| `apps/web/src/i18n/settings.integration.test.tsx` | `8142f472ee68134bf07508fab46ea5354bba67f4` | 45 |
| `apps/web/src/i18n/storage.test.ts` | `b02a7ca4af0c1c5cc7efb812ba545166a5d6cda1` | 41 |
| `apps/web/src/i18n/translator.test.ts` | `580a69de0a6272210fbbc3f23677b6af3ef5ed42` | 53 |
| `apps/web/src/views/About.test.tsx` | `b7efecde8c62043aa894385a3af05f91eb8382d5` | 99 |
| `apps/web/src/views/RegistryView.route.test.tsx` | `1e72d4e6486fc9022994ac052182f881c805e04a` | 53 |
| `apps/web/src/components/CameraImporter.visibility.test.tsx` | `591becf9ad1f59e143bd3356b9b3a1bcc1ec6d11` | 154 |
| `apps/web/src/components/Disclosure.manifest.test.tsx` | `da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8` | 72 |
| `apps/web/src/features/registry/RegistryView.network.test.tsx` | `f2a879bf1deecde6c8ad94d40a21096dcbe1c04c` | 78 |
| `apps/web/src/i18n/message.test.ts` | `b9bb238e31af3b5febf5f05972da4c5f9b960649` | 216 |
| `apps/web/src/i18n/securityKeys.test.ts` | `14ea92f4f68a910aadc6ac78003c4443de1ffa76` | 234 |
| `apps/web/src/components/Common.test.tsx` | `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` | 204 |
| `apps/web/src/lib/clipboardPrivacy.test.ts` | `2af15327f398c18c7dc09cb890b9008d150c4198` | 111 |
| `apps/web/src/views/Settings.test.tsx` | `226c2c17faf611a1611acc9d40665c6e07fbb450` | 436 |
