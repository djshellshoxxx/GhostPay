# Worker D: build/release pipeline review (2026-11-16)

Branch work/d-release (base origin/claude/lucid-meitner-apalzc). Experimental, unaudited. Nothing pushed, published or deployed.

## Ran (all local, this checkout)
- node --test scripts/tests/*.test.mjs: 112 tests, 111 pass, 0 fail, 1 skipped (not investigated).
- check-actions-pinned.sh: 109 uses: refs, all full-SHA pinned. scan-secrets.sh: OK. check-tx-origin.sh: OK.
- Lean web build (GHOSTPAY_LOCAL_BUILD_PROFILE=lean) + postbuild scan-bundle: passed (17 files).
- Not run: repro-check.sh / qualify-lean.sh (need two clean npm ci clones, network; hosted CI only), forge/anvil/slither/gitleaks (unavailable), signed release/attestation (never run locally).

## Findings
1. DEFECT FIXED (be7e9671): scripts/check-tx-origin.sh missed `tx` and `.origin` split across lines (gate bypass). RED test added (original script fails it), fix, GREEN 8/8. Known remaining gap: an inline block comment between (`tx /* c */` newline `.origin`) is not joined; line and blank comments between are handled.
2. CodeQL on PR #157 head a89a2e94: NOT a config conflict. No codeql workflow in repo; default setup is "configured" (weekly, js/ts/py/actions). Check run 132708826224 = failure from 2 NEW HIGH alerts: js/polynomial-redos at packages/i18n/src/ux/readability.ts:25 and packages/ops-monitor/src/fetcher.ts:56. Source packages, outside my ownership; needs regex fix by owners (or dismissal with reason).
3. Lean reachability, source graph: apps/web workspace closure still includes btc-silent-payments, solana-stealth, tron-adapter and PENDING_OWNER_REVIEW (net-transport, payment-uri, pir-two-server, policy-scheme, scan-source, ux-vault); gate test passes only because the list is pinned.
4. Lean reachability, final bundle (ghostpay-lean-build.json module report): btc-silent-payments, solana-stealth, tron-adapter, features/btc|solana|tron, pir-two-server, policy-scheme are ABSENT (good). PRESENT: scan-source, ux-vault, payment-uri, net-transport (pending-review deps ship), and features/registry/RegistryView.tsx + lib/registry.ts. RegistryView is deferred-by-name (the gate regex treats features/registry as deferred) yet ships in lean: AppShell statically imports it and CORE_ORDER lists 'registry'. The AppLean.tsx comment "optional views not imported" is inaccurate. Fix is in apps/web/src (not mine): profile-gate the registry route, or owner-accept it in the scope doc.
5. Pending dependencies status: 4 of 6 pending entries are in the lean bundle; 2 (policy-scheme, pir-two-server) are source-closure only. Owner acceptance still outstanding.
6. Docs: LEAN_RELEASE_SCOPE.md lives at docs/handoffs/, not handoffs/. Gate-port doc says bundle not proven; this review supplies evidence for this commit only.

## Pipeline review (no defects found)
Workflows default to contents:read (agent workflows `{}`); id-token/attestations write only in the release build job behind environment: release; tag signature verified against a trust root taken from the default branch; SHA256SUMS + manifest + SBOM checked by verify-release.sh; attest-build-provenance SHA-pinned; nightly runs repro-check --head; dependabot covers actions and npm; ci.yml runs secret scan, pin check, tx-origin check. Reproducibility is claimed only via hosted two-build comparison; not independently verified here.
