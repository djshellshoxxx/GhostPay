# Team D: cryptography, key management and smart-contract security review

**This is an AI-assisted review.** It is not an independent professional audit, it gives no security guarantee, and nobody should present it as either.
Target: candidate worktree `/home/user/wt/cand` @ `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (PR #203 head), read-only.
Contract sources are byte-identical to `beb525dd`. Verified with `git diff --quiet beb525dd 7a620ff1 -- packages/contracts/{src,lib,foundry.toml}`. The sha256 prefixes `9943c8b4` (SweepRelayer) and `c860fcf7` (PolicyAccount) match the Mythril expiry record.
Evidence markers: **VERIFIED** (I read the code or ran it at this SHA), **INFERRED** (reasoned from evidence), **UNVERIFIED** (a claim only).
Machine-readable findings: `findings.json` in this directory.

## 0. What was run (all VERIFIED, this session)

| Command | Result |
|---|---|
| `cd packages/core-crypto && npx vitest run` | 9 files / **75 passed** (vectors, ScopeLift differential, bigint reference, negatives, redaction) |
| `cd packages/ux-vault && npx vitest run` | 7 files / **284 passed** (`logs/ux-vault.log`) |
| `cd packages/secret-box && npx vitest run` | 3 files / **47 passed** (`logs/secret-box.log`) |
| `chain-adapters: vitest eip712.independent, sweep, permit, deploymentsVerify` | 4 files / **71 passed** (`logs/chain-adapters-signing.log`) |
| `invoice-schema: vitest sign, independent, receipts, envelope, passphrase` | 5 files / **158 passed** (`logs/invoice-schema-signing.log`) |
| `apps/web: vitest lib/keyVault, session, sweep, keystore` | 4 files / **168 passed** (`logs/web-keys.log`) |
| `scripts/indep-vectors.cjs` (elliptic + js-sha3, no @noble) | scheme1.json **6/6 vectors match** (pubkeys, R, tag, address, stealth key, ECDH symmetry) |
| `scripts/indep-keystore-recovery.mjs` | keystore v1 made by the real codec (N=2^17) **decrypts with node:crypto alone** from the documented AAD; a tampered AAD is rejected; the scheme1-001 stealth key and address re-derived independently. exit 0 |
| `scripts/passphrase-probe.mjs` | estimator accepts `Michael1985!!x`, `Jennifer041990`, `Liverpool2026!`, `Correcthorse12` (see D-03) |
| `grep Math.random / getRandomValues / eval / new Function / console.*` (product src) | No `Math.random` in key paths; the only exemption is React keys in `scan-bundle.mjs:41`. Every secret RNG is `crypto.getRandomValues` or `node:crypto`. No `eval`/`Function`. Two `console.warn` calls, neither with secrets (`manifest.ts:90` dev-manifest warning, `i18n/context.tsx:51`). Relayer logs use allowlisted fields (`apps/relayer/src/log.ts:4-16`) |
| `gh api -X GET` (read-only) | CI 44231986652 (`d91ae16a`): 24/24 jobs success, including contracts-slither and contracts-test. Contract analysis 44231986631: **echidna success, mythril failure**. Candidate head `7a620ff1`: CI 44242366118 success; contract analysis 44242366379 echidna success / mythril failure. Artifact zips were refused by blob storage (403), and the analyzer reports go to `report.log` rather than the job log |

Not run: forge, anvil, slither, mythril and echidna are not installed. Every Foundry, Echidna and Mythril result below is either a CI job conclusion (VERIFIED) or an in-tree record (UNVERIFIED unless I re-derived it from source).

## 1. Summary

- No Critical or High finding. **5 Medium, 8 Low, 9 Info** (22 total).
- **Crypto core is sound (VERIFIED).**
  - Library: `@noble/curves` and `@noble/hashes` 2.4.0, pinned exactly.
  - Scalar handling: rejection sampling in [1, n-1] with a stuck-RNG guard (`rng.ts:31-44`). Zero hash, zero stealth key and the point at infinity are all rejected.
  - Points: strict compressed-SEC1 parsing. The derived key is checked against the announced address before it is returned (`stealth.ts:212-232`).
  - Signatures: RFC 6979 low-s, verified against the key after signing (`chain-adapters/src/sweep.ts:192-202`).
  - Domains are prefix-free: invoice `GhostPay.Invoice.v1\0`, receipt `GhostPay/receipt/v1\n`, profile `GhostPay.MerchantProfile.v1\0`, sweep/policy/delegate use EIP-712 with chainId and verifyingContract, and direct sweeps are EIP-1559 transactions carrying chainId.
- **The main gaps are in key management.**
  - D-01: a session without a vault has no re-authentication for sweeping or exporting.
  - D-02: spec 18 is unimplemented, so there is no GhostPay-independent recovery tool.
  - D-03: the passphrase floor is too low for master keys.
- **Contracts.**
  - None has an owner, admin, upgrade path, pause, delegatecall or rescue function, and no protocol contract holds user funds or has withdrawal authority over them.
  - The open items are all scheme-2 and scheme 2 is undeployed: AUD24-01, N1, L-05/CORE-01, and L2 delays.
- **Relayer.** It cannot steal or redirect funds. It can censor, delay and observe.
- **Release.** The trust roots are empty, which is fail-closed, and the Mythril gate is red by design.

## 2. Findings

| ID | Area | Sev | Status | Finding | Evidence (`path:line@7a620ff1` unless noted) | Affected | Remediation | Verification needed |
|---|---|---|---|---|---|---|---|---|
| D-01 | Key mgmt / step-up | Medium | CONFIRMED | A seller session with no vault gets **no re-authentication** before a sweep or a full keystore export (spend + view + signing keys under a passphrase the person exporting chooses). The idle lock deliberately keeps keys loaded until they are backed up. Anyone at an unattended tab can drain the account or export it. Prior R-15 covered export only. | `keyVault.ts:257-266` (returns `undefined`), `:328-333`; `SellerKeys.tsx:221-224`; `Sweep.tsx:150-154`; `AppShell.tsx:128-160`; behaviour pinned by `keyVault.test.ts:241` (passed) | apps/web SellerKeys, Sweep; spec 18 K03/K04/K06 | Owner decision before K03. Choose one: require a vault or verified backup and its passphrase before mainnet sweep/export; a session unlock secret set at generation; or WebAuthn user-verification step-up (local, no server). K04 raw export must refuse when no re-auth factor exists. | Unit and Playwright tests: a vault-less session cannot sweep, export or raw-export without re-auth; a lock or key change during the KDF never publishes a secret |
| D-02 | Recovery | Medium | CONFIRMED | **No independent recovery path ships.** None of the `ghostpay-stealth-*` formats (K01-K06) exist. The CLI scans (`checkAnnouncement`) but cannot derive one-time keys or sweep, so scheme-1 recovery today needs the GhostPay web bundle (self-hosting is possible). My script shows the gap is small: keystore v1 decrypts with node:crypto and the key derives with elliptic. | grep `ghostpay-stealth-`: none; `packages/cli/src/commands/scan.ts:88`; no sign/sweep code in `packages/cli/src`; `scripts/indep-keystore-recovery.mjs` | cli, ux-vault, web; constraint 4 | Implement K01-K06. Ship an offline reference recovery script with vectors. Add a CI job that decodes the vectors with a non-GhostPay implementation and proves the recovered key works on anvil (Foundry 1.8.5 is already pinned in CI, per the job log). | KC checkpoint on one SHA |
| D-03 | Key mgmt / KDF | Medium | CONFIRMED | The master-key keystore and vault accept name+year passphrases: 14 characters and a pool-entropy score of at least 2. Examples rated 52-65 "bits": `Michael1985!!x`, `Jennifer041990`, `Liverpool2026!`. scrypt N=2^17 costs about 0.37 s per guess on CPU. An exfiltrated file (cloud backup, malware, or other sites on the shared `github.io` origin reading IndexedDB) is then crackable with rule-based guessing. INFERRED. | `ux-vault/src/keystore-portable.ts:186-216`, `:49`; `scripts/passphrase-probe.mjs` | keystore, vault, tag archive, CLI backups | For mainnet: make the generated 6-word passphrase (60 bits) the default, with an explicit override; raise the floor to score ≥3 or use a bundled dictionary/pattern estimator; consider N=2^18 for exports | Estimator regression corpus; KDF timing on low-end mobile |
| D-04 | Contracts / privacy (scheme 2) | Medium | CONFIRMED (prior AUD24-01) | `GhostPayPolicyRouter` takes `PolicyRef{owner, policyHash}`, so the seller-constant `policyHash` appears in every scheme-2 payment and links that seller's payments. | `GhostPayPolicyRouter.sol:93-106,236-242`; audit 26:45 PoC | contracts, policy-scheme, payer-hiding `RouterCall.sol` | Owner ABI decision: restore the salt-only ABI (`50881e4`) in lockstep across the three packages | Restore `test_policy_calldataDoesNotLinkPaymentsToSeller` |
| D-05 | Contracts / token quirks (scheme 2) | Medium (conditional) | CONFIRMED (prior R-11/N1) | If the fee token's views fail, or a transfer lands with an unexpected delta, every fee-charging `deploy` of the immutable factory reverts. Counterfactual funds then stay frozen, and there is no factory-side recovery. | `PolicyAccountFactory.sol:113-114,128-164` | Factory | Owner: zero-fee factory for upgradeable or fee-switch tokens, or a specified fail-open `_collectFee` | Invert the probe test under the chosen design |
| D-06 | Contracts / lock-in (scheme 2) | Low | CONFIRMED | A payer cannot see which assets the seller's policy can withdraw: the scheme-2 meta-address carries only `policyHash`. The router accepts any token or native coin to the predicted account, and an asset without a leaf can never leave. **Whole payments are affected**, not only the gas buffers CORE-01 covers. | `PolicyAccount.sol:172-186`; `GhostPayPolicyRouter.sol:136-158`; `policy-scheme/src/meta.ts:7-12`; audit 02 L-05 | scheme-2 invoices | Client gate that refuses scheme-2 invoices for assets without a leaf (mitigation UNVERIFIED); payer warning; or a contract change | Unit and anvil tests |
| D-07 | Contracts / L2 (scheme 2) | Low | CONFIRMED (numbers INFERRED) | `MIN_DELAY = 1 hours` is below L2 forced-inclusion bounds (OP Stack about 12 h, Arbitrum about 24 h) and Arbitrum's timestamp latitude (about +1 h). A censoring or colluding sequencer can defeat the cancel window. R-09 only says "prefer longer delays". | `PolicyAccountFactory.sol:36`; `docs/developer/security-model.md:44` | PolicyAccount on L2 | Per-chain minimum delay above the forced-inclusion bound plus margin, enforced in the UI and/or as a per-chain factory constant | Per-chain Foundry timing tests |
| D-08 | Key mgmt / raw export (full profile) | Low | CONFIRMED | The BTC, SOL and TRON views reveal raw master seeds or keys and allow a two-click clipboard copy with a warning but **no re-auth**. The TRON backup is plaintext spend+view hex. This does not match spec 18's raw-export controls. Not in lean. | `components/SecretBackup.tsx:193,233`; `features/tron/wallet.ts:54-63`; `TronView.tsx:339`; `BtcView.tsx:664`; `SolanaView.tsx:343`; lean `AppShell.tsx:39` | full-profile experimental views | Owner decision on clipboard; align with the K04 controls or keep these views explicitly experimental | Component tests; lean bundle scan |
| D-09 | Manifest trust | Low | CONFIRMED | A legacy text-manifest path is still exported: sha256/ed25519, runtime `fetch ./deployments`, and **unsigned manifests accepted on testnets**. It sits next to the strict bundled keccak scheme. The default services do not use it. | `apps/web/src/lib/manifest.ts:52-101`; `chain-adapters/src/deploymentsSignature.ts:19,79-103`; `defaultServices.ts:30` | web, chain-adapters | Delete it or move it to test utilities; add a bundle-scan rule | scan-bundle rule and test |
| D-10 | Recovery docs | Low | CONFIRMED | The keystore v1 documentation says N ≤ 2^20, a passphrase of at least 10 characters, and an old writer path. The code enforces N ≤ 2^18, r ≤ 8, p ≤ 2, 8 KiB, and a passphrase of at least 14 characters that also passes the strength check. Spec 18 flow 4 needs an exact format. | `docs/developer/byte-layouts.md:195-198` vs `keystore-portable.ts:51-62,323,376-381` | third-party decoders | Write a normative spec with a vector and a CI decode using node:crypto | Doc/code parity test |
| D-11 | Key mgmt (experimental pool) | Low | CONFIRMED | The pool-sdk seed backup is weaker than the keystore: passphrase of 8+ characters, no strength estimator, no NFKC, N=2^15, and import accepts logN up to 20 (about 1 GiB). | `packages/pool-sdk/src/store.ts:118-150` | pool-sdk | Reuse the ux-vault KDF policy and bounds | Unit tests |
| D-12 | Analyzers | Low | MISSING-COVERAGE | Slither CI excludes Low and Informational, while the triage doc says "no detector exclusions". payer-hiding, pool and confidential contracts get no Slither, Mythril or Echidna. Echidna does not exercise `payERC20WithPermit`/`sweepWithPermit`, forged signers, the factory or PolicyRouter. | `.github/workflows/ci.yml:459`, `nightly.yml:65`; `docs/audits/00-slither-triage.md:10`; `run-mythril.sh:20`; `run-echidna.sh:13`; `EchidnaRouter.sol:94-160`; `EchidnaSweep.sol:52-150` | contracts packages | Full-severity Slither triage before mainnet; extend the analyzers and harnesses | CI artifacts |
| D-13 | Hosting / UI redress | Low | CONFIRMED | No anti-framing protection on Pages. `frame-ancestors` exists only in `_headers`, which Pages ignores, and a meta CSP cannot carry it. Key and sweep views do not refuse to render when framed. INFERRED: storage partitioning limits the impact to clickjacking. | `apps/web/scripts/scan-bundle.mjs:189`; `lib/embedHost.ts:7-9`; no `window.top` checks in src | Pages build | Refuse to render sensitive views when framed (unless the embed protocol is active); use a header-capable host for mainnet | Playwright framing test |
| D-14 | Scheme-2 recovery | Info | INTENDED | If the owner key is compromised, the thief can cancel every withdrawal and keep proposing destinations. The result is an indefinite freeze race; the funds cannot be stolen while the owner is live. There is no key rotation, and ADR-0028 is unaccepted. | `PolicyAccount.sol:245-252,255-280`; `ADR-0028:3,14-21` | scheme 2 | Owner decision D04 (no custodial guardians); state the liveness-only guarantee in the docs | — |
| D-15 | Release trust roots | Info (fail-closed gate) | CONFIRMED | `RELEASE_KEY` is undefined, `RELEASE_PUBLIC_KEYS` is `[]`, and `allowed_signers` holds 0 keys. Payments and releases stay disabled. The keys ship inside the same bundle, so they need out-of-band bundle verification. | `deploymentsSignature.ts:19`; `releaseKeys.ts:9`; `manifest.ts:41`; `.github/release-signers/allowed_signers` | all payment flows, release.yml | Owner key ceremony (manifest secp256k1 key, separate SSH/PGP tag keys); publish digests | Signed Sepolia manifest checked at build and at runtime |
| D-16 | Release gate | Info | CONFIRMED | Mythril is red by design: 11 dispositioned records, R8 timeout-dependent, and no keyed suppression mechanism, so every release is blocked. | runs 44231986631 / 44242366379 (job conclusions); `run-mythril.sh:1-8` | release.yml | Owner: approve a keyed disposition mechanism or keep releases blocked | Mutation tests for the mechanism |
| D-17 | Relayer trust | Info | CONFIRMED | The relayer **cannot steal or redirect**: EIP-712 binds every field plus chainId and verifyingContract, and the nonce is consumed before transfers. A front-run permit is swallowed. It **can censor or delay** (orders live 20 min), sees owner, destination, amount and IP, and loses gas to mempool front-runs. The direct-sweep fallback needs native gas on the stealth address, which links its funding unless the payer sent a gas buffer. | `GhostPaySweepRelayer.sol:46-60,80-115`; `apps/web/src/lib/sweep.ts:103-121,172-266`; `chain-adapters/src/sweep.ts:79-106` | relayer | Keep it optional and user-selected; document what it learns | — |
| D-18 | 7702/4337 (experimental) | Info | CONFIRMED | The EIP-7702 delegation persists after use: a public fingerprint, and exposure to any future bug in the delegate. The 4337 paymaster admin controls only the sponsor's own deposit and stake. The paymaster's verifying signer is a server key, which is optional. Testnet ChainGuard. | `GhostPayPayerDelegate.sol:36-39,98-147`; `GhostPayVerifyingPaymaster.sol:180-207`; `payer-sponsor/src/eip7702/intent.ts:67-68` | payer-sponsor, payer-hiding | Before any non-testnet use: a mandatory clear-delegation step, an audit, and analyzer coverage | anvil end-to-end test |
| D-19 | Availability | Info | INTENDED (prior 02 M-01) | Native fees go to the immutable `FEE_RECIPIENT` with all gas forwarded. A recipient that refuses ETH blocks native payments; no funds are lost. | `GhostPayRouter.sol:121-127,241-249`; `GhostPayPolicyRouter.sol:150-155` | routers | Use an EOA or a multisig known to accept ETH; include it in the smoke test | SmokeSepolia |
| D-20 | Memory hygiene | Info | CONFIRMED | Zeroization is best-effort. Secrets pass through JS strings (keystore plaintext JSON hex, typed key hex and passphrases), the noble `toHex` path is permitted, and the viewing key is structured-cloned into the worker, which wraps and zeroizes it. | `secret.ts:16-20,61-75,132-134`; `keystore-portable.ts:327-333`; `session.ts:268-279,334-337`; `scannerCore.ts:75-88` | browser | For K02, build plaintext as bytes; document the residual | — |
| D-21 | EIP-5564 interop | Info | CONFIRMED | The hash is keccak256 of the compressed shared point S (ADR-0001), which matches the ScopeLift SDK. EIP-5564 publishes no official vectors. I recomputed all 6 vectors independently. When s_h ≥ n the code reduces it mod n, where the SDK would throw (probability about 2^-128). | `stealth.ts:78-100,120-136,157-190,212-232`; `indep-vectors.cjs` | core-crypto | Record the convention in the K01 public format | — |
| D-22 | Process | Info | CONFIRMED | The packet says commits after `d91ae16a` are docs-only, but `7a620ff1` also changes `apps/web/src/views/SellerKeys.test.tsx` (test-only). CI re-ran green on `7a620ff1`. | `git diff --name-only d91ae16a 7a620ff1`; CI 44242366118 | PROMOTION_PACKET | Correct the packet | — |

### Controls checked and found sound (VERIFIED by reading or running)

- **Randomness.**
  - `randomScalar` uses rejection sampling with no modulo bias; 64 failed attempts mean the RNG is stuck.
  - `generateKeySet` refuses KEY_REUSE.
  - Session `install` refuses a signing key equal to the spend or view key (`session.ts:235`).
  - The keystore checks after decryption that the public keys match the stored metadata and that the signing key is distinct (`keystore-portable.ts:418-426`).
- **Keystore v1.**
  - KDF and cipher: scrypt N=2^17, r=8, p=1, dkLen 32, NFKC passphrase, non-extractable AES-GCM key with the raw key wiped. Fresh 16-byte salt and 12-byte IV per file, so a nonce is never reused under one key.
  - The AAD binds the domain, metaAddress, signer, N, r and p.
  - Import ceilings: N ≤ 2^18, r ≤ 8, p ≤ 2, 8 KiB.
  - A wrong passphrase and tampering produce the same error.
- **Tag archive (GPA1).** The header (magic, KDF id, parameters, salt) is the AAD. Size and record caps are checked before the KDF runs.
- **Address-book vault (GPVT).** PBKDF2 at 600k iterations, with a downgrade floor of 210k.
- **secret-box.** Uses a captured `fill` intrinsic, WeakMap storage and wipe-on-use loans.
- **Sweep signing.**
  - The derived key's address must equal the announced address and the owner (`apps/web/src/lib/sweep.ts:49-56`).
  - The EIP-712 digest is computed twice, with viem and by hand.
  - Permits are built with chainId and the token as verifyingContract.
  - Direct sweeps are EIP-1559 transactions with chainId, re-parsed and guarded before signing; the signed hash is recorded before handoff.
- **Manifests in the default app.** Only manifests bundled in the build are used, and they must verify against a pinned key, with no unsigned fallback. Before use they are read back on-chain (code hashes, FEE_BPS, FEE_RECIPIENT, canonical announcer).
- **Contracts.**
  - Every mutating entry point is `nonReentrant`.
  - SafeERC20 with exact balance deltas.
  - Bitmap nonces are consumed before any external call.
  - Permits run inside try/catch.
  - Native sends are assembly calls that copy no return data.
  - `initialize` is authenticated by recomputing the CREATE2 address.
  - Pending requests are bound to the destination current when they were made.

## 3. Analyzer re-triage

Mythril 0.24.8, artifact 14290880802 (`beb525dd`; source identical at `7a620ff1`). I could not download the report from the qualified-head run (blob 403), so every per-record PC claim is UNVERIFIED. The verdicts below re-derive each record's premise from source.

| Rec | Contract:function:line | SWC / sev | Prior disposition | Team D status | Evidence / note |
|---|---|---|---|---|---|
| R1 (EXP-1) | SweepRelayer:sweep:83 | 116 / Low | intended | **INTENDED** | `GhostPaySweepRelayer.sol:83`: an inclusive deadline gates acceptance only, before signature and nonce checks; the timestamp is not used as randomness |
| R2 (EXP-2) | PolicyAccount:requestWithdraw:161 | 116 / Low | intended | **INTENDED** | `PolicyAccount.sol:161`: the deadline bounds submission, not execution. The real timing risk is the timelock on L2 (D-07), which Mythril does not flag |
| R3 (EXP-3) | PolicyAccount:proposeDestination:262 | 116 / Low | intended | **INTENDED** | `:262`; same reasoning as R2 |
| R4 | modelled clone fallback, PC 30 | 110 / Low | FP | **FALSE-POSITIVE** | The constructor rejects `implementation = address(1)` (`PolicyAccountFactory.sol:88`). There is no `assert` in PolicyAccount or the OZ paths it uses. The clone is standard EIP-1167. The PC mapping is UNVERIFIED |
| R5 | Factory:deploy:117 `initialize` | 107 / Med | intended | **INTENDED** | `deploy` is `nonReentrant` (`:103`). `initialize` (`PolicyAccount.sol:130-152`) makes no external call, only a pure `predictDeterministicAddress`. The fee is pulled before the clone is created, and any revert rolls everything back |
| R6 | Factory:deploy (ReentrancyGuard.sol:99) | 107 / Low | FP | **FALSE-POSITIVE** | The flagged write is the guard release itself, according to the record. Not re-derived at the bytecode level: UNVERIFIED |
| R7 | Factory:deploy:131 `balanceOf(recipient)` | 113 / Low | intended fail-closed | **INTENDED; residual CONFIRMED → D-05** | A failing view reverts the deploy, which freezes counterfactual funds (N1) |
| R8 | Factory:deploy:132 `allowance` | 113 / Low | intended | **INTENDED; residual → D-05** | Timeout-dependent: not reported on `d91ae16a` (packet) or in the local rerun. Any suppression key must tolerate a record that appears and disappears |
| R9 | Factory:deploy Clones.sol:104 `create2` | 107 / Med | intended | **INTENDED** | The salt binds owner and policy. A front-run deploys the victim's own policy, and the victim's call then reverts `AlreadyDeployed` before any fee (`:111`) |
| R10 | Factory:deploy SafeERC20.sol:227 | 107 / Low | FP | **FALSE-POSITIVE** | The call target is the immutable `FEE_TOKEN` (`:129`), not caller input |
| R11 | Factory:deploy SafeERC20.sol:227 | 104 / Med | FP as "unchecked" | **FALSE-POSITIVE** (residual INTENDED) | The return value is branched on at `:135`. Residual: the waiver can be triggered by a fee token with sender hooks (AUD24-02) or starved with a pathological ~3.9-7.7M-gas `transferFrom`. Fee revenue is the only loss |
| (gap) | Router / PolicyRouter | — | — | **MISSING-COVERAGE** | The same `timestamp > deadline` checks exist (`GhostPayRouter.sol:99,211`; `GhostPayPolicyRouter.sol:125,256`) with no records; local runs were killed (team-j README). The absence of records is not evidence. payer-hiding and pool contracts are not analysed at all |

Echidna 2.2.7. The CI job succeeded on `d91ae16a` (run 44231986631) and on `7a620ff1` (run 44242366379), both VERIFIED. Per-property output is UNVERIFIED (report artifact 403). The gate script fails the job if any safety property fails or any canary goes unreached (`run-echidna.sh:31-76`, VERIFIED), so a green job means all 13 properties passed and all 11 canaries were reached (INFERRED).

| Harness | Property | Status | Coverage note |
|---|---|---|---|
| Router | `router_never_holds_tokens`, `fee_plus_net_eq_gross`, `native_fee_plus_net_eq_gross`, `fee_recipient_only_gets_bps` | **CONFIRMED (hold, CI)** | Recipients have no code; the FoT token is covered. **MISSING:** the permit entry point, reentrant or hook tokens |
| Sweep | `sweep_nonce_single_use`, `used_nonces_marked`, `relayer_never_holds_tokens`, `token_conservation` | **CONFIRMED (hold, CI)** | The harness approves through `token.permit` directly. **MISSING:** `sweepWithPermit`, a forged signature from a non-owner key, hostile tokens |
| Policy | `funds_only_to_destination`, `destination_only_changes_via_timelock`, `timelocks_never_shortened`, `policy_immutable`, `rolling_window_cap` | **CONFIRMED (hold, CI)** | Includes wrong-key and re-init actions. **MISSING:** destinations with code (reentrancy), the unlimited-leaf path (`limit == max`), the L2 timestamp model, leaf/proof substitution |
| Canaries (11) | Router 4, Sweep 2, Policy 5 (incl. `exec_native`, R-12) | **CONFIRMED reached (CI)** | — |
| Not harnessed | PolicyAccountFactory, GhostPayPolicyRouter, payer-hiding, pool | **MISSING-COVERAGE** | Foundry invariant tests exist for PolicyRouter (not run here) |

Slither 0.11.6. The job is green on `d91ae16a` (VERIFIED). The command is `slither . --filter-paths "lib|test|script" --fail-medium --exclude-informational --exclude-low`.

| Item | Status | Evidence |
|---|---|---|
| `arbitrary-send-erc20` ×2 (SweepRelayer `_execute`) | **INTENDED** | `from` is `s.owner`, recovered by `ECDSA.recover` (`:109`); the nonce is consumed (`:111-114`) before the transfers (`:130-134`) |
| `incorrect-equality` (PolicyAccount `_consume`) | **FALSE-POSITIVE** | Integer bucket indices (`:382-383`) |
| `timestamp`, `naming-convention`, `assembly` inline disables (PolicyRouter `:63-73,123-126,254-257,291-296`) | **INTENDED** | Deadlines; ABI naming; assembly to avoid a return-data bomb |
| Low/Info detectors | **MISSING-COVERAGE** | Excluded in CI and nightly. The triage doc (`:10`) wrongly says "no detector exclusions" (D-12) |
| Older local evidence (team-j, `365a1c38`): 34 contracts, 64 detectors, 0 results | UNVERIFIED for this SHA | `team-j-analyzer-evidence/slither.log` |

## 4. Spec 18 readiness (K01-K06)

| Item | Ready primitives (VERIFIED) | Gaps / risks | Gate |
|---|---|---|---|
| K01 schemas + verified derivation | `deriveStealthSecret` (checks the derived address), `addressOfSecret`, `scheme1.json`, independent reference implementations | Decide which viewTag the public record carries for deep-scan matches (`tagMatches=false`; sweep always uses `ignoreViewTag:true`, `sweep.ts:49-50`). Record the hash convention (D-21) | Vectors unchanged; the public payload contains no secret |
| K02 single-keypair envelope | scrypt/AES-GCM pattern, bounds, NFKC | `derive`/`aad` are private to the `createKeystoreApi` closure (`keystore-portable.ts:74-86`): **export a shared primitive rather than fork it**. Use a new domain (not `GhostPay.keystore.v1`) and canonical header-as-AAD. Build the plaintext as bytes (D-20). Fix the floor (D-03) | Tamper, truncation, oversize-cost and wrong-chain cases fail closed; legacy tests unchanged |
| K03 payment-row export UI | `SellerKeys.tsx:205-247` lifecycle, session guards | **Blocked by D-01** (re-auth for in-memory sellers) and the clipboard wording decision | No secret in fetch, URL, log, storage or clipboard (browser test) |
| K04 raw single key | `signDigest` and `addressOfSecret` as checks | Second confirmation; re-auth (D-01); proof with an independent tool needs Foundry, which is in CI and not installed locally | anvil transfer signed by an independent tool |
| K05 bulk archive | `paymentKeyOf` dedupe; the tag-archive pattern for bounds | Atomic import; duplicate/conflict rejection; count/size caps | Deterministic ordering test |
| K06 master backup | keystore v1 (stays unchanged) | Must exclude the invoice-signing key; offline recovery documentation (D-02, D-10) | Recover a historic announcement on a fresh install |

## 5. Security gates

**Before the Sepolia beta (testnet funds only):**

1. Release manifest key ceremony done by the owner. The signed Sepolia manifest passes the build-time `validate-deployments` and the runtime readback through the user-selected RPC. An unsigned manifest still fails. (D-15)
2. Origin decision for GP-PAGES-01: a dedicated origin, or recorded `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet` acceptance with the banner shown. Note that other sites on the shared origin can read the vault ciphertext (D-03).
3. Deploy from the exact reviewed source (contracts unchanged since `beb525dd`). Read back runtime codehashes; canonical announcer; a FEE_RECIPIENT that accepts ETH (D-19).
4. Exact-SHA CI green: CI 24/24, Echidna (13 properties + 11 canaries), Slither Medium+, Foundry; Mythril shows **no record beyond the 11 dispositioned**.
5. `main` branch protection and a `v*` tag ruleset (R-07) before any tag.
6. Beta disclosure: in a vault-less session, sweep and export have no re-auth, and un-backed-up keys survive the idle lock (D-01). Alternatively, require a vault for beta sweeps.
7. Lean Pages build keeps scheme 2, the relayer service, BTC/SOL/TRON and 7702/4337 out. VERIFIED: `CORE_ORDER`; the policy feature is behind a VITE flag.
8. Add the keystore v1 independent-decode vector test (D-10).

**Before mainnet (in addition):**

1. An external professional audit of the contracts **and** the client key management. AI review does not replace it.
2. A Mythril disposition mechanism decided (D-16); full-severity Slither triage; Echidna extended (permit paths, forged signers, factory, PolicyRouter); every deployable contract analysed (D-12).
3. Spec 18 K01-K06 plus KC qualified, including the independent-recovery proof on anvil (D-02).
4. D-01 implemented (re-auth model) and D-03 (passphrase floor) hardened.
5. Release trust roots populated (manifest key, tag signers); reproducible build and published digests for out-of-band bundle checks (D-15).
6. All 73 chain-matrix cells verified (packet blocker 5); mainnet chains enabled one at a time.
7. Anti-framing (D-13) or a header-capable host; ADR-0029 decided.
8. Private security inventories reviewed (R-16); real wallet, device and browser acceptance.
9. Any scheme-2 launch: AUD24-01 (D-04), N1 (D-05), asset-leaf guard (D-06), L2 delays (D-07), ADR-0028 (D-14), and the 7702 clear-delegation flow (D-18).

## 6. Blockers and the features they block

| Blocker | Blocks |
|---|---|
| Release key + signed manifest (D-15) | Pay, Scan and Sweep on every chain (payments disabled); B03-B06 |
| Mythril policy (D-16) | Any release tag through `release.yml` |
| Branch protection / tag ruleset (R-07) | A trustworthy release process |
| D-01 re-auth decision | K03, K04, K06; mainnet sweep/export posture |
| Spec 18 implementation (D-02) | Beta exit (spec 18 priority); constraint 4 compliance |
| AUD24-01 (D-04), N1 (D-05), D-06, D-07 | Any scheme-2 / policy-account deployment (D03) |
| ADR-0028 (D-14) | Guardian recovery (D04) |
| Origin decision (GP-PAGES-01, D-13) | Pages beta with payments on the shared origin; mainnet hosting |

## 7. Missing test coverage

1. An independent (non-GhostPay) decode of a fixed keystore v1 vector in CI. `indep-keystore-recovery.mjs` is a template.
2. Sweep, export and raw-export behaviour in a vault-less session, end to end. Today `keyVault.test.ts:241` pins "no step-up".
3. Echidna: `payERC20WithPermit`/`sweepWithPermit`, forged-signer sequences, hostile or reentrant tokens and destinations, the policy unlimited leaf, factory, PolicyRouter.
4. Complete Mythril runs for Router and PolicyRouter. Any analysis at all for payer-hiding, pool and confidential contracts.
5. Slither Low/Info triage.
6. Scheme-2 L2 timing tests (timestamp jump, censorship window).
7. K04/K06 recovery proofs (anvil plus an independent tool; offline master recovery).
8. Browser no-secret-egress tests for the export flows.
9. A second independent EIP-5564 implementation cross-check. Vectors currently come from the ScopeLift SDK only; the bigint reference re-derives the same hash convention.
10. pool-sdk backup strength and bounds.
11. Pages framing test.
12. A bundle-scan rule proving the legacy unsigned manifest path is absent (D-09).
13. Refusal of scheme-2 invoices for assets without a leaf (D-06; existence UNVERIFIED).

## 8. Owner decisions needed

1. The re-auth model for in-memory or vault-less sellers (D-01, R-15, inside K03).
2. Whether raw keys may ever be copied to the clipboard (spec 18 wording), and whether the BTC/SOL/TRON seed reveal should match (D-08).
3. The Mythril disposition mechanism, or keeping releases blocked (D-16).
4. N1: a zero-fee factory or a fail-open `_collectFee` (D-05).
5. AUD24-01: the salt-only ABI change (D-04).
6. Release trust roots and the ADR-0029 origin (D-15, D-13).
7. The mainnet passphrase floor and whether the generated passphrase is the default (D-03).
8. Per-chain L2 minimum delays for scheme 2 (D-07).
9. Accept or reject ADR-0028, with no custodial guardians (D-14).
10. The FEE_RECIPIENT account type (D-19).
11. The 7702 delegate clearing policy (D-18).

## 9. UNVERIFIED, and why

- **Foundry, Echidna, Mythril and Slither outputs.** The tools are not installed here, and artifact downloads hit a 403. Only the CI job conclusions are VERIFIED.
- **Mythril on the qualified head.** The "10 identical records, R8 absent" claim comes from the packet.
- **L2 protocol parameters.** The OP Stack and Arbitrum windows in D-07 are INFERRED from public protocol design and were not checked this session.
- **Lean bundle contents.** Whether the legacy manifest path or other strings appear in the lean bundle is unknown: building dist is not allowed in the shared worktree.
- **Scheme-2 client guards.** Client-side refusal of assets without a leaf was not traced end to end.
- **Real-world GPU scrypt cost.** The cost estimate behind D-03 is INFERRED.
- **CodeQL, Dependabot and secret-scanning inventories.** Not accessible (R-16).

Files: `SECURITY_CRYPTO.md`, `findings.json`, `scripts/{indep-vectors.cjs, indep-keystore-recovery.mjs, passphrase-probe.mjs, make-findings.cjs}`, `logs/*.log`, `artifacts/{mythril,echidna}-job-*.log` (CI job logs; the reports themselves are not inside).
