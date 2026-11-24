# GhostPay R46 — source-proven donor disposition and uncapped investigation

Checked UTC: 2026-11-22T19:12:02.509Z. Main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Published as an additive checkpoint on existing draft PR #471. No protected-main merge or production-code change.

## Four finalized historical donors (NOT four main merges)

1. `fix/ghostpay-embed-popup-legacy-test-20261120-r1` at `0750012546aeb4336b4340fe16751f8d83804acd`: its child PR #351 is **merged only into parent PR #337**, which is still open. The child and the parent head `08d2111a5fd3b71a148fc8648481200e680faf53` have identical complete root Git tree `9ce013174e2417756abd8cc95407010414a66814`; compare child..parent is 1 commit ahead, 0 tree-file changes. The code fixing false "Popup blocked" warnings for `noopener` is not on protected main. Parent #337 owns eventual qualification.
2. `fix/ghostpay-policy-pendingedit-lint-20261121-r1` at `23f55bfea1068a5791b8e8e29409e4a13d0b28a3`: its child PR #359 is **merged only into parent PR #345**, which remains open. Parent head `ccc8c3521511e2a2b9b66ef11f12723d87ce5f44` has identical complete Git tree `9ff7701b0a8992bf9d266b8dee6b2792aa0c2047`; 1 descendant commit, 0 source-file changes. The guarded review-revision logic remains unmerged to main. Respect #345 ownership.
3. `evidence/ghostpay-vault-rekey-qualification-20261120` at `b9911c7228e95a3f8a6666d10aae50bcda08bd7d`: exact production `packages/ux-vault/src/vault.ts` blob `402da7d6761b0c19eedcb8c0f6af2996f9411f5e` and `vault.rekey-lock.test.ts` blob `f9959f245313d06b368854203ac61e8e66b1a585` equal existing, still-open PR #328 head `81598d93dd82cc440526c866d42b55be0657895b`. Parent-to-evidence compare is 1 commit ahead and has exactly three differences: `docs/ai/ACTIVE_WORK.md` and two `docs/consolidation/continuation-r2-20261120/VAULT_REKEY_QUALIFICATION.*` documents. Audit evidence is preserved; this donor does not carry additional application code. PR #328 is **not** in main.
4. `fix/ghostpay-cloud-api-secret-aliases-20261103` at `cdbb7ec775a37f985f6c66afddbcbba6e043f467`: its one changed path `.github/workflows/ghostpay-codex-cloud.yml` has old blob `be5e694fbd0c48960a2643c1df5d5e6e7c7bb629`; main has hardened blob `e3bd3923920f4ab13280c0cf6565ed863d8e4276`. Old code uses `gh pr list --limit 100`, assumes older `e2e` check names and trusts assumed branch protection for approvals. Main uses paginated PR lists, exact-head GitHub Actions checks (full and lean), safe-path restrictions and independent qualified human review before allowed merge. The old merge routine is less safe and has no worthy unique import. Mark superseded, not included-by-commit.

## Uncapped, but semantically unresolved, historical donors

Complete recursive Git trees (both `truncated:false`) were reviewed for:
- `repair/ghostpay-qr-surrogates-20261119` `ac7b7a11f00896d105fa7a06e44e218046bdc56c`, root tree `b4fd64db80b36549e3db81a89ca79e42f7e20a26`, 4,675 blobs.
- `codex/ghostpay-private-scan-lint-20261119` `1b010ec910d04df105fd662cc360629cb0a2f5dd`, root tree `51e666f0d111c35dec061218ff7ace0038d3a61d`, 4,535 blobs.

Reference `main` tree `d8aa628cbc531c6969bdf0af621795ceacfc00c3`, 3,981 blobs. Reference recovery PR #372 at `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` root tree `65e5cc6fdb7ab3337951ba0b0b58e87b71df095b`, 5,762 blobs.

Against #372 the QR donor has 228 differing paths and 14 donor-only paths; the private-scan donor has 228 differing paths and 11 donor-only. The latter is a proven **126-commit ancestor** of QR, while both are ancestors of an historical remediation branch. That proves commit ancestry, **not feature equivalence**, and neither is part of main. Donor-only paths cover old CLI/relayer regression fixtures, contract-analysis tools and test suites; some are outside browser-only scope. Preserve them for remaining targeted semantic and owner review. Do not wholesale merge.

## Coordination and restrictions

- Main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; generation-11 integration lock remains `held` by `994a0d214fb9-root-r3`. An expired timestamp is not authorization to take over.
- Full census: **546** refs and branches, zero SHA mismatches; **238** open PRs including **93** stacked. **296 finalized / 250 unresolved** after four source-proven dispositions. R45 finalized 292; two new BUG-only PR-owned branches #478/#479 are *unresolved* and not overwritten.
- R46 ledger is frozen **before its own new checkpoint commit**, so self-advancing audit-branch SHA needs refresh.
- Recovery #372 still requires Tor/Mythril and browser qualification; F10 #456 has build/test failures; scanner #466 has immutable-SHA and alias bugs. No approval, merged main, CI acceptance or deployment is claimed by this documentation-only cycle.
