# QR classifier unpaired-surrogate guard — isolated cycle 2026-11-22

## Exact source and scope

- Repository: `djshellshoxxx/GhostPay`; base `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da` (observed 2026-11-22 06:41 UTC).
- Branch: `automation/20261122T0641Z/bug/qr-classify-surrogate-input`; one assistant executed sequential discovery, reproduction, implementation and handoff. No external/native worker, independent reviewer, Caveman runtime, or local repository checkout.
- Ownership claim commit: `7ee064fa0b054db1496c4b8780617f630c8440bb` in `docs/ai/ACTIVE_WORK.md`.
- Regression-first commit: `9f2e81b36a9e59dd44278c838a4c84047aaff6a9`; **new** `apps/web/src/lib/qrClassify.unpaired-surrogate.test.ts` (4 tabulated malformed cases, 1 mixed Unicode case, 2 preservation assertions).
- Production commit: `50acde91a30aca43694595da54eb4ace147e5926`; modified `apps/web/src/lib/qrClassify.ts` only; source base blob `973c7831c4c3d81da9d99c620fd758a03e62a118`, new blob `08ed57f8af0ae85c47477ab8e01105c33d1322bb`.
- No source or history was imported from unrelated branches, and no changes were made to cryptography, transaction/custody semantics, contracts, manifests, CLI, relayer, build, release or hosting.

## Finding GP-QR-CLASSIFY-UTF16-01 (low-severity correctness; not a demonstrated exploit)

`classifyQrText` accepted raw unpaired UTF-16 high/low surrogate code units in an otherwise recognised settings-shaped JSON envelope and labelled it `{family:'settings',validated:false,version:1}`. Such text does not round-trip through UTF-8: `TextEncoder` replaces an isolated surrogate with U+FFFD, while `makeQr` already rejects Unicode `Cs` units. The QR classifier did not claim full settings validation, but its family recognition was inconsistent with the client QR encoder's lossless-text requirement.

A bounded new input guard rejects a surrogate code point (`/\\p{Cs}/u`) with the classifier's existing `unknown/malformed` result before family detection. Under Unicode mode, a valid high+low pair is interpreted as one supplementary scalar and remains accepted. No input or secret bytes are echoed in a result.

## Executed checks and limitations

- Node 22 **source-equivalent** baseline JSON/settings discriminator replay: all **5/5** malformed literal-surrogate cases were accepted by the pre-guard path; `JSON.parse` accepts the text and `TextEncoder` would replace the surrogate (`efbfbd`). This verifies the classification mechanism, **not** an execution of the repository's `parseStrictJson` or Vitest.
- Node 22 **source-equivalent** guarded replay: **7/7 assertions passed** (five malformed cases refused; valid emoji-pair and accented-text envelopes accepted). `/\\p{Cs}/u` specifically refused lone high and low surrogates and allowed valid emoji.
- No repository Vitest, workspace lint, TypeScript typecheck, build, browser suite, fuzz suite, full security/Mythril or independent review was run locally: container GitHub git transport returned `Could not resolve host: github.com`. Connected GitHub source and write APIs were available. Hosted exact-head CI must qualify the final source and test bundle; do not infer a pass from this replay or from another head.
- CI and PR evidence: see the draft PR for this branch and its exact-head Actions jobs after creation. No production deployment is allowed. Inspection of `.github/workflows/pages.yml` shows PR events only build/verify; publishing requires an explicit `workflow_dispatch` from `main` with `deploy=true`. The release workflow is tag-only; this cycle creates no tag.

## Ownership, audit and integration

- `automation/ghostpay-integration-lock` metadata `integration-lock.json` observed `status: held`, generation **11**, owner `994a0d214fb9-root-r3`, acquired 2026-11-20T23:16:57Z (source blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`). Though its recorded expiry has passed, **it must not be stolen** without independent reconciliation of existing owner writes. The lock metadata branch was not modified.
- Searched open PRs specifically mentioning `qrClassify`, `UTF-16 classifier` and malformed QR classification; no direct claim found. Broad consolidation PRs such as #278 remain active and could overlap; an exhaustive 500+-branch semantic reconciliation was **not** performed.
- No independent reviewer available; do **not** mark verified, resolve finding or merge. `SECURITY.md` forbids public disclosure of confirmed vulnerabilities; this is recorded only as a low-severity input-classification correctness defect, with no exploit, secret leak, or funds-loss assertion.
- Main and protected integration targets were untouched; no force-push, release, deployment, main merge, testnet signing, real-wallet action, or fee-policy change.

## Next invocation

1. Fetch fresh main SHA, this exact branch head and PR/head CI; inspect failing job steps and exact test results. Repair any failure solely on an exclusively owned follow-up branch with a regression, not by suppressing checks.
2. Independently run the committed `qrClassify.unpaired-surrogate.test.ts` on the exact candidate and applicable test/build/lint/browser scopes; inspect classifier callers and ownership overlap. The test must pass on the corrected candidate and fail on the base for malformed inputs.
3. Coordinate integration through a valid atomic lock owner. Evaluate deployment triggers, upstream source/PR overlap, review requirements, and branch protections. Merge only if independently verified, CI-qualified, and the no-deployment instruction can be honored.
4. Preserve the unrelated #427 → #440 → #441 → #443 wallet-journal chain, #431 → #435 settings chain, #390/#419 → #422 display combination, privacy/issue286 and unresolved security/Mythril findings. These are not newly qualified by this cycle.

`docs/automation/` was not present on live main at inspection; canonical existing `docs/ai/ACTIVE_WORK.md` plus this isolated handoff preserve the checkpoint without silently creating a competing shared ledger while another coordinator owns the integration lock.
