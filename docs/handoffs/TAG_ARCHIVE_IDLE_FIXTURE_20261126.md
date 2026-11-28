# Tag archive idle fixture qualification — 2026-11-26

## Source and hosted evidence

- Worker: `/root/branch_triage`; isolated branch
  `fix/tag-archive-idle-fixture-20261126`.
- Base: canonical privacy #691 `f8145c1cb8d806f1d8b134c159eb00f595e6769a`.
- Additive pre-edit claim: `d1f00a52`.
- Qualified fixture source: `d012ac99f2b6e94ca6ff1a3ec46ac4b5c30fb497`, tree
  `32c1613b1611ecc730ae35ce2d8ff14fa6de097d`.
- Hosted [PR #689](https://github.com/djshellshoxxx/GhostPay/pull/689) at `0ae8a9d1`,
  web job `139653073679`: C-R11 in `src/components/TagArchive.test.tsx` failed
  looking for `Archive passphrase (at least 14 characters)` after the idle advance.
  The job's other failure was the separately corrected retention fixture; this
  patch owns only the tag archive case. The actual job log was inspected before
  editing.

## Correction and assertion preservation

The current `SellerKeys` mounts the tag archive only when the session is active.
Idle retains an unbacked seller's sole key copy for encrypted recovery but
suspends ordinary authority. The old C-R11 fixture incorrectly expected active
archive fields to remain available immediately after this suspension.

The corrected fixture first verifies the current restricted state: the same
seller is retained, the session is suspended, fresh and pre-idle active guards
refuse, archive controls are absent, and neither typed archive passphrase remains
in the live DOM. It then uses the actual encrypted-keystore export and verification
functions. Verification marks the backup verified but leaves the session suspended
and the archive unavailable. Only normal import of that same encrypted key set
restores an active session. The original guard remains invalid even after the same
keys return; a fresh guard succeeds.

Every original assertion is retained in its original order, including the fresh
suggestion pattern/type, controlled-input value attribute, and both blank repeated
and import passphrases. All other test cases in this file are unchanged apart from
the shared import of the additional existing session APIs. No assertion, timeout,
runtime guard, cryptographic implementation, dependency, workflow or contract was
weakened or changed. The backup round trip uses the existing test option
`N: 1 << 14`; production parameters are untouched.

## Actual local qualification

An independent `npm ci --offline --ignore-scripts --no-audit --no-fund` completed
with 722 packages. The eighteen required web/type library workspaces were built
successfully using their existing build scripts; no shared `node_modules` was used.

| Check | Result |
| --- | --- |
| `npx vitest run src/components/TagArchive.test.tsx --coverage.enabled=false --maxWorkers=1` | 9/9 passed, exit 0; 18.26 seconds |
| Exact-file typed ESLint | Exit 0 |
| `npm run typecheck --workspace=@ghostpay/web` | Exit 0 |
| Original assertion-order and unaffected-case comparison | Passed |
| `git diff --check` | Passed |

The fixture and lint commands run from `apps/web`; typecheck runs from repository
root. Root independently reviewed `d012ac99` and approved the complete fixture diff
with no source finding. No browser, fuzz, mutation or exploitation campaign was run,
and no remote write occurred. Root composes the pin with the separate #691 browser
fixture corrections. Fresh hosted qualification applies to that combined
idle/privacy candidate; the failing intermediate #689 is not being represented as
cleared or independently mergeable.
