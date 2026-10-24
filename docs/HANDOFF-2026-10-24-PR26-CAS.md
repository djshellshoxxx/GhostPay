# Replacement-agent handoff: PR26 safety fixes, 2026-10-24

Coordinator-owned status. This experimental software artwork remains incomplete; tests are bounded engineering evidence, not an independent audit or production acceptance.

## Exact source/provenance

Current code commit `2751517663e208d3d894af4c40b602432a22df6c`, tree `b20c8ecff795efd4f67dc5695113144c26334f67`, based on verified PR26 `claude/cool-albattani-xopr89` at `06f1426dd29b9b154d9f725d48918dcf049876bf`. Local branch `integration/ghostpay-pr26-fixes-2026-10-24`, checkout `/workspace/GhostPay-pr26-fixes`; intended remote work checkpoint `work/ghostpay-pr26-qa-2026-10-24`. Following docs-only commit records this handoff; read `git rev-parse HEAD` and remote ref for its exact SHA.

Main was rechecked at `dbee6786c5adf97e014318f55da4dfdbc1565cfc`. PR26 includes preserved source `bd320d530c725c0edc820b496ea298d741c7ba9e` and all 18 older source branches. Do not remerge those or gh-pages. PR26 merge-ref `fda41dcb842b803904adf838f1039f01fb38910d` had identical tree `75638eaca10b3ef2848fc4395ff9e25c5755da5b`. Original `/workspace/GhostPay` at bd320d5 remains preserved. No unavailable old b9ac/6b698 history was recovered or credited.

## Completed fixes with reproduced triggers

- Persistent IDB profile+records revision and exact encrypted-snapshot CAS in one native transaction. Previously five native two-tab scenarios allowed stale replace/save/rotate commits, including after another-tab wipe/rotation or a local lock. All TagVault writers now bind their snapshot/lifetime. Wipe retains a revision tombstone; in-place DB v2 upgrade preserves old ciphertext and prevents old v1 writers reopening. Legacy payloads are authenticated before re-encryption; IDs/timestamps retained. Bounded100000 records, limit+1 reads and pre-commit result-count checks reject overflow.
- Combined archive restore previously committed tags then returned a generic failure on history errors; cancellation/session switch could continue later history stores, and preview/discard/error paths retained vaults. New code reports each store as committed/not-started/unknown, checks authority before each next store, locks opened history vaults, invalidates stale preview/mode/input/session, refuses missing archived chains before tags, and discloses history omissions. Separate databases still commit separately; there is no cross-DB transaction, cancellation rollback or automatic retry. Imported observations remain historical evidence, not fresh payment proof.
- Solana scanner now wipes an untransferred yielded tweak when balance RPC fails or the progress callback throws; outer failure still wipes accumulated results. Both failures reproduced before the fix. Additional Solana/TRON tests cover malformed/RPC/network/reorg/cancellation/fee/precision/error fallback/duplicate cases.
- Pages workflow is manual-dispatch only; source integration cannot auto-deploy. Existing main-only deployment guards stay. No hosting/security settings, release, deployment, live wallet request, chain transaction or real money were used.
- README truthfully labels software artwork while retaining functional/security/development statements. Static Vite/browser app, local client-held keys/IndexedDB remain unchanged. External blockchain RPC/indexers and optional user-selected relay services are dependencies, not a mandatory custom app backend or an infrastructure-free claim.

## Fresh verification and failure evidence

Native Chromium154 two-tab tests:11/11; Playwright app tests20/20; committed-secret scan and60 action pins passed. Focused archive/tag tests48/48; UI archive40/40 including14 new cancellation/partial-import cases; final two chain hardening files54/54 plus key-wipe cases passed. See evidence JSON for completed logs and SHA-256s.

