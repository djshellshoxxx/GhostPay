# GhostPay feature acceptance criteria (post-consolidation, 2026-11-18)

Team G-A. Audited source: product source `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (PR #203 candidate). Same IDs as [`completion_strategy.json`](completion_strategy.json) and [`FEATURE_DEPENDENCY_GRAPH.md`](FEATURE_DEPENDENCY_GRAPH.md); WS/CP IDs from G-B [`ws_registry.json`](ws_registry.json); owner/external IDs canonical (BLOCKERS_AND_DECISIONS: OD-01..22, OA-01..07, EX-01..07, TB-01..10); SEC IDs from `security_findings.json`.

Covers all 151 unfinished distinct features: 64 beta-core/beta-supporting/full-profile rows individually (§4), 44 experimental + 43 future rows by theme with every ID listed (§5). Every command below is meant for an implementer's OWN worktree (builds rewrite `apps/web/dist`). ESTIMATE figures are engineer-days.

## 1. Global Definition of Done: two distinct states

A row is first **implementation-complete (IC)** on its WS branch, then **release-qualified (RQ)** on one exact integrated SHA. IC never implies RQ. Neither implies "released", "deployed" or "beta-ready": those are owner actions (OA-02/OA-04/OA-06) recorded separately.

### 1.1 Implementation-complete (IC), per row, on the WS head

| Gate | Criterion |
|---|---|
| IC-1 Functional | every FUNC/CRYPTO line of the row is implemented and reachable from the intended surface (lean, full, CLI, library as stated). Code unreachable from that surface does not count. |
| IC-2 Tests first | each new/changed behaviour has an automated test that failed before the change and passes after; every command listed for the row exits 0 on the WS head (paste command + exit code + pass/fail counts). |
| IC-3 No regression | `npm run typecheck` and `npm run lint` exit 0; `npm test -w <workspace>` exits 0 for every touched workspace; baselines not reduced: web 2,749 passed / 1 skipped, Playwright lean 66 passed / 3 skipped, full 78 / 1, `forge test` 490 (packages/contracts) @7a620ff1 (CI 44242366118). |
| IC-4 Constraints | NEXT_PHASE_QUEUE constraint row holds: static client-only, noncustodial, no telemetry, no silent or fallback requests, no automatic clipboard, no secret-bearing logs, explicit user-selected providers, fail-closed private-required mode. |
| IC-5 Lean boundary | `node --test apps/web/scripts/localBuildProfile.test.mjs` 33/33 and the bundle scan (run by `npm run build -w @ghostpay/web`) pass for lean and full; frozen paths untouched: `git diff --exit-code <base> -- packages/contracts/src packages/core-crypto/src test-vectors/scheme1.json` (G-B frozen_paths). |
| IC-6 Docs | user/developer/operator docs match behaviour, or the PR states "no doc change"; copy passes `node --test scripts/tests/privacy-claims.test.mjs` once F-WEB-23 lands. |
| IC-7 Security delta | each SEC id listed for the row is fixed with a test, or stays open with its OD/TB id; no new open Medium+ finding. |
| IC-8 Decisions | owner-gated parts ship the fail-closed default from BLOCKERS; nothing assumes a decision that is not recorded. |

### 1.2 Release-qualified (RQ), on one exact integrated SHA

| Gate | Criterion |
|---|---|
| RQ-1 Exact-SHA CI | B-RQ-1 (§2.1) green on the integrated SHA, not on the WS branch. |
| RQ-2 Re-verified | every IC line of the row re-run on that SHA; evidence = `path:line @ <sha>`, command, exit code, counts, CI run id. |
| RQ-3 Browsers | rows with a browser surface: Chromium desktop + the 3 Chromium device-emulation projects; Firefox + WebKit through C-06 "where supported" (gaps listed, never silently waived). Tor Browser and real devices are EX-02. |
| RQ-4 Independent review | reviewer of the named role (§2.3), author != reviewer; secret-flow rows (spec 18) need two independent Tier S reviewers at KC with a threat-model delta. |
| RQ-5 Security analysis | SEC delta recorded against `security_findings.json`; contracts: analyzer runs per F-CTR-07; secret flows: privacy checks P-EGRESS/P-STORE/P-CLIP/P-URL/P-LOG (§2.4) on the integrated build. |
| RQ-6 Owner records | decisions the row names in its RQ are RECORDED (default no longer used), with the decision text linked. |
| RQ-7 External | EX rows are recorded separately and block ONLY that row's external-verification gate; while one is pending the row is reported "RQ, external pending", never "release-complete" (spec 18 DoD). |

## 2. Shared gates, roles, methods

### 2.1 CI gate IDs (inherited from the lost-team registry; coordinator-run via G-B WS-20)

| ID | Meaning | Where |
|---|---|---|
| B-RQ-1 | exact-SHA bundle: `ci.yml` 24/24 jobs (aggregators `typescript`, `contracts`), `pages.yml` PR validation (site + anvil acceptance), `beta-acceptance.yml`, `integration.yml`, `hosting-kit.yml` + `cli-operator.yml` (dispatch when path filters skip), CodeQL; `contract-analysis.yml` Echidna success; Mythril per OD-03 (red-by-design tolerated only for rows that touch neither contracts nor release) | baseline 7a620ff1: CI 44242366118 24/24, Pages 44242366052, Beta 44242366040, Integration 44242366032, Hosting 44242366075, CLI 44242366236 |
| C-03 | CI job for local browser harnesses: `GHOSTPAY_CHROMIUM=<chromium> node apps/web/scripts/test-reconciliation-idb.mjs`, `test-seller-vault-idb.mjs`, `test-tags-concurrency.mjs` | WS-20.2 |
| C-06 | Playwright `firefox` + `webkit` projects in CI (install in CI only; `apps/web/playwright.config.ts` is coordinator-owned; today: desktop Chromium + pixel-7/iphone-se/ipad-mini Chromium emulation, VERIFIED playwright.config.ts:35-41) | coord-request |
| C-07 | scheduled/dispatch jobs: chain-matrix mock revalidation, `deploy.sh sepolia rehearse`, K04 Foundry proof, infra compose/header checks, anvil/circuit suites + examples tests (TB-09) | WS-20.2 |
| C-08 | Pages deployed-origin assertion in `pages.yml` + smoke (TB-03, SEC-09) | WS-04.1 (smoke/build-pages) + pages.yml assertion via coord-request to WS-20 (G-B: lands at CP-1) |

### 2.2 Checkpoints (G-B)

- **CP-0**: Rebaseline: start commit fixed, toolchain, baseline gates recorded
- **CP-1**: Wave 1-2 closed: critical security/correctness defects + consolidation regressions + doc drift; #204 tooling ported; minor/patch deps refreshed
- **CP-2**: Spec 18 format freeze (K01/K02) + step-up API (WS-07.2) + shared foundations (independent tool, CI wiring/speed)
- **CP-3**: Wave 4 nearly-complete features + wave 5 recovered harness/doc hunk
- **CP-4**: Browser beta engineering-ready (waves 5-6): strict verifier, dual readback, rehearsal, smoke, shell hardening
- **CP-5**: KC: spec 18 K01-K06 acceptance on one exact integrated SHA (+ independent recovery proof)
- **CP-6**: Wave 8 optional advanced merged (never blocks CP-7/CP-8)
- **CP-7**: Sepolia static beta START qualification (owner-gated: OD-06/07/08, OA-01..06)
- **CP-8**: Beta EXIT qualification: CP-5 + B06 acceptance incl. 3q export + independent recovery on Sepolia
- **CP-9**: Release-tag qualification (owner-gated: OD-03, OD-07/OA-03 keys, OA-01 tag ruleset); mainnet out of scope

### 2.3 Review roles (author != reviewer, always)

| Role | Scope | Tier |
|---|---|---|
| RV-CRYPTO | derivation, envelopes, KDF/AEAD, key export/import, recovery tooling | Tier S (strongest); two independent reviewers at KC |
| RV-WEB | browser privacy: egress, storage, URL/fragment, clipboard, console, framing, UI safety | Tier S for secret flows, else mid |
| RV-SC | contracts, analyzers, disposition mechanisms | Tier S |
| RV-REL | release/deploy tooling, key ceremonies, manifests, infra, CLI operator paths | Tier S for key handling, else mid |
| RV-DOC | copy honesty, docs, i18n, accessibility text; human sign-off where stated | mid + human |

### 2.4 Privacy check methods (Playwright unless noted)

| ID | Method | Pass condition |
|---|---|---|
| P-EGRESS | `context.on('request')` collects every request for the whole flow; pattern `docs/handoffs/post-consolidation-20261118/evidence/teams/E/scripts/egress_walk.mjs` | request origins subset of {site origin, RPC origins the test configured}; zero requests during secret export |
| P-STORE | after the flow `page.evaluate` dumps localStorage, sessionStorage and every IndexedDB store (incl. `ghostpay-encrypted-seller-vault`) | no fixture secret (64-hex scalar, passphrase, seed words) present |
| P-CLIP | `page.addInitScript` replaces `navigator.clipboard.writeText/write` and `document.execCommand('copy')` with spies | zero calls (or exactly the OD-02-recorded manual copy) |
| P-URL | `page.url()` + history entries before/after; download filename | unchanged; no secret or key material in URL, fragment or filename |
| P-LOG | `page.on('console')` + `pageerror` collected | no fixture secret/passphrase substring; root error handlers sanitized (SEC-42, WS-21.2) |
| P-CLI | CLI command under a mock transport / no network | zero network calls except the explicit `--rpc` endpoint |

### 2.5 Crypto verification methods

| ID | Method |
|---|---|
| V-VEC | committed vectors with provenance (`test-vectors/*.json`); `test-vectors/scheme1.json` + `packages/core-crypto/src/**` frozen; fixed salt/IV only through a test-only injection |
| V-IND | `tools/independent-recovery` (WS-19: zero `@ghostpay/*` imports, zero npm deps; node>=22 scrypt + aes-256-gcm, vendored keccak-f[1600] + secp256k1) recomputes 100 % of the row's vectors. Reference pattern until it lands: `docs/handoffs/post-consolidation-20261118/evidence/teams/D/scripts/indep-vectors.cjs` (elliptic + js-sha3; `vectors=6 ok=6 bad=0` on scheme1.json) and `indep-keystore-recovery.mjs` (node:crypto keystore v1 decode) |
| V-FOUNDRY | pinned Foundry v1.8.5 (CI foundry-toolchain `dba66c27`; locally the GitHub release tarball with recorded sha256, foundry.paradigm.xyz is blocked) `anvil`, `cast wallet address --private-key`, `cast send`; synthetic keys only |
| V-AN | contracts: `forge test` (490), fuzz/invariant, coverage, Slither 0.11.6, Echidna 2.2.7, Mythril 0.24.8 with OD-03-approved dispositions |

### 2.6 Common commands

```bash
npm test -w <workspace>                  # vitest run --coverage (apps/web also runs vitest.nocov.config.ts)
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web   # and =full; webServer builds dist
node --test apps/web/scripts/localBuildProfile.test.mjs                # lean guard, 33 tests
node scripts/i18n/check.mjs [--strict]
node --test scripts/tests scripts/testnet scripts/regtest; node --test scripts/pages
cd packages/contracts && FOUNDRY_SOLC=<solc-0.8.28> forge test         # Foundry 1.8.5
REQUIRE_ANVIL=1 ANVIL_BIN=$(command -v anvil) npm test -w apps/relayer
npm run build:cli && npm run test:compiled -w @ghostpay/cli
npm run ci:scan-secrets && npm run ci:check-actions
```

## 3. Spec 18 K01-K06 + KC (requirement 3q): criteria built on NEXT_PHASE_QUEUE primitives

Primitives below are the NEXT_PHASE_QUEUE "Shared primitives (reuse, do not fork)" list; every file:line re-VERIFIED by G-A @7a620ff1. A K item that forks one of them fails IC-1.

| Primitive | file:line @7a620ff1 | Used by |
|---|---|---|
| scheme-1 derivation | `packages/core-crypto/src/stealth.ts` deriveStealthPayment :120, checkAnnouncement :157, deriveStealthSecret :212 (zero-scalar refusal, derived == announced, `ignoreViewTag` deep scan); vectors `test-vectors/scheme1.json`, `packages/core-crypto/src/vectors.test.ts` | K01, K04, K06 |
| address correspondence | `packages/chain-adapters/src/sweep.ts` addressOfSecret :175; pattern `apps/web/src/lib/sweep.ts` deriveVerifiedSweepKey :49 | K01, K04 |
| envelope (keystore v1) | `packages/ux-vault/src/keystore-portable.ts` KeystoreFile v1 :9, DEFAULT_SCRYPT N=2^17 r=8 p=1 :49, import ceilings :54-60, derive :74-82 (NFKC, dkLen 32, non-extractable AES-GCM, raw wiped), aad `GhostPay.keystore.v1|...` :84-86, encryptKeystore :313, validateKeystoreEnvelope :368, decryptKeystore :391; web `apps/web/src/lib/keystore.ts`; CLI `packages/cli/src/backup-data.ts:10`; second pattern `tag-archive-portable.ts` | K02, K05, K06 |
| vault store | `apps/web/src/lib/keyVault.ts` DB `ghostpay-encrypted-seller-vault` :39, IndexedDbKeyVaultStore :45, MemoryKeyVaultStore :170 | K03, K06 |
| step-up | `keyVault.ts` authorizeKeyExport :257 (undefined without vault :264 = SEC-03), authorizeEncryptedVault :328; G-B WS-07.2 `requireStepUp(kind)` API | K03-K06 |
| session guards | `apps/web/src/lib/session.ts` markKeystoreDownloaded :140, withSessionSecrets :312, captureSessionVersionGuard :344, captureSessionGuard :352, verifyDownloadedBackup :412, exportKeystore :434, importKeystore :452 | K03-K06 |
| export lifecycle | `apps/web/src/views/SellerKeys.tsx` onExport :205 (operation token, version guard, step-up, download, verify-backup); `apps/web/src/components/Common.tsx` downloadText :87, downloadBlob :95 | K03-K06 |
| secret wrappers | `packages/secret-box/src/secretBox.ts` wipe :56; `packages/core-crypto/src/secret.ts` zeroize :132 | K01-K06 |
| scan results | `apps/web/src/lib/scanClient.ts` ScanMatch :30-45 (tagMatches :38, receipt :44); `apps/web/src/lib/scanMatches.ts` paymentKeyOf :8; row UI `apps/web/src/views/Scan.tsx` ReceiptPanel :546 (no "Payment details" view exists, VERIFIED) | K01, K03, K05 |

**OD-10 wording defaults** (engineering applies, records in spec 18 for owner sign-off): no automatic clipboard, any manual raw-key copy needs OD-02; no telemetry at all; flow-1 announcement check uses the user-selected RPC with no automatic fallback; export modules stay inside the lean bundle rules and import no relayer/operator/CLI runtime; deep-scan matches (`tagMatches=false`) exportable only after the full derivation check; the public record carries the announced viewTag.

### K01 = F-KEY-07: Spec 18 K01: public/keypair/master schemas + verified derivation adapter

- Owner WS: WS-03 (WS-03.1, WS-19.2); checkpoint CP-2; deps F-PROTO-01; owner OD-10 (all have fail-closed defaults).
- NEXT_PHASE_QUEUE acceptance evidence (verbatim intent): Known EIP-5564 vector -> exact pubkey + EIP-55 address; wrong scheme/chain/announcement/format/version rejected; public payload proven secret-free; errors carry no secret; core-crypto vectors unchanged and passing.
- Measurable criteria (IC):
  - FUNC: strict parsers/builders for ghostpay-stealth-public-v1, -keypair-v1 (secret payload only via K02 envelope), -master-v1; spec 18 public fields; unavailable metadata omitted, never invented
  - CRYPTO: verifyDerivation(schemeId=1, chainId, announcement): private scalar -> address == announced stealth address == independently recomputed EIP-55 address; zero/out-of-range scalar refused
  - CRYPTO: test-vectors/stealth-export-v1.json derived from scheme1.json with provenance; tools/independent-recovery recomputes 100% of vectors without GhostPay code
  - FUNC: deep-scan (tagMatches=false) eligibility and carried viewTag rule documented in docs/developer/key-portability-formats.md; hash convention keccak256(compressed S) recorded (D-21)
  - TEST: negative: wrong scheme/chain/announcement/format/version, bad hex/length/case -> fixed error codes; fast-check parse(serialize(x))==x; `npm test -w packages/ux-vault` exit 0
  - PRIV: public payload secret-free: test asserts no 32-byte scalar of the fixture appears in output; errors never echo input
  - REG: `npm test -w packages/core-crypto` unchanged pass; `git diff --exit-code <base> -- test-vectors/scheme1.json packages/core-crypto/src`
  - TEST: [G-A name-align] module + tests in packages/ux-vault/src/stealth-export*.ts (G-B WS-03 owned); vectors test-vectors/stealth-export-v1.json; format doc docs/developer/key-portability-formats.md
- RQ:
  - REVIEW: RV-CRYPTO independent review (not author)
  - CI: B-RQ-1
  - REVIEW: KC (F-KEY-12)
  - BROWSER: Chromium + Firefox/WebKit (C-06) where the row has UI; P-EGRESS, P-STORE, P-CLIP, P-URL, P-LOG all pass on the integrated lean AND full builds.
- Security: SEC-04 [Medium CONFIRMED].

### K02 = F-KEY-08: Spec 18 K02: encrypted single-keypair envelope + atomic import

- Owner WS: WS-03 (WS-03.2, WS-19.2); checkpoint CP-2; deps F-KEY-07, F-KEY-03, F-KEY-13; owner OD-09, OD-10 (all have fail-closed defaults).
- NEXT_PHASE_QUEUE acceptance evidence (verbatim intent): Wrong passphrase, tamper, truncation, oversize cost, wrong chain/scheme fail closed with no partial state; round-trip across new browser sessions; existing keystore tests still pass unchanged.
- Measurable criteria (IC):
  - CRYPTO: format id + AAD domain `GhostPay.stealth-export.v1|...` (never GhostPay.keystore.v1); canonical header bytes bound as AAD; fresh CSPRNG salt + 12-byte IV per export; scrypt N=2^17 r=8 p=1 export, import ceilings N<=2^18 r<=8 p<=2 + byte cap, via the shared primitive
  - CRYPTO: plaintext built as bytes, no JSON hex string of secrets (D-20); key material wiped after use
  - TEST: fail closed with no partial state: wrong passphrase, every-byte tamper of header/ciphertext/tag, truncation, oversize cost params, wrong chain/scheme, unknown version
  - CRYPTO: fixed-salt/IV test vectors (test-only injection) decrypted by tools/independent-recovery
  - REG: legacy keystore v1 golden vector decrypts byte-identically; `npm test -w packages/ux-vault` (portable-parity) and `npm test -w packages/cli` unchanged pass
  - COMPAT: round trip across fresh browser contexts (Playwright new context, no storage)
- RQ:
  - REVIEW: RV-CRYPTO
  - CI: B-RQ-1
  - REVIEW: KC
  - BROWSER: Chromium + Firefox/WebKit (C-06) where the row has UI; P-EGRESS, P-STORE, P-CLIP, P-URL, P-LOG all pass on the integrated lean AND full builds.
- External (EX-02; own gate only): KDF time on a low-end mobile browser recorded (spec 18 envelope note)
- Security: SEC-04 [Medium CONFIRMED], SEC-15 [Low CONFIRMED].

### K03 = F-KEY-09: Spec 18 K03: seller payment-row export UI (public + encrypted)

- Owner WS: WS-08 (WS-08.1); checkpoint CP-5; deps F-KEY-08, F-KEY-04, F-WEB-06; owner OD-01, OD-02, OD-10 (all have fail-closed defaults).
- NEXT_PHASE_QUEUE acceptance evidence (verbatim intent): Locked/stale/changed-keys/wrong-chain refuse; lock/chain switch/key replacement during KDF never publishes a secret; no auto-download at scan; browser test proves no secret in fetch/URL/log/storage/clipboard.
- Measurable criteria (IC):
  - FUNC: seller-only Payment details > Export: deliberate gesture, re-auth per OD-01 (vault-less session refuses or demands the chosen factor), explicit chain/EOA/scope display, ownership label separate from receipt status; encrypted JSON default, public-only option
  - FUNC: refusals: locked, stale session, changed keys, wrong chain, policy/AA/7702 account, BTC output, unmatched announcement; lock/chain switch/key replacement during KDF never publishes a secret (operation token + version guard)
  - BROWSER: Playwright lean+full apps/web/e2e/stealth-export.spec.ts (G-B WS-08 owned path): zero network requests during export; URL/fragment unchanged; localStorage/sessionStorage/IndexedDB dumps contain no fixture secret hex; console spy clean; navigator.clipboard never called; download only after click; no auto-download at scan
  - TEST: component tests for every refusal state; `npm test -w apps/web` exit 0
  - I18N: keys allocated by coordinator in en/es/ar/ja; check 0 errors
  - A11Y: axe clean on the dialog (accessibility.spec.ts)
- RQ:
  - BROWSER: Firefox + WebKit projects green (C-06)
  - REVIEW: RV-CRYPTO + RV-WEB
  - REVIEW: KC
  - BROWSER: Chromium + Firefox/WebKit (C-06) where the row has UI; P-EGRESS, P-STORE, P-CLIP, P-URL, P-LOG all pass on the integrated lean AND full builds.
- External (EX-02; own gate only): mobile browser download/import recorded separately
- Security: SEC-03 [Medium CONFIRMED], SEC-04 [Medium CONFIRMED].

### K04 = F-KEY-10: Spec 18 K04: raw single-key export + independent recovery proof

- Owner WS: WS-08 (WS-08.2, WS-19.5); checkpoint CP-5; deps F-KEY-09; owner OD-02, OD-01, OD-10 (all have fail-closed defaults).
- NEXT_PHASE_QUEUE acceptance evidence (verbatim intent): Exported scalar derives the original address and signs a transfer accepted by anvil via the independent tool; no automatic wallet connection; BTC/AA/7702/policy-account requests refused; spent-address export allowed with "controls future deposits" label.
- Measurable criteria (IC):
  - FUNC: 0x + 64 lowercase hex, labelled "private key (not a seed)", after re-auth + second confirmation; masked by default; single key only; refused for BTC BIP-352/AA/7702/policy/unmatched; spent address allowed with "controls future deposits" label
  - CRYPTO: `bash tools/independent-recovery/k04-cast-proof.sh` (G-B WS-19 owned path; takes the app-exported key file as input): local anvil (1.8.5), synthetic stealth payment, key exported through the app export function, `cast wallet address --private-key` == stealth address and a `cast send` transfer is accepted
  - BROWSER: same no-secret-egress assertions as F-KEY-09; clipboard policy per OD-02 asserted
  - CI: coordinator adds the Foundry proof job (C-07)
- RQ:
  - REVIEW: RV-CRYPTO
  - CI: proof job green on exact SHA
  - REVIEW: KC
  - BROWSER: Chromium + Firefox/WebKit (C-06) where the row has UI; P-EGRESS, P-STORE, P-CLIP, P-URL, P-LOG all pass on the integrated lean AND full builds.
- External (EX-01; own gate only): import into one independent third-party EVM wallet app (optional, recorded)
- Security: SEC-03 [Medium CONFIRMED], SEC-04 [Medium CONFIRMED].

### K05 = F-KEY-11: Spec 18 K05: encrypted bounded bulk archive of validated one-time keys

- Owner WS: WS-25 (WS-08.3, WS-19.3, WS-25.1, WS-25.2); checkpoint CP-5; deps F-KEY-08, F-KEY-09; owner OD-10 (all have fail-closed defaults).
- NEXT_PHASE_QUEUE acceptance evidence (verbatim intent): Deterministic ordering; duplicate/conflicting records rejected; size/count bounds; malformed record -> atomic reject (no partial import).
- Measurable criteria (IC):
  - FUNC: encrypted only; header count/chain/scope; no master keys; deterministic order (chainId, blockNumber, logIndex, stealthAddress)
  - TEST: duplicates by paymentKeyOf deduplicated; conflicting records reject the whole import; max count/bytes enforced; malformed record -> atomic reject (store unchanged asserted)
  - CRYPTO: archive vector decrypted by tools/independent-recovery
  - BROWSER: import in a fresh context restores exactly the validated set
  - TEST: [G-A name-align] packages/ux-vault/src/stealth-archive*.test.ts + apps/web/e2e/stealth-archive.spec.ts (G-B WS-25 owned paths)
- RQ:
  - REVIEW: RV-CRYPTO
  - CI: B-RQ-1
  - REVIEW: KC
  - BROWSER: Chromium + Firefox/WebKit (C-06) where the row has UI; P-EGRESS, P-STORE, P-CLIP, P-URL, P-LOG all pass on the integrated lean AND full builds.
- Security: SEC-04 [Medium CONFIRMED].

### K06 = F-KEY-12: Spec 18 K06: separate encrypted master spend/view backup (+ KC checkpoint)

- Owner WS: WS-09 (WS-09.1, WS-19.4); checkpoint CP-5; deps F-KEY-07, F-KEY-08, F-KEY-03, F-KEY-09, F-KEY-10, F-KEY-11; owner OD-01, OD-09, OD-10 (all have fail-closed defaults).
- NEXT_PHASE_QUEUE acceptance evidence (verbatim intent): Offline recovery of a known historic announcement omitted from the payment archive; fresh-install restore without original host/account/service; legacy keystore import regression test; invoice-signing key never in master/payment formats.
- Measurable criteria (IC):
  - CRYPTO: ghostpay-stealth-master-v1 encrypted: spend+view secrets, scheme/version, recovery instructions; invoice-signing key absent (asserted)
  - CRYPTO: tools/independent-recovery recovers address + key of a known historic announcement omitted from the payment archive, without GhostPay code
  - BROWSER: fresh-install restore: new Playwright context with empty storage imports master backup, rescans fixture chain, finds the payment
  - REG: legacy keystore v1 export/import regression test unchanged
  - DOC: user recovery guide + normative format spec + reference vectors in repo
  - TEST: [G-A name-align] packages/ux-vault/src/stealth-master*.test.ts + apps/web/e2e/master-backup.spec.ts; user guide docs/user/master-backup-recovery.md (G-B WS-09 owned paths)
- RQ:
  - REVIEW: KC on one exact integrated SHA: every spec 18 acceptance test passes; lean/full guards; Chromium + Firefox/WebKit; two independent Tier S secret-flow reviewers (not authors) with threat-model delta
  - CI: B-RQ-1
  - BROWSER: Chromium + Firefox/WebKit (C-06) where the row has UI; P-EGRESS, P-STORE, P-CLIP, P-URL, P-LOG all pass on the integrated lean AND full builds.
- External (EX-02, EX-01; own gate only): mobile download/import; external wallet/device rows stay pending until real evidence
- Security: SEC-03 [Medium CONFIRMED], SEC-04 [Medium CONFIRMED].

### KC = CP-5: spec 18 acceptance on one exact integrated SHA

| Spec 18 acceptance test | Criterion that proves it | Owner |
|---|---|---|
| Known EIP-5564 vector -> exact public key + checksummed address | K01 CRYPTO: `test-vectors/stealth-export-v1.json` (provenance: scheme1.json) recomputed 100 % by V-IND; `npm test -w packages/ux-vault` exit 0 | WS-03.1 / WS-19.2 |
| Single encrypted keypair export/import across new browser sessions; wrong passphrase, tamper, wrong chain/scheme, malformed fail closed | K02 TEST (every-byte tamper, truncation, oversize params, unknown version -> no partial state) + COMPAT (Playwright new context, empty storage) | WS-03.2 |
| Raw key interoperates with an independent EVM tool on a local chain | K04 CRYPTO `bash tools/independent-recovery/k04-cast-proof.sh` (V-FOUNDRY; input = key file exported by the app in `apps/web/e2e/stealth-export.spec.ts`): `cast wallet address --private-key` == stealth address and `cast send` accepted by anvil; WS-19.5 signs the same transfer without GhostPay code | WS-08.2 / WS-19.5 |
| Public-only export has no secret bytes; encrypted files never expose plaintext | K01 PRIV (no 32-byte scalar of the fixture in output; errors never echo input) + K02/K05/K06 tests scanning ciphertext files for fixture scalars and passphrases | WS-03 / WS-25 / WS-09 |
| Bulk archive: ordering, duplicates, versioned schema, bounds, atomic import | K05 TEST (`packages/ux-vault/src/stealth-archive*.test.ts`, `apps/web/e2e/stealth-archive.spec.ts`): order (chainId, blockNumber, logIndex, stealthAddress); paymentKeyOf duplicates collapse; conflicting record rejects whole import; count/byte caps; store unchanged after reject | WS-25.1 |
| Master backup recovers known historic announcements incl. one omitted from the payment archive | K06 CRYPTO via V-IND (WS-19.4) on a fixture log set + BROWSER `apps/web/e2e/master-backup.spec.ts` fresh-install restore (empty context) finds the payment | WS-09.1 / WS-19.4 |
| No secret-bearing fetch/analytics/URL/log/storage/clipboard; deliberate gestures; locked vault refuses | K03 BROWSER `apps/web/e2e/stealth-export.spec.ts` (new, WS-08) with P-EGRESS/P-STORE/P-CLIP/P-URL/P-LOG; download only after click; refusal states unit-tested | WS-08.1 |
| Chromium + Firefox/WebKit where supported; mobile download/import recorded separately; offline documented recovery | C-06 green; EX-02 rows recorded (do not block KC); `docs/recovery/independent-recovery.md` (WS-19) followed offline on a clean machine | coordinator / WS-19 / WS-17 |
| Exact-head CI, provenance, independent source review | B-RQ-1 on the KC SHA; two independent Tier S RV-CRYPTO reviewers (not authors) with threat-model delta; legacy keystore v1 regression unchanged | coordinator |

KC also requires: lean/full guards (IC-5), docs + user recovery guide + normative format spec + reference vectors committed, and external wallet/device rows marked pending until real evidence (EX-01/EX-02). KC is not an approval to merge, deploy or publish (spec 18 DoD).

## 4. Per-row criteria: beta-core, beta-supporting, full-profile (64 rows)

Each row: decision line, then the 11 categories. Lines tagged `[row]` come from the row's registry criteria (converted, OD IDs canonical); untagged lines are the G-A category default for that row. `IC` lines must hold at implementation-complete, `RQ` lines at release-qualified. EX lines block only their own gate.

### 4.1 beta-core (23)

#### F-CLI-03: CLI encrypted backup, restore, rekey, offline recovery

IMPLEMENTED_UNVERIFIED 100/85 · track B-EXIT · WS-11 (WS-11.4) · CP CP-3 · decision **implement** · est 1-2.25 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | implement: YES: independent-decode test of CLI-produced keystore (tools/independent-recovery); optional spec 18 CLI export after KC | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `npm test -w packages/cli` incl. recovery-auth-negative.test.ts pass | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | [row] CRYPTO: test: `ghostpay backup create` output decrypted by tools/independent-recovery (no GhostPay code), keys match | same as IC on the integrated SHA |
| Privacy | [row] PRIV: CLI makes no network call in backup/recovery commands (asserted) | same as IC on the integrated SHA |
| Security analysis | SEC-04 [Medium CONFIRMED]; SEC-05 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-CRYPTO; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External | — | none |

#### F-CTR-07: Contract qualification gates (Foundry unit/fuzz/invariant, coverage, Slither, Echidna, Mythril, NatSpec)

BLOCKED 90/80 · track POST-BETA · WS-06 (WS-06.1, WS-06.2, WS-06.3) · CP CP-4, CP-6, CP-9 · decision **refactor** · est 4.5-8.5 d · owner OD-03, OA-01, OA-02, OA-03

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: disposition file keyed by (contract, function, SWC, PC, solc version, source keccak) read by the Mythril gate; any unmatched record, any source/compiler change, or any new record fails the job; R8 present-or-absent tolerated only when dispositioned | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: >=10 gate mutations caught (changed PC, changed source hash, new SWC, extra record, missing evidence, wrong commit): `node --test scripts/tests/mythril-dispositions.test.mjs` (new, WS-06) <br> [row] TEST: D-12: new Echidna actions for payERC20WithPermit/sweepWithPermit, forged non-owner signer, hostile token; canaries reached; `forge test` green (contracts src unchanged: `git diff --exit-code <base> -- packages/contracts/src packages/contracts/lib packages/contracts/script`) | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | [row] SEC: one-time full-severity Slither triage report (no --exclude-low/-informational) committed under docs/audits/; 00-slither-triage.md wording fixed <br> SEC-02 [High UNVERIFIED]; SEC-17 [Low MISSING-COVERAGE]; SEC-32 [Info CONFIRMED]; SEC-33 [Info CONFIRMED]; SEC-47 [Info UNVERIFIED]; SEC-49 [Info UNVERIFIED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: OD-03 decision recorded; OA-01 tag ruleset evidence |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | [row] REVIEW: RV-SC (Tier S) approves mechanism; author != reviewer | RV-SC; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | [row] CI: Contract analysis on exact SHA: Echidna success (13 properties, all canaries), Mythril success via approved dispositions only <br> [row] CI: release.yml evidence gate exercised on an owner-signed test tag (owner action) |
| External (EX-05) | — | independent professional audit (mainnet only) (blocks only this row's external gate) |

#### F-DEP-01: Deployment manifests: schema, strict loader, structured release signature, build-time bundling

PARTIAL 85/80 · track B-START · WS-05 (WS-05.1) · CP CP-1 · decision **repair** · est 1.25-2.5 d · owner OD-07, OA-03

> G-A verification (CONFIRMED): apps/web/deployments/README.md:37 says `npm run validate:deployments -w @ghostpay/web`; neither apps/web/package.json nor package.json defines validate:deployments (grep empty). (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: offline helper scripts/testnet/sign-manifest.mjs: computes the structured manifest digest, signs with a key read from stdin or an encrypted keystore, never writes key material, makes no network call | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: synthetic-key round trip verifies with deploymentsSignature.ts; unsigned manifest still fails build (existing test); validate-deployments refuses the public Playwright key 0x0707..07 (E-21) | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Signature: synthetic-key sign/verify round trip through deploymentsSignature.ts; public Playwright key 0x0707..07 refused (SEC-44); signature domain unchanged. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | [row] SEC: RV-REL review of key handling (no argv secrets, no logs) <br> SEC-14 [Low CONFIRMED]; SEC-24 [Low CONFIRMED]; SEC-32 [Info CONFIRMED]; SEC-44 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: OD-07 key ceremony done; fingerprint published out of band |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: apps/web/deployments/README.md:37 names a command that exists: README changed to `GHOSTPAY_RELEASE_PUBKEYS=<key> node apps/web/scripts/validate-deployments.mjs` (or coordinator adds the npm script); parity asserted by a scripts/tests check | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: signed Sepolia manifest validates at build (vite validateDeployments) and at runtime; unsigned still fails |
| External | — | none |

#### F-DEP-02: On-chain manifest read-back verifyDeployment (spec 01)

PARTIAL 85/80 · track B-START · WS-24 (WS-24.2) · CP CP-4 · decision **refactor** · est 3-5.5 d · owner OA-04

> G-A verification (CONFIRMED+NUANCE): G-NOTE-01 holds: Pay.tsx:402/Sweep.tsx:172 -> verifyManifestForFlow, Scan.tsx:233 -> verifyManifestState (manifest.ts:107-127) -> verifyManifestOnChain (deploymentsVerify.ts:44-70: compares FEE_RECIPIENT/ANNOUNCER/FEE_BPS to manifest values, single client, no canonical announcer, no fixed 25 bps); verifyDeployment (verify.ts:184-235: canonicalAnnouncer, FEE_BPS==25, optional secondary via requestWithFallbackCheck) used only by packages/cli/src/payment-context.ts:156 and web checkDeployment (apps/web/src/lib/deployment.ts:15, referenced only by tests). NUANCE: verifyDeployment pins only the policy FACTORY codehash while verifyManifestOnChain pins policy implementation + factory, so the unified verifier must take the union. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: web manifest.ts verifyManifestForFlow, CLI payment-context.ts and relayer runtime.ts call one exported strict verifier: canonical announcer per chain, router/sweep/policy implementation+factory codehashes, FEE_BPS==25, FEE_RECIPIENT, rejects EIP-7702 designator (0xef0100) and proxy code; optional/required second provider with identical-result reconciliation <br> [row] FUNC: result cached per (chainId, block) and re-checked before Pay preview/sign and Sweep sign <br> [row] FUNC: union of today's checks: canonical announcer + FEE_BPS==25 + secondary provider (verify.ts) AND policy implementation codehash (deploymentsVerify.ts only) AND policy factory codehash (both) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: chain-adapters verify*.test.ts: 0xef0100 code refused, announcer mismatch refused, policy implementation hash mismatch refused, secondary disagreement/unreachable -> fail closed; `npm test -w packages/chain-adapters` exit 0 <br> [row] TEST: pages-devnet journey and scripts/beta/cli-devnet.e2e.mjs (CI pages.yml/beta-acceptance) pass | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Codehash pins: keccak256(eth_getCode) vs pinned hex; fixtures cover match, mismatch, empty code and the 0xef0100 delegation designator. | same as IC on the integrated SHA |
| Privacy | RPC requests only to the user-configured primary/secondary providers, never a built-in fallback (P-EGRESS on the pages-devnet journey; request count asserted in unit tests). | same as IC on the integrated SHA |
| Security analysis | SEC-32 [Info CONFIRMED]; SEC-34 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: Sepolia announcer runtime codehash pinned from two-provider evidence (B04) |
| Regression | [row] REG: `npm test -w apps/web` (manifest.test.ts, deployment.test.ts), `npm test -w packages/cli`, `REQUIRE_ANVIL=1 npm test -w apps/relayer` pass | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | RV-REL; author != reviewer. | [row] REVIEW: RV-REL |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External (EX-06) | — | public-provider readback of the real Sepolia deployment (B05) (blocks only this row's external gate) |

#### F-DEP-03: Chain/token/feed deployment matrix + release gate (spec 09)

PARTIAL 75/70 · track B-START · WS-05 (WS-05.3) · CP CP-4 · decision **implement** · est 2.25-4 d · owner OA-04

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: `node scripts/check-chain-matrix.mjs --revalidate --rpc <user url>` re-reads codehashes read-only and diffs against pins; never edits matrix.json | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: mocked-RPC tests in scripts/tests/chain-matrix*.test.mjs: drift detected, no auto-verified promotion, strict gate unchanged | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | Codehash pins: keccak256(eth_getCode) vs pinned hex; fixtures cover match, mismatch, empty code and the 0xef0100 delegation designator. | same as IC on the integrated SHA |
| Privacy | RPC requests only to the user-configured primary/secondary providers, never a built-in fallback (P-EGRESS on the pages-devnet journey; request count asserted in unit tests). | same as IC on the integrated SHA |
| Security analysis | SEC-44 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: Sepolia 14 cells filled from authenticated evidence, independently re-checked by a second agent (B04) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: operator doc for evidence capture (block, provider, date, source) | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1; nightly mock revalidation job (coordinator C-07) |
| External (EX-06) | — | remaining 59 non-Sepolia cells: per-chain owner deployments (D01) (blocks only this row's external gate) |

#### F-DEP-04: Testnet deployment tooling + Sepolia-first deployment of record

BLOCKED 75/55 · track B-START · WS-05 (WS-05.2) · CP CP-4 · decision **implement** · est 2.25-4 d · owner OA-04, OD-08, OD-14

> G-A verification (CONFIRMED): scripts/testnet/deploy.sh:31-38 supports sepolia/base-sepolia/op-sepolia/arbitrum-sepolia/polygon-amoy/hoodi; packages/chain-adapters/src/config/chains.ts:41-47 enables 11155111, 84532, 11155420, 421614, 80002, 97, 43113 (no deploy path for 97/43113; hoodi 560048 absent from chains.ts). (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: deploy driver network list == enabled testnet set in packages/chain-adapters/src/config/chains.ts (or enabled set reduced, decision recorded); hoodi resolved | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `FEE_RECIPIENT=<anvil acct> bash scripts/testnet/deploy.sh sepolia rehearse` exit 0 producing a valid manifest in a temp dir (Foundry 1.8.5); SmokeSepolia runs against the rehearsal anvil incl. a native payment to a fee recipient that accepts ETH (D-19) <br> [row] TEST: pre-deploy-check.sh test with fake RPC prints effective config and never broadcasts; broadcast refused without CONFIRM_BROADCAST=1 | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | RPC requests only to the user-configured primary/secondary providers, never a built-in fallback (P-EGRESS on the pages-devnet journey; request count asserted in unit tests). | same as IC on the integrated SHA |
| Security analysis | SEC-17 [Low MISSING-COVERAGE]; SEC-32 [Info CONFIRMED]; SEC-33 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: OA-04: owner broadcast on Sepolia; tx hashes, blocks, verify-sources.sh output, runtime codehashes read back by two providers, committed as evidence (B02) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | [row] CI: coordinator adds rehearsal job (C-07) | B-RQ-1 on the exact integrated SHA. |
| External (EX-06) | — | other testnets per D01 (blocks only this row's external gate) |

#### F-DOC-04: In-app contextual help + static help/privacy pages

PARTIAL 65/65 · track POST-BETA · WS-12 (WS-12.7) · CP CP-6 · decision **defer** · est 0.6-1 d · owner OD-20, OD-16

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: static-help.spec.ts per locale | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-27 [Low CONFIRMED]; SEC-28 [Low CONFIRMED]; SEC-29 [Low UNVERIFIED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: help/privacy pages available for every shipped locale or picker hides untranslated help | [row] DOC: native review recorded per locale |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-04) | — | native-speaker review (human) (blocks only this row's external gate) |

#### F-I18N-01: Web i18n framework: catalogs, translator, plurals/ICU-lite, RTL, language picker, pseudo-locales

IMPLEMENTED_UNVERIFIED 90/90 · track B-EXIT · WS-12 (WS-12.4) · CP CP-3 · decision **repair** · est 2-4.25 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: add JSX-literal checker test with baseline allowlist; localise remaining literals as files are released by other WS | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: apps/web/src/i18n/literals.test.ts (TypeScript AST) fails on any JSX text/attribute literal not in an allowlist; allowlist shrinks to 0 by CP-5 <br> [row] TEST: `npm test -w apps/web` i18n suites pass; pseudo-locale e2e shows no untranslated literal on 9 lean views | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] I18N: `node scripts/i18n/check.mjs` 0 errors; `--strict` warning count reported, not increased | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-DOC; author != reviewer. | [row] REVIEW: RV-DOC |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External | — | none |

#### F-KEY-03: Keystore v1 backup/restore and verified-backup gate (GP-PAGES-02)

IMPLEMENTED_UNVERIFIED 100/100 · track B-EXIT · WS-02 (WS-02.7) · CP CP-3 · decision **recover** · est 0.85-1.75 d · owner —

> G-A verification (CONFIRMED): 57dcf7e8 is NOT an ancestor of 7a620ff1; its apps/web/scripts/test-seller-vault-idb.mjs has 228 lines with R1-R3 recovery cases vs 75 lines (no R1-R3) in the candidate; no CI/package script runs either harness. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | recover: YES: restore R1-R3 isolated-context recovery harness from 57dcf7e8 (C class B; verified passing on candidate) into apps/web/scripts/test-seller-vault-idb.mjs | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `GHOSTPAY_CHROMIUM=/opt/pw-browsers/chromium node apps/web/scripts/test-seller-vault-idb.mjs` exit 0 printing the R1-R3 and two-tab PASS lines; no external egress | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | [row] CRYPTO: test-vectors/keystore-v1-golden.json (name per G-B WS-03.2) decrypted by tools/independent-recovery (node:crypto only) in CI (WS-03) | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-01 [High CONFIRMED]; SEC-03 [Medium CONFIRMED]; SEC-04 [Medium CONFIRMED]; SEC-05 [Medium CONFIRMED]; SEC-15 [Low CONFIRMED]; SEC-37 [Info CONFIRMED]; SEC-41 [Info UNVERIFIED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: docs/developer/byte-layouts.md keystore section matches code (N<=2^18, r<=8, p<=2, 8 KiB, >=14 chars + strength) (D-10) | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-CRYPTO; author != reviewer. |
| CI gates | [row] CI: coordinator wires the harness into CI (C-03) | [row] CI: harness job green on exact SHA |
| External (EX-02) | — | mobile download/import and real-device restore (B06) (blocks only this row's external gate) |

#### F-KEY-07: Spec 18 K01: public/keypair/master schemas + verified derivation adapter

SPEC_ONLY 0/0 · track B-EXIT · WS-03 (WS-03.1, WS-19.2) · CP CP-2 · decision **implement** · est 4.25-6 d · owner OD-10

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: strict parsers/builders for ghostpay-stealth-public-v1, -keypair-v1 (secret payload only via K02 envelope), -master-v1; spec 18 public fields; unavailable metadata omitted, never invented <br> [row] FUNC: deep-scan (tagMatches=false) eligibility and carried viewTag rule documented in docs/developer/key-portability-formats.md; hash convention keccak256(compressed S) recorded (D-21) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: negative: wrong scheme/chain/announcement/format/version, bad hex/length/case -> fixed error codes; fast-check parse(serialize(x))==x; `npm test -w packages/ux-vault` exit 0 <br> [row] TEST: [G-A name-align] module + tests in packages/ux-vault/src/stealth-export*.ts (G-B WS-03 owned); vectors test-vectors/stealth-export-v1.json; format doc docs/developer/key-portability-formats.md | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | [row] CRYPTO: verifyDerivation(schemeId=1, chainId, announcement): private scalar -> address == announced stealth address == independently recomputed EIP-55 address; zero/out-of-range scalar refused <br> [row] CRYPTO: test-vectors/stealth-export-v1.json derived from scheme1.json with provenance; tools/independent-recovery recomputes 100% of vectors without GhostPay code | same as IC on the integrated SHA |
| Privacy | [row] PRIV: public payload secret-free: test asserts no 32-byte scalar of the fixture appears in output; errors never echo input | same as IC on the integrated SHA |
| Security analysis | SEC-04 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | [row] REG: `npm test -w packages/core-crypto` unchanged pass; `git diff --exit-code <base> -- test-vectors/scheme1.json packages/core-crypto/src` | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO independent review (not author) <br> [row] REVIEW: KC (F-KEY-12) |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External | — | none |

#### F-KEY-08: Spec 18 K02: encrypted single-keypair envelope + atomic import

SPEC_ONLY 0/0 · track B-EXIT · WS-03 (WS-03.2, WS-19.2) · CP CP-2 · decision **implement** · est 4.25-6.5 d · owner OD-09, OD-10

> G-A verification (CONFIRMED): packages/ux-vault/src/keystore-portable.ts: DEFAULT_SCRYPT :49, import ceilings MAX_N/MAX_R/MAX_P/MAX_KEYSTORE_BYTES :54-60, derive :74-82 and aad :84-86 are inside createKeystoreApi (:42) and absent from its return object (:438) -> closure-private; a shared primitive must be exported without changing v1 bytes. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | implement: YES: new envelope format id + AAD domain + atomic import | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: fail closed with no partial state: wrong passphrase, every-byte tamper of header/ciphertext/tag, truncation, oversize cost params, wrong chain/scheme, unknown version | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | [row] CRYPTO: format id + AAD domain `GhostPay.stealth-export.v1/...` (never GhostPay.keystore.v1); canonical header bytes bound as AAD; fresh CSPRNG salt + 12-byte IV per export; scrypt N=2^17 r=8 p=1 export, import ceilings N<=2^18 r<=8 p<=2 + byte cap, via the shared primitive <br> [row] CRYPTO: plaintext built as bytes, no JSON hex string of secrets (D-20); key material wiped after use <br> [row] CRYPTO: fixed-salt/IV test vectors (test-only injection) decrypted by tools/independent-recovery | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-04 [Medium CONFIRMED]; SEC-15 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | [row] REG: legacy keystore v1 golden vector decrypts byte-identically; `npm test -w packages/ux-vault` (portable-parity) and `npm test -w packages/cli` unchanged pass | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | [row] COMPAT: round trip across fresh browser contexts (Playwright new context, no storage) | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO <br> [row] REVIEW: KC |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External (EX-02) | — | KDF time on a low-end mobile browser recorded (spec 18 envelope note) (blocks only this row's external gate) |

#### F-KEY-09: Spec 18 K03: seller payment-row export UI (public + encrypted)

SPEC_ONLY 0/0 · track B-EXIT · WS-08 (WS-08.1) · CP CP-5 · decision **implement** · est 6-10 d · owner OD-01, OD-02, OD-10

> G-A verification (CONFIRMED): No "Payment details" view in apps/web/src (grep empty); Scan.tsx:546 renders ReceiptPanel per match; SellerKeys.tsx:205 onExport exists as the lifecycle template. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: seller-only Payment details > Export: deliberate gesture, re-auth per OD-01 (vault-less session refuses or demands the chosen factor), explicit chain/EOA/scope display, ownership label separate from receipt status; encrypted JSON default, public-only option <br> [row] FUNC: refusals: locked, stale session, changed keys, wrong chain, policy/AA/7702 account, BTC output, unmatched announcement; lock/chain switch/key replacement during KDF never publishes a secret (operation token + version guard) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: component tests for every refusal state; `npm test -w apps/web` exit 0 | same as IC on the integrated SHA |
| Browser | [row] BROWSER: Playwright lean+full apps/web/e2e/stealth-export.spec.ts (G-B WS-08 owned path): zero network requests during export; URL/fragment unchanged; localStorage/sessionStorage/IndexedDB dumps contain no fixture secret hex; console spy clean; navigator.clipboard never called; download only after click; no auto-download at scan <br> [row] A11Y: axe clean on the dialog (accessibility.spec.ts) | [row] BROWSER: Firefox + WebKit projects green (C-06) |
| Crypto verification | Derivation/envelope bytes unchanged unless the row says otherwise: `npm test -w packages/core-crypto` exit 0 and V-IND `indep-vectors.cjs` vectors=6 ok=6 bad=0. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-03 [Medium CONFIRMED]; SEC-04 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] I18N: keys allocated by coordinator in en/es/ar/ja; check 0 errors | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO + RV-WEB <br> [row] REVIEW: KC |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-02) | — | mobile browser download/import recorded separately (blocks only this row's external gate) |

#### F-KEY-10: Spec 18 K04: raw single-key export + independent recovery proof

SPEC_ONLY 0/0 · track B-EXIT · WS-08 (WS-08.2, WS-19.5) · CP CP-5 · decision **implement** · est 4-6 d · owner OD-02, OD-01, OD-10

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: 0x + 64 lowercase hex, labelled "private key (not a seed)", after re-auth + second confirmation; masked by default; single key only; refused for BTC BIP-352/AA/7702/policy/unmatched; spent address allowed with "controls future deposits" label | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/chain-adapters`, `node --test scripts/tests scripts/testnet` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | [row] BROWSER: same no-secret-egress assertions as F-KEY-09; clipboard policy per OD-02 asserted | same as IC on the integrated SHA |
| Crypto verification | [row] CRYPTO: `bash tools/independent-recovery/k04-cast-proof.sh` (G-B WS-19 owned path; takes the app-exported key file as input): local anvil (1.8.5), synthetic stealth payment, key exported through the app export function, `cast wallet address --private-key` == stealth address and a `cast send` transfer is accepted | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-03 [Medium CONFIRMED]; SEC-04 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO <br> [row] REVIEW: KC |
| CI gates | [row] CI: coordinator adds the Foundry proof job (C-07) | [row] CI: proof job green on exact SHA |
| External (EX-01) | — | import into one independent third-party EVM wallet app (optional, recorded) (blocks only this row's external gate) |

#### F-KEY-11: Spec 18 K05: encrypted bounded bulk archive of validated one-time keys

SPEC_ONLY 0/0 · track B-EXIT · WS-25 (WS-08.3, WS-19.3, WS-25.1, WS-25.2) · CP CP-5 · decision **implement** · est 3.5-4.5 d · owner OD-10

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: encrypted only; header count/chain/scope; no master keys; deterministic order (chainId, blockNumber, logIndex, stealthAddress) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: duplicates by paymentKeyOf deduplicated; conflicting records reject the whole import; max count/bytes enforced; malformed record -> atomic reject (store unchanged asserted) <br> [row] TEST: [G-A name-align] packages/ux-vault/src/stealth-archive*.test.ts + apps/web/e2e/stealth-archive.spec.ts (G-B WS-25 owned paths) | same as IC on the integrated SHA |
| Browser | [row] BROWSER: import in a fresh context restores exactly the validated set | Firefox + WebKit via C-06 where supported |
| Crypto verification | [row] CRYPTO: archive vector decrypted by tools/independent-recovery | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-04 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO <br> [row] REVIEW: KC |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External | — | none |

#### F-KEY-12: Spec 18 K06: separate encrypted master spend/view backup (+ KC checkpoint)

SPEC_ONLY 0/0 · track B-EXIT · WS-09 (WS-09.1, WS-19.4) · CP CP-5 · decision **implement** · est 6.75-9.75 d · owner OD-01, OD-09, OD-10

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | implement: YES: master spend/view encrypted backup (format WS-03, UI WS-09) + offline recovery + KC checkpoint | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: [G-A name-align] packages/ux-vault/src/stealth-master*.test.ts + apps/web/e2e/master-backup.spec.ts; user guide docs/user/master-backup-recovery.md (G-B WS-09 owned paths) | same as IC on the integrated SHA |
| Browser | [row] BROWSER: fresh-install restore: new Playwright context with empty storage imports master backup, rescans fixture chain, finds the payment | Firefox + WebKit via C-06 where supported |
| Crypto verification | [row] CRYPTO: ghostpay-stealth-master-v1 encrypted: spend+view secrets, scheme/version, recovery instructions; invoice-signing key absent (asserted) <br> [row] CRYPTO: tools/independent-recovery recovers address + key of a known historic announcement omitted from the payment archive, without GhostPay code | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-03 [Medium CONFIRMED]; SEC-04 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | [row] REG: legacy keystore v1 export/import regression test unchanged | same as IC on the integrated SHA |
| Docs | [row] DOC: user recovery guide + normative format spec + reference vectors in repo | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: KC on one exact integrated SHA: every spec 18 acceptance test passes; lean/full guards; Chromium + Firefox/WebKit; two independent Tier S secret-flow reviewers (not authors) with threat-model delta |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 |
| External (EX-02, EX-01) | — | mobile download/import; external wallet/device rows stay pending until real evidence (blocks only this row's external gate) |

#### F-KEY-13: secret-box (closure-held secret bytes, scopes, wipe)

IMPLEMENTED_UNVERIFIED 90/90 · track POST-BETA · WS-03 (WS-03.3) · CP CP-6 · decision **defer** · est 1.1-2.25 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: secret-box suites stay green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | [row] CRYPTO: K02 review confirms spec 18 secrets live in SecretBox/Uint8Array and are wiped | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-37 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-CRYPTO; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-PROTO-03: Announcement discovery primitives: verified RPC client + reorg-safe announcement fetch/validation

IMPLEMENTED_UNVERIFIED 95/95 · track B-NONGATING · WS-11 (WS-11.1) · CP CP-3 · decision **repair** · est 0-0.1 d · owner —

> G-A verification (CORRECTED): Claim "per-log blockHash cross-check missing in fetchAnnouncements" is WRONG: packages/chain-adapters/src/logs.ts:438-460 reads the canonical block for every accepted log (cache + separate 1,000-read cap MAX_CANONICAL_BLOCK_READS :90, doc :269-271) and fails RPC_FAILURE "log block hash differs from canonical block"; tested logs.test.ts:132-148, scanHardening.test.ts:82; `npx vitest run src/logs.test.ts src/scanHardening.test.ts` 2 files / 70 tests passed. Introduced 18e5b23f (2026-10-22). Requirement is implemented+verified; only the matrix row needs rescoring. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES (records only): rescore the "per-log block-hash cross-check" requirement as implemented+verified (logs.ts:438-460, logs.test.ts:132-148); no code change | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/chain-adapters`, `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: records-only change. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-19 [Low CONFIRMED]; SEC-20 [Low CONFIRMED]; SEC-45 [Info SUSPECTED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | [row] REG: `npm test -w packages/chain-adapters` exit 0 (logs.test.ts, scanHardening.test.ts unchanged) | same as IC on the integrated SHA |
| Docs | [row] DOC: feature matrix row F-PROTO-03: requirement "per-log block-hash cross-check" -> implemented yes / verified yes citing logs.ts:438-460 + logs.test.ts:132-148; status -> VERIFIED_COMPLETE | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B-RQ-1 on exact SHA |
| External (EX-06) | — | Sepolia public-provider log caps/rate limits observed during B06 (blocks only this EXT row) (blocks only this row's external gate) |

#### F-WEB-04: Payment submission journal and honest uncertain outcomes

IMPLEMENTED_UNVERIFIED 90/90 · track POST-BETA · WS-10 (WS-10.6) · CP CP-6 · decision **defer** · est 2-3.75 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: limit stated in docs/user and Pay copy (verify present) | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-01) | — | real wallet speed-up/replacement behaviour recorded in B06 (blocks only this row's external gate) |

#### F-WEB-06: Seller scan & discovery UI (worker, checkpoints, reorg, dedupe, deep scan, auto-rescan)

IMPLEMENTED_UNVERIFIED 95/95 · track B-NONGATING · WS-02 (WS-02.6) · CP CP-3 · decision **defer** · est 0-0.45 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/core-crypto`, `npm test -w packages/chain-adapters` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-22 [Low CONFIRMED]; SEC-32 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: docs/specs/02-scanner-robustness-and-payment-verification.md disposition note for rule 2 citing negative.test.ts:200,314 deep-scan tests; owner-ack recorded (no canonical ID) | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-06) | — | Sepolia provider log caps observed in B06 (blocks only this row's external gate) |

#### F-WEB-09: Payment history & reconciliation ledger (encrypted IndexedDB, invoice registry)

VERIFIED_COMPLETE 100/95 (H1 rescoring; WS-02.4 = TB-06 script fix + regression protection only) · track B-NONGATING · WS-02 (WS-02.4) · CP CP-1 · decision **repair** · est 0.75-1.1 d · owner —

> G-A verification (CONFIRMED): apps/web/scripts/test-reconciliation-idb.mjs:71 calls invalidateFrom(100n); packages/ux-vault/src/reconciliation-portable.ts:154 (interface) and :961-965 (impl) require (block, observed, canonicalHash) -> observed.map TypeError (static); no workflow/package script references the harness (grep .github, package.json, scripts). (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: update apps/web/scripts/test-reconciliation-idb.mjs:71 to invalidateFrom(block, observed, canonicalHash); wire into CI | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `GHOSTPAY_CHROMIUM=/opt/pw-browsers/chromium node apps/web/scripts/test-reconciliation-idb.mjs` exit 0, PASS line incl. "no external egress" | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-05 [Medium CONFIRMED]; SEC-22 [Low CONFIRMED]; SEC-23 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | [row] CI: coordinator wires it into a CI job (C-03) | [row] CI: job green on exact SHA |
| External | — | none |

#### F-WEB-17: Bundled signed manifests + on-chain readback in UI

PARTIAL 80/80 · track B-START · WS-24 (WS-24.3) · CP CP-4 · decision **repair** · est 1.75-3 d · owner OD-07, OD-06, OA-04, OA-03

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: with a secondary RPC configured, Pay/Scan/Sweep readback reconciles both providers and fails closed on disagreement/unreachable; banner shows provider count | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: manifest.test.ts/deployment.test.ts cases; pages-devnet journey with a lying second anvil endpoint -> payments disabled (CI pages.yml acceptance) | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Codehash pins: keccak256(eth_getCode) vs pinned hex; fixtures cover match, mismatch, empty code and the 0xef0100 delegation designator. | same as IC on the integrated SHA |
| Privacy | RPC requests only to the user-configured primary/secondary providers, never a built-in fallback (P-EGRESS on the pages-devnet journey; request count asserted in unit tests). | same as IC on the integrated SHA |
| Security analysis | SEC-14 [Low CONFIRMED]; SEC-24 [Low CONFIRMED]; SEC-32 [Info CONFIRMED]; SEC-44 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: B03 signed manifest bundled; B05 runtime readback passes via user-selected RPC on the real origin |
| External | — | none |

#### F-WEB-21: Lean static Pages build profile (product surface)

BLOCKED 80/80 · track B-START · WS-04 (WS-04.6) · CP CP-7 · decision **defer** · est 1.5-3 d · owner OD-08, OD-06, OD-07, OA-01, OA-05, OA-06, OA-02, OA-03

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | Gated by OD-08, OD-06, OD-07, OA-01, OA-05, OA-06, OA-02, OA-03: no new product function before those are recorded; the prep lines in this table are the IC scope; the feature is accepted when its RQ lines hold. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: AppLean.test.tsx, localBuildProfile.test.mjs, scanBundle.test.ts, pages-devnet.spec.ts stay green | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | [row] BROWSER: B05 live `node scripts/pages/smoke.mjs <url> --commit <sha>` incl. origin assertion and extended egress walk |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | [row] SEC: deployed-origin assertion (E-03) in smoke + pages.yml <br> SEC-01 [High CONFIRMED]; SEC-02 [High UNVERIFIED]; SEC-03 [Medium CONFIRMED]; SEC-08 [Medium SUSPECTED]; SEC-09 [Medium CONFIRMED]; SEC-18 [Low CONFIRMED]; SEC-21 [Low INTENDED]; SEC-24 [Low CONFIRMED]; SEC-30 [Low INTENDED]; SEC-40 [Info CONFIRMED]; SEC-43 [Info CONFIRMED]; SEC-46 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: OD-08 ADR-0029 Accepted; OD-06 origin recorded; OA-01 protection evidence; OA-05 Pages source = Actions |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | [row] CI: ADR-0015 gate 2: signed checksums or release + published key fingerprint + second-machine `bash scripts/repro-check.sh --head` identical SHA256SUMS |
| External (owner-provisioned) | — | header-capable primary host if OD-06 chooses it (ADR-0015 gate 5) (blocks only this row's external gate) |

#### F-WEB-26: address-safety (strict addresses, lookalikes, display-text sanitizing)

IMPLEMENTED_UNVERIFIED 90/80 · track B-NONGATING · WS-10 (WS-10.3) · CP CP-3 · decision **repair** · est 0.7-1.5 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: record payeeTrust non-use (redundant with Pay pinned signers) or wire it; add cross-engine confusable rendering test | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/address-safety`, `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | [row] BROWSER: Playwright confusable/bidi rendering spec (Chromium now) | [row] BROWSER: Firefox + WebKit projects green (C-06) |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-34 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: payeeTrust decision recorded (ADR note) and export marked internal or wired with tests | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External | — | none |

### 4.2 beta-supporting (23)

#### F-A11Y-01: Automated accessibility: axe-core audit in Playwright (all routes, keyboard, 320px reflow, forced-colors, reduced-motion)

IMPLEMENTED_UNVERIFIED 90/85 · track B-EXIT · WS-12 (WS-12.2) · CP CP-3 · decision **repair** · est 1.25-2.5 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: extend axe audit to modals, deferred routes, theme combos | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | [row] BROWSER: accessibility.spec.ts covers every modal/dialog, deferred network/embed views, light/dark/forced-colors/reduced-motion; 0 serious/critical axe violations lean+full <br> [row] A11Y: keyboard-only path through the 9 lean routes recorded in the spec | [row] BROWSER: Firefox + WebKit runs (C-06) |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-03) | — | see F-A11Y-03 (blocks only this row's external gate) |

#### F-A11Y-02: Mobile/responsive: Chromium device-emulation projects (Pixel 7, iPhone SE, iPad Mini descriptors)

PARTIAL 50/50 · track B-EXIT · WS-17 (WS-17.2) · CP CP-8 · decision **defer** · est 0.5-1.25 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | Gated by EX-02: no new product function before those are recorded; the prep lines in this table are the IC scope; the feature is accepted when its RQ lines hold. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | [row] BROWSER: device-emulation projects stay green; labels say emulation | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-02) | — | real iOS Safari + Android Chrome: invoice open, pay, camera QR scan, keystore download/import; recorded with device/OS/browser versions (B06) (blocks only this row's external gate) |

#### F-A11Y-03: Screen-reader / assistive-tech qualification

PARTIAL 40/20 · track B-EXIT · WS-12 (WS-12.5) · CP CP-3 · decision **implement** · est 1.5-2.5 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | implement: YES: manual NVDA/VoiceOver/TalkBack protocol + log template; run by humans | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | [row] A11Y: aria-live announcements for payment status/scan progress asserted in unit tests | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: docs/accessibility/screen-reader-protocol.md: 9 core routes x tasks x expected announcements; log template | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-03) | — | NVDA+Firefox, VoiceOver+Safari, TalkBack+Chrome logs for the 9 routes (human) (blocks only this row's external gate) |

#### F-BTC-01: BIP-352 silent payments: keys, addresses, sender derive, receive scan, spend (full-profile web)

IMPLEMENTED_UNVERIFIED 100/80 (tier full-profile after H1 rescoring) · track POST-BETA · WS-14 (WS-14.4) · CP CP-6 · decision **defer** · est 2-4 d · owner OD-20, OD-02

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: regtest e2e: receive, scan, taproot spend + sweep with policy (spend-regtest.test.ts) green in integration.yml | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Derivation/envelope bytes unchanged unless the row says otherwise: `npm test -w packages/core-crypto` exit 0 and V-IND `indep-vectors.cjs` vectors=6 ok=6 bad=0. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | [row] SEC: D-08: seed reveal behind re-auth + second confirmation; clipboard per OD-02 <br> SEC-13 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07, EX-02) | — | signet + physical device acceptance (spec 12 banner) (blocks only this row's external gate) |

#### F-CLI-01: CLI core: registry, strict arg parsing, --json, exit codes, doctor, build-info

IMPLEMENTED_UNVERIFIED 100/85 · track POST-BETA · WS-11 (WS-11.3) · CP CP-3 · decision **repair** · est 0.25-0.35 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: record compiled-binary acceptance (local `npm run test:compiled -w @ghostpay/cli` + CI cli-operator run 44242366236) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `npm run build:cli && npm run test:compiled -w @ghostpay/cli` exit 0 locally; run id of cli-operator on the WS head recorded | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-CLI: no network call except the explicit --rpc endpoint. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | [row] CI: cli-operator workflow green at exact SHA (dispatched if path filter skips) |
| External | — | none |

#### F-CLI-05: CLI read-only chain/payment/scan/registry commands

IMPLEMENTED_UNVERIFIED 100/80 · track POST-BETA · WS-17 (WS-17.1) · CP CP-7 · decision **defer** · est 0.5-0.75 d · owner OA-04

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/cli` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-CLI: no network call except the explicit --rpc endpoint. | same as IC on the integrated SHA |
| Security analysis | SEC-04 [Medium CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-06) | — | read-only `deployment verify`, `scan`, `payment verify` against Sepolia with a user RPC; outputs recorded (no secrets) (blocks only this row's external gate) |

#### F-CLI-06: CLI merchant commands: refunds, installments, subscriptions, webhooks, split, batch

PARTIAL 80/80 · track POST-BETA · WS-15 (WS-15.1) · CP CP-6 · decision **defer** · est 0-0.1 d · owner —

> G-A verification (CONFIRMED): packages/cli/src/commands/merchant-refund.ts:43-45 `merchant refunds execute` always exits 5 (REFUND_EXECUTION_UNSUPPORTED). (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: refund execute returns the documented UNSUPPORTED exit code (test) | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-CLI: no network call except the explicit --rpc endpoint. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: docs say why | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-CTR-04: ERC-6538 registry integration (canonical singleton used as deployed) + delegated-registration builders (#181) + ENS

IMPLEMENTED_UNVERIFIED 90/85 · track B-NONGATING · WS-24 (WS-24.4) · CP CP-4 · decision **repair** · est 1.5-1.75 d · owner OA-04

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: registry client compares the singleton runtime codehash against a per-chain pin; unknown/mismatch -> registry features disabled (fail closed) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: registry.test.ts mismatch case | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | Codehash pins: keccak256(eth_getCode) vs pinned hex; fixtures cover match, mismatch, empty code and the 0xef0100 delegation designator. | same as IC on the integrated SHA |
| Privacy | RPC requests only to the user-configured primary/secondary providers, never a built-in fallback (P-EGRESS on the pages-devnet journey; request count asserted in unit tests). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | [row] SEC: Sepolia pin from two-provider evidence (B04) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: ADR-0018 matches code (WS-02) | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-SC; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-06) | — | public-testnet registry/ENS acceptance (blocks only this row's external gate) |

#### F-CTR-06: Gas buffer v2 (spec 13) + invoice v2 seller bufferPolicy (ADR-0024)

IMPLEMENTED_UNVERIFIED 95/80 · track POST-BETA · WS-10 (WS-10.5) · CP CP-3 · decision **implement** · est 1.5-2 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | implement: YES: anvil e2e "sweep funded only by buffer"; public-linkage notice assertion | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: anvil test (REQUIRE_ANVIL=1 in CI web shard): v2 invoice bufferPolicy -> payment with buffer -> direct sweep paid only from the buffer succeeds; net to destination asserted <br> [row] TEST: CreateInvoice.buffer.test.tsx asserts the public-linkage notice; fiat estimate hidden when feeds unverified | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-17 [Low MISSING-COVERAGE]; SEC-36 [Info INTENDED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-SC; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | [row] CI: B-RQ-1 |
| External (EX-01) | — | real-chain buffer acceptance (full profile) (blocks only this row's external gate) |

#### F-DEP-05: EVM multichain config + ChainAdapter interface (MULTICHAIN_SPEC tier 1, ADR-0016)

PARTIAL 80/75 · track B-NONGATING · WS-02 (WS-02.5) · CP CP-1 · decision **repair** · est 0.6-1.35 d · owner —

> G-A verification (CONFIRMED): packages/chain-adapters/src/quote.ts:52 FEEDS lists 4 testnet feeds (11155111 ETH/USD, USDC/USD; 84532 ETH/USD, USDC/USD) while TODO-VERIFY.md:29-32 says FEEDS is empty and the app offers no fiat price. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: scripts/testnet/measure-chain-params.mjs (WS-05) read-only, user RPC, mock-RPC unit test | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/chain-adapters` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | RPC requests only to the user-configured primary/secondary providers, never a built-in fallback (P-EGRESS on the pages-devnet journey; request count asserted in unit tests). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: README/TODO-VERIFY consistent with quote.ts FEEDS (WS-02) | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-06) | — | Sepolia finalityDepth/getLogsMaxRange/blockTime measured on chosen providers, dated (blocks only this row's external gate) |

#### F-DOC-01: User docs (docs/user, 20 pages) + guides (docs/guides, 11 pages)

IMPLEMENTED_UNVERIFIED 90/90 · track B-START · WS-02 (WS-02.2) · CP CP-1 · decision **defer** · est 0.25-0.85 d · owner OD-20, OD-16

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | Gated by OD-20, OD-16, EX-04: no new product function before those are recorded; the prep lines in this table are the IC scope; the feature is accepted when its RQ lines hold. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: scripts/tests/privacy-claims.test.mjs (new) passes | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-28 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: docs/user mentions browser history sync of invoice fragments (E-08); E-17 overclaims removed | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-04) | — | native review of translated docs (blocks only this row's external gate) |

#### F-DOC-02: Developer wiki (docs/wiki, 9 pages)

PARTIAL 60/50 · track POST-BETA · WS-02 (WS-02.8) · CP CP-3 · decision **repair** · est 0.7-1.45 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: re-derive wiki pages from current code | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-15 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: qr-colors.md says bearer also wins over testnet/unsigned/unverified (matches qrKinds.test.ts:40-42) <br> [row] DOC: docs/wiki pages updated to current code; no #140 status narration imported | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (owner-provisioned) | — | owner publishes wiki (blocks only this row's external gate) |

#### F-HOST-03: Portable hosting kit: package/verify/preview + nginx/container/Tor/I2P profiles

PARTIAL 80/80 · track POST-BETA · WS-13 (WS-13.4) · CP CP-6 · decision **defer** · est 0-0.75 d · owner OD-07, OD-22, OD-06

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | tools/portable-hosting-kit tests (hosting-kit.yml) exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-02 [High UNVERIFIED]; SEC-24 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: signed release + legal review (owner) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-HOST-04: infra/: devnet, integration, proxy, publish (IPFS/Tor), static web Caddy

IMPLEMENTED_UNVERIFIED 100/40 · track POST-BETA · WS-13 (WS-13.3) · CP CP-6 · decision **repair** · est 0.75-2 d · owner OD-22

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: verify compose files (`docker compose config`), run infra/proxy/check-headers.sh in CI | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `docker compose -f <each infra compose> config -q` exit 0; check-headers.sh against local nginx/Caddy containers | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-26 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | [row] CI: coordinator CI job (C-07) | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | IPFS publish run (blocks only this row's external gate) |

#### F-I18N-02: Locale catalogs: translation completeness and native review

PARTIAL 60/55 · track B-EXIT · WS-12 (WS-12.3) · CP CP-3 · decision **repair** · est 0.75-1 d · owner OD-20, OD-16

> G-A verification (PARTLY-OUTDATED): languages.ts:19-43 lists 24 languages, 4 catalogs ship (apps/web/locales/{ar,en,es,ja}.json), LanguagePicker.tsx:17 renders all 24 -- BUT the "label unshipped" option is already implemented: LanguagePicker.tsx:19-23 appends i18n.picker.noCatalog / machineDrafted notes. Remaining choice = trim (canonical OD-16 recommendation) vs keep labelled. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: trim LANGUAGES picker to shipped locales (en/es/ar/ja) per OD-16 default; the alternative "label unshipped" is ALREADY implemented (LanguagePicker.tsx:19-23 noCatalog/machineDrafted notes) | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-28 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] I18N: LANGUAGES (picker list) == shipped catalogs per OD-16 default, or owner records "keep 24, labelled" (already true); languages.test.ts asserts the chosen rule <br> [row] I18N: `needs review` / machine-drafted metadata stays until native review (EX-04) | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-04) | — | native-speaker review es/ar/ja recorded per locale (blocks only this row's external gate) |

#### F-I18N-03: packages/i18n localisation framework (CLI/library) + CLI i18n check

PARTIAL 60/60 · track POST-BETA · WS-12 (WS-12.6) · CP CP-6 · decision **consolidate** · est 0.75-1.5 d · owner OD-20, OD-16

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | consolidate: YES: ADR: apps/web/src/i18n is the product stack; packages/i18n stays CLI/library; ux-i18n shim retirement candidate (no deletion now) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: CLI i18n check passes on packages/i18n catalogs | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: ADR recorded | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-MER-01: Merchant billing: subscriptions, schedules, installments, refunds, payouts, CSV

PARTIAL 85/85 · track POST-BETA · WS-15 (WS-15.5) · CP CP-6 · decision **defer** · est 3.75-7.5 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: library tests stay green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-MER-02: Merchant ledger: reconciliation + accounting/tax exports

PARTIAL 80/65 · track POST-BETA · WS-15 (WS-15.2) · CP CP-6 · decision **consolidate** · est 2.25-3.75 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: one reconciliation model; ledger exports derived from it | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: parity tests web vs ledger outputs | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-NET-01: Transport profiles: direct/Tor SOCKS5h/local-proxy/OHTTP framing + browser fetch transport

PARTIAL 80/65 (H1 rescoring; was IMPLEMENTED_UNVERIFIED 100/80) · track B-START · WS-01 (WS-01.2) · CP CP-1 · decision **repair** · est 1.25-2.25 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: OHTTP framing vectors; honest Tor copy check; wss rejection (E-06) in the same package | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: OHTTP framing encode/decode vectors (RFC 9458 test vector if usable) in net-transport tests | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | [row] PRIV: fetch transport: credentials omit, no-store, no-referrer asserted | same as IC on the integrated SHA |
| Security analysis | SEC-10 [Medium CONFIRMED]; SEC-19 [Low CONFIRMED]; SEC-41 [Info UNVERIFIED]; SEC-45 [Info SUSPECTED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: Tor-browser copy says the page cannot verify Tor | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-WEB; author != reviewer. | [row] REVIEW: RV-WEB |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-02, EX-07) | — | real Tor Browser route (E-18) (blocks only this row's external gate) |

#### F-OPS-03: sandbox / test mode: deterministic mock chain, faucet, clock, fault injection

PARTIAL 70/70 · track POST-BETA · WS-16 (WS-16.3) · CP CP-6 · decision **defer** · est 1.75-3.75 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: sandbox tests green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-PROTO-05: Announcer spam & anonymity-set bounds (spec 05)

IMPLEMENTED_UNVERIFIED 90/80 · track B-EXIT · WS-10 (WS-10.2) · CP CP-3 · decision **implement** · est 0.75-1.35 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: Pay renders the spec 05 2C hint under the conditions spec 05 names; no network call | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: Pay.test.tsx case | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-22 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: seller privacy guide link checked | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-06) | — | thresholds (20/200, 25 %, 2,000 blocks) checked against real Sepolia volume (blocks only this row's external gate) |

#### F-WEB-05: Gas buffer UI: v1 payer buffer (lean+full) and v2 seller policy (full)

IMPLEMENTED_UNVERIFIED 90/75 · track B-START · WS-10 (WS-10.1) · CP CP-3 · decision **repair** · est 0.45-1.1 d · owner —

> G-A verification (CONFIRMED): apps/web/src/lib/pay.ts:252-255 bufferOffered() is true for every v1 ERC-20 invoice in both profiles; Pay.tsx:1190 renders the buffer option; docs/pages/README.md:61 and docs/pages/RELEASE_MATRIX.md:24 say the lean build has no payer gas buffer (TB-07). (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: docs match code (lean offers v1 payer buffer; Pay.tsx:1190); port B1b lean probe test | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: lean payer-buffer unit test (lean + full configs) | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: docs/pages/RELEASE_MATRIX.md + README state the lean v1 payer buffer (WS-04) | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External (EX-01) | — | allowlisted ERC-20 buffer journey on Sepolia (B06) (blocks only this row's external gate) |

#### F-WEB-23: Home / About / help pages / contextual help (lost-click fix)

IMPLEMENTED_UNVERIFIED 100/85 · track B-START · WS-02 (WS-02.1) · CP CP-1 · decision **repair** · est 0.75-1.1 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: claims review vs E-17; banned-phrase test | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: scripts/tests/privacy-claims.test.mjs: no unqualified "anonymous/untraceable/unlinkable/Monero-like/hides which seller" in en.json, help.html, privacy.html, docs/user, README.md | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-18 [Low CONFIRMED]; SEC-29 [Low UNVERIFIED]; SEC-30 [Low INTENDED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: E-17 strings fixed: en.json:1100 and :11/:2138 (coordinator), docs/developer/api/policy-scheme.md:233, docs/pages/README.md:48-49 (WS-04), README.md:5 | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-WEB; author != reviewer. | [row] REVIEW: human copy sign-off recorded |
| CI gates | B-RQ-1 on the exact integrated SHA. | B-RQ-1 on the exact integrated SHA. |
| External | — | none |

### 4.3 full-profile (18)

#### F-BTC-03: BTC light-client scanning: BlindBit HTTP + gRPC-Web, own-node Esplora, 2-oracle cross-check, worker

IMPLEMENTED_UNVERIFIED 90/80 · track POST-BETA · WS-14 (WS-14.5) · CP CP-6 · decision **defer** · est 1.75-3.5 d · owner OD-20, OD-21

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: gRPC-Web opt-in fixture suites green | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Derivation/envelope bytes unchanged unless the row says otherwise: `npm test -w packages/core-crypto` exit 0 and V-IND `indep-vectors.cjs` vectors=6 ok=6 bad=0. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-CRYPTO; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07, EX-02) | — | real BlindBit server + device acceptance (blocks only this row's external gate) |

#### F-DOC-03: Operator docs (docs/operators, 17 pages): runbooks, relayer, monitoring, release, rollback

PARTIAL 50/50 · track POST-BETA · WS-13 (WS-13.5) · CP CP-9 · decision **defer** · est 0-0.75 d · owner OA-04

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test` for every touched workspace exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | privacy-claims test passes (no unqualified anonymity/untraceable/Monero-like claims). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-DOC; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | testnet-runbook.md dry-run notes captured during B02; others on operator infra (blocks only this row's external gate) |

#### F-HOST-01: Self-host recipe: docker-compose + nginx + relayer image + selfhost.sh

PARTIAL 70/45 · track POST-BETA · WS-13 (WS-13.1) · CP CP-6 · decision **repair** · est 1.25-2.25 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: digest-pin images (E-15), `docker compose config` + header conformance in CI | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: compose config valid; nginx headers conformance; /metrics never routed | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | [row] SEC: every FROM/image: pinned by digest; dependabot docker entries requested (coordinator) <br> SEC-26 [Low CONFIRMED]; SEC-34 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | operator live deploy with TLS + HSTS at terminator (blocks only this row's external gate) |

#### F-HOST-02: Tor onion service for the static bundle

PARTIAL 60/45 · track POST-BETA · WS-13 (WS-13.2) · CP CP-6 · decision **repair** · est 1.25-2 d · owner OD-22

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: onion config smoke (container builds, torrc lint, no single-hop, no keys in repo) | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: tor image builds; torrc lint; HiddenServicePort -> web:8080; no keys in repo (scan) | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-26 [Low CONFIRMED]; SEC-41 [Info UNVERIFIED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07, EX-02) | — | onion reachability + Tor Browser QA (E-18) (blocks only this row's external gate) |

#### F-INT-01: WooCommerce gateway plugin (payment-link redirect flow)

PARTIAL 85/75 · track POST-BETA · WS-15 (WS-15.3) · CP CP-6 · decision **defer** · est 2.75-5.5 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: integrations/woocommerce/tests/run.php green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | live WordPress/WooCommerce run (blocks only this row's external gate) |

#### F-INT-02: PrestaShop module

PARTIAL 60/60 · track POST-BETA · WS-15 (WS-15.4) · CP CP-6 · decision **defer** · est 2.25-3.75 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: integrations/prestashop/tests/run.php green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | real PrestaShop 8 + validator (blocks only this row's external gate) |

#### F-KEY-05: Tag archive backup/restore + combined BackupPanel (spec 08)

IMPLEMENTED_UNVERIFIED 90/90 · track POST-BETA · WS-07 (WS-07.2) · CP CP-2 · decision **repair** · est 0.7-1.5 d · owner OD-01

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: archive export requires the same step-up as keystore export; wrong/missing factor refused | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: TagArchive.test.tsx cases; backup-panel.spec.ts (full) | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Derivation/envelope bytes unchanged unless the row says otherwise: `npm test -w packages/core-crypto` exit 0 and V-IND `indep-vectors.cjs` vectors=6 ok=6 bad=0. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-05 [Medium CONFIRMED]; SEC-22 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-CRYPTO; author != reviewer. | [row] REVIEW: RV-CRYPTO |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-MER-04: Merchant m-of-n multisig approvals

PARTIAL 60/60 · track POST-BETA · WS-15 (WS-15.6) · CP CP-6 · decision **defer** · est 2.5-4.5 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: library tests green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-OPS-01: ops-monitor: read-only chain anomaly probes + bounded release-asset streaming

PARTIAL 80/75 · track POST-BETA · WS-13 (WS-13.6) · CP CP-9 · decision **defer** · est 0.75-1.75 d · owner OA-04

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `systemd-analyze verify` on the unit/timer (if available) or static lint | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | read-only anomaly probes against Sepolia deployment (blocks only this row's external gate) |

#### F-POOL-04: Pool withdrawal relayer service (node:http)

EXPERIMENTAL 100/60 · track POST-BETA · WS-16 (WS-16.5) · CP CP-6 · decision **defer** · est 5-10 d · owner OD-21

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/pool-relayer` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-PROTO-11: Scan-source abstraction (range / indexer-tor / pir2 / light-client / quorum)

EXPERIMENTAL 70/70 · track POST-BETA · WS-16 (WS-16.4) · CP CP-6 · decision **defer** · est 4-10 d · owner OD-21

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: scan-source suites green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | [row] PRIV: createScanSource never falls back; describeScanMode honest | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-PROTO-12: SDK programmatic API (@ghostpay/sdk)

PARTIAL 45/45 · track POST-BETA · WS-15 (WS-15.7) · CP CP-6 · decision **defer** · est 1.25-3.5 d · owner OD-20

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: sdk tests green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-RLY-01: Optional relayer: quote/sweep API, fee policy, permit failure classes

IMPLEMENTED_UNVERIFIED 95/80 · track POST-BETA · WS-11 (WS-11.2) · CP CP-3 · decision **repair** · est 0.25-0.35 d · owner —

> G-A verification (CONFIRMED): .github/workflows/ci.yml:198-223 ts-test-relayer builds contract artifacts and runs `npm test -w apps/relayer` with REQUIRE_ANVIL=1. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | repair: YES: record anvil e2e evidence (CI ts-test-relayer runs e2e.anvil with REQUIRE_ANVIL=1, green in 44242366118); local run | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: `REQUIRE_ANVIL=1 ANVIL_BIN=$(command -v anvil) npm test -w apps/relayer` exit 0 locally (Foundry 1.8.5); CI job id recorded | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | SEC-34 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | funded hot-key testnet run (operator) (blocks only this row's external gate) |

#### F-RLY-04: relayer-guard: breaker, trusted-proxy IP, /64 buckets, limiter, loss budget, challenge

PARTIAL 60/60 · track POST-BETA · WS-16 (WS-16.2) · CP CP-6 · decision **defer** · est 1.5-2.75 d · owner —

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: relayer-guard suites green | same as IC on the integrated SHA |
| Browser | n/a: no browser surface (gap stated explicitly). | same as IC on the integrated SHA |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | No new egress, telemetry or secret-bearing log (reviewer checks the diff). | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-REL; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-07) | — | run behind a real proxy (blocks only this row's external gate) |

#### F-SOL-01: Solana dual-key ed25519 stealth (solana-stealth) wired to web full profile

EXPERIMENTAL 60/50 · track POST-BETA · WS-14 (WS-14.1) · CP CP-6 · decision **consolidate** · est 4.5-8.5 d · owner OD-20, OD-02

> G-A verification (CONFIRMED (TB-08) + UNBLOCK-CORRECTION): solana-stealth st:sol: (meta-address.ts:10) vs chain-solana gpsol: (keys.ts:10); shared memo prefix gpst1: with base58 vs base64url encodings (announcement.ts). Registry made consolidation wait on lost OD-14 (=OD-20); canonical BLOCKERS TB-08 says the format consolidation is engineering-removable -> unblocked=true for the format fix, promotion still waits OD-20/OD-02. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | consolidate: YES: pick one Solana stealth format (solana-stealth vs chain-solana gpsol:/gpst1) before any claim (OD-20) | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/solana-stealth`, `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Derivation/envelope bytes unchanged unless the row says otherwise: `npm test -w packages/core-crypto` exit 0 and V-IND `indep-vectors.cjs` vectors=6 ok=6 bad=0. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-13 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-CRYPTO; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-TRX-01: Tron stealth adapter (tron-adapter) wired to web full profile

EXPERIMENTAL 70/60 · track POST-BETA · WS-14 (WS-14.2) · CP CP-6 · decision **consolidate** · est 4.5-8.5 d · owner OD-20, OD-02

> G-A verification (CONFIRMED (TB-08) + UNBLOCK-CORRECTION): tron-adapter st:trx:0x (meta.ts:17) vs chain-tron st:eth:0x via core-crypto encodeMetaAddress (stealth.ts:47, adapter.ts:126); unblocked as for F-SOL-01. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | consolidate: YES: unify meta-address tag (tron-adapter st:trx:0x vs chain-tron st:eth:0x) (OD-20) | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w packages/tron-adapter`, `npm test -w apps/web` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | Derivation/envelope bytes unchanged unless the row says otherwise: `npm test -w packages/core-crypto` exit 0 and V-IND `indep-vectors.cjs` vectors=6 ok=6 bad=0. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-13 [Low CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | SEC delta recorded on the integrated SHA (RQ-5) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Public formats, CLI flags and exit codes unchanged unless versioned and documented. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-CRYPTO; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External | — | none |

#### F-WEB-02: Fiat-quote invoices and price-feed UI (spec 03)

IMPLEMENTED_UNVERIFIED 90/80 · track POST-BETA · WS-10 (WS-10.4) · CP CP-3 · decision **repair** · est 1.5-2.5 d · owner —

> G-A verification (CONFIRMED): apps/web/src/lib/pay.ts:192-196 calls readPrice(..., {now, expectedDecimals, maxAgeSeconds}) with no sequencerFeed; quote.ts:181-214 supports sequencerFeed + 3600 s grace; FEEDS (quote.ts:52) includes Base Sepolia 84532 (opStack: true in chains.ts:42) ETH/USD and USDC/USD. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | [row] FUNC: OP-stack fiat quote refused when sequencer down or inside grace; reference deviation and USD-peg checks applied when configured | same as IC on the integrated SHA |
| Unit/integration tests | [row] TEST: pay.test.ts: sequencer down -> refuse; grace -> refuse; up -> quote; deviation > threshold -> refuse | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | No SEC id mapped; reviewer records "no new attack surface" or files a new SEC id. | same as IC on the integrated SHA |
| Regression | [row] REG: lean excludes fiat (localBuildProfile.test.mjs) | same as IC on the integrated SHA |
| Docs | Behaviour/doc parity: affected doc updated or "no doc change" recorded in the PR. | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | RV-WEB; author != reviewer. | [row] REVIEW: RV-WEB |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-06) | — | fork/testnet acceptance per enabled feed (blocks only this row's external gate) |

#### F-WEB-18: Embed SDK checkout (popup default, opt-in iframe postMessage handshake)

IMPLEMENTED_UNVERIFIED 95/95 · track POST-BETA · WS-01 (WS-01.3) · CP CP-9 · decision **defer** · est 0.55-1.25 d · owner OD-07

> G-A verification (CONFIRMED): apps/web/src/lib/embedHost.ts:8 names deploy/nginx/embed-frame.conf; deploy/nginx contains only nginx.conf, security-headers.conf, security-headers-embed.conf. (G-A, @7a620ff1)

| Category | IC (implementation-complete) | RQ (release-qualified) |
|---|---|---|
| Functional | No functional change this phase (defer); current behaviour kept and the open requirement stays listed as open in the matrix. | same as IC on the integrated SHA |
| Unit/integration tests | `npm test -w apps/web`, `docker compose -f <deploy compose file> config -q` exit 0 with the new/changed cases. | same as IC on the integrated SHA |
| Browser | Playwright lean + full suites green (baseline lean 66/3 skipped, full 78/1); Chromium now; Firefox/WebKit at RQ via C-06. | Firefox + WebKit via C-06 where supported |
| Crypto verification | n/a: no key material or signatures touched. | same as IC on the integrated SHA |
| Privacy | P-EGRESS + P-STORE + P-URL + P-LOG on the touched flow. | same as IC on the integrated SHA |
| Security analysis | SEC-10 [Medium CONFIRMED]; SEC-18 [Low CONFIRMED]; SEC-24 [Low CONFIRMED]; SEC-26 [Low CONFIRMED]; SEC-43 [Info CONFIRMED]: each fixed + tested or still open with its OD/TB id recorded. | [row] SEC: release publishes embed v2 SHA-384 SRI + hash in signed release notes (after OD-07) |
| Regression | `npm run typecheck` + `npm run lint` exit 0; touched workspaces' full suites; no baseline count drops (IC-3). | same as IC on the integrated SHA |
| Docs | [row] DOC: embedHost.ts:8 names deploy/nginx/security-headers-embed.conf (WS-01, W2) | same as IC on the integrated SHA |
| Compatibility | Lean/full guard 33/33; invoice v1/v2, keystore v1 and stored-data formats readable unchanged. | same as IC on the integrated SHA |
| Independent review | self-review checklist (code-quality) before requesting RV | RV-WEB; author != reviewer. |
| CI gates | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. | Owning workflow green on the WS head (ci.yml shard / cli-operator / hosting-kit / integration) and B-RQ-1 at integration. |
| External (EX-02, EX-07) | — | real merchant sites/browsers (blocks only this row's external gate) |

## 5. Experimental (44) and future (43) rows, grouped by theme

Default for every row here: **keep separate** (never beta-core; WS-90 unless a confirmed defect routes a fix elsewhere). A row is promoted (to beta-supporting/full-profile or to a scheduled WS) only when ALL theme "Promote" criteria hold; until then only "Keep separate" criteria apply and they are checked at every checkpoint.

Keep-separate criteria common to all experimental rows (KS):

- KS-1 Lean: the package/feature stays out of the lean build. Guarded today: features/{btc,solana,tron,policy}, btc-silent-payments, btc-family, btc-payjoin, chain-solana, chain-tron, chain-evm-extra, solana-stealth, tron-adapter, policy-scheme, pool-*, external-pools*, pir-* (`apps/web/scripts/localBuildProfile.mjs:118-123`, VERIFIED). Not in the regex but unimported by apps/web and packages/cli (VERIFIED grep): ux-*, privacy-pipeline, privacy-profiles, metadata-hardening, amount-blur, hops, hygiene, donation, plugin-api, payer-sponsor, confidential-amounts. Any first import must add the package to the regex with a test case.
- KS-2 Tests: package suites stay green where they run; suites that skip in PR CI (TB-09: pool-circuits, payer-sponsor, railgun, privacypools, pool-relayer, examples, experimental models) get a scheduled job (WS-20.2) before any promotion claim.
- KS-3 Copy: README banner "experimental / testnet-only / not release-qualified"; no product copy claims the capability (privacy-claims test, F-WEB-23).
- KS-4 No default network, no default operator dependency, contracts frozen (`packages/contracts/src/**`) unless an OD decision unfreezes them.

Future rows (KS-F): no apps/web or packages/cli code for the item; spec text stays under docs/future or docs/specs/ideas labelled proposed; overlaps with shipped modules recorded in `maps_to`.

### TH-AA: Scheme-2 policy accounts / account abstraction (ADR-0014: out of releases) (6)

Decision: defer; keep separate (flag OFF, lean-excluded); decision packets first (NEXT_PHASE_QUEUE D03/D04); never beta-core.

Promote only when (all):
- SEC: OD-05 recorded; option (a) = salt-only ABI (reference content 50881e47, ancestor, later regressed) applied in lockstep to packages/contracts GhostPayPolicyRouter + packages/policy-scheme calldata + packages/payer-hiding-contracts RouterCall.sol; packages/contracts/test/audit/Review24.audit.t.sol inverted to assert calldata carries no seller-constant policyHash
- SEC: OD-04 recorded and implemented (zero-fee factory for upgradeable/fee-switch tokens or non-upgradeable token allowlist); test: failing fee-token views / fee-switch delta never freeze counterfactual funds (SEC-07)
- SEC: OD-11 per-chain MIN_DELAY floors from source-verified forced-inclusion windows + tests (SEC-12); OD-03 Mythril factory records re-dispositioned on the changed bytecode
- REVIEW: RV-SC Tier S review + EX-05 independent audit BEFORE any deployment; ADR-0027 gates 1-6 evidence; owner broadcast on a public testnet with B02-B04-equivalent evidence

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-AA-01 | Scheme-2 policy-guarded account contracts (PolicyAccount, PolicyAccountFactory,  | EXPERIMENTAL 85/85 | defer / WS-90 | `forge test` packages/contracts stays 490/490 (CI contracts-test); no src change without an OD decision: `git diff --exit-code <base> -- packages/contracts/src` | OD-05, OD-04, OD-11, OD-12, OD-14, OD-03; EX-05 | Two CONFIRMED Medium defects (SEC-06 AUD24-01 policy-hash linkability, SEC-07 N1 fee-token freeze) are owner-gated; contracts stay undeployed (fail-closed defau |
| F-AA-02 | Policy-scheme client (scheme-2 derivation, gp2 meta-address, limits tree, EIP-71 | EXPERIMENTAL 80/80 | defer / WS-90 | `npm test -w packages/policy-scheme` (vectors/properties/negative) green; anvil.test.ts runs under REQUIRE_ANVIL in CI rest shard | OD-05, OD-20; EX-01 | Client follows the contract ABI; any AUD24-01 fix changes calldata, so client completion (public pins, scheme-2 invoice, gate 4) waits for OD-05. |
| F-AA-03 | F-SECURE factory flat fee + fee-token handling (N1 freeze residual) | BLOCKED 55/55 | defer / WS-90 | KS-1..KS-4 | OD-04, OD-03, OD-11; EX-05 | BLOCKED on OD-04 (PROMOTION_PACKET blocker 3); scheme 2 undeployed so the freeze residual is not exposed. |
| F-AA-04 | EIP-7702 / ERC-4337 / ERC-7579 account-abstraction path (spec 15) | BLOCKED 15/0 | defer / WS-90 | KS-1..KS-4 | OD-13, OD-12, OD-05; EX-05 | Spec 15 path (7702/4337/7579) has 15 % code and no tests; delegation persistence (SEC-35) and chain-id-0 replay need OD-13 first. |
| F-AA-05 | Policy-account recovery / guardian (spec 16, ADR-0023, ADR-0028) | BLOCKED 30/15 | defer / WS-20 (bucket WS-90; WS-20.2) | `node --test scripts/experimental/policy-recovery/model.test.mjs` exit 0; optional nightly wiring with TB-09 (coordinator C-07) | OD-12; EX-05 | Guardian recovery needs an accepted authority model (ADR-0028 Unaccepted); recommendation = reject for beta (OD-12). Model tests exist but are wired into no CI  |
| F-WEB-15 | Policy-account UI (scheme 2 / EIP-7702, experimental) | EXPERIMENTAL 60/60 | defer / WS-90 | PolicyView.guard.test.tsx + paymentEvidence tests green (full profile); flag default OFF asserted | OD-05, OD-12, OD-04, OD-03, OD-13 | UI is gated by every scheme-2 decision (OD-05, OD-12, OD-04, OD-03, OD-13); flag OFF and lean-excluded today. |

### TH-MC: Alternative-chain PoCs (Solana/TRON CLI ports, BTC family, PayJoin, extra EVM chains) (5)

Decision: defer + keep separate; EXCEPT the confirmed TB-08 format split (F-SOL-02/F-TRX-02) which is consolidated with F-SOL-01/F-TRX-01 in WS-14.

Promote only when (all):
- SEC: OD-20 promotion decision recorded per chain family; OD-02 seed/raw-key reveal aligned to re-auth + no clipboard (SEC-13) before any promotion
- CRYPTO: one canonical format per chain with committed vectors re-derived by an independent implementation
- TEST: regtest/devnet acceptance in .github/workflows/integration.yml (bitcoind regtest, solana-test-validator) green on exact SHA

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-BTC-04 | BTC family engine (LTC/DOGE etc. SP w/ ChainParams) — standalone | EXPERIMENTAL 40/40 | defer / WS-90 | KS-1..KS-4 | OD-20; EX-07 | Standalone duplicate engine, not imported anywhere; BTC itself is full-profile and deferred (F-BTC-01). |
| F-BTC-05 | BTC PayJoin BIP-78 policy core + v1 HTTP transport (+ optional BIP-77 ffi, unver | EXPERIMENTAL 60/45 | defer / WS-90 | KS-1..KS-4 | OD-21, OD-20; EX-07 | PayJoin receiver requires a server; constraint 2 allows it only as optional (OD-21). BIP-77 adapter unverified. |
| F-EVMX-01 | Extra EVM chain manifests + fail-closed verifier (Linea, Scroll, zkSync ... 12 c | EXPERIMENTAL 55/55 | defer / WS-90 | zkSync non-standard CREATE2 stays rejected (chain-evm-extra tests) | OD-20; EX-06 | Config-only, every chain enabled:false; promotion needs the same B02-B04 evidence per chain. |
| F-SOL-02 | chain-solana alt stealth PoC (CLI only) | EXPERIMENTAL 40/40 | consolidate / WS-14 (bucket WS-90; WS-14.1) | cross-package vector test: CLI-encoded meta-address and memo == solana-stealth encoding for every test-vectors/solana-stealth.json case; decoding a legacy `gpsol:` / base64url `gpst1:` string fails with a fixed error code; `npm test -w packages/chain-solana -w packages/solana-stealth -w packages/cli` exit 0 | OD-20, OD-02 | paired with F-SOL-01 (work counted there) |
| F-TRX-02 | chain-tron alt PoC (CLI only) | EXPERIMENTAL 40/40 | consolidate / WS-14 (bucket WS-90; WS-14.2) | TRON vectors: CLI and web derive identical stealth addresses from one meta-address; `st:eth:` on a TRON command -> fixed error; `npm test -w packages/chain-tron -w packages/tron-adapter -w packages/cli` exit 0 | OD-20, OD-02 | paired with F-TRX-01 (work counted there) |

### TH-EXT: Extension points (plugin API, optional developer donation) (2)

Decision: defer; keep separate; explicit opt-in design before any wiring.

Promote only when (all):
- SEC: OD-20 scope decision; capability sandbox deny-by-default proven by conformance tests (examples/plugin-conformance)
- PRIV: donation strictly opt-in, itemised in the pay review, never default; manifest schema change reviewed (RV-REL)

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-INT-04 | Plugin/extension API (privacy options) + conformance example | EXPERIMENTAL 55/55 | defer / WS-90 | `node --test examples/plugin-conformance/conformance.test.mjs` exit 0 (add to CI with TB-09) | OD-20 | No app consumes the plugin API; conformance example passes locally but is not in CI (TB-09). |
| F-MER-07 | Optional itemised developer donation | EXPERIMENTAL 40/40 | defer / WS-90 | KS-1..KS-4 | OD-20 | Donation must be opt-in and itemised; no manifest field (donationRecipient) exists. |

### TH-PRIV: Client-side privacy option packages + operator-assisted private scanning (7)

Decision: defer; keep separate; consolidate overlapping helpers into apps/web privacy hardening only after beta exit.

Promote only when (all):
- PRIV: each option names the one leak it reduces and what stays public; Off by default; no I/O without an explicit user-selected provider; Playwright egress walk ($SP/final/evidence/teams/E/scripts/egress_walk.mjs pattern) shows no new host
- TEST: consuming view has unit + Playwright coverage (lean and/or full as decided); lean guard decision recorded
- SEC: OD-21 for anything needing an always-on operator (hops relayer, PIR servers); OD-20 scope decision for UI exposure

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-NET-03 | PIR two-server XOR private scan (pir2 scan mode, default OFF) | EXPERIMENTAL 40/40 | defer / WS-90 | createScanSource never falls back from pir2; default OFF asserted (scan-source tests) | OD-21; EX-07 | pir2 requires two non-colluding operator-run servers (optional only, constraint 2); scan-source ships in lean but pir2 UI is not wired. |
| F-OPS-02 | hygiene: own-leak hygiene options (HY-DST/CON/VER/BUF/FUND) | EXPERIMENTAL 45/45 | defer / WS-90 | KS-1..KS-4 | OD-20; EX-05 | Own-leak hygiene helpers unwired; option B is a contract change. |
| F-PRIV-01 | Privacy pipeline (chain steps, cost/leak preview, run) | EXPERIMENTAL 50/50 | defer / WS-90 | KS-1..KS-4 | OD-20 | Pure orchestrator over unwired method packages; testnet only. |
| F-PRIV-02 | Privacy profiles catalogue/presets/conflict rules | EXPERIMENTAL 60/60 | defer / WS-90 | KS-1..KS-4 | OD-20 | No-I/O catalogue; matrix suggested consolidate, but merging during beta touches lean privacy UI; post-beta. |
| F-PRIV-03 | Metadata hardening MH-* helpers | EXPERIMENTAL 60/60 | defer / WS-90 | KS-1..KS-4 | OD-20 | Duplicate of separately implemented web hardening; consolidate after beta exit with parity tests. |
| F-PRIV-04 | Amount blur (split/round/jitter, Off by default) | EXPERIMENTAL 60/60 | defer / WS-90 | KS-1..KS-4 | OD-20 | Friction, not anonymity; Off by default; unwired. |
| F-PRIV-05 | Delayed multi-hop forwarding (Weak) | EXPERIMENTAL 80/60 | defer / WS-90 | KS-1..KS-4 | OD-21, OD-20 | Labelled Weak; requires a long-lived client or operator relayer, conflicting with the static model unless the tab stays open. |

### TH-POOL: Shielded pools, external pools, payer hiding, confidential amounts (testnet PoCs) (9)

Decision: defer; keep separate (testnet-only, insecure dev ceremony, third-party/operator services); never beta-core.

Promote only when (all):
- SEC: EX-05 independent audit of circuits + contracts; real multi-party trusted-setup ceremony replaces the deterministic dev beacon (F-POOL-01)
- SEC: OD-21 recorded: any relayer/broadcaster/KMS stays optional, user-selected, never required by lean; egress allowlist + browser egress test for every third-party host
- TEST: anvil/circuit suites execute (not skip) in a scheduled job (TB-09; coordinator C-07): pool-circuits 59 skipped -> 0, payer-sponsor/railgun/privacypools REQUIRE_ANVIL=1 green
- PRIV: copy never claims anonymity (SEC-28 privacy-claims test); leak preview states what the pool/sponsor/relayer still sees

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-POOL-01 | Shielded pool circuits (circom Groth16, withdraw/commitment) — INSECURE dev cere | EXPERIMENTAL 35/15 | defer / WS-90 | pool-circuits: 18 pass / 59 skipped locally (circuits not built); INSECURE banner stays | OD-20; EX-05 | Deterministic public-beacon dev ceremony: anyone can forge proofs (documented, intended for testnet). Needs MPC ceremony + circuit audit. |
| F-POOL-02 | Shielded pool contracts (GhostPayShieldedPool ERC20/Native, ASP registry) | EXPERIMENTAL 35/15 | defer / WS-90 | `forge test` packages/pool-contracts 86/86 (CI contracts-extra pool) | OD-20; EX-05 | Contracts depend on insecure verifiers; never deployed; analyzer scope excludes pool contracts (SEC-17). |
| F-POOL-03 | Pool prover + pool SDK (client side proving, Poseidon, note mgmt) | EXPERIMENTAL 50/50 | defer / WS-16 (bucket WS-90; WS-16.1) | SEC-16: pool-sdk seed backup uses the keystore passphrase policy (OD-09 floor) before promotion | OD-20, OD-09 | Client proving testnet-only; zkey artifacts would bloat the static app; SEC-16 (Low CONFIRMED) weak seed backup. |
| F-POOL-05 | External pools adapter interface (Privacy Pools, Railgun) — shared machinery | EXPERIMENTAL 40/40 | defer / WS-90 | KS-1..KS-4 | OD-20, OD-21; EX-07 | Shared adapter interface; nothing run against real pools. |
| F-POOL-06 | Privacy Pools (0xbow) adapter | EXPERIMENTAL 100/60 | defer / WS-90 | REQUIRE_ANVIL=1 anvil integration green in a scheduled job (C-07) | OD-21, OD-20; EX-07 | Adapter complete (100) but anvil integration never runs in PR CI (TB-09); third-party relayer dependency (OD-21). |
| F-POOL-07 | Railgun adapter | EXPERIMENTAL 50/50 | defer / WS-90 | KS-1..KS-4 | OD-21, OD-20; EX-07 | Railgun broadcasters (Waku) are third-party infrastructure not self-hostable client-side. |
| F-POOL-08 | Payer-hiding contracts PH-2 PayRelay / PH-3 7702 delegate / PH-4 4337 account+pa | EXPERIMENTAL 50/25 | defer / WS-90 | `forge test` packages/payer-hiding-contracts 109/109 (CI contracts-extra payer-hiding) | OD-13, OD-21; EX-05 | PH-2/3/4 contracts: sponsor sees everything (no payer anonymity claim); SPONSOR_ADMIN role; 7702 delegation persistence (SEC-35) needs OD-13. |
| F-POOL-09 | Confidential amounts client (ERC-7984 / Zama fhEVM backend) + confidential contr | EXPERIMENTAL 60/45 | defer / WS-90 | confidential-contracts hardhat suite green in CI (152 s on 7a620ff1); confidential-amounts vitest green | OD-21, OD-20; EX-07 | CT-1 PoC on Zama fhEVM needs a third-party relayer/KMS; mainnets refused; not wired. |
| F-RLY-05 | payer-sponsor: payer-address hiding modes + testnet sponsor core | EXPERIMENTAL 60/40 | defer / WS-90 | payer-sponsor anvil e2e green with artifacts in a scheduled job (C-07); 135/4 skipped today | OD-13, OD-21 | Sponsor core + payer-hiding modes; anvil e2e never runs in PR CI (TB-09); docs already honest about limits. |

### TH-UX: ux-* support libraries (unconsumed) (15)

Decision: defer; keep separate; wire-or-retire per concrete feature need; no deletion now (constraint 5).

Promote only when (all):
- FUNC: a named feature row needs it: import from apps/web (or CLI), remove the duplicate in-app helper, decide lean vs full (lean: bundle scan allow + egress test; full: add to lean deferred regex)
- TEST: consuming view covered by unit + Playwright tests; package suite >= 1 meaningful test per exported function
- PRIV: no new network, storage, notification or clipboard path without RV-WEB privacy review
- I18N: user-facing strings via apps/web/locales keys allocated by the coordinator (en/es/ar/ja)
- FUNC: a concrete consumer row is named and scheduled (per-ID candidate consumer below).

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-UX-01 | ux-connect: wallet connect compat, WalletConnect session grammar, hardware-signe | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-connect is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-WEB-03 wallet connect (WalletConnect adds a remote relay |
| F-UX-02 | ux-core: netstate, theme, palette, store (pure UX core) | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-core is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: AppShell theme/netstate (apps/web/src/AppShell.tsx). |
| F-UX-03 | ux-export: structured export encoder/parser/import with formula neutralisation | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-export is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-MER-02 accounting exports (CSV formula neutralisation). |
| F-UX-04 | ux-fees: fee preview, cheapest route, timing | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-fees is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: Pay fee preview (apps/web/src/views/Pay.tsx). |
| F-UX-05 | ux-fiat: BigInt fiat display + rate validation/state machine | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-fiat is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-WEB-02 fiat display. |
| F-UX-06 | ux-flow: return URLs, embed, proof, reconcile, undo | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-flow is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-WEB-18 embed return URLs / F-FUT-20. |
| F-UX-07 | ux-guide: onboarding checklist, profiles, questionnaire validation (PR #127/#133 | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-guide is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-WEB-23 onboarding / F-FUT-38 explainer. |
| F-UX-08 | ux-intake: address/deeplink/NL amount/QR payload intake | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-intake is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: Pay intake / F-PROTO-10 QR. |
| F-UX-09 | ux-links: payment links, handles, address book, tip, URI | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-links is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-FUT-14 private payment links. |
| F-UX-10 | ux-notify: notification manifest, redaction, URL safety, reminder bridge | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-notify is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: reminders (notifications need privacy review). |
| F-UX-11 | ux-presets: pay-again presets, sealed store | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-presets is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: pay-again presets. |
| F-UX-12 | ux-privacy: privacy score + policy | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-privacy is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-PRIV-02 / F-FUT-29 privacy modes. |
| F-UX-13 | ux-receipts: receipt parse/render/verify/disclose | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-receipts is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-FUT-16 / F-FUT-36 receipts. |
| F-UX-14 | ux-schedule: recurrence, schedule templates, advancing-clock expiry guard (PR #1 | EXPERIMENTAL 55/45 | defer / WS-90 | KS-1..KS-4 | OD-20 | @ghostpay/ux-schedule is imported by neither apps/web nor packages/cli (VERIFIED); candidate consumer: F-MER-01 recurring billing / F-FUT-21. |
| F-UX-15 | ux-i18n and ux-sandbox: deprecated thin re-export shims | EXPERIMENTAL 50/50 | defer / WS-90 | zero-consumer proof recorded: `grep -rl "@ghostpay/ux-i18n\/@ghostpay/ux-sandbox" apps packages --include=*.ts --include=*.tsx` lists only the shims themselves | — | Thin re-export shims (2 tests each) with zero consumers (VERIFIED grep). |

### TH-FUT-OTHER: Other future scope (hosted BTC scan, milestone escrow, Shopify, address-book vault) (4)

Decision: defer; keep separate; F-FUT-41 stays absent by design.

Promote only when (all):
- SEC: owner decision recorded (OD-20 / OD-17 / NEXT_PHASE_QUEUE D05 as listed per row); custody or server-side key exposure never introduced (constraints 1-3)

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-AA-06 | GhostMilestones escrow (spec 17) | BLOCKED 15/15 | defer / WS-90 | `node --test scripts/experimental/milestone-escrow/model.test.mjs` exit 0 (not in CI) | OD-20; EX-05 | scripts/experimental/milestone-escrow (model only) |
| F-FUT-41 | Hosted BTC scan service (mode C / Frigate-style) | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-21, OD-20 | btc-silent-payments/scan (F-BTC-03) |
| F-INT-03 | Shopify integration | PARTIAL 50/0 | defer / WS-90 | KS-F | OD-17, OD-20 | integrations/shopify (stub) |
| F-KEY-14 | ux-vault encrypted address book / multi-profile vault (library; web-unwired) | PARTIAL 30/30 | defer / WS-90 | ux-vault vault/contacts/envelope suites green | OD-20, OD-09 | packages/ux-vault (library) |

### TH-FUT-ARCH: Future privacy architecture 5a-5j, 5l (docs/future/privacy-architecture; NEXT_PHASE_QUEUE D07) (11)

Decision: defer; keep separate (spec-only); map to existing modules first.

Promote only when (all):
- DOC: owner schedules the item (OD-20; NEXT_PHASE_QUEUE D07); requirement table maps every 5x requirement to existing modules (maps_to) with an explicit gap list
- TEST: each requirement gets an observable before/after adversary test (egress capture, storage dump, chain-observer view) before implementation starts
- SEC: constraint check row of NEXT_PHASE_QUEUE satisfied (static, noncustodial, no telemetry, no silent/fallback requests, explicit providers, fail-closed)

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-FUT-01 | 5a: No accounts / identifying telemetry | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | apps/web/src/privacyInvariants.test.ts + scripts/scan-secrets.sh (partial guard exists); F-WEB-22 |
| F-FUT-02 | 5b: Local encryption and key management | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | secret-box, ux-vault keystore-portable, keyVault.ts (F-KEY-02/03/13; spec 18) |
| F-FUT-03 | 5c: Fresh EVM stealth destinations + local discovery | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | core-crypto scheme-1 (F-PROTO-01), hygiene, scan-source |
| F-FUT-04 | 5d: Privacy-preserving RPC and scanning | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20, OD-21 | net-transport, scan-source, apps/web/src/lib/scanPrivacy.ts, pir-two-server (F-NET-01, F-PROTO-11, F-NET-03, F-WEB-07); TB-02 |
| F-FUT-05 | 5e: Sweep privacy + linkability analysis | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | hygiene, hops, ux-flow (F-OPS-02, F-PRIV-05) |
| F-FUT-06 | 5f: Encrypted invoice + metadata minimization | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | invoice-schema, #gpi=v1 encrypted link envelope (F-PROTO-07), metadata-hardening (F-PRIV-03), payment-uri |
| F-FUT-07 | 5g: HTTPS and Tor hosting w/ verifiable boundaries | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20, OD-06, OD-22 | net-transport/onion.ts, deploy/tor (F-HOST-02), Pages (F-WEB-21); OD-06, OD-22 |
| F-FUT-08 | 5h: Optional broadcast + gas sponsorship without custody | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20, OD-21 | payer-sponsor, relayer-guard, payer-hiding-contracts (F-RLY-05, F-RLY-04, F-POOL-08); OD-21 |
| F-FUT-09 | 5i: Buyer-side privacy adapters + identity separation | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | external-pools*, pool-sdk, privacy-pipeline, payer-hiding-contracts (F-POOL-05..08, F-PRIV-01) |
| F-FUT-10 | 5j: Confidential amount + settlement integrations | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | confidential-amounts, confidential-contracts CT-1 PoC (F-POOL-09) |
| F-FUT-11 | 5l: Reproducible builds + release integrity | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20, OD-07 | scripts/repro-check.sh, release-build.sh, gen-release-manifest.mjs (F-WEB-21 ADR-0015 gate 2); SEC-25, SEC-43; OD-07 |

### TH-FUT-PF: Privacy-first product ideas 01-18 (docs/future/privacy-first) (18)

Decision: defer; keep separate (spec-only); promote only via a numbered spec + owner scheduling.

Promote only when (all):
- DOC: owner schedules the item (OD-20; NEXT_PHASE_QUEUE D07); requirement table maps every 5x requirement to existing modules (maps_to) with an explicit gap list
- TEST: each requirement gets an observable before/after adversary test (egress capture, storage dump, chain-observer view) before implementation starts
- SEC: constraint check row of NEXT_PHASE_QUEUE satisfied (static, noncustodial, no telemetry, no silent/fallback requests, explicit providers, fail-closed)

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-FUT-12 | privacy-first 01: GhostTips donations | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | donation, payment-uri (F-MER-07) |
| F-FUT-13 | privacy-first 02: GhostStore static storefronts | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | merchant-*, invoice-schema (F-MER-01, F-WEB-01) |
| F-FUT-14 | privacy-first 03: Private payment links/QR | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | payment-uri, qr-exchange, ux-links (F-UX-09, F-PROTO-10) |
| F-FUT-15 | privacy-first 04: Local merchant dashboard | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | merchant-ledger, ux-receipts (F-MER-02, F-MER-05) |
| F-FUT-16 | privacy-first 05: GhostProof selective disclosure | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | ux-receipts, specs/ideas/07 (F-UX-13, F-FUT-36) |
| F-FUT-17 | privacy-first 06: Encrypted backups + full recovery | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | spec 18 K01-K06 covers EVM key portability (F-KEY-07..12); residual = non-key data backups (ux-vault backup.ts) |
| F-FUT-18 | privacy-first 07: Private multi-recipient payouts | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | merchant-multisig, privacy-pipeline (F-MER-04, F-PRIV-01) |
| F-FUT-19 | privacy-first 08: Portable merchant identities | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | policy-scheme, merchant-hooks (F-AA-02) |
| F-FUT-20 | privacy-first 09: In-person QR checkout | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | qr-exchange, ux-flow (F-PROTO-10, F-UX-06) |
| F-FUT-21 | privacy-first 10: Private recurring invoices | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | ux-schedule, merchant-billing (F-UX-14, F-MER-01) |
| F-FUT-22 | privacy-first 11: Encrypted collaboration | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | merchant-multisig, secret-box (F-MER-04) |
| F-FUT-23 | privacy-first 12: P2P offramp handoff | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | none (no module) |
| F-FUT-24 | privacy-first 13: Privacy-aware fiat conversion | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | ux-fiat, quote.ts feeds (F-UX-05, F-WEB-02) |
| F-FUT-25 | privacy-first 14: Privacy-aware multichain routing | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | chain-adapters, btc-*, solana-stealth, tron-adapter, chain-evm-extra (F-BTC-01, F-SOL-01, F-TRX-01, F-EVMX-01) |
| F-FUT-26 | privacy-first 15: Private scanning/RPC/broadcast | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20, OD-21 | net-transport, scan-source, pir-two-server (F-NET-01, F-PROTO-11, F-NET-03); TB-02, OD-21 |
| F-FUT-27 | privacy-first 16: Per-client identities | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | ideas/03, core-crypto meta-address (F-PROTO-02) |
| F-FUT-28 | privacy-first 17: Private sweeping/offline funds | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | hygiene, ux-vault (F-OPS-02, F-KEY-14) |
| F-FUT-29 | privacy-first 18: Selectable privacy modes | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | privacy-profiles, ux-privacy (F-PRIV-02, F-UX-12) |

### TH-FUT-IDEA: Idea specs 01-10 (docs/specs/ideas) (10)

Decision: defer; keep separate (spec-only); several are partly covered by shipped modules (see maps_to).

Promote only when (all):
- DOC: owner schedules the item (OD-20; NEXT_PHASE_QUEUE D07); requirement table maps every 5x requirement to existing modules (maps_to) with an explicit gap list
- TEST: each requirement gets an observable before/after adversary test (egress capture, storage dump, chain-observer view) before implementation starts
- SEC: constraint check row of NEXT_PHASE_QUEUE satisfied (static, noncustodial, no telemetry, no silent/fallback requests, explicit providers, fail-closed)

| ID | Name | Status | Decision / WS | Row-specific keep-separate criteria | Owner / EX | Maps to / notes |
|---|---|---|---|---|---|---|
| F-FUT-30 | idea 01: Sweep + link hygiene | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | hygiene (F-OPS-02); sweep linkage notices (F-WEB-11) |
| F-FUT-31 | idea 02: Claim-by-tx-hash + spam filter | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | scan spam lanes (F-PROTO-05), scan UI (F-WEB-06) |
| F-FUT-32 | idea 03: Per-client meta-addresses | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | core-crypto meta-address (F-PROTO-02), seller keys (F-KEY-01) |
| F-FUT-33 | idea 04: Encrypted backup/restore | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | spec 18 + keystore v1 (F-KEY-03, F-KEY-07..12) cover keys; residual data backups |
| F-FUT-34 | idea 05: Tor/onion/proxy RPC + padded queries | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | net-transport + web scanPrivacy (stage 1 largely implemented: F-NET-01, F-WEB-07); TB-02 |
| F-FUT-35 | idea 06: Watch-only + airgapped signer | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | qr-exchange (F-PROTO-10), tx-review (F-WEB-25) |
| F-FUT-36 | idea 07: Selective-disclosure receipts | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | ux-receipts (F-UX-13) |
| F-FUT-37 | idea 08: Multi-relayer + self-submit | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20, OD-21 | relayer-guard, apps/relayer (F-RLY-01, F-RLY-04); OD-21 |
| F-FUT-38 | idea 09: 'What is public' explainer | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | help/About copy (F-WEB-23, F-DOC-04), ux-guide (F-UX-07) |
| F-FUT-39 | idea 10: Client-side hosting constraints | SPEC_ONLY 0/0 | defer / WS-90 | KS-F | OD-20 | cross-cutting: lean guard + Pages (F-WEB-21), hosting kit (F-HOST-03) |

## 6. External gates (EX): each blocks only its own verification gate

| EX | Dependency | Rows whose external gate it is | Does NOT block |
|---|---|---|---|
| EX-01 | real wallets (EIP-6963 injected, hardware) on Sepolia | F-AA-02, F-CTR-06, F-KEY-10, F-KEY-12, F-WEB-04, F-WEB-05 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start |
| EX-02 | Firefox, WebKit/Safari, Tor Browser (JIT-less scrypt ≈ 28 s INFERRED), real mobile devices | F-A11Y-02, F-BTC-01, F-BTC-03, F-HOST-02, F-KEY-03, F-KEY-08, F-KEY-09, F-KEY-12, F-NET-01, F-WEB-18 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start |
| EX-03 | screen-reader / assistive-technology qualification | F-A11Y-01, F-A11Y-03 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start |
| EX-04 | native-language review es/ar/ja | F-DOC-01, F-DOC-04, F-I18N-02 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start |
| EX-05 | independent professional security audit (contracts + client key handling) | F-AA-01, F-AA-03, F-AA-04, F-AA-05, F-AA-06, F-CTR-07, F-OPS-02, F-POOL-01, F-POOL-02, F-POOL-08 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start (except as a G-MAIN/G-S2 gate) |
| EX-06 | provider/primary-source evidence for 73 chain-matrix cells (42 chain, 27 token, 4 feed) | F-CLI-05, F-CTR-04, F-DEP-02, F-DEP-03, F-DEP-04, F-DEP-05, F-EVMX-01, F-PROTO-03, F-PROTO-05, F-WEB-02, F-WEB-06 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start |
| EX-07 | live nodes/services (bitcoind, BlindBit, relayer deployment, SOCKS/Tor proxy, pools, PIR, CMS) | F-BTC-01, F-BTC-03, F-BTC-04, F-BTC-05, F-DOC-03, F-HOST-01, F-HOST-02, F-HOST-04, F-INT-01, F-INT-02, F-NET-01, F-NET-03, F-OPS-01, F-POOL-05, F-POOL-06, F-POOL-07, F-POOL-09, F-RLY-01, F-RLY-04, F-WEB-18 | the rows' IC/RQ engineering gates, CP-5 KC (EX rows marked pending), CP-7 start |

## 7. Registry conversion and verification log

- Source: lost-team decision registry `work/rows_a.py` + `rows_b.py` (64 rows) converted by `work_ga/build_cs.py`; experimental/future decisions in `work_ga/expfut.py`. Lost OD numbers remapped to canonical (coordinator table); TB ids moved to findings; lost OD-16 on F-WEB-04/F-WEB-06/F-WEB-26/F-CLI-06/F-KEY-05 = owner-ack (no canonical ID; JSON field `owner_ack`), TB-07 only on F-WEB-05; F-DEP-05 lost OD-09 -> EX-06 (per-row `notes`).
- Claims re-checked against code @7a620ff1: 17 rows (requirement: 8).

| Row | Result | Evidence |
|---|---|---|
| F-DEP-01 | CONFIRMED | apps/web/deployments/README.md:37 says `npm run validate:deployments -w @ghostpay/web`; neither apps/web/package.json nor package.json defines validate:deployments (grep empty). (G-A, @7a620ff1) |
| F-DEP-02 | CONFIRMED+NUANCE | G-NOTE-01 holds: Pay.tsx:402/Sweep.tsx:172 -> verifyManifestForFlow, Scan.tsx:233 -> verifyManifestState (manifest.ts:107-127) -> verifyManifestOnChain (deploymentsVerify.ts:44-70: compares FEE_RECIPIENT/ANNOUNCER/FEE_BPS to manifest values, single client, no canonical announcer, no fixed 25 bps); verifyDeployment (verify.ts:184-235: canonicalAnnouncer, FEE_BPS==25, optional secondary via requestWithFallbackCheck) used only by packages/cli/src/payment-context.ts:156 and web checkDeployment (apps/web/src/lib/deployment.ts:15, referenced only by tests). NUANCE: verifyDeployment pins only the policy FACTORY codehash while verifyManifestOnChain pins policy implementation + factory, so the unified verifier must take the union. (G-A, @7a620ff1) |
| F-DEP-04 | CONFIRMED | scripts/testnet/deploy.sh:31-38 supports sepolia/base-sepolia/op-sepolia/arbitrum-sepolia/polygon-amoy/hoodi; packages/chain-adapters/src/config/chains.ts:41-47 enables 11155111, 84532, 11155420, 421614, 80002, 97, 43113 (no deploy path for 97/43113; hoodi 560048 absent from chains.ts). (G-A, @7a620ff1) |
| F-KEY-03 | CONFIRMED | 57dcf7e8 is NOT an ancestor of 7a620ff1; its apps/web/scripts/test-seller-vault-idb.mjs has 228 lines with R1-R3 recovery cases vs 75 lines (no R1-R3) in the candidate; no CI/package script runs either harness. (G-A, @7a620ff1) |
| F-KEY-08 | CONFIRMED | packages/ux-vault/src/keystore-portable.ts: DEFAULT_SCRYPT :49, import ceilings MAX_N/MAX_R/MAX_P/MAX_KEYSTORE_BYTES :54-60, derive :74-82 and aad :84-86 are inside createKeystoreApi (:42) and absent from its return object (:438) -> closure-private; a shared primitive must be exported without changing v1 bytes. (G-A, @7a620ff1) |
| F-KEY-09 | CONFIRMED | No "Payment details" view in apps/web/src (grep empty); Scan.tsx:546 renders ReceiptPanel per match; SellerKeys.tsx:205 onExport exists as the lifecycle template. (G-A, @7a620ff1) |
| F-PROTO-03 | CORRECTED | Claim "per-log blockHash cross-check missing in fetchAnnouncements" is WRONG: packages/chain-adapters/src/logs.ts:438-460 reads the canonical block for every accepted log (cache + separate 1,000-read cap MAX_CANONICAL_BLOCK_READS :90, doc :269-271) and fails RPC_FAILURE "log block hash differs from canonical block"; tested logs.test.ts:132-148, scanHardening.test.ts:82; `npx vitest run src/logs.test.ts src/scanHardening.test.ts` 2 files / 70 tests passed. Introduced 18e5b23f (2026-10-22). Requirement is implemented+verified; only the matrix row needs rescoring. (G-A, @7a620ff1) |
| F-WEB-09 | CONFIRMED | apps/web/scripts/test-reconciliation-idb.mjs:71 calls invalidateFrom(100n); packages/ux-vault/src/reconciliation-portable.ts:154 (interface) and :961-965 (impl) require (block, observed, canonicalHash) -> observed.map TypeError (static); no workflow/package script references the harness (grep .github, package.json, scripts). (G-A, @7a620ff1) |
| F-CLI-06 | CONFIRMED | packages/cli/src/commands/merchant-refund.ts:43-45 `merchant refunds execute` always exits 5 (REFUND_EXECUTION_UNSUPPORTED). (G-A, @7a620ff1) |
| F-DEP-05 | CONFIRMED | packages/chain-adapters/src/quote.ts:52 FEEDS lists 4 testnet feeds (11155111 ETH/USD, USDC/USD; 84532 ETH/USD, USDC/USD) while TODO-VERIFY.md:29-32 says FEEDS is empty and the app offers no fiat price. (G-A, @7a620ff1) |
| F-I18N-02 | PARTLY-OUTDATED | languages.ts:19-43 lists 24 languages, 4 catalogs ship (apps/web/locales/{ar,en,es,ja}.json), LanguagePicker.tsx:17 renders all 24 -- BUT the "label unshipped" option is already implemented: LanguagePicker.tsx:19-23 appends i18n.picker.noCatalog / machineDrafted notes. Remaining choice = trim (canonical OD-16 recommendation) vs keep labelled. (G-A, @7a620ff1) |
| F-WEB-05 | CONFIRMED | apps/web/src/lib/pay.ts:252-255 bufferOffered() is true for every v1 ERC-20 invoice in both profiles; Pay.tsx:1190 renders the buffer option; docs/pages/README.md:61 and docs/pages/RELEASE_MATRIX.md:24 say the lean build has no payer gas buffer (TB-07). (G-A, @7a620ff1) |
| F-RLY-01 | CONFIRMED | .github/workflows/ci.yml:198-223 ts-test-relayer builds contract artifacts and runs `npm test -w apps/relayer` with REQUIRE_ANVIL=1. (G-A, @7a620ff1) |
| F-SOL-01 | CONFIRMED (TB-08) + UNBLOCK-CORRECTION | solana-stealth st:sol: (meta-address.ts:10) vs chain-solana gpsol: (keys.ts:10); shared memo prefix gpst1: with base58 vs base64url encodings (announcement.ts). Registry made consolidation wait on lost OD-14 (=OD-20); canonical BLOCKERS TB-08 says the format consolidation is engineering-removable -> unblocked=true for the format fix, promotion still waits OD-20/OD-02. (G-A, @7a620ff1) |
| F-TRX-01 | CONFIRMED (TB-08) + UNBLOCK-CORRECTION | tron-adapter st:trx:0x (meta.ts:17) vs chain-tron st:eth:0x via core-crypto encodeMetaAddress (stealth.ts:47, adapter.ts:126); unblocked as for F-SOL-01. (G-A, @7a620ff1) |
| F-WEB-02 | CONFIRMED | apps/web/src/lib/pay.ts:192-196 calls readPrice(..., {now, expectedDecimals, maxAgeSeconds}) with no sequencerFeed; quote.ts:181-214 supports sequencerFeed + 3600 s grace; FEEDS (quote.ts:52) includes Base Sepolia 84532 (opStack: true in chains.ts:42) ETH/USD and USDC/USD. (G-A, @7a620ff1) |
| F-WEB-18 | CONFIRMED | apps/web/src/lib/embedHost.ts:8 names deploy/nginx/embed-frame.conf; deploy/nginx contains only nginx.conf, security-headers.conf, security-headers-embed.conf. (G-A, @7a620ff1) |

- Corrections applied: F-PROTO-03 (requirement already implemented -> records-only repair; G-B WS-11.1 should shrink to ~0.1 d), F-I18N-02 ("label unshipped" already done -> only trim-vs-keep remains, OD-16), F-DEP-02 (verifier union must include policy implementation hash), F-SOL-01/F-TRX-01 (TB-08 format fix unblocked: engineering, not owner), F-KEY-12 deps on K03-K05 marked soft (NEXT_PHASE_QUEUE: K06 parallel after format freeze), two registry dependency cycles removed (F-DEP-02<->F-WEB-17, F-I18N-03<->F-UX-15).
- Files the criteria name that do NOT exist @7a620ff1 (to be created by the owning WS): `apps/web/e2e/master-backup.spec.ts`, `apps/web/e2e/stealth-archive.spec.ts`, `apps/web/e2e/stealth-export.spec.ts`, `apps/web/src/i18n/literals.test.ts`, `docs/accessibility/screen-reader-protocol.md`, `docs/developer/key-portability-formats.md`, `docs/user/master-backup-recovery.md`, `scripts/testnet/measure-chain-params.mjs`, `scripts/testnet/sign-manifest.mjs`, `scripts/tests/mythril-dispositions.test.mjs`, `scripts/tests/privacy-claims.test.mjs`, `test-vectors/keystore-v1-golden.json`, `test-vectors/stealth-export-v1.json`, `tools/independent-recovery`, `tools/independent-recovery/k04-cast-proof.sh`.
- UNVERIFIED here: anything needing Firefox/WebKit, real devices, a live Sepolia deployment, Docker infra runs, Mythril/Echidna/Slither local runs, and the lost team's own test runs (C re-run of 57dcf7e8 harness is cited, not repeated).


## 8. Coordinator addendum: rows held by open security findings, and one correction (2026-11-18)

The coordinator applied the matrix's **security-hold rule** after this document was generated: a row whose own code is the
root cause of an open, confirmed Medium-or-higher finding cannot be VERIFIED_COMPLETE. Five rows that scored complete on
their requirements are therefore unfinished; each closes through an existing workstream item, so no effort is added.

| Row | Held by | Closed by | Implementation-complete criteria | Release-qualified criteria |
|---|---|---|---|---|
| F-KEY-01 Seller key generation, hex import, in-memory session | SEC-03 | WS-07.1 (OD-01 default) | Vault-less session: every new spec-18 secret export (K03-K06) refuses with an explicit "create an encrypted vault" path, while the existing encrypted keystore v1 backup stays available after a disclosure + typed confirmation (BLOCKERS OD-01; constraint 4); sweep shows the step-up/vault prompt or the documented warning; `keyVault.test.ts` no longer pins "no step-up" (it pins the refusal); unit + Playwright lean/full cover refuse/warn; no secret reaches fetch/URL/log/storage/clipboard | OD-01 recorded; strongest-tier independent review; CP-1 G-FULL green |
| F-KEY-02 Encrypted browser key vault | SEC-05 | WS-18.1 | Shared passphrase policy (estimator extracted from `keystore-portable.ts:182-216`) with a `high` tier (generated diceware default, ≈80-bit estimate) enforced for new vaults and master/raw exports; name+year probes (`evidence/teams/D/scripts/passphrase-probe.mjs`) rejected; keystore v1 decode byte-compatible (golden vector) | OD-09 recorded for existing flows; independent review |
| F-WEB-07 Scan privacy modes | SEC-10 | WS-01.1 (TB-02) | Lean: local-proxy mode absent from UI and docs; full/self-host: mode removed, or `connect-src` gains only `http://127.0.0.1:*`, `http://localhost:*`, `http://[::1]:*` (BLOCKERS TB-02); Playwright under the real meta CSP proves the mode works or is absent; `wss://` rejected with a clear message (SEC-19) | Spec 10 acceptance text matches behaviour; review |
| F-KEY-03 Keystore v1 backup/restore + verified-backup gate (hold added by the H1 rescoring) | SEC-05, SEC-03 | WS-18.1 + WS-07.1 (WS-02.7 harness) | keystore export uses the WS-18 policy (`SellerKeys.tsx:207`); vault-less export keeps working after disclosure + typed confirmation (`SellerKeys.tsx:221-224`, OD-01 default); R1-R3 seller-vault harness green | OD-01 / OD-09 recorded; review |
| F-WEB-11 Direct sweep | SEC-03 | WS-07.1 | As F-KEY-01 for the sweep path (`Sweep.tsx:150-154`): vault-less sweep stays available with the OD-01 warning and a vault-creation offer (default: sweep unchanged but warned); e2e covers the warning; sweep on vault sessions unchanged | OD-01 recorded; review |
| F-WEB-12 Relayer-assisted sweep | SEC-03 | WS-07.1 | Same rule as F-WEB-11; permit-refusal messages unchanged; relayer client stays opt-in | OD-01 recorded; review |

**Correction — F-PROTO-03 is VERIFIED_COMPLETE.** Its only missing requirement (per-log canonical block-hash cross-check,
S3-14) already exists in `fetchAnnouncements` (`packages/chain-adapters/src/logs.ts:438-460`) with tests
(`logs.test.ts:132-148`, `scanHardening.test.ts:82`; 70/70 locally at `7a620ff1`). Its §4.1 entry is retained for history;
WS-11.1 reduces to recording this evidence (~0.1 d).
