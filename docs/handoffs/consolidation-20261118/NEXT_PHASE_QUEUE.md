# GhostPay next-phase completion queue

Prepared 2026-11-18 during repository consolidation (integration branch `nodata/wizardly-allen-qwol6u`). File:line
references were read at specs-lane head `ab78c021`, whose product source is identical to candidate base `d39e304a`.
Nothing in this queue has been implemented or run. This queue starts after the consolidation checkpoint; it does not
authorize new custody, authority or network surfaces by itself.

Canonical requirement: [spec 18](../../specs/18-stealth-keypair-export.md) (requirement 3q = privacy 5k, counted once).

Order: K (approved, before beta exit) -> B (authentic Sepolia-first static beta) -> D (decision-gated, no implied
authority). Each item lists what it depends on, what it reuses, and the acceptance evidence. "Owner" marks a step only
the owner can perform.

Spec 18 wording to settle before K03 implementation (reported by the specs lane, not edited):
- Spec 18 "redact UI and clipboard by default" next to "no ... clipboard ... transmission of secret material": read as
  never copying secret material to the clipboard automatically; any manual copy affordance for raw keys needs an
  explicit owner decision.
- Spec 18 limits telemetry "of secret material"; the product rule is no telemetry at all, which continues to apply.
- Spec 18 flow 1 on-chain announcement verification must use the user-selected RPC with no automatic fallback.
- Spec 18 does not restate the lean-bundle import boundary; export modules must remain within the lean static bundle
  rules and import no relayer/operator/CLI runtime.

## K — payment-key portability (spec 18, approved, before beta exit)

Shared primitives (all exist today; reuse, do not fork):
- Stealth derivation: `packages/core-crypto/src/stealth.ts` `deriveStealthPayment` :120, `checkAnnouncement` :157,
  `deriveStealthSecret` :212 (rejects zero scalar, compares derived address to announced; `ignoreViewTag` for deep scan).
  Vectors: `test-vectors/scheme1.json`, `packages/core-crypto/src/vectors.test.ts`.
- Address correspondence: `packages/chain-adapters/src/sweep.ts` `addressOfSecret` :175; sweep's pattern
  `apps/web/src/lib/sweep.ts` `deriveVerifiedSweepKey` :49-56.
- Envelope: `packages/ux-vault/src/keystore-portable.ts` — `KeystoreFile` v1 :9-18, scrypt `DEFAULT_SCRYPT` N=2^17 r=8 p=1
  :49, import ceilings :51-60, `derive` (NFKC, dkLen 32, non-extractable AES-GCM key, raw wiped) :74-82, AAD domain
  `GhostPay.keystore.v1|...` :84-86, `encryptKeystore` :313, `validateKeystoreEnvelope` :368, `decryptKeystore` :391.
  Web binding `apps/web/src/lib/keystore.ts`; CLI binding `packages/cli/src/backup-data.ts:10`.
  Second scrypt + AES-256-GCM/HMAC pattern: `packages/ux-vault/src/tag-archive-portable.ts`.
- Vault / IndexedDB: `apps/web/src/lib/keyVault.ts` `IndexedDbKeyVaultStore` :45 (DB `ghostpay-encrypted-seller-vault`
  :39, stores encrypted keystore text only), `MemoryKeyVaultStore` :170.
- Step-up re-authentication: `keyVault.ts` `authorizeKeyExport` :257 (returns `undefined` when no vault is involved),
  `authorizeEncryptedVault` :328 (sweep step-up); session guards `apps/web/src/lib/session.ts`
  `withSessionSecrets` :312, `captureSessionVersionGuard` :344, `captureSessionGuard` :352, `exportKeystore` :434,
  `importKeystore` :452, `verifyDownloadedBackup` :412, `markKeystoreDownloaded` :140.
- Export lifecycle convention: `apps/web/src/views/SellerKeys.tsx` `onExport` :205-247 (operation token, version guard,
  step-up, download, verify-backup state), step-up input :560; download `apps/web/src/components/Common.tsx`
  `downloadText` :87; secret wrappers `packages/secret-box/src/secretBox.ts` (`wipe` :56), `core-crypto/src/secret.ts`
  `zeroize` :132.
- Scan results: `apps/web/src/lib/scanClient.ts` `ScanMatch` :30-45 (`receipt` verified/claimed/pending, `tagMatches`);
  dedupe identity `apps/web/src/lib/scanMatches.ts` `paymentKeyOf` :8; row UI `apps/web/src/views/Scan.tsx` :546-550
  (ReceiptPanel, Sweep). No "Payment details" view exists by that name yet (grep of `apps/web/src`: none).

