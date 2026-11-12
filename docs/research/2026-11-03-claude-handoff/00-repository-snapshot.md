# Repository state and research delta

Snapshot date: **November 3, 2026, America/Vancouver** (November 4 UTC).
This report distinguishes observed source, contributor-reported results, and new research. It is not a release-acceptance record.

## Source anchors

- Canonical repository: [djshellshoxxx/GhostPay](https://github.com/djshellshoxxx/GhostPay).
- Inspected `main`: [`0014bc5b26c7487ea1f9fb230194c36673193236`](https://github.com/djshellshoxxx/GhostPay/tree/0014bc5b26c7487ea1f9fb230194c36673193236).
- Inspected integrated core: [PR #47, `f8193502e602c99bb24ff956f142671750b744a0`](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0).
- These are different source states. Do not use a missing file, stale guide, or failed check on main as proof that the integrated candidate lacks the same capability.
- The research note branch is based on main and adds documentation only. Source links explicitly point to PR #47 or a child PR where that source is not yet on main.
- The existing [lean release scope](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/handoffs/LEAN_RELEASE_SCOPE.md) keeps the first supported milestone to one EVM invoice/payment/detection/receipt/sweep/recovery path. Deferred systems remain preserved; research about them does not expand that release claim.

## Research-packet verification

Before publication, the handoff's relative file links and explicit Markdown reference definitions were checked. All 120 unique pinned upstream GitHub file links were verified against retrieved trees or file responses. The 69 pinned GhostPay file links resolve through 64 local Git object checks plus five previously retrieved API file responses. This is path/provenance verification, not execution of the referenced code or tests.

Both saved Chainlink JSON files match their recorded SHA-256 hashes, byte lengths and record counts. All selected record fields match the retrieval manifest. A second agent independently checked this extraction, and another independently sampled the private-scanning report's source/license evidence and claim boundaries. No application test result is inferred from those documentation checks.

## Live ownership refreshed during research

The REST open-pull-request collection returned **27 open PRs** at the mid-research refresh. Search results alone omitted several known PRs, so the collection and individual PR metadata were used to reconcile ownership. The collection is a point-in-time inventory, not proof of merge eligibility or complete branch ancestry.

| PR | Work already owned | Head observed | Base observed |
|---|---|---|---|
| [#47](https://github.com/djshellshoxxx/GhostPay/pull/47) | Consolidate published work and implement supported lean checkout | `f8193502e602c99bb24ff956f142671750b744a0` | `main` |
| [#59](https://github.com/djshellshoxxx/GhostPay/pull/59) | A0: fix web typecheck that turns PR #47 CI red (axe page-global cast) | `4a38efdfa999f84685e5004b4c17a2a8e493f704` | `integration/ghostpay-accepted-20261102` |
| [#60](https://github.com/djshellshoxxx/GhostPay/pull/60) | C2: seller device pairing (public config) and registry meta-address QR export | `fc0980947f8103244ac76652fa18f75de1cc49f3` | `claude/ar-a0-pr47-green` |
| [#61](https://github.com/djshellshoxxx/GhostPay/pull/61) | A6: combined backup checklist (seller keys + tag archive, full profile) | `11bc44a417ba31406de1a180d39cdbfe08327322` | `claude/ar-a0-pr47-green` |
| [#62](https://github.com/djshellshoxxx/GhostPay/pull/62) | B1: chained lean-core browser journey and devnet backup/restore step | `9763a112cfdc0bea19ed2efe916b3f19a3fcd170` | `claude/ar-a0-pr47-green` |
| [#63](https://github.com/djshellshoxxx/GhostPay/pull/63) | C7: iframe-mode embed e2e + SDK handshake fix | `f2c3555193c34a341824878c52c5f7cad7e12800` | `claude/ar-a0-pr47-green` |
| [#64](https://github.com/djshellshoxxx/GhostPay/pull/64) | B2': require invoice-bound seller receipts in the lean profile | `820ede969445d6b3e186bc357e7d1c90ea253f64` | `claude/ar-a0-pr47-green` |
| [#36](https://github.com/djshellshoxxx/GhostPay/pull/36) | Portable hosting kit (tools/portable-hosting-kit) | `cb917c67bf8a621c48ef02e7d70caf5eadb7b4e2` | `main` |
| [#54](https://github.com/djshellshoxxx/GhostPay/pull/54) | docs: independent GhostPay acceptance-tests research 41750257638 | `57b414bfbc1fa9de9ef68675b9181b4c148f18e4` | `main` |
| [#55](https://github.com/djshellshoxxx/GhostPay/pull/55) | docs: independent GhostPay security-review research 41750257638 | `2d9c30e12c41cfb0212b0cfc366c83a1e5e45b21` | `main` |
| [#56](https://github.com/djshellshoxxx/GhostPay/pull/56) | docs: independent GhostPay documentation-ux research 41750257638 | `96fc22c42a704d1c590d56d624fff15a945c8231` | `main` |
| [#57](https://github.com/djshellshoxxx/GhostPay/pull/57) | docs: independent GhostPay release-qualification research 41750257638 | `6bd5b15ce4b883b1070ccc1deef6086fd9df3aa4` | `main` |
| [#58](https://github.com/djshellshoxxx/GhostPay/pull/58) | docs(handoff): autonomous completion prompt and launch recommendations | `1db8e967af91bc1d3132e99fa5f4d94696e22997` | `main` |
| [#51](https://github.com/djshellshoxxx/GhostPay/pull/51) | ci: continue GhostPay API-funded backlog development twice daily | `5835736c12968231ac7b3152e394077bee453622` | `main` |
| [#52](https://github.com/djshellshoxxx/GhostPay/pull/52) | ci: add four parallel API-funded GhostPay QA agents with guarded integration | `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce` | `main` |

Additional open dependency/history PRs in that inventory: [#49](https://github.com/djshellshoxxx/GhostPay/pull/49), [#45](https://github.com/djshellshoxxx/GhostPay/pull/45), [#44](https://github.com/djshellshoxxx/GhostPay/pull/44), [#43](https://github.com/djshellshoxxx/GhostPay/pull/43), [#42](https://github.com/djshellshoxxx/GhostPay/pull/42), [#41](https://github.com/djshellshoxxx/GhostPay/pull/41), [#40](https://github.com/djshellshoxxx/GhostPay/pull/40), [#39](https://github.com/djshellshoxxx/GhostPay/pull/39), [#34](https://github.com/djshellshoxxx/GhostPay/pull/34), [#32](https://github.com/djshellshoxxx/GhostPay/pull/32), [#31](https://github.com/djshellshoxxx/GhostPay/pull/31), [#30](https://github.com/djshellshoxxx/GhostPay/pull/30). Their lockfiles, source branches and CI definitions were not changed by this research.

PR #60 moved from the initially inspected `4b386f441ecbd0b4985e4d4bd6d4438117d41a74` to `fc0980947f8103244ac76652fa18f75de1cc49f3` during the session. Both source identities are preserved in the research process. Refresh live ownership again before implementation.

### Later ownership refresh

The open-PR collection was refreshed at **2026-11-04 02:39:55 UTC** and contained **36 open PRs** before this research PR was created. Main remained at `0014bc5b26c7487ea1f9fb230194c36673193236`, and PR #47 remained at `f8193502e602c99bb24ff956f142671750b744a0`. This table updates ownership; it does not assert that every newly advanced head was fully rereviewed. The area reports retain the exact revisions they inspected.

| PR | Current work title at this refresh | Latest observed head | Latest observed base |
|---|---|---|---|
| [#59](https://github.com/djshellshoxxx/GhostPay/pull/59) | A0: fix web typecheck that turns PR #47 CI red (axe page-global cast) | `4a38efdfa999f84685e5004b4c17a2a8e493f704` | `integration/ghostpay-accepted-20261102` |
| [#60](https://github.com/djshellshoxxx/GhostPay/pull/60) | C2: seller device pairing (public config) and registry meta-address QR export | `f5c9015ff38529a981b15a3ca9c6dd60635b2837` | `claude/ar-a0-pr47-green` |
| [#61](https://github.com/djshellshoxxx/GhostPay/pull/61) | A6: combined backup checklist (seller keys + tag archive, full profile) | `6101683a99f755dd8255c2576f4f565e801e4561` | `claude/ar-a0-pr47-green` |
| [#62](https://github.com/djshellshoxxx/GhostPay/pull/62) | B1: chained lean-core browser journey and devnet backup/restore step | `31b6974481dd2a3865ba3c1e7a97cc670ce60236` | `claude/ar-a0-pr47-green` |
| [#63](https://github.com/djshellshoxxx/GhostPay/pull/63) | C7: iframe-mode embed e2e + SDK handshake fix | `f2c3555193c34a341824878c52c5f7cad7e12800` | `claude/ar-a0-pr47-green` |
| [#64](https://github.com/djshellshoxxx/GhostPay/pull/64) | B2': require invoice-bound seller receipts in the lean profile | `93f4467dd202ad905c55e8997e44e990824bb5ee` | `claude/ar-a0-pr47-green` |
| [#65](https://github.com/djshellshoxxx/GhostPay/pull/65) | A7: session, reviewed-tx and deadline guards on the policy-account send path | `b220f0b0764fe7d8af7fe1491c44032e0ce38255` | `claude/ar-a0-pr47-green` |
| [#66](https://github.com/djshellshoxxx/GhostPay/pull/66) | C4a: localize the Pay view through the i18n catalog | `cb259a476b07422fbbd1eb56fd80bdb2c0a49354` | `claude/ar-a0-pr47-green` |
| [#67](https://github.com/djshellshoxxx/GhostPay/pull/67) | C4b: localize the Scan view through the i18n catalog | `fc3b14c000e5a82b340aaf4f17425443890de54c` | `claude/ar-c4-i18n-pay` |
| [#68](https://github.com/djshellshoxxx/GhostPay/pull/68) | C4c + B4: localize Create invoice; seller gas-buffer policy control (full profile only) | `b358a0e371cf8512b75eacab64a598663b66390c` | `claude/ar-c4-i18n-scan` |
| [#69](https://github.com/djshellshoxxx/GhostPay/pull/69) | B3': specific Sweep messages for relayer permit refusals (spec 04 acceptance) | `19f435990429c322cf5e271b1c95b0d41efc54eb` | `claude/ar-c4-i18n-create-b4-buffer-ui` |
| [#70](https://github.com/djshellshoxxx/GhostPay/pull/70) | A5: announcer spam lanes/budget adversarial tests and four scan-cursor fixes (spec 05) | `a4f7a2c7d05d358cec09df0e613c3ef6e46aae90` | `claude/ar-a0-pr47-green` |
| [#71](https://github.com/djshellshoxxx/GhostPay/pull/71) | C1: ADR-0026 local reconciliation and receipt archive (docs) | `76d7394134d764ddf2728d6645dbfe3058a2bf05` | `claude/ar-a0-pr47-green` |
| [#72](https://github.com/djshellshoxxx/GhostPay/pull/72) | B5 (blocked): record unreachable Chainlink primary sources for testnet feeds (docs) | `76199cdac3ee336e2751995d511111467141d943` | `claude/ar-a0-pr47-green` |
| [#73](https://github.com/djshellshoxxx/GhostPay/pull/73) | C5: Chromium device-emulation Playwright projects (a11y + responsive) | `b73105e559ab2ea8ec4a7393a13a22f406532771` | `claude/ar-a0-pr47-green` |

In particular, policy-send guards, view localization, the full-profile buffer control and permit-refusal wording now have active owners. Treat suggestions touching those paths as coordination/review work until their current changes have been inspected. Do not infer a merge, completed CI or a shipping feature from this inventory.

After this refresh, the research successfully fetched the primary Chainlink data that PR #72 could not retrieve. [Report 10](10-chainlink-testnet-source-evidence.md) records the exact source bytes, hashes and official network binding; this supersedes the source-unavailable condition for this handoff, without changing that PR's code or qualifying a live feed. PR #73's projects are Chromium device emulation, so engine/hardware coverage recommendations in report 02 remain distinct.

## What already exists and must not be rebuilt

### Implementation reconciliation

| Earlier apparent gap | Current observed or published work | Correct next action |
|---|---|---|
| Invoice-bound seller receipts | PR #47 has binding/signing/export/import work; PR #64 adds lean-profile enforcement. | Review the combined behavior and exact candidate; do not invent a parallel receipt format. |
| Independent-profile recovery and composed core journey | PR #47 includes recovery coverage; PR #62 adds the chained browser journey and anvil backup/restore step. | Inspect what the existing tests actually prove and qualify the integration. |
| Public device pairing and registry QR | PR #60 contains a bounded public-config format, QR/file import/export and preview-only pairing. | Review authentication boundaries and remaining real-device evidence. |
| Combined backup panel | PR #61 implements a full-profile checklist, retaining lean exclusion. | Distinguish produced backup bytes from successful restore and safe external retention. |
| Portable hosting kit | PR #36 supplies the kit; PR #47 incorporates related integration/hardening. | Extend qualification against the final artifact, not a replacement hosting generator. |
| Iframe merchant embedding | PR #63 adds iframe tests and handshake changes. | Coordinate future merchant work with this owner; keep full/lean boundary. |
| Typecheck blocker in accessibility helper | PR #59 supplies the one-file correction. | Consume/review it in the integration; do not create a duplicate fix. |
| Private-scanning client interfaces | PR #47 uses stage-one fixed-window/indexer code; experimental PIR/light packages exist. | Research server, evidence and operational gaps instead of recreating interfaces. |

Sources: individual PR links above, the [PR #47 handoff directory](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0/docs/handoffs), and pinned code citations in each area report.

PR descriptions contain contributor-reported validation. This research did not independently rerun those application or browser results. In particular, PR #62 distinguishes its real product browser-keystore test from a Node/anvil helper that reimplements documented envelope parameters. Preserve that distinction during review.

## Relationship to the earlier four research PRs

| Existing report | What it already covers | What this research adds |
|---|---|---|
| [#54 acceptance tests](https://github.com/djshellshoxxx/GhostPay/blob/57b414bfbc1fa9de9ef68675b9181b4c148f18e4/docs/research/parallel-reviews/acceptance-tests-41750257638.md) | Interrupted/uncertain operations, reorg, replay, stale authority, recovery matrices against main. | Current frontier/child-PR reconciliation and primary-source tools/vectors for the remaining evidence. |
| [#55 security review](https://github.com/djshellshoxxx/GhostPay/blob/2d9c30e12c41cfb0212b0cfc366c83a1e5e45b21/docs/research/parallel-reviews/security-review-41750257638.md) | Source-based payment/relayer assurance questions and proposed acceptance work. | External protocol and implementation comparisons; no conversion of hypotheses into confirmed vulnerabilities. |
| [#56 documentation/UX](https://github.com/djshellshoxxx/GhostPay/blob/96fc22c42a704d1c590d56d624fff15a945c8231/docs/research/parallel-reviews/documentation-ux-41750257638.md) | Guide drift, observer-specific privacy language, uncertainty wording, accessibility/recovery worksheets. | Current browser/platform references, concrete reuse choices, and refreshed pairing/backup ownership. |
| [#57 release qualification](https://github.com/djshellshoxxx/GhostPay/blob/6bd5b15ce4b883b1070ccc1deef6086fd9df3aa4/docs/research/parallel-reviews/release-qualification-41750257638.md) | Reproducibility, manifests, provenance, browser matrix, signing and release gates. | Frontier checks, directly retrieved primary references, non-GitHub upstream code and an adoption plan. |

Those reports state that external retrieval or live GitHub verification failed in their execution environment. Their cited standards were not freshly retrieved there. This session successfully read the current repository and external sources; each new area note states its evidence limits. Keep the earlier reports as history instead of overwriting them.

## A concrete stale-status correction

On PR #47 `f8193502e602c99bb24ff956f142671750b744a0`, this session ran:

```text
node docs/tools/third-party-table.mjs --check
exit 0
THIRD_PARTY.md is up to date
```

The command still warns about direct dependencies without curated notes, including cryptography, chain, proof-system and QR components. Therefore:

- **Observed:** the generated table is current on this frontier.
- **Still useful work:** curate exact-file/package license and provenance notes before adopting or shipping new components.
- **Not established:** installed package authenticity, dependency security, lean-bundle reachability, release readiness or a successful runtime suite.

The earlier #57 result that the table was stale describes main `0014bc5`; it is not evidence of the same defect on PR #47.

## Research boundaries and publication

New notes contain original analysis, primary-source links, exact revisions where obtained, concrete GhostPay integration paths and future acceptance requirements. No upstream application code was copied; no dependency or production configuration was changed.

No live payment, contract deployment, release, signing-key action, paid-agent dispatch, automation change or message to an external collaborator was performed. The deliverable is repository documentation for Claude's next source-verified implementation pass.

## Before Claude acts

1. Refresh main, PR #47 and child PRs; mark merged/closed/rebased work explicitly.
2. Read the area note and the existing owner task, then claim one disjoint implementation slice.
3. Verify the exact upstream tag/commit, per-file license and transitive dependency artifacts before adoption. A root license badge is insufficient for mixed-license repositories.
4. Preserve the existing protocols and supported-build boundary unless a separately reviewed design decision changes them.
5. Report source inspection, new execution, previous contributor results and unrun acceptance gates separately.
