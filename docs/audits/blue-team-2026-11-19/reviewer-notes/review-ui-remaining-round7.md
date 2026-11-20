> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Shared/QR UI, i18n and About/Settings/Disclosure tests — round 7

**Complete: 26 immutable versions / 3,053 version-lines across 24 paths.** The exact round-6 `remaining_untouched` assignment is exhausted. There are **zero remaining and zero partially reviewed assigned versions**.

Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Combined candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. Current-main freshness remains root-owned.

## Outcome

No new production vulnerability or behavior defect was established. The seven canonical production findings remain unchanged. One bounded informational test-assurance observation is recorded separately below. Tests were inspected, never executed; no passing or failing runtime result is claimed.

## Reviewed behavior and limits

### Shared UI and payment/print display

ContextHelp (`6c282bff7a223286c431c41514351ba6c6d2b2c2`, 1–145) asserts keyboard focus and Escape behavior, hover and tap interaction, outside-dismissal timing that keeps a pressed control in place until its click, independent accessible descriptions, disabled-field help, and inert rendering of supplied text. ErrorBoundary (`b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76`, 1–65) asserts fixed redacted messages, preservation of the surrounding app, route-owned resets, Back recovery, and the reload callback.

PaymentRequestQr (`167776cdc0703bed151715ff619197649da0d2fe`, 1–138) asserts multiple URI families, invalid-request refusal, testnet caution, the proof disclaimer, explicit proof reveal, and retention of JSON when a QR is oversized. PrintableBill (`4e80b81546f6d10464ef2dd25464036113d0e817`, 1–111) asserts bearer/passphrase distinctions, fixed-token amounts versus unchecked seller-stated fiat, omission of an oversized link from print content, and print/afterprint lifecycle. Its CSS checks inspect source strings; they do not establish real browser print layout. No CSS source was separately opened.

### QR reveal, motion, focus and localization

The complete QR security suite (`642a51e40607844f2af9e5d59a3e1a0e752b3c4f`, 1–106) binds reveal to the kind, full text and multipart bytes; replacing public or revealed secret data with new secret data must hide it. Equivalent chunk arrays and changed labels must not extend the reveal deadline. It also asserts stale large-dialog dismissal and focus restoration, constrained dialog keyboard operation, recovery from outside focus, and immediate stopping of multipart motion when reduced motion becomes active. The base suite (`6f84f7e43f15afae4bc1f292a95510ead7bd2123`, 1–162) asserts timeout/manual/visibility hiding, no copy or download control for secrets, multipart bounds and stepping, and dialog handling when wake-lock acquisition fails. Warning tests keep bearer, secret and caution copy within the large dialog.

The QR i18n suites assert that changing language preserves QR bytes, selected part and the rendered path. Error text is fixed or drawn from reviewed source messages rather than arbitrary thrown detail; an unreviewed locale cannot replace the critical failure description. These are static assertions in component tests, not physical-camera, scanner or browser-runtime results.

### Internationalization and review authority

Message, Trans and translator tests cover inert interpolation, rich-text parts, inherited prototype names used as tags, syntax rejection, plural and locale formatting, missing/bad arguments, serialization, and pseudo-localization. The later message-test blob changes only the literal bidi character to its `\u202b` spelling. The complete diff was reviewed against the fully read counterpart.

Security-key tests require every source key to be classified exactly once, preserve source English for unreviewed critical text, refuse approval inferred from catalog metadata or a regional locale tag, retain bundled critical source messages even when a supplied English layer is replaced, and refuse an unknown runtime key before census. The privacy-branch variant adds nineteen required clipboard/privacy key classifications; its entire diff was read against the full counterpart. The shared-i18n tests check neutral labels, English security warnings, left-to-right addresses/fingerprints inside RTL output, and destructive-action confirmations. These tests do not constitute native translation review.

LanguagePicker, context, storage and Settings integration tests assert preference persistence, reset to browser defaults, blocked-storage messaging, operable selection after load failure, document language/direction changes, pseudo-locale filtering, and fallback to English when a requested catalog is unavailable.

### About, manifest ownership and historical Settings variant

