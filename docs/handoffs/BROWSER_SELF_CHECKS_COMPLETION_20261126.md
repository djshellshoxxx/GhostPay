# Browser self-check completion (2026-11-26)

Base main `019d5d18c8992f63fe77740f75ad04d86d3d9b07`; branch `nodata/fervent-mendel-ybw0va`.

## Consolidated sources

| Source | Head | State before this change |
| --- | --- | --- |
| #395 footer (`chatgpt/ghostpay-browser-selfchecks-20261121`) | `1edc524e` | Ancestor of main (closed PR) |
| #402 exact-optional fix (`fix/ghostpay-browser-selfchecks-optionals-r13-20261121`) | `3c9b96d0` | Ancestor of main; PR still open against the merged #395 branch |
| #412 lint repair (`fix/ghostpay-browser-selfchecks-lint-r16-20261121`) | `087ecf7e` | Ancestor of main; PR still open against #402 |

No unique unmerged code remained on those branches. No other open PR or branch touches the owned paths.
#402 and #412 can be closed as superseded once this lands; they were left untouched here.

## Completed

- Results are now `pass`, `fail` or `unavailable`. Missing WebCrypto, a non-function `digest`, a missing
  `isSecureContext` flag, a null or denied `localStorage` and a refused probe write are *unavailable*. A wrong SHA-256
  answer, a rejected or throwing digest, an insecure context, a lost read, or a probe that cannot be removed is
  *failed*. Previously absent WebCrypto showed *Failed* and a storage read mismatch showed *Unavailable*.
- Every non-passing result shows a short explanation of what the capability affects and what to do, linked to the
  result with `aria-describedby`. The explanations are classified with the reviewed-only IN-3 group
  (`browserCapabilityLimits`), so unreviewed drafts show the English source text.
- The probe round trip now also checks deletion. A throwing `randomUUID` or `crypto` getter no longer drops an
  otherwise usable digest provider.
- Full and lean builds render the same `AppShell` footer; a unit test now asserts the region in both shells across
  views. A Playwright spec checks the passing state across views and, with synthetic faults injected only for the
  self-check inputs, the failed/unavailable explanations at 320 CSS pixels, no horizontal overflow and an axe audit.
- Help (troubleshooting row) and privacy (local-storage probe disclosure) pages describe the checks truthfully.

## Not changed

Release-hash display (`lib/release.ts`, Home), integrity verification, cryptography, signing, wallet authority,
payment gating, network egress and release gates are unchanged. The checks still make no network request.

## Deeper follow-ups (not in scope)

- An IndexedDB availability check: the vault and encrypted records use IndexedDB, which the current probe does not
  exercise.
- Native WebKit/Firefox/mobile-device qualification of the footer (Playwright device projects emulate Chromium only).
- Native-speaker review of the new reviewed-only explanation strings for es/ja/ar.

## Review and verification

An AI-assisted review by a separate subagent covered `019d5d18...5a0c3833`. It is not a human or professional
audit. It found nothing blocking. Two wording nits were fixed: the privacy page now says a probe that cannot be
removed reports *Failed*, and the storage explanation no longer cites private windows. Two nits were left as is:
`aria-describedby` on `<strong>`, which is harmless, and the cosmetic footer-identity assertion. Exact commands and
outcomes are recorded in the pull request.
