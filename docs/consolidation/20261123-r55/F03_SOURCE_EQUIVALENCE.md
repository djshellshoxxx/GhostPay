# R55 supplemental — F03 historical donor source disposition, exact tree proof

**Checked:** 2026-11-23T04:15:14Z UTC. No changes to app code. This is a source-inclusion proof, **not** a behavioral-equivalence, security acceptance or main integration claim.

- Historical donor `audit/f03-browser-qualification-20261120` at `9a0e268034ee2321c5e333c35a3aa1825b1c8f63`.
- Current draft F03 owner [PR #310](https://github.com/djshellshoxxx/GhostPay/pull/310), base `main`, HEAD `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`.
- Main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- GitHub recursive Git tree comparisons of the donor, PR #310 and main each returned `truncated=false`.
- Donor has **22 paths missing from PR #310**, **all under documentation/evidence**; **zero donor-only production or executable test paths**.
- **16 shared paths have different blob hashes**: 13 app/package code or tests and three coordination/evidence documents. All **13 differing app/test paths in PR #310 match the exact current-main blob SHA**. Thus the donor variants are historical, older versions already superseded by main at those paths; none is an isolated new source/test blob requiring restoration.
- All other shared application/test paths, including the four previously confirmed F03 payment-request implementation/test files, have **identical Git blob hashes** between donor and PR #310. PR #310 also adds **47 parent-only paths**; no parent changes are silently reverted.
- The 13 different source/test paths are: `apps/web/src/lib/buildProfile.test.ts`, `buildProfile.ts`, `merchantIdentity.test.ts`, `merchantIdentity.ts`, `qrKinds.test.ts`, `qrKinds.ts`, `qrMultipart.test.ts`, `qrMultipart.ts`, `scanSpam.ts`, `packages/payment-uri/src/bitcoin.ts`, `query.ts`, `solana.ts`, and `tron.ts` (the five abbreviated filenames in the preceding web folder share that same prefix). Exact hashes are retained by the immutable donor/parent/main commits.
- Example: `packages/payment-uri/src/query.ts` on PR #310/main introduces `boundBuiltUri`, an output-length guard absent in the older donor. BTC/Solana/TRON constructors call the stronger guard in PR/main but not in the donor. Do not replace those newer files with donor versions.

**Disposition:** finalize only the historical donor's **structural source/test recovery obligation** as `retained-in-unmerged-recovery-PR310-pending-gates`, source pin parent `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`. This means all donor source/test blobs are either already present at the parent or superseded by the exact main versions; the donor-only documentation remains preserved on its original ref. PR #310 remains **draft, unmerged and unqualified**. No proof of application behavioral equivalence or completed F03 integration is asserted. Should parent #310 advance, the validator must invalidate stale parent SHA and demand new proof. No protected-main merge or authorization bypass.