The prior fixed full run passed950 tests/1 existing BTC skip, but branch coverage84.97% was below85%; statements90.25/functions91.41/lines94.25 met90% gates. Five further meaningful chain branch tests were added, and full coverage rerun is currently pending. That new run already reproduced the150-case archive fuzz timeout at unchanged120s under concurrent build/browser work. The exact06f baseline also reproduced this local timeout; GitHub's earlier reported873/1skip with89.88/84.43 coverage is separate reported evidence, not this checkout's result. Preserve every failure; do not raise deadlines, shrink150 mutations, lower KDF profiles, skip failures or reduce90/85/90/90 coverage gates. Inspect `/workspace/ghostpay-pr26-fixes-coverage-gate.log`; do not assume its eventual exit status. Latest all-workspace type/lint/build results are pending at checkpoint creation. Required exact-head CI and substantive review must pass before merge.

Test reliability correction: the archive UI error test now awaits its real call-through preview/KDF promise before checking the alert. No crypto mocking, KDF weakening or timeout change. Narrow40-test coverage command intentionally fails whole-app coverage percentages; it is not a full coverage pass. Full command/result distinctions stay explicit.

## Standards review

Persistent CAS and stale-generation defenses have local native-browser evidence, not just mocked storage. Thresholds are unchanged. Cross-chain UI duplication is an observed maintainability concern, not a reason for speculative abstraction. TRON Nile/Shasta identity checking still lacks positive genesis pinning; do not claim testnetidentity acceptance from rejecting mainnet alone. Code/test source and local log hashes are in `evidence/pr26-cas-2026-10-24.json`.

## Spec review and outstanding acceptance

Spec08 export is buffered and does not require fresh user re-authentication in the UI. Key rotation uses one bounded atomic profile+records rewrite rather than the specified resumable rotation journal; document/reconcile that contract and native crash behavior instead of calling it done. There is bidirectional independent `node:crypto` scrypt/AES interoperability in tagArchive.test.ts; the deterministic `test-vectors/tags.json` catalogue is still absent. Archive export defaults toN2^17; bounded14..18 imports and the public test option are accepted, so do not claim all files use17. Combined multi-chain archive is explicitly partial across stores. No device/deployed-host/native-speaker/independent audit/release acceptance is implied.

## Next reproducible steps

1. Finish and record running exact-source checks. Preserve this source/handoff to its own work branch and verify remote SHA; do not overwrite live Claude branches. Open a new integration PR containing PR26 plus fixes, require exact-head tests/review. Any failed gate means work-branch preservation only.
2. If fuzz timeout recurs, diagnose measured CPU/KDF behavior with the same150 inputs/deadline, preserve original failures and rerun exact-source checks in an uncontended supported environment. Do not hide a failure behind a narrow green run. Latest broad check uses explicit `--maxWorkers=1`; environment VITEST_MAX_WORKERS was not read by configuration.
3. Fix actual gas-buffer v2/permit preflight/fallback gaps (spec13/04), then private-scan/spam wiring, scheme2/7702 recovery UI, BTC header/SPV hardening, reconciliation/archive, merchant embedding, pins/QR/localization/accessibility according to canonical work plan. Read source first; no blanket claims modules are absent.
4. Preserve client-side architecture, chain/session/payment authority, keys, unknown wallet outcomes, reorg tombstones and user consent. Unsupported proofs remain unverified. No production scans/funds/deployment.
5. Independent audit task has not run: Library download failed. Parent coordinates pinned authorized GitHub source intake; do not relabel internal review or local tests an independent audit.

## Coordination/publication safety

Three Ghost workers owned tags/storage/native tests; archive UI/spec review; Solana/TRON hardening tests/standards review. Root owned scanner runtime fix/sharedCI/docs/Git/full QA. All code froze before broad tests. Current workers do read-only next-tranche intake/final review; P2P has separate source ownership/checkouts.

User later authorized regular secret-checked source pushes and appropriate tested source merges for both repos. A P2P PR4 merge was nevertheless denied by automatic approval review citing the earlier restriction; explicit reconfirmation is pending, so no alternative merge route or retry without new relevant evidence. Treat each denied operation explicitly. No force push, destructive reset, credentials/security-setting changes, releases or deployment. Small restart-ready repository handoffs must accompany every milestone; the hourly timer is only a recovery check, not permission to idle.