| ID | Task | Depends on | Reuses | Acceptance evidence |
|---|---|---|---|---|
| K01 | Typed `ghostpay-stealth-public-v1` / `-keypair-v1` / `-master-v1` schemas + strict parsers; verified derivation adapter (scheme 1, chainId, announcement, derived address == announced == independently recomputed). Decide and document deep-scan (`tagMatches=false`) eligibility and which viewTag the public record carries. | Spec 18 frozen (integrated in this consolidation) | `stealth.ts`:212, `addressOfSecret`, `scheme1.json` | Known EIP-5564 vector -> exact pubkey + EIP-55 address; wrong scheme/chain/announcement/format/version rejected; public payload proven secret-free; errors carry no secret; core-crypto vectors unchanged and passing |
| K02 | Encrypted single-keypair envelope + import: new format id and AAD domain (not `GhostPay.keystore.v1`), header bound as AAD, fresh salt/IV, bounded KDF params from the keystore policy, atomic import in a fresh session | K01 | `keystore-portable.ts` `derive`/AES-GCM/bounds; `secret-box` | Wrong passphrase, tamper, truncation, oversize cost, wrong chain/scheme fail closed with no partial state; round-trip across new browser sessions; existing keystore tests still pass unchanged |
| K03 | Seller payment-row public/encrypted export UI ("Payment details > Export"), seller-only, deliberate gesture, re-authentication, explicit chain/EOA/scope display; ownership label separate from `receipt` status. **Decision inside K03:** how mandatory re-auth is satisfied for an in-memory seller with no vault (`authorizeKeyExport` returns `undefined` today). | K02; stable lock/reimport behavior | `SellerKeys.tsx`:205-247 lifecycle, `keyVault.ts`:257/:328, session guards, `downloadText` | Locked/stale/changed-keys/wrong-chain refuse; lock/chain switch/key replacement during KDF never publishes a secret; no auto-download at scan; browser test proves no secret in fetch/URL/log/storage/clipboard |
| K04 | Raw single-key export (`0x`+64 hex, labelled private key, not seed) behind re-auth + second confirmation; independent recovery proof on a local chain with an independently implemented EVM tool (e.g. pinned Foundry `cast`/`anvil` 1.8.5, synthetic keys) | K03 | K03 controls; pinned Foundry toolchain | Exported scalar derives the original address and signs a transfer accepted by anvil via the independent tool; no automatic wallet connection; BTC/AA/7702/policy-account requests refused; spent-address export allowed with "controls future deposits" label |
| K05 | Encrypted, bounded bulk archive of discovered + validated distinct EVM one-time keys (count, chain, scope); no plaintext mode, no master keys | K02, K03 | `paymentKeyOf` dedupe, K02 envelope | Deterministic ordering; duplicate/conflicting records rejected; size/count bounds; malformed record -> atomic reject (no partial import) |
| K06 | Separate encrypted master spend/view backup with derivation scheme/version and recovery instructions; legacy v1 keystore stays exportable/importable unchanged and distinct | K01, K02 (can run parallel to K03-K05 after format freeze) | `keystore-portable.ts` (untouched v1), `session.ts`:434/:452, `stealth.ts` | Offline recovery of a known historic announcement omitted from the payment archive; fresh-install restore without original host/account/service; legacy keystore import regression test; invoice-signing key never in master/payment formats |
| KC | Checkpoint: spec 18 acceptance on one exact integrated SHA | K01-K06 | — | Focused suites + lean/full build guards; Chromium plus Firefox/WebKit where supported; mobile download/import recorded separately; independent secret-flow review; docs + reference vectors; external wallet/device rows marked pending until real evidence |

## B — authentic Sepolia-first static beta (after/alongside K; owner signing gates)

