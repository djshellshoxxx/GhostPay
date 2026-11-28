# Retirement log (2026-11-18)

Executed with the owner's explicit authorization after PR #203 merged into `main` as
`5467c158069c5bab264b6a653ac56e89e13f3e13`. Each PR below received a closing comment naming the merge and this
repository's disposition ledger, and was closed (not merged). A final read-back confirmed every closure. **No branch
was deleted**, so every head below remains available; any PR can be reopened.

## Closed as merged: head fully contained in `main` (90 PRs)

Containment was rechecked immediately before each closure with `git merge-base --is-ancestor <head> origin/main`.

| PR | Head | Head ref |
|---:|---|---|
| #41 | `70d8bf6ec37a` | `codex/ghostpay-consolidation-20261030` |
| #59 | `4a38efdfa999` | `claude/ar-a0-pr47-green` |
| #60 | `78be1730ad2a` | `claude/ar-c2-qr-pairing` |
| #61 | `f5d219851a47` | `claude/ar-a6-combined-backup` |
| #62 | `e0a499bdd95d` | `claude/ar-b1-core-journey` |
| #63 | `2b9db8ab1998` | `claude/ar-c7-embed-iframe-e2e` |
| #64 | `2bcfd11f9dc5` | `claude/ar-b2-lean-bound-receipts` |
| #65 | `f7b8ee9db981` | `claude/ar-a7-policy-send-guard` |
| #66 | `e02d04c75406` | `claude/ar-c4-i18n-pay` |
| #67 | `7f4702fdd366` | `claude/ar-c4-i18n-scan` |
| #68 | `4fe95fc0f6f5` | `claude/ar-c4-i18n-create-b4-buffer-ui` |
| #69 | `9d100956f08d` | `claude/ar-b3-sweep-permit-states` |
| #70 | `d9fe8b4e9c02` | `claude/ar-a5-announcer-budget` |
| #71 | `1e87109119c1` | `claude/ar-c1-reconciliation-adr` |
| #72 | `76199cdac3ee` | `claude/ar-b5-testnet-feeds` |
| #73 | `92af349a2e87` | `claude/ar-c5-device-matrix` |
| #74 | `27d1580c5c53` | `claude/ar-a4-btc-headersync` |
| #89 | `cfc7b0f3325a` | `codex/ghostpay-product-20261109` |
| #90 | `5628bc00b05a` | `codex/ghostpay-policy-localization-20261109` |
| #91 | `b748ecdce06d` | `codex/ghostpay-companion-merchant-20261109` |
| #92 | `3a9ce554ff6a` | `gpt/ghostpay-cli-completion-20261109` |
| #93 | `3cd1e5544391` | `gpt/ghostpay-product-completion-20261109` |
| #94 | `a864949d9ee4` | `fix/ghostpay-reconciliation-saturated-state-20261109` |
| #95 | `3ec039c554f7` | `codex/ghostpay-integrate-product-cli-20261109` |
| #96 | `6697390ff482` | `gpt/ghostpay-beta-spec-20261109` |
| #100 | `e36786bce4e7` | `codex/ghostpay-approval-gated-auto-integration-20261109` |
| #102 | `a2f4205f900d` | `chatgpt/zero-codex/qualify-98-20261110` |
| #103 | `621ee0af3f47` | `chatgpt/zero-codex/audit-secret-box-20261110` |
| #104 | `fa375dbc1f24` | `chatgpt/zero-codex/docs-wiki-20261110` |
| #105 | `83d17adb4a07` | `chatgpt/zero-codex/receipt-boundary-regressions-20261110` |
| #106 | `5280569b7eaa` | `chatgpt/zero-codex/ops-monitor-bounded-fetch-20261110` |
| #107 | `0ab175e55248` | `chatgpt/zero-codex/signed-receipt-no-rpc-proof-20261110` |
| #108 | `0a61e2c7fc54` | `chatgpt/zero-codex/b0-receipt-recovery-20261110` |
| #109 | `969d1b270b24` | `chatgpt/zero-codex/recovery-auth-negative-20261110` |
| #110 | `bbe300b7fb21` | `chatgpt/zero-codex/rpc-response-correlation-20261110` |
| #111 | `b12a20e1d6e2` | `chatgpt/zero-codex/rpc-concurrent-byte-budget-20261110` |
| #113 | `0641d41a4e86` | `claude/vibrant-cori-scu18b` |
| #114 | `1bf25be7c540` | `claude/nice-ritchie-8vivls` |
| #117 | `1e4d19f1a533` | `claude/kind-faraday-8qzf6e` |
| #118 | `97b919c9c19d` | `claude/wonderful-thompson-ir89i9` |
| #119 | `07968599cd37` | `claude/exciting-brown-7v69cr` |
| #121 | `ca358acfa8f4` | `claude/gallant-hamilton-4wzkyn` |
| #124 | `afaf7ce62d2b` | `chatgpt/zero-codex/merchant-csv-safety-20261111` |
| #128 | `1a5e815d8446` | `chatgpt/ghostpay-integration-matrix-20261112` |
| #129 | `3fd18ef4011b` | `chatgpt/ghostpay-cli-sentinel-port-20261112` |
| #130 | `eb21d57c8ad1` | `chatgpt/ghostpay-billing-horizon-port-20261112` |
| #131 | `bbc7dda4ce27` | `chatgpt/ghostpay-merchant-csv-port-20261112` |
| #132 | `c3173f849ad6` | `chatgpt/ghostpay-ux-clock-port-20261112` |
| #133 | `f3a9b2389f8b` | `chatgpt/ghostpay-ux-guide-port-20261112` |
| #134 | `8277879eeaa0` | `chatgpt/ghostpay-onion-canonical-port-20261112` |
| #135 | `f88aaf2fe27a` | `nodata/jolly-rubin-u4zd45` |
| #137 | `ac08062ec540` | `claude/ghostpay-github-pages-up6cj6` |
| #138 | `6f59cc2cb7ad` | `chatgpt/zero-codex/pages-verifier-comment-attrs-20261112` |
| #141 | `68aca93bc19e` | `chatgpt/zero-codex/pages-rpc-http-status-20261113` |
| #142 | `eece5aff5542` | `chatgpt/zero-codex/pages-smoke-project-boundary-20261113` |
| #156 | `81fd4c032e29` | `chatgpt/zero-codex/pages-bearer-qr-warning-20261114` |
| #158 | `9a84764e7060` | `chatgpt/zero-codex/pages-relayer-stream-limit-20261114` |
| #164 | `0d2ea8b40d6e` | `claude/lucid-meitner-apalzc` |
| #165 | `9b3a3070499a` | `chatgpt/ghostpay-pages-gp02-gp04-review-20261115` |
| #166 | `f3872e90eb25` | `chatgpt/ghostpay-pages-client-hardening-20261115` |
| #167 | `cf6a8d69620a` | `chatgpt/ghostpay-pages-second-pass-notes-20261115` |
| #168 | `90a145740a16` | `chatgpt/ghostpay-sensitive-surface-audit-20261115` |
| #169 | `97a617b5b95f` | `chatgpt/ghostpay-sensitive-surface-fourth-pass-20261115` |
| #170 | `775756931be4` | `chatgpt/ghostpay-top-down-audit-20261115` |
| #171 | `433307b869ac` | `chatgpt/zero-codex/pages-backup-gate-verified-only-20261115` |
| #172 | `dffe072511c3` | `chatgpt/zero-codex/pages-invoice-stale-submit-20261115` |
| #173 | `97cf5a0cda25` | `chatgpt/zero-codex/pages-reconciliation-imported-link-20261115` |
| #174 | `dffe072511c3` | `chatgpt/zero-codex/pages-invoice-stale-submit-20261115` |
| #175 | `57acf1b06b3b` | `chatgpt/zero-codex/pages-reconciliation-e2e-proof-20261116` |
| #177 | `17f681915f25` | `chatgpt/zero-codex/pages-tag-store-closed-connection-20261116` |
| #178 | `cf5ad81cab48` | `chatgpt/zero-codex/pages-download-cleanup-20261116` |
| #179 | `b4be8866f6ff` | `codex/ghostpay-completion-20261116` |
| #180 | `ffd957e28f98` | `codex/ghostpay-mythril-recovery-20261116` |
| #181 | `98f779538bb7` | `codex/ghostpay-registry-recovery-20261116` |
| #182 | `0c4c3c8d951a` | `codex/ghostpay-caveman-completion-20261116` |
| #184 | `73371b57040c` | `codex/ghostpay-ops-response-cap-20261116` |
| #185 | `c738f96e2f1a` | `codex/ghostpay-observability-20261116` |
| #186 | `27852ba89896` | `codex/ghostpay-canonical-time-20261116` |
| #190 | `16bc61fa1c19` | `docs/ghostpay-3q-stealth-keypair-export-20261116` |
| #191 | `e05044d4209d` | `docs/ghostpay-privacy-architecture-5a-5l-20261116` |
| #192 | `dd4a7eb4dd71` | `chatgpt/zero-codex/pages-renderer-own-property-20261116` |
| #194 | `c15833bc2aa6` | `chatgpt/zero-codex/pages-pay-rich-tags-20261117` |
| #195 | `12e18931ae99` | `chatgpt/zero-codex/pages-manifest-gates-20261117` |
| #196 | `120dcd7fc15b` | `chatgpt/zero-codex/pages-fragment-shell-gates-20261117` |
| #197 | `68993c668aa7` | `chatgpt/zero-codex/pages-fragment-history-state-20261117` |
| #198 | `9732adb949cc` | `chatgpt/zero-codex/pages-autoclear-enable-retained-hash-20261117` |
| #199 | `b570d4bb748d` | `chatgpt/zero-codex/pages-hash-navigation-exceptions-20261117` |
| #200 | `23cc6db4b924` | `chatgpt/zero-codex/pages-late-invoice-focus-20261117` |
| #201 | `2fb89ff5f2dc` | `chatgpt/zero-codex/pages-same-view-invoice-focus-20261117` |
| #202 | `30cc4560c6a7` | `chatgpt/zero-codex/pages-keystore-reimport-control-20261118` |

