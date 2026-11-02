# GhostPay source and release-scope reconciliation — 2026-11-02

**Not engineering-ready.** This checkpoint records published-source recovery and
bounded qualification. It changes no application, dependency, trust, fee,
release, deployment or financial policy and does not resolve unavailable work.

## Pinned source

| Source | Commit | Tree |
| --- | --- | --- |
| Main observed before this documentation change | `edb0051eb89bd135c73733d9db14569aa000662d` | `cb91b18bae5705fa0ee6f1bfcabce5bee9b06a26` |
| Published application development version / PR #41 | `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2` | `86214bc44259326379239a99bfd2c3bd8572997a` |
| Earlier reconciliation document (not application qualification) | `243d98d67c7cbcc854b2107da5461e4718cb6272` | `11f29c702256745dbf9d7aee3d570384caec80d4` |

The published application source was restored and independently checked against
its Git identities: 3,190 files, 23,022,224 bytes, and 498 trees including the
root. Its exact public commit object was also verified. This supports a shallow
checkout of that published revision; it is not recovery of unpublished history.

The reported `integration/consolidated-all-2026-10-30` at short SHA `7979e6f`
remains unavailable. The current public branch inventory does not expose that
branch, and GitHub does not resolve that commit. Source transfer or an explicit
owner disposition is still required before overlapping implementation or any
source-completeness claim. Do not recreate its lean-build work from old lists.

## Candidate dispositions

These are bounded changed-file and source comparisons against published
`70d8bf6`, not complete behavioral equivalence or permission to close branches.
Preserve every original ref and any unavailable unique work.

| PR | Observed head | Disposition / next action |
| --- | --- | --- |
| #30 | `7373172db4cf40ce5622e5a92a55b2b086e5e7cb` | 87/160 changed blobs exact; 73 evolved. Reconcile evolved behavior; retain history. |
| #31 | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | Sole changed E2E file is exact in development. Do not replay its older file. |
| #32 | `b34edd5a7fccbc3d904d004135d1352bf2838ca1` | Action-update candidate; direct updates omit the older pin in `setup-forge`. Assess the composite too. |
| #34 | `212967febe05a8afc8e481e9c6b91d70558d5894` | Broad major dependency candidate has failing checks. Preserve; do not make it a prerequisite by assumption. |
| #36 | `cb917c67bf8a621c48ef02e7d70caf5eadb7b4e2` | 71/78 changed blobs exact; seven evolved. Hosting code is present with later changes. |
| #37 | `b6a0871d0618c5ee804947af22d21b794948fa3d` | Closed without merge; 411/437 changed blobs exact and 26 evolved. Preserve the aggregate and newer descendants. |
| #39 | `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` | Divergent history and 12 evolved paths. Newer deadline, fee and scanner mechanisms require behavior-aware comparison. |
| #40 | `63994db6cff8b3b3ca698427eee9e95904230546` | All three changed blobs match development despite divergent history. Do not duplicate the secret-loader repair. |
| #41 | `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2` | Application checks executed, but the PR targets another development branch. A verified path to main remains open. |
| #42 | `c9a8c3d3cf549799a9fc93a7053f2d9ccb5d0483` | Two documentation additions remain absent. Preserve and reconcile; documentation CI is not application qualification. |
| #43 | `8d1bde36bb7d16374a2f9ad0ac2c39f46c086951` | Documentation has stale PR #37 and scanner-follow-up claims. Reconcile before adoption. |
| #44 | `fd710eb367eff8bbc250024f5a4317875930736b` | Existing report-permissions repair, not yet incorporated. Sonar Security C / required A remains unresolved; no issue cause is inferred. |
| #45 | `277e490857a654f11e564ce8b208ee236ffbeb13` | Minor/patch dependency candidate: 23 successful checks and neutral CodeQL. Qualify against the eventual integrated source. |

Closed-unmerged dependency PR #33 is an older candidate than #45; retain its
source and account for unique lockfile changes rather than reviving it by title.
This table does not complete every branch or accepted-source-packet disposition.

## Supported-flow evidence and remaining gaps

The accepted milestone remains the client-only one-EVM invoice → explicit payment
consent → detection/reconciliation → invoice-bound seller receipt → sweep →
encrypted backup → independent fresh-profile restore, retaining the source.

- The inspected application still imports and routes BTC, Solana and TRON, and
  SellerKeys reaches TagArchive. Deferred-code exclusion is not established.
- Receipt verification and actual Pay-side invoice binding already exist. Seller
  receipt creation still accepts an explicitly unbound manual digest. Existing
  Worker E2E checks do not establish the complete invoice-bound creation journey.
- The Worker scenario uses mocked RPC responses. Recovery uses independent
  browser profiles of one configured engine; it is not cross-engine or physical
  device evidence. Existing valid-path coverage must be retained.
- Scan wording, payment/sweep unknown outcomes, reorg and late-result handling,
  interrupted operations, and private-review assignments still need their
  required exact-candidate behavioral qualification.

## Fresh bounded checks

On published `70d8bf6`, the relative-link check passed across 588 Markdown files;
all 65 action references were pinned; the committed-secret scan passed; all 39
tracked shell scripts passed syntax checking; proxy-header consistency and the
self-host fixture self-test passed. The self-test uses fake Docker/GitHub tools
and does not deploy or authenticate a real release.

The locale check failed: four catalogs, 1,533 errors and zero warnings. Do not
machine-translate security copy or reduce the gate to conceal missing work.
Dependency and process-execution prerequisites prevented fresh application,
browser, contract and reproducibility qualification. No partial runner summary
is counted as a full script-test pass. Existing hosted results apply only to
their exact revision and executed jobs.

## Resume gates

1. Recover and preserve the unavailable consolidation bytes and necessary assets,
   or obtain a specific owner disposition. Refresh refs and active ownership.
2. Reconcile unique changes without discarding newer guards; independently review
   and qualify each accepted slice through to canonical main.
3. Restore supported execution/dependency access, retain prior failure receipts,
   and run the full final-source matrix without weakening thresholds.
4. Finish deferred-code isolation, the complete supported product journey,
   security-gate resolution, human-reviewed locales and traceable repeat builds.
5. Keep production configuration/trust, private review, professional security
   review, device/accessibility/translation, licensing and publication decisions
   explicit. Package metadata remains `UNLICENSED`; no license is selected here.

No deployment, release tag/publication, credential change or real-funds action
was performed. Workflow inspection found manual Pages dispatch and version-tag
release triggers; any future merge must recheck those side effects.