About (`b7efecde8c62043aa894385a3af05f91eb8382d5`, 1–99) asserts manifest-only recipient display, disabled payments for absent/invalid/rejected manifest loads, and redaction of rejected-load detail. Disclosure (`da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8`, 1–72) asserts that same-chain invoice replacement and service replacement immediately hide the previous manifest and that late results from cancelled loads are ignored.

The assigned Settings version (`226c2c17faf611a1611acc9d40665c6e07fbb450`, 1–436, representative commit `e4d54a6829fcc861de7af1669c0e0f64f62aa137`) is a historical variant; it is not the frozen-main or combined-candidate Settings test blob. Its assertions cover opt-in session-only endpoint storage even when a credential heuristic misses, preservation of that consent after unrelated validation failure, explicit exchange preview and confirmation, invalidation of old reviews/exports on settings change, scan bounds, network-policy acknowledgement, own-node refusal before adapter creation, preservation of prior policy after refused writes, corrupt-storage handling, and cross-tab stale-save refusal.

## Existing finding context retained

**BROWSER-01:** The existing actual Pay route regression for rejected submission, duplicate refusal, confirmed clearing and a second request remains documented. No claim is made that it is absent. A companion shared-i18n case (`a48fbe04da171154ba009ce11132e30ffbcaf80f`, 169–177) mounts `WalletAttempts` without a wallet prop and expects a clear button and record details. That exact test blob exists on frozen main, the combined candidate and affected #300 (`137628961463fc5abd8b7927b2efe6b18a0a206a`). This is additional test-maintenance evidence when reconciling the changed component contract, not a new production finding or an observed runtime failure.

**PN-05:** The intentional optional one-time-address omission and the existing import-description mismatch remain as recorded by the earlier complete receipt review. This batch does not change that interpretation.

## Test assurance observation

### UI-REMAINING-TEST-ASSURANCE-01 — Existing mount can satisfy the rejected-release-hash fallback assertion

**Informational; high confidence.** In `About.test.tsx` lines 79–91, the test first renders an App without a usable entry script and awaits the unavailable-hash message. It then creates an entry script, renders a second App using a rejecting fetch, and asserts only that a global `screen.findAllByText` query finds more than zero unavailable-hash messages. The first, already-confirmed message can satisfy that assertion even if the second instance remains loading or fails to render its intended fallback.

This was checked against the exact same-commit render helper: `apps/web/src/test/render.tsx`, blob `dbd0a6a491b6284a39a7e185847713184a97be88`, representative commit `87cf6c603338ad64ec02300fe42b96c3e0a205b9`, lines 1–13 and 39–45. Cleanup is registered only after each test; `renderApp` and `renderWith` directly render and do not remove an earlier mount. The helper excerpts were narrowly authorized by root for this verification and are excluded from assigned full-file completion counts.

**Impact and boundary:** This particular assertion does not independently establish the rejected entry-script-fetch fallback. No application defect, executed test failure, or repository-wide absence of release-hash coverage is established. The About test blob is identical on frozen main and the combined candidate.

**Remediation:** Unmount the first App before the rejecting-fetch case, split the cases, or retain the second RenderResult and scope the awaited message with `within(second.container)`. Observe the rejecting fetch call as well so the intended path is exercised.

## Method and constraints

All 26 representative commit/path/blob identities and line counts were verified with read-only Git object access. Twenty-four versions were read as complete immutable numbered source. Two variants were reviewed from a fully read counterpart plus every added and deleted line of the exact blob diff. All assigned source/diff output was complete; no truncated source was counted. The initial oversized previous-checkpoint metadata output was narrowed to the exact remaining rows before review.

No target execution, tests, builds, scripts, probes, transactions, proofs of concept, dependency installation, network access, app/config/test edits, Git mutation, commits or pushes occurred. Only the requested scratch audit artifacts were written. No English catalog, CSS or E2E worker source was separately read. The supplemental helper was inspected only for the explicit render/cleanup evidence described above.

## Completed immutable versions

