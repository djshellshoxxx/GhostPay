# Required branch consolidation

Status: **COMPLETE — migration and main promotion (2026-10-22)**.

`main` is the canonical branch for all continuing development. PR #20 promoted the verified implementation in merge `5795857d9e366cc9a4304c6afa9b03365e7c1844`, based on candidate `c206655ebfa747b3dd56b1dc9f4e7f16e641a833`. Do not resume parallel implementation on the superseded source branches.

Relevant authored work from Fermat `c1c4ac9b648174db33c87b59bc9c09267eca731c`, Bardeen `e96cee1a4e12773a6f66781c5a6797cbf9ff4ec5`, extensions 1–10, site source, documentation snapshots and wiki source has been reconciled. All authored source tips are ancestors of main. Source refs remain provenance; generated gh-pages output is kept separate. The per-path inventory, owner reviews and independent checks are in audits 06, 07, 13, 16 and 19.

Three semantic migration reviews were followed by exact-tree and ancestry checks. The 2,923-file candidate exactly matched the worktree; the promoted main runtime tree exactly matched that validated candidate. Hosted [CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/39768643775) and [EVM/Bitcoin/Solana Integration](https://github.com/djshellshoxxx/GhostPay/actions/runs/39768643774) completed successfully before merge. All 17 outstanding consolidation/source PRs are resolved: six merged, eleven stacked PRs closed as superseded after their source histories were incorporated.

[Consolidation verification](audits/22-consolidation-completion.md) and [post-consolidation validation](audits/23-post-consolidation-validation.md) record the completed checks, security fixes and limits. PR #24 added the local seller ledger, signed receipt QR exchange and scan scope protections after all 20 candidate CI jobs passed (651 web tests, 17 browser tests, unchanged coverage gates). Its promotion merge is `ca30bf821f412f0af50b2725722b0e968e6fed12`.

[Audit 24](audits/24-ai-assisted-security-audit-2026-10-28.md) is an AI-assisted security audit of the completed modules, dated 2026-10-28 and on draft PR #37. It is not a professional audit. It records 83 verified findings, 2 of them High and 12 Medium, with the fix status of each. As of 2026-10-29, 63 of them are fixed on PR #37, including every High and Medium. Where the work stands and what is next is in the [next-agent handoff](handoffs/HANDOFF_FOR_NEXT_AGENT_2026-10-29.md).

Migration and this automated build/audit pass are complete. Feature and production readiness remain incomplete: automatic seller reconciliation/receipt archival, broader localization/device workflows, experimental scheme-2/chain activation and external deployment, custody, trusted setup, professional audit and real-device gates remain in [audit 08](audits/08-completion-gates.md). Continue that work on main. Incompatible major dependency proposals #23 and #25 were deferred with reproduced failures; no authored GhostPay implementation was omitted.