## Closed as superseded: change already present in `main` (15 PRs)

Not ancestors of `main`; their content was verified as present (patch-equivalent by `git patch-id`, or the same or
stronger behaviour and tests found in current source by the 2026-11-18 supersession check).

| PR | Head | Evidence posted on the PR |
|---:|---|---|
| #39 | `1d28f24d86f4` | Retained in main with broader current defenses: D3 relayer deadline rechecks (apps/relayer/src/service.ts) and B2R positively identified plain-revert handling (packages/chain-adapters/src/errors.ts, rpc.ts), including this PR's test rows (rpc.test.ts, sweep.test.ts); verified 2026-11-18 (supersession check). |
| #40 | `63994db6cff8` | Retained in main with broader current defenses: D3 relayer deadline rechecks and B2R plain-revert handling (same commits as #39), with ported test rows; verified 2026-11-18 (supersession check). |
| #43 | `8d1bde36bb7d` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #44 | `fd710eb367ef` | Retained in main: the generator keeps report modes (scripts/audit/gen-audit24-report.py) and the test now expects the stricter 0o644 & ~umask; verified 2026-11-18. |
| #81 | `f34a80f710d1` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #122 | `72dde82d9d89` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #123 | `7cdc6b32ecaf` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #125 | `a6e74591e134` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #126 | `d77956901d95` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #151 | `2527d6b93678` | Retained in main with stronger behaviour: payment deadline capped at the last payable second and rechecked at signature and send (apps/web/src/lib/pay.ts, payExec.ts) and stronger automation gates; the invalid legacy workflow is removed; verified 2026-11-18 (supersession check). |
| #154 | `9bdc9cbade90` | Retained in main: formatFiat renders negative minor units with one leading sign (apps/web/src/lib/format.ts) with its regression test (format.test.ts); verified 2026-11-18. |
| #159 | `7b6c4983e5c0` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #161 | `73923350fcda` | Patch-equivalent: every unique patch of this head has an identical patch (by git patch-id) already in main. |
| #162 | `26f83ccdda98` | Retained in main: both bearer-QR assertions this PR adds are present (apps/web/src/lib/qrKinds.test.ts); only a comment differs; verified 2026-11-18. |
| #163 | `cf5e876ce164` | Superseded: its only commit not already in main is ownership documentation; the transfer-filter guard it requalified is in main (merged Pages lineage), and current status lives in the consolidation ledgers. |

## Deliberately left open

- Active work by other sessions (verified 07:40–07:55Z): #204, #205, #206, #208, #209, #211, #212, #213, #214, #215,
  #216, #217.
- Active ChatGPT zero-codex documentation ledgers still receiving rotations: #139, #140, #153.
- Dependency maintenance (separate lane): #49, #87, #207, #210.
- Paid or autonomous automation awaiting an owner decision on activation: #51, #52, #82.
- Needing a semantic decision first: #42 (historical agent prompts), #127 (two unique `ux-guide` patches), #160
  (Pages release-gate inventory documentation).

## Branch deletion: deferred

Branch refs were not deleted. Other active coordinators (PR #205 branch-recovery matrix, PR #209 consolidation
ports) are reading historical refs right now, and deleting refs gains little once their PRs are closed. When those
lanes finish, branches whose heads are ancestors of `main` can be deleted safely (their commits stay reachable from
`main`; record each name and SHA first). Non-ancestor heads must first be preserved (for example an annotated
`archive/<branch>` tag or a checksummed bundle), and `gh-pages` stays outside source merges.