| ID | Task | Depends on | Files / primitives | Acceptance evidence |
|---|---|---|---|---|
| B01 | Owner decisions packet: accept ADR-0029 (status "Proposed (2026-11-12)"), origin choice for GP-PAGES-01 shared `github.io` origin, release-key authority | — (read-only prep now) | `docs/adr/ADR-0029-github-pages-static-beta.md`:3, `docs/pages/RELEASE_MATRIX.md`:41,:53 | Recorded owner decision; no placeholder keys |
| B02 | Authentic Sepolia (11155111) deployment + source verification (Owner broadcasts) | B01 | `scripts/testnet/deploy.sh`, `verify-sources.sh`, `make-manifest.mjs`, `docs/operators/testnet-runbook.md` | Tx hashes, block numbers, verified sources; runtime bytecode hashes read back independently |
| B03 | Signed manifest bundled into the lean build | B02; release key | `apps/web/deployments/README.md` procedure, `apps/web/scripts/validate-deployments.mjs`, `apps/web/src/lib/bundledManifests.ts`, `releaseKeys.ts`, `manifest.ts` | Build-time `validateDeployments` (`apps/web/vite.config.ts`:7, `apps/web/scripts/validate-deployments.mjs`) passes with pinned `GHOSTPAY_RELEASE_PUBKEYS` (note: the README's `npm run validate:deployments -w @ghostpay/web` has no matching package.json script at this tree — fix that doc/script drift first); runtime readback (`verifyDeployment`) passes via user-selected RPC; unsigned manifest still fails build |
| B04 | Sepolia matrix evidence (14 cells per prior census) without weakening the strict all-enabled-chain gate; lean Pages path qualifies the one supported chain explicitly | B02 | `packages/chain-adapters/config/matrix.json`, `scripts/lib/chain-matrix.mjs`, `packages/chain-adapters/src/config/chains.ts` | Each cell block/provider/date/source pinned and independently checked; no auto-"verified" promotion |
| B05 | Pages build/deploy by manual main-only dispatch (Owner), smoke on the real origin | B03, B01 | `.github/workflows/pages.yml`, `scripts/pages/build-pages.sh`, `verify-pages-site.mjs`, `smoke-url.mjs` | Served-file digests match built artifact; CSP/egress check; deployment and release recorded as separate states |
| B06 | User acceptance on Sepolia: invoice -> pay (native and ERC20 separately) -> scan -> receipt -> sweep -> backup/restore -> 3q export + independent recovery | B05, KC | `scripts/beta/acceptance.sh`, `browser-devnet.sh`, `docs/beta/CORE_BETA_COMPLETION_TRACKER.md` | Per-run record: SHA, browser/device/wallet versions, pass/fail; real wallet + mobile file/camera + screen reader rows; nothing claimed from emulation alone |

## D — decision-gated (packets first; no authority inferred from existing models)

| ID | Item | Gate | Files | Acceptance of the packet |
|---|---|---|---|---|
| D01 | Base Sepolia, then OP/Arbitrum/Polygon Amoy/BSC/Fuji testnets; mainnets stay disabled | B06 + owner per chain | `chains.ts` (app accepts Sepolia + Base Sepolia only, runbook :53), `matrix.json` | Same B02-B04 evidence per chain |
| D02 | Full-profile integrations: BTC BIP-352 (spec 11/12), Tor/SOCKS transport (spec 10), relayer observability (spec 07) | Owner scope choice; never required by the lean bundle | `packages/btc-silent-payments/src`, specs 07/10/11/12 | Own observable contract; lean bundle imports none of it |
| D03 | Policy accounts / EIP-7702: AUD24-01 policy-hash linkability, delegate authority | Owner ABI/privacy decision | `docs/specs/15-eip7702-aa-policy-account-path.md`, `apps/web/src/features/policy/`, ledger :52 | Alternatives, changed authority, migration/privacy effects, tests; no new delegate authority by default |
| D04 | Guardian recovery | Accept/reject ADR-0028 (unaccepted; owner rotation impossible today) | `docs/adr/ADR-0028-policy-recovery-authority-model.md`, `docs/specs/16-policy-account-recovery.md` | No default guardians, no custodial recovery; CONTRACTS_SPEC first |
| D05 | Milestone escrow | Custody/dispute model decision | `docs/specs/17-milestone-escrow.md`, `scripts/experimental/milestone-escrow/` | No escrow powers implied; formal model + audit before any funds path |
| D06 | Automatic merchant checkout | Signed destination/token/fee/pricing authority schema | `docs/specs/14-embed-merchant-profile.md` (2026-11-16 continuation) | Local signed-template issuance remains complete behavior; new schema reviewed separately |
| D07 | Future privacy 5a-5j, 5l (proposed) | Owner decision to schedule each | `docs/future/privacy-architecture/` | Map to existing modules first; observable before/after adversary tests |

Constraint check for every row: static client-only, noncustodial, no telemetry, no silent or fallback requests, no
automatic clipboard, no secret-bearing logs, explicit user-selected providers, fail-closed private-required mode.
