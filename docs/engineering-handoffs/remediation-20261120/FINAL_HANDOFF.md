# GhostPay release remediation — final engineering handoff

**Independent release verdict: BLOCKED — WITH PRECISE REMAINING REQUIREMENTS.**

This cycle implemented and published the Pages promotion gate, clarified two adversarial fixtures reported by CodeQL, added meaningful Sweep authority coverage, independently reviewed additional scan/QR work, and refreshed the same scoped PR against the newly published canonical successor. No PR was merged into main and no site, payment network, signing identity or release was activated.

Use [FOLLOWUP_CHECKPOINT.json](FOLLOWUP_CHECKPOINT.json) for the exact latest observation time and machine-readable queue. [FINAL_REMOTE_SNAPSHOT.json](FINAL_REMOTE_SNAPSHOT.json) retains the corresponding API responses. Later CI progress must be read from GitHub rather than inferred from this saved snapshot.

## Source and ownership

| Role | Exact source |
| --- | --- |
| Latest observed main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Canonical integration PR | [#278](https://github.com/djshellshoxxx/GhostPay/pull/278), `release/ghostpay-beta-qualification-20261119`, `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| Combined scoped remediation PR | [#292](https://github.com/djshellshoxxx/GhostPay/pull/292), `fix/ghostpay-pages-integrity-gate-20261120`, `936d054ed067d89c773310d42e33939c1129bbfa` |
| Combined tree | `02b24c83c14a8af608a97ccdd7ed97b0a3351a87` |
| Ordered source parents | `814950a1cf99e68765b85f241e6f4a0fc55ea9c6`, then `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| Locally reviewed equivalent merge | `6124ded5741b2d316327bee040da8a44bb1d652c`; same tree and ordered parents as published 936 |

The prior coordinator explicitly released generation 5 of `automation/ghostpay-integration-lock` at `2026-11-20T01:00:43Z`. This cycle did not acquire or alter that lock, the canonical shared branch, or main. The owned PR branch advanced once from 814 to 936 with an expected-head, non-force update. Git fetch and the authenticated ref readback verified the resulting object. PR #292 was draft and mergeable at the snapshot; mergeability does not satisfy its required checks or reviews.

The baseline refresh was necessary after canonical 417 introduced independently reviewed browser, signer, merchant and dependency-discovery corrections. An independent reviewer compared all 5,104 tree entries, verified exact preservation of all eleven changed non-documentation blobs, and proved both complete ownership records survive in order. The only manual merge resolution was the additive ownership document. [Combined-source review](successor-combined-review/REVIEW.md) preserves the proof and 24 passing verifier/promotion cases.

Further evidence remains on the separate `evidence/ghostpay-remediation-20261120` branch. Keep the qualified PR source frozen while CI runs. Do not push evidence-only updates to that PR head.

## Engineering completed

| Work | Reproduction and correction | Published implementation |
| --- | --- | --- |
| Pages artifact promotion | The actual original final promotion block failed all seven new expectations and promoted six corrupted staged artifacts. The builder now runs the existing independent verifier against staged bytes, its build-generated SHA256SUMS and the exact expected commit before either final move. Failure aborts promotion and success retains a receipt. | [94c01cac](https://github.com/djshellshoxxx/GhostPay/commit/94c01cac36d97e2d83ab763bf7b7a5d742217f38) |
| CodeQL hostile-fixture clarification | Replaced two fixed-fixture first-character replacement expressions with direct construction. Independent AST evaluations prove the hostile JSON and CSP strings remain byte-identical, with every rejection assertion retained. No production escaping fix, alert dismissal or analyzer suppression is claimed. | [e250143f](https://github.com/djshellshoxxx/GhostPay/commit/e250143f3c4263b9584e66acde64985a17222419) |
| Sweep authority tests | Added eleven cases covering revocation during real signing, silent/session replacement, expiry, endpoint changes, final journal callback invalidation, native/ERC-20 handoff, uncertain outcomes and buffer cleanup. Actual cryptography/client guards execute with authored offline RPC responses. No new runtime exploit was demonstrated. | [d298547e](https://github.com/djshellshoxxx/GhostPay/commit/d298547e9ca4d41ba4690b76f7f1dab95b84216b) |
| Reviewed canonical follow-up preserved | Included the original merchant counted-payment guard, replacement-preflight observation barrier, signer-fixture synchronization and composite-action dependency discovery without reimplementing or changing their source. | [936d054e](https://github.com/djshellshoxxx/GhostPay/commit/936d054ed067d89c773310d42e33939c1129bbfa), second parent [417f7c71](https://github.com/djshellshoxxx/GhostPay/commit/417f7c71daf8645e1432f2ec8f070110879b80bd) |

No threshold, existing assertion, analyzer policy, workflow privilege, contract, fee behavior, deployment key or enabled payment network was relaxed. The historical #276/#277 verifier implementation and hardening remain preserved; this cycle closes its missing builder integration.

## Executed combined qualification

[The current receipt](successor-qualification/RECEIPT.json) records commands, source identities, logs, review provenance and limits. Test counts overlap reviewer replays and must not be added together.

| Check | Actual result | Scope |
| --- | --- | --- |
| Clean dependency installation | 721 packages, exit 0 | Node 22.23.4/npm 10.9.11, scripts disabled, unchanged lockfile |
| Fresh library compilation | 65 workspace libraries, exit 0 | Built at local 6124 before publication metadata reconstruction; its complete source tree equals 936. This is not a separate final CLI stamp or whole-repository qualification claim |
| Pages tooling plus CSP, at 936 | 168 passed, zero failures/skips | Existing and new tests, unchanged assertions |
| Web transaction/signer/preflight selection, at 936 | 80 passed, zero failures/skips | Includes 68 Sweep cases, eleven signer cases and the original preflight-completion case; focused coverage disabled |
| Deployment manifests, at 936 | 13 passed, zero failures/skips | Focused selection, coverage disabled |
| Merchant ledger, at 936 | 30 passed with original coverage gate | 175/175 statements, 147/148 branches, 40/40 functions, 149/149 lines |
| Type/lint | Full web TypeScript and affected typed ESLint passed | Actual scopes recorded; no full-repository lint claim |
| Secret/action checks, at 936 | Passed | Existing source-secret scan and all 113 pinned action references |
| Two exact-source Pages builds | Both passed; 16 served files each | Release-build mode, zero enabled payment networks, automatic promotion verifier executed |
| Independent artifact checks | Both 16-file inventories and all served bytes match | Same environment only; independent reviewer, not independent builder machine |

Earlier dependency auditing on the unchanged lockfile reported zero production findings and 17 Low development entries, with zero Moderate/High/Critical entries. No dependency changed. The independent dependency review retained its advisory and compatible-upgrade limits.

### Downloadable inspection artifact

[ghostpay-demo-936d054e.tar.gz](successor-qualification/ghostpay-demo-936d054e.tar.gz) contains the complete `site/` and `evidence/` output: 21 regular archive members, including 16 served files. Archive round-trip checks verified the source identity and every served checksum.

- Archive bytes: **789,959**.
- Archive SHA256: `c8901f8cd19e950c4c3cf1a523c64230e2e97b5c8f3c5667321e3cf9d1737454`.
- SHA256 of the identical a/b `SHA256SUMS`: `dcd15d9346168f9c948614b957541371203376cc55024135b050a6138be9e7c3`.
- Source: `936d054ed067d89c773310d42e33939c1129bbfa`.
- `paymentsEnabledChainIds`: `[]`; mainnet is not activated.
- Declared origin: `https://djshellshoxxx.github.io`; `sharedOrigin: true` is explicit.

This is an inspection artifact. Its shared-origin declaration is not an accepted hosting exception. `release: true` records the clean build mode; it is not publication approval. GitHub Pages cannot provide the missing HTTP-header protections described in the existing owner decision packet. The checksum verifier checks bytes against a trusted inventory; it does not authenticate a maliciously replaced inventory or substitute for release signatures.

Using the exact candidate's verifier and an extracted archive:

```sh
node scripts/pages/verify-pages-artifact.mjs /absolute/extracted/site /absolute/extracted/evidence/SHA256SUMS --expect-commit 936d054ed067d89c773310d42e33939c1129bbfa
```

## Hosted CI and incomplete gates

Fresh 936 workflows were queued/pending at the recorded snapshot:

| Workflow | Exact run |
| --- | --- |
| CI | [44652410961](https://github.com/djshellshoxxx/GhostPay/actions/runs/44652410961) |
| Pages | [44652411300](https://github.com/djshellshoxxx/GhostPay/actions/runs/44652411300) |
| Beta acceptance | [44652410998](https://github.com/djshellshoxxx/GhostPay/actions/runs/44652410998) |
| Integration | [44652410979](https://github.com/djshellshoxxx/GhostPay/actions/runs/44652410979) |
| CLI operator qualification | [44652410859](https://github.com/djshellshoxxx/GhostPay/actions/runs/44652410859) |
| Hosting kit | [44652410995](https://github.com/djshellshoxxx/GhostPay/actions/runs/44652410995) |

The earlier 814 Pages build and its actual Anvil browser job passed; that browser job ran 16 tests. Its integration job also passed actual local-chain checks. Hosted Pages artifact 14590197888 was independently downloaded and checked against GitHub's ZIP digest, its 16-file inventory, exact source and zero-network metadata. Its synthetic merge `4b44077f` has the same tree as 814. These remain useful source-pinned historical results, **not** passes for 936, a published site or an external testnet.

The prior d74 CI failed the browser observation cases and signer-fixture synchronization. Actual failing logs were retained, and the other coordinator's independently reviewed corrections are now preserved in 936. Their current focused tests pass; complete real hosted browser and web qualification still must finish.

No cancelled, skipped, queued or pending required check is counted as passing. Publishing/attestation/smoke jobs skipped on earlier PR runs are not deployment evidence. The cause of current queue latency is not established, and no runner/concurrency or safety gate was bypassed.

## Security findings and audit boundaries

The bounded new reviews demonstrated **zero new Critical, High or Medium runtime vulnerabilities**. Repository-wide confirmed-open counts remain **unknown**, since private alert inventory, complete current analyzer disposition and external review are incomplete. Do not convert that bounded result to a global zero-finding statement.

Two High CodeQL annotations were traced to deliberate hostile fixture construction and clarified without changing the generated inputs. Fresh integrated finding-level clearance remains required. Successful language-analysis execution alone does not clear a failed findings check.

The exact d74 Mythril job ended cancelled. Its recovered artifact has four of five target results and three Low SWC116 records. `PolicyAccountFactory` is missing, overall `completed` is false, and the terminal runner exit is null. All retained hashes and the full untruncated partial report were checked. The source locations correspond to existing C1–C3 assessments; this follow-up does not dismiss them or claim new counterexample replay. [Terminal evidence](terminal-mythril/README.md) and the original downloaded ZIP preserve the actual result. Current canonical [Contract analysis 44650172375](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172375) was queued. The older complete ten-record report and this partial three-record report must not be substituted for complete final-source clearance.

### Additional independent work preserved for subsequent integration

- **PR #290:** Exact `ec546311f994fe1db544fe85ff2aa6db428d67d4` primitive-string QR guards independently verified. Latest supplied cases were 40 pass/13 fail on original runtime, then 53/53 on fixed runtime. A separate actual-module probe observed 16 original hostile-input failures and 16 fixed passes; 148 valid/inherited/mapping controls pass both. No successful remote fund-loss exploit was demonstrated. The source is compatible with 417/936, but its ownership-log conflict and normal qualification remain. [Review](qr290-review/REVIEW.md).
- **Private scan:** Three real-WebCrypto continuation probes plus 47 existing lifecycle/store cases passed twice, including a reviewer independent of their author. They cover authority replacement/history invalidation during actual encryption or decryption completion and buffer cleanup. The exact new test source, hashes and both reviews are preserved. Storage is an in-memory guarded CAS fixture; browser IndexedDB, cross-tab delivery/restart, live RPC and external testnets are not qualified. The test is not silently added to frozen PR #292. [Author evidence](scan-review/AUDIT.md), [independent review](scan-probe-review/REVIEW.md), [exact reproducible test source](scan-review/privateScanLifecycle.cryptoBoundaryReview.test.ts.txt).

The original metadata census covered 282 PRs: 73 open, 67 merged and 142 closed unmerged, with 299 remote branch heads and no tags at that snapshot. Subsequent work examined #290 and #292. This is not a fresh semantic audit of every historical branch. Preserve the canonical branch-disposition work and its explicit UNKNOWN/deferred scopes. No historical branch was deleted and no superseded PR was closed by this cycle.

## Remaining release requirements and next steps

1. **Keep 936 frozen and finish its complete hosted matrix.** Retrieve actual logs for any failure. Repair demonstrated causes with original assertions and gates. Complete web coverage/nocov, full/lean builds, browser `/GhostPay/` scenarios, local-chain lifecycle, accessibility and applicable contract/fuzz/invariant checks on the approved final source. Focused results and older Anvil passes do not establish this complete matrix.
2. **Complete strict security qualification.** Obtain current CodeQL/finding results and the complete strict analyzer evidence. Preserve existing per-finding assessments and residual deployment constraints. Required external security review remains separate from all agent reviews.
3. **Integrate qualified work through the approved workflow.** Re-read main, canonical head and ownership; acquire current coordination before any shared update. Merge #292 only after its required checks/reviews, then reconcile reviewed #290 and the maintained scan probes without losing unique work. Requalify the exact combined canonical commit before main. Do not force-push or infer permission from main's unprotected API setting.
4. **Resolve owner-controlled demonstration choices.** Use the prepared [deployment decision packet](../../release/DEPLOYMENT_READINESS.md): ADR-0029/ADR-0015 scope, dedicated origin/account and verified DNS/HTTPS, Pages security-header limitations, environment controls, applicable legal/licensing/fee decisions, exact artifact/source and publication authorization. Do not treat the shared origin or engineering request as approval.
5. **Qualify actual publication.** Perform required independent-machine reproduction and the approved hosting build, then verify the live source commit, every artifact byte, subpath routing and browser behavior after an authorized deployment. No live deployment occurred here.
6. **Keep payments-enabled beta separate.** It additionally needs an approved EVM testnet, verified contract bytecode/addresses/immutables, approved offline signing process and public verification key, signed deployment manifest, real-wallet payment/confirmation/private-scan/receipt/native-sweep/restart/independent-recovery acceptance, and its explicit release approval. No mainnet or real funds are authorized.

The current external/runtime boundaries are pending hosted qualification, unavailable local browser execution already documented by prior workers, incomplete current strict/security evidence, and owner/external-review gates. No whole-repository engineering fixed point or fully completed beta is claimed. This handoff preserves the completed work and the exact next actionable queue without repeating prior discovery.
