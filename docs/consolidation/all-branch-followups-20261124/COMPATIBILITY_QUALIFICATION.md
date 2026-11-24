# Compatibility qualification supplement

**Composition:** `7852931fecc8bdd2ab17e3e70813f36e502c50b0`  
**Tree:** `bc51e09031d4d52a47b01596ed24ef5a8297a945`  
**Application evidence base:** `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`  
Prepared by `/root/historical_review`, 2026-11-24 UTC.

Existing receipts are consistent and bind to unchanged selected units in this
composition. This supplement adds no test execution and does not recount the
separate application evidence or replace the delegated final composition review.

## Qualified sources and retained results

| Unit | Qualified source | Final selected head | Local result |
| --- | --- | --- | --- |
| Cookie #377 | `5a2038d6f5fd0e01f663a09d9dcaa75742754c07` | `bb81db3e68bc6725e6d966593a7f20bda88cd31d` | 6 tooling + 30 router cases; typecheck and 36-file native compilation passed |
| Tools #358 / #468 | `90415efdbc9af2db3537148f4702e8f8f5791815` | `7851c5063282255117709296ddde7dcef148444c` | 37 distinct cases; syntax and current-input/runner-contract checks passed |
| HTTPS/RPC #578 | `e2401baa939359b67b5f0541cdb92edcc8c6bd1f` | `d995764543041b0d971db2759be9b2f3f9afc9a7` | 70 consumer cases; web typecheck/lint passed; one native scenario listed per profile, zero executed |

All listed suites recorded zero failures/skips. The tools canonical 13 cases
were also run separately, then rerun within the 37-case discovery invocation;
**37 is the distinct count, not 50**. Its breakdown is 13 comparator, five evidence
formatter and nineteen existing offline-runner cases. Do not add these per-unit
counts to the earlier whole-application total. Compilation's 36 files are not
additional tests.

All three candidate heads are ancestors of the composition. Their production,
test and documented interface files remain exact qualified entries. Every
qualified-source-to-final-head change is documentation only. In particular,
`bb81db3e…` changes only the cookie handoff and registry after `5a2038d6…`;
its three product/test files remain donor-exact. The three final handoffs are
preserved exactly in the composition.

## Cookie installation and audit boundary

The current successful installation is a normal **private workspace-only npm ci**
for confidential-contracts plus root: **334 installed packages**, 335 records
including its workspace link. All 74 manifests plus the lock were exact source
snapshots; installed version/resolution/integrity records match the candidate.
Sentry node and its actual utils consumer resolve private cookie 0.7.2. This is
not the historical donor's 722-package full installation, a fresh full-repository
install, or lifecycle-script qualification. Shared cookie 0.4.2 was not used for
these tests. Only a 512 MiB heap cap was set; no module-resolution flags were used.

The canonical install's npm tree is clean and shows the overridden chain.
Earlier externally linked checkout/stage diagnostics remain recorded and are
not counted as clean-tree results. After the canonical metadata check the source
workspace link was restored; final per-entry link bookkeeping preserves all
twelve checked resolved module filenames. All 814 other lock records remain
unchanged, including 222 nondevelopment/non-link package records (223 counting
root metadata).

The production lock audit records **zero findings and exit 0**. The full audit
retains **15 low Elliptic-derived development findings and exit 1**, with zero
moderate/high/critical findings. No clean-full-audit claim is made. Independent
review `/root/ui_data_review` approved the exact qualified source and inspected
installation, actual resolution, retained diagnostics and raw receipts.

## Standalone tooling contracts

The comparator retains its canonical complete branch/PR observation contract,
including original PR base/head IDs and the captured integration head. Current
refresh/2 and final-ref snapshots are incompatible and were explicitly rejected
before Git comparison. No adapter or current full-census replay is claimed. Its
Git output cap is 64 MiB per subprocess, not a global input/report cap; it does not
decide qualification or release ownership, mutate refs, merge or dispatch CI.

The formatter reads five accepted report shapes within an 8 MiB input bound.
Labels are positional; legacy `clean`/exit 0 means only zero reported issues in
those objects. It does not establish analyzer exit success, target identity,
authenticity, complete exploration or clearance. Existing runner gates are
unchanged. Runner compatibility tests used a synthetic offline executable;
**no actual analyzer was executed**. Required Node 22 hosted qualification is
separate from the local Node 24.22.3 executions.

## HTTPS collection is not native acceptance

The 70 existing Settings/scan-privacy/invoice-create cases passed in seven files.
Full and lean Playwright `--list` each registered exactly one HTTPS scenario;
**neither executed the browser, TLS server or assertions**. The local native
restriction was not retried. No local application build was repeated for this
test/documentation-only addition. Historical donor full/lean passes are retained
as dated evidence, not qualification of this composition.

The test uses owned loopback TLS material and an intercepted synthetic selected
RPC. It checks secure context, signed-invoice review, saved scan preference,
selected-chain health request and wrong-chain refusal. It does not certify a
Tor route or exercise a live provider, wallet or payment. Fresh combined full/lean
hosted execution remains mandatory.

## Evidence inventory for the Git report

The JSON companion records absolute source paths, byte counts, hashes, each raw
archive member, source bindings and an embedding-name suggestion. Cookie evidence
below is still scratch evidence and should accompany the Git report:

| Suggested embedded name | Bytes | SHA-256 |
| --- | ---: | --- |
| cookie/qualification.json | 25630 | `435983de247925725e597217de8f211db83394fe99e4f52fcc752c303c2d12f1` |
| cookie/cookie-recovery-evidence.tar.gz | 88959 | `3a9ee6c67a2e78c842ba7d38ca2f926d55e7221c908c483023cb1806d36048d8` |
| cookie/independent-review.md | 6323 | `b9e6ac0999685231908eadb36f6c53689f04409e1e1a73008b2c0a00994f2d7b` |
| cookie/independent-source-evidence.json | 9344 | `24673bd3395c7ae83679d0ecd6ad02f2c701ef25029c035f03f8797cbfd9228d` |
| cookie/evidence-archive.json | 1478 | `b61463a071ce9ae129545340e6587e172134ecf8a74875f98ccf99afa6daded2` |

The cookie archive is pinned to qualified source `5a2038d6…`; its separate final
`qualification.json` records docs-only `bb81db3e…`. No dependency tree/cache is
included. Cookie independent-review inventory and raw-log hashes are consistent.

Tool and HTTPS receipts/archives are already committed under
`docs/handoffs/readonly-tooling-recovery-20261124/` and
`docs/handoffs/https-rpc-compatibility-recovery-20261124/` respectively. Their
archive hashes are `c9610137fc3dbc48273066c4c8185c5000a6f5092be4bdadc8c21962620d9225`
and `005c978f3d77994c7e07a11e597b3a513bbf1ea7641d4fd4c6c15ee0d2d84642`.
The existing independent tools/HTTPS review Markdown and JSON are also inventoried
in the companion for embedding.

Verification matched **51 declared hash references** with zero mismatches and
read back **49 archive members** (34 cookie, ten tools, five HTTPS). No runtime,
native or analyzer test was rerun; no repository source or Git ref was changed.
Fresh final-head hosted installation, ordinary/security gates and required native
browser results remain the acceptance boundary.
