# Combined account privacy and idle qualification — 2026-11-26

## Source and exact composition

- Branch: `fix/account-privacy-qualification-20261126-8812`; root claim
  `99494d1c4f4cf775a22aa8febf9674519bb7443d`.
- Base: canonical #691 `f8145c1cb8d806f1d8b134c159eb00f595e6769a`, containing
  corrected idle #689 `0ae8a9d1812c28acdc894b3a3ac12b82ef38aaff` and main `1bea3df3`.
- Normal merge `88b002edf84361a953d6111bb531ff5d76bcf8a0` adopted TagArchive
  `eff31aad96ca9011ddcac0d001ac595d5df5405a`; normal merge
  `ea9ddeecc2e4ab1dca56a4bf467747c67235b0e7` adopted browser fixtures
  `f6911be80ebaba20ce26e42bfa999d713c6ef151`. Both ancestries remain intact.
- Final fixture source: `ed5ea96e17333f5ec71380882ce56abb753362a3`;
  tree `3be592cc3f82a713aa3c93d10041c57a9162b3cc`. Above the normal composition,
  pre-edit claim `9278002a` and two wallet source-inventory/metadata tests were added.

The three browser fixture blobs (`flows`, `devnet-journey`, `pages-devnet`) exactly
match `f6911be8`; `TagArchive.test.tsx` exactly matches `eff31aad`. Both donor
handoffs are exact. The full canonical ownership prefix and coordinator/TagArchive/
browser tails are preserved once in order, followed by the new wallet-test claim.
Six fixture/test paths are the only source differences from canonical #691.
Runtime, catalogs, configuration, dependencies, workflows, contracts and chain
scope are unchanged. All fourteen idle cases and the entire Pages expiry case,
including its four-line clock correction, are exact.

## Review and corrections

Root independently approved all three source slices and the two donor handoffs,
including the exact final wallet-test diff `ed5ea96e`. `/root/help_review` checked
composition and independently reviewed TagArchive; root independently reviewed the
browser and wallet-test changes because this worker authored them. No source or
composition finding remains.

TagArchive retains the same unbacked seller while suspending ordinary authority.
The test verifies absent archive controls/passphrases, denied old/fresh guards,
and actual encrypted export/verification while still locked. Normal import creates
fresh authority while the old guard remains invalid. All 53 original assertion/
idle-setting/time-advance/timeout lines remain in order. Production crypto
parameters and the one-minute idle / 61-second advance are unchanged.

Browser fixtures conceal durable history until actual matching-account/network
recovery through wallet disclosure. They retain hash/receipt binding, cross-account
duplicate refusal, confirmed clearing, nonce/balance checks and no extra send.
The silent-network case expects the proven current public revocation notice and
cleared signing controls; no runtime error is hidden.

The latest hosted web run exposed two additional stale tests. The connection
inventory now enumerates exactly four production files, including WalletAttempts.
Its checker requires an approved final disclosure-options form and corresponding
`useWalletDisclosure()` binding. Five negative cases reject omitted/empty options,
an undefined gate and unbound explicit/shorthand values. Discovery metadata keeps
exact-object equality and all oversized-input limits, adding only the required
`requireLifecycleEvents: true` field. Production and consent gates are unchanged.

## Actual original-head failures

The coordinator's standalone #689 web baseline, job `139653073679` at `0ae8a9d1`,
had 3,973 passes and two failures: TagArchive after idle suspension and invoice
retention after a ten-hour idle jump. The retention correction is already in
canonical #691; this composition adds TagArchive's correction.

All observed #691 jobs below tested merge `7335f02b457607bffff564a3dd6959b951a3bf0c`
(`f8145c1c` into main `1bea3df3`), not the corrected composition.

| Run / job | Observed result |
| --- | --- |
| CI `45743729535`, web `139655022034` | 4,053 passed, 4 failed, 2 expected failures, 1 skipped. Failures: TagArchive, two disclosure-source assertions and exact discovery metadata. |
| CI `45743729535`, full `139655022238` | 180 passed, 2 skipped, 2 failed: the two pre-connection flows hash assertions. |
| CI `45743729535`, lean `139655021954` | 168 passed, 4 skipped, 2 failed: the same hash assertions. |
| Beta `45743729477`, browser `139654655573` | Three devnet failures: two post-reload hash assertions and the obsolete network-only notice. Library and CLI stages passed. |
| Pages `45743729598`, browser `139654656248` | 11 passed, 1 failed, 5 did not run: buyer history after reload. |

## Bounded local evidence

| Check | Actual result |
| --- | --- |
| TagArchive ordinary fixture | 9/9 passed; typed lint and full web TypeScript exited 0. Captured original execution records were inspected; their later export was not a rerun. |
| Existing silent-network/account component cases | 2 passed, 26 unselected; verified the public notice and zero-send behavior before the browser edit. |
| Wallet-test reconciliation | Local unchanged baseline: 3 failed, 30 unselected. Corrected selection: 8 passed, 30 unselected, including the five new negative checks. |
| Final two wallet-test files | Typed lint and full web TypeScript completed exit 0. No other hardening cases or generated campaign ran. |
| Browser fixture source | Affected-file lint, full web TypeScript, secret and whitespace checks passed. Collection only: full flows12 + idle14; lean flows11; devnet3; Pages17. |

The coordinator workspace independently installed the locked 722 packages and
reused 65 library build directories after checking identical package sources.
Logs are under `verification-8812/account-qualification-*`; donor commands and
limits are in [TagArchive evidence](TAG_ARCHIVE_IDLE_FIXTURE_20261126.md) and
[browser evidence](ACCOUNT_HISTORY_BROWSER_QUALIFICATION_20261126.md).
**No browser bodies ran locally**, and no corrected-source hosted pass is claimed.

## Remaining integration gates

Root owns final documentation review, publication of a nonforce #691 follow-up,
fresh exact-composition hosted unit/full/lean/devnet/Pages checks, the cooperative
integration lock and ordinary merging. Qualify #689 and #691 together through a
green combined #691; do not merge or describe the failing intermediate #689 as
independently green. Policy #692 and later privacy/retention work remain separate
continuations. This worker performed no remote mutation or merge.