| Path | Blob | Representative SHA | Version lines | Method |
|---|---|---|---:|---|
| `apps/web/src/components/ContextHelp.test.tsx` | `6c282bff7a223286c431c41514351ba6c6d2b2c2` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 145 | Full source |
| `apps/web/src/components/ErrorBoundary.test.tsx` | `b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 65 | Full source |
| `apps/web/src/components/PaymentRequestQr.test.tsx` | `167776cdc0703bed151715ff619197649da0d2fe` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 138 | Full source |
| `apps/web/src/components/PrintableBill.test.tsx` | `4e80b81546f6d10464ef2dd25464036113d0e817` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 111 | Full source |
| `apps/web/src/components/QrFrame.i18n.test.tsx` | `31c15bcb5a18296b67942bf93cdc30c32426d2c3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 42 | Full source |
| `apps/web/src/components/QrFrame.largeWarning.test.tsx` | `7c8c1cf7150a88a5487a8b0db9496c7287c22af3` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 21 | Full source |
| `apps/web/src/components/QrFrame.security.test.tsx` | `642a51e40607844f2af9e5d59a3e1a0e752b3c4f` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 106 | Full source |
| `apps/web/src/components/QrFrame.test.tsx` | `6f84f7e43f15afae4bc1f292a95510ead7bd2123` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 162 | Full source |
| `apps/web/src/components/QrView.i18n.test.tsx` | `474affeda6d8f7e68a0bd4d4a976350b92a8291f` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 56 | Full source |
| `apps/web/src/components/QrView.test.tsx` | `8dc103ff3c081a63bc631aa9e532fdf2de2e3bd0` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 21 | Full source |
| `apps/web/src/components/SharedComponents.i18n.test.tsx` | `a48fbe04da171154ba009ce11132e30ffbcaf80f` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 238 | Full source |
| `apps/web/src/i18n/LanguagePicker.test.tsx` | `8b492301d0bd857770581acf17de66ec82883053` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 73 | Full source |
| `apps/web/src/i18n/Trans.test.tsx` | `39a69e994819cacf23d3e03c2d8f1f464302a552` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 54 | Full source |
| `apps/web/src/i18n/catalog.test.ts` | `cebbbc60c3f01698d90ddf24c08de95d8f98e8c5` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 45 | Full source |
| `apps/web/src/i18n/context.test.tsx` | `1ec8e02639c038ec458e762886d45cbb20ea1ca1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 67 | Full source |
| `apps/web/src/i18n/languages.test.ts` | `68d1fed519cb0a86b8f9804bbe8f063fda455e1d` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 82 | Full source |
| `apps/web/src/i18n/message.test.ts` | `6bc2e91cdf4ed5402f895f8cc8d2a296702fff1b` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 216 | Full source |
| `apps/web/src/i18n/securityKeys.test.ts` | `5efd78ea6c77a1e161a0716199e853d57138cacb` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 215 | Full source |
| `apps/web/src/i18n/settings.integration.test.tsx` | `8142f472ee68134bf07508fab46ea5354bba67f4` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 45 | Full source |
| `apps/web/src/i18n/storage.test.ts` | `b02a7ca4af0c1c5cc7efb812ba545166a5d6cda1` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 41 | Full source |
| `apps/web/src/i18n/translator.test.ts` | `580a69de0a6272210fbbc3f23677b6af3ef5ed42` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 53 | Full source |
| `apps/web/src/views/About.test.tsx` | `b7efecde8c62043aa894385a3af05f91eb8382d5` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 99 | Full source |
| `apps/web/src/components/Disclosure.manifest.test.tsx` | `da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 72 | Full source |
| `apps/web/src/i18n/message.test.ts` | `b9bb238e31af3b5febf5f05972da4c5f9b960649` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 216 | Full counterpart + complete diff |
| `apps/web/src/i18n/securityKeys.test.ts` | `14ea92f4f68a910aadc6ac78003c4443de1ffa76` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 234 | Full counterpart + complete diff |
| `apps/web/src/views/Settings.test.tsx` | `226c2c17faf611a1611acc9d40665c6e07fbb450` | `e4d54a6829fcc861de7af1669c0e0f64f62aa137` | 436 | Full source |

## Handoff

The exact assigned remainder is complete: 26 versions / 3,053 version-lines, zero remaining, zero partially reviewed assigned versions. Both `remaining_untouched` and `remaining` are empty in the companion JSON. Exact references, original assignment indexes, reviewed methods and ranges are preserved. Root owns canonical report integration, current-main freshness and global reconciliation. Static assertions must not be reported as executed results.
