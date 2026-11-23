# R60: finalized-donor evidence integrity and historical security-source triage

Checked 2026-11-23T09:04:43.550Z. Main `8ddb344973e80b8e1eda6821e970ee6a2b808b29`; owner branch pre-publication HEAD `1133c57ab1af66f027c4ef391e1d53b15c429cd0`. This is source/tooling engineering, **not** a payment application merge or release.

## Confirmed reproducible validator defect and fix

The R59 validator accepted an already-finalized donor at unchanged SHA whose disposition was silently rewritten from `included-in-main-by-ancestry` to `audit-or-documentation-only`, with no source-proof update. Demonstrated against the exact R59 566-record ledger: the transition returned finalized=316 despite the unsupported historical rewrite. This could hide the actual integration state of safety-sensitive donor changes.

- Test-first commit `afe32ef418712b78396ced87d0f808d3039b728c` adds regression test covering disallowed silent disposition rewrite, valid proof-backed correction, and five malformed-proof variants.
- Fix commit `1133c57ab1af66f027c4ef391e1d53b15c429cd0` requires `checkedDonorSha`, `previousDisposition`, valid `comparedWithSha`, nonblank `sourceProof` and `assessment` for any non-main previously-finalized row whose disposition changes.
- Direct V8 execution of **exact committed JavaScript** and regression definitions: **26/26 passed, zero failed**; historical R59 standalone/transition replay passed. It is not a native Node, full browser or payment qualification; hosted CI for the new source HEAD must be read separately. Prior exact R59 SHA `7ab1a0539dfd3628fcc55047f5875396f1d735d8` completed 24/24 CI jobs successfully, which does not qualify the R60 changes.

## Untruncated historic security donor investigation

Compared donor `codex/ghostpay-security-audit-20261030` at `63994db6cff8b3b3ca698427eee9e95904230546` against main: 5 commits ahead, 1398 behind, **15 changed files**, no compare-file truncation. Independently fetched complete Git trees (donor 3681 entries, main 4552, recovery PR372 6514; all `truncated:false`).

- Donor's `apps/relayer/src/secrets.test.ts` covers file replacement/growth, previously found semantically covered by the shared relayer-guard loader tests on main. Relayer server code is out of Pages-only integration scope.
- Donor's `apps/relayer/src/service.ts` pre-lane deadline recheck already appears in main (source line around 868), and its chain-adapter `scanHardening.test.ts` AR2 dense-results-window regression is also already on main (around line 404), with regrowth reset logic in `logs.ts`.
- Donor contains `reportsPlainRevert`, `readOperatorFee` and a `halted` adapter property, but those **functions/field and the historical `getOperatorFee` flow are absent from current Pages main** and recovery PR372. They cannot be lifted as an isolated patch without proving the old OP Stack fee-oracle path is still applicable. Do **not** misdescribe absence as proof the old path is vulnerable, or copy old production fee logic over current code.
- Affected recovery PR372 `sweep.ts`, `rpc.ts` and `txGuard.ts` differ from main and are owner-held; no changes made to those files. Further semantic classification of the remaining original 15 paths is required. Donor remains unresolved; no blanket merge/finalization.

## Safety and ownership

Dedicated BUG-only PR502 `automation/20261123T0840Z/bug/bitcoin-uri-input-snapshot` at `02aba52ad3d38991cc58a7d6869836cd70a0cbb5` belongs to its existing owner, not consolidation. PR372/PR500 remain independent owners. Integration metadata generation 12 is released; branch-protection API returned HTTP 403, and independent reviews plus exact-head browser/security checks remain mandatory. No deployment, key exposure, custody server or real-funds tests.
