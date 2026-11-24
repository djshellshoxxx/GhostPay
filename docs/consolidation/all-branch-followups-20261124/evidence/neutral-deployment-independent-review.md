# Neutral deployment diagnostic — independent source review

## Source decision

**The bounded author source, recorded qualification, and coordinator composition are approved. No source blocker was found.** Execution evidence retains the author's qualified source pin; this review does not assert a new final-head run.

- Reviewer: `/root/ownership_review`.
- Approved author source: `e65214c2f13bd7724aec42032e6cfcb40e87aba5`.
- Author tree: `088fa581964a891a793bdeaef879a42bf1c20725`.
- Final author documentation head: `c38f3c2cd692b44f512c596cab4732b7ed04f5ce`, tree `e78131dd21005e3abf360f10d4bea1ac262e4fa0`.
- Reviewed coordinator merge: `70df75359a807bf833da82f43229452d6ab59976`, tree `d006864ec291386d17ddab0bd4fd4ac1bb08c1a8`.
- Baseline: `7852931fecc8bdd2ab17e3e70813f36e502c50b0`, tree `bc51e09031d4d52a47b01596ed24ef5a8297a945`.
- Selected donor #619: `3107b816144b4a6fe43f197fbdc323b5d8d80628`.
- Earlier donor #570: `557815335b8ef94b6c311c0ca4369daf0756ae1d`.

The source commit follows claim commit `cafa0ebd6c8e872d2041ac77eb9213d1af280cce`. Its entire difference from the baseline is the three selected donor files and the append-only ownership claim. No donor branch was merged wholesale.

## Exact selected files and preservation

| Path | Reviewed content | Preservation |
| --- | --- | --- |
| `apps/web/src/lib/deployment.ts` | Actual `ChainAdapterError` instance selects a fixed contract-check message; every other rejection selects a fixed RPC message | Only the class import, diagnostic comment and reason-selection expression change; every other source byte is exact |
| `apps/web/src/lib/deployment.test.ts` | One existing donor case covers genuine adapter errors and ordinary errors with an adapter-looking name | Entire baseline file is an exact prefix; all five original named cases remain, with one appended case |
| `apps/web/src/lib/hardening.test.ts` | Actual adapter instance plus ordinary provider-error cases; fixed returned reasons and disabled-payment banner assertions | All 16 named cases remain in order; only one import and one existing case change; all other bytes are exact |

All three postimages and modes are exact to #619. The first two are also exact to #570; the corrected hardening test is specifically taken from #619. Named-case counts above are static source counts, not execution receipts.

The changed hardening case retains no-RPC, pending-check and disabled-payment assertions. It now verifies fixed messages and absence of supplied detail in both the returned result and formatted banner. No original case is deleted or skipped, and no broader test expectation is weakened.

## Contract and current callers

The helper retains the same exported types and call signature. An absent primary RPC still returns `no-rpc` without invoking verification. The same manifest and primary client reach the same verifier; the optional secondary client is omitted or forwarded exactly as before. A successful `VerifiedDeployment` value is returned unchanged. A verification rejection remains `unverified`. The formatter's existing status mapping and payment-disabled wording remain unchanged.

The runtime class comes from the already imported `@ghostpay/chain-adapters` dependency. That package exports the class from `errors.ts`; the default verification implementation uses the same module's `fail` helper. No dependency, manifest, lockfile, network request, contract or workflow changes are required.

The new reason selection does not read an error's `name` or `message`. A genuine adapter instance receives `the contract checks failed`; all other values receive `the RPC could not be read`. These are intentionally broad diagnostics: an adapter error can also represent a transport failure, and a non-instance error uses the generic fallback. The distinction does not change authorization or verification status.

Static references at the baseline show only the two test files importing `checkDeployment` and `deploymentProblem`; there is no current application caller outside the utility itself. The application retains its separate bundled-manifest loading and manifest readback path in `defaultServices.ts` and `manifest.ts`. This unit corrects an existing helper and adds no caller. It does not establish application-wide diagnostic coverage, a newly active payment gate, or completion of the donor's broader privacy/export work.

## Evidence and limits

The companion `neutral-deployment-independent-review.json` records exact blobs, modes, source-preservation checks, donor correspondence and the current review state. The earlier `final-extended-composition-independent-review-7852931.*` reports remain unchanged and cover the baseline's application/tooling/HTTPS/cookie composition.

No project source, refs or remote state were modified by this reviewer. No project tests, browser/native checks, installs, builds, analyzer runs or reproduction cases were executed. Only immutable source, existing instructions and static callers were inspected.

The author's current checkout reuses web dependencies that still contain cookie 0.4.2. Its focused qualification must not be described as an exact installation of the final cookie 0.7.2 lockfile. The separate cookie review and its private-install evidence remain distinct. Final combined hosted qualification remains necessary.

## Qualification and merge addendum

The committed qualification at the final author head records all three commands on `e65214c2f13bd7724aec42032e6cfcb40e87aba5` / `088fa581964a891a793bdeaef879a42bf1c20725`:

| Check | Recorded result independently verified |
| --- | --- |
| Existing deployment, hardening, manifest and defaultServices suites | 4 files; 45 passed; 0 failures and 0 skips; exit 0 |
| Full web typecheck | Exit 0 |
| Full web typed lint | Exit 0 |

These 45 focused tests overlap prior application coverage and must not be added to earlier full-suite totals as new unique cases. No full application suite, bundle build or native/browser execution was performed for this unit.

The final author commit changes only four documentation/evidence paths after qualification: the additive completion record, handoff, qualification JSON and log archive. Product/test source remains exact. All eight archive members were read back, checked against their recorded sizes and SHA-256 hashes, and compared byte-for-byte with the original scratch records. The archive SHA-256 is `8263be6b725860d69fd6beafaee74d0452d013f5f050bc60971b04ebb07eb29c`.

The coordinator merge is independently approved in `final-extended-composition-neutral-diagnostics-addendum-70df753.md` and its JSON companion. Its only shared changed path is the ownership registry; both parents' ordered lines and multiplicities survive. All six nonshared entries are exact, and the entire remaining tree is the expected parent union. All earlier tooling, HTTPS and cookie postimages remain exact.
