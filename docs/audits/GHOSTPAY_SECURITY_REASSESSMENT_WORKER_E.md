# Security reassessment, worker E (crypto, chains, contracts)

AI-assisted re-verification, not a professional audit. Branch `work/e-security` (base `origin/claude/lucid-meitner-apalzc`). Nothing deployed, no real funds.
Scope: packages/core-crypto, btc-*, chain-adapters, chain-evm-extra, chain-solana, chain-tron, solana-stealth, tron-adapter, address-safety, policy-scheme, contracts (read only), payer-hiding-contracts (read only), pool-contracts (read only), confidential-*, pool-circuits (TS only).
Contracts: no `forge` here, so no `.sol` edited and no Solidity test run. Contract status is from reading current source plus the committed test names, not from executing them.
Not re-verified (outside E ownership): apps/web, apps/relayer, invoice-schema (one spot check), secret-box, hosting/CI/docs findings from 03, 24, 20, 21 that live outside E packages. They are listed as "other owner".

Baseline (plain `vitest run`; the `--coverage` wrapper fails in this sandbox for core-crypto): core-crypto 75, chain-adapters 448+18 skipped, btc-silent-payments, btc-payjoin, btc-family, chain-evm-extra, chain-solana, chain-tron 42, solana-stealth 109, tron-adapter 75, address-safety 76, policy-scheme 88+7 skipped, confidential-amounts 88, pool-circuits 19 + skipped: all pass after the fixes below.

## Defects fixed in this pass (test first: RED, fix, GREEN, neighbours)

| id | sev | what | test |
|---|---|---|---|
| Haiku R2 F3 | Low | `pool-circuits/src/inputs.ts` accepted value 0 for withdraw (existing and withdrawn) and ragequit, while `GhostPayShieldedPool.sol:160,206` revert `InvalidValue` on 0 and deposit (`:285`) refuses zero notes. Now fails early with `OUT_OF_RANGE`. | `helpers.test.ts` "zero values fail early" (was NO_THROW), property test updated |
| CHAIN-ADAPTERS-10 (a) | Low | `deployments.ts isRealDate` accepted `2026-02-30` (Date.parse rolls over). Now requires a real calendar day. | `deployments.test.ts` (2026-02-30, 2026-04-31) |
| CHAIN-ADAPTERS-10 (b) | Low | `rpc.ts createClient` with `retries: NaN` retried forever (`attempt >= NaN` never true). RED run hung until killed. NaN/Infinity now means 0. Needs a caller bug, not attacker input. | `rpc.test.ts` "bounds retries" |
| CHAIN-ADAPTERS-10 (c) | Low | `quote.ts fiatToTokenAmount` did not bound `price.decimals` (`10n ** BigInt(2**31)`). Now 0..36 like the other decimals. `readPrice` already bounded it; direct callers were not. | `quote.test.ts` |
| SOLANA-TRON-08 | Low | `tron-adapter/src/rpc.ts getBlockRange` accepted a short, empty or gapped block list; `scanTron` then moved on and skipped payments silently. Now fails `INVALID_RESPONSE` unless the range is whole and contiguous. An old test encoded "empty answer = []" and was changed. | `scan.test.ts` "block range completeness" |

## Reassessment table

Status: fixed / still-valid / severity-changed / FP / other-owner. File:line is current code.

### Audit 02 (contracts), re-checked against audit 26 and current source

| id | orig | status | evidence | test |
|---|---|---|---|---|
| 02 M-01 immutable fee recipient | Med | still-valid, by design, Low | `GhostPayRouter.sol:57` immutable; no admin. Ops mitigation only | `Router.audit.t.sol` EXPLOIT tests (not run here) |
| 02 M-02 router scheme 2 | Med | fixed | `GhostPayPolicyRouter.sol:46` `SCHEME_ID = 0x47500002` | existing |
| 02 M-03 / C-04 fee-token freezes accounts | Med | fixed, residual AUD24-02 | fee waiver in `PolicyAccountFactory.sol` ~113-164 | `Policy.audit.t.sol` |
| 02 L-01 return-data bomb | Low | fixed | `GhostPayRouter.sol:245` and `GhostPayPolicyRouter.sol:223` use assembly call with no return copy; `PolicyAccount.sol` same | gas tests |
| 02 L-02 announcement spoofing | Low | still-valid, by design (client side) | router checks marker/asset/net only | - |
| 02 L-03 sweep fee dodge | Low | still-valid (service level) | - | `Sweep.audit.t.sol` |
| 02 L-04 limit leaf not signed | Low | fixed | `PolicyAccount.sol:165` `limitLeafHash` in `WITHDRAW_TYPEHASH`, checked `:173-179` | existing |
| 02 L-05 no rescue | Low | accepted by design | - | - |
| 02 L-06 deploy-script gaps | Low | mostly fixed | `DeployBase.s.sol:61-75` allowlist, `ALLOW_LOCAL`; router constructors still skip announcer code check (`GhostPayRouter.sol:62-64`) | - |
| 02 I-02 min delay | Info | fixed | `PolicyAccountFactory.sol:36` `MIN_DELAY = 1 hours`, `MAX_DELAY` 30 days | existing |
| 02 I-01, I-03..I-08 | Info | still-valid, accepted | - | - |

### Audit 26 (contracts 2026-11) and 05 contracts-core

| id | orig | status | evidence |
|---|---|---|---|
| AUD24-01 policyHash in router calldata (privacy regression) | Med | still-valid, owner decision | `GhostPayPolicyRouter.sol:96,112,139,164` take `PolicyRef`; no fix since `fc57154` for this item |
| AUD24-02 fee-waiver veto by token hook | Low | still-valid, documented | factory waiver; no in-contract fix possible |
| AUD24-03 docs describe salt-only ABI | Info | not re-checked (docs) | - |
| AUD24-04 manifest schema looser than validator | Info | still-valid | `deployments/schema.json` vs `chain-adapters/src/deployments.ts`; no `policyRouter` field |
| AUD24-05 pins optional, smoke checks weak | Info | still-valid | `SmokeSepolia.s.sol:42-43` only non-zero separator |
| AUD24-06 31337 bypasses opt-in | Info | fixed | `DeployBase.s.sol:74-75` 31337 needs `ALLOW_LOCAL` (the 26 text predates it) |
| AUD24-07 `MIN_POLICY` under-counts head | Info | still-valid, benign | `payer-hiding-contracts/src/RouterCall.sol:24` still `4 + 8*32`; `payloadHash` binds the calldata |
| CONTRACTS-CORE-01 policy buffer stranded | Low | still-valid | `GhostPayPolicyRouter.sol:161-178` |
| CONTRACTS-CORE-02 buffer moves native value fee-free | Low | still-valid | `GhostPayRouter.sol:132-147` |
| CONTRACTS-CORE-03 / C-06 fee token without code | Info | still-valid | `PolicyAccountFactory.sol:84-88` checks implementation code only; `DeployPolicy.s.sol:61` checks off-chain |
| CONTRACTS-CORE-04 / C-09 scheme-2 smoke, pins | Info | still-valid | as AUD24-05 |

### Audit 05 contracts-pools, Haiku notes

| id | orig | status | evidence |
|---|---|---|---|
| CONTRACTS-POOLS-01 portable paymaster sig | High | fixed (contract bound) | `GhostPayVerifyingPaymaster.sol:53-61` immutable `MAX_FEE_PER_GAS`, `MAX_PRIORITY_FEE_PER_GAS`, `MAX_PRE_VERIFICATION_GAS`; service side per audit 17 (other owner) |
| CONTRACTS-POOLS-02..09 | Med..Info | other owner (pool-relayer, payer-sponsor, pool-sdk) | - |
| Haiku R1: paymaster has no `validAfter <= validUntil` check | Low | confirmed, severity Info | `GhostPayVerifyingPaymaster.sol:119-137` reads both, rejects only `validUntil == 0`. With `validAfter > validUntil` no timestamp satisfies both, so the EntryPoint rejects every time. Fails closed, signer-controlled, no loss. A require would only give an earlier, clearer revert. Not edited (`.sol`) |
| Haiku R2 F4 NatSpec `WrongChain` | Info (doc) | confirmed | `IGhostPayShieldedPool.sol:133` says "other than 31337, 11155111 or 84532"; code `PoolConstants.isAllowedChain()` (`PoolConstants.sol:39-41`) also refuses 31337 when mainnet WETH9 has code (fork guard). Report only: add the fork refusal to the NatSpec |
| Haiku R2 F3 pool-circuits zero values | Low | confirmed and fixed (see above) | `inputs.ts` |

### Audit 05 crypto-core, 27 (EXTRA-05)

| id | orig | status | evidence | test |
|---|---|---|---|---|
| CRYPTO-CORE-01 stuck RNG in `SecretBox.random` | Low | still-valid, other owner (secret-box) | `secret-box/src/secretBox.ts:126` result unchecked | - |
| CRYPTO-CORE-02/03 secret-box guards | Low | other owner, not re-checked | - | - |
| CRYPTO-CORE-04 un-wipeable copies | Info | still-valid, accepted | noble internals | - |
| CRYPTO-CORE-05 single-oracle vectors | Info | fixed | 27: three-way differential `core-crypto/src/independent.test.ts` | passes (75) |
| CRYPTO-CORE-06 signer vs spend/view key | Info | other owner (invoice-schema) | not re-checked | - |
| CRYPTO-CORE-07 unbounded metadata decode | Info | still-valid, negligible | `core-crypto/src/stealth.ts` parse decodes the full metadata string; RPC response cap bounds it | - |
| 27 EXTRA05-F1 registry bad checksum | Low | fixed | `chain-adapters/src/registry.ts:118-121` mixed case must verify | `registry.test.ts` |
| 27 I-1..I-6 | Info | still-valid, by design | - | - |
| 03 S3-08 SecretBytes redaction | Low | fixed partly, Low | `core-crypto/src/secret.ts:53-72` `slice`/`subarray`/`toBase64` blocked; `structuredClone`, `TextDecoder`, native `toHex` remain (documented best effort) | existing |
| 24 L4-I3 SecretBytes toHex/toBase64 | Info | fixed for toBase64; `toHex` left on purpose (noble reads it) | `secret.ts:61-72` | existing |

### Audit 05 chain-adapters, 03 S3-01/S3-14, 24 chain-adapters items

| id | orig | status | evidence |
|---|---|---|---|
| 03 S3-01 manifest unauthenticated root of trust | High | severity-changed, still partly open | `deploymentsSignature.ts:19` `RELEASE_KEY = undefined`, so testnet manifests load `unsigned-dev`; mainnet refused (`:83-86`). Read-back exists. Pay-path wiring is in apps/web (other owner). Mainnet not enabled; Medium while testnet only |
| 03 S3-14 chain id verified once | Low | fixed | `rpc.ts:229` `chainRecheckMs` + reconnect recheck `:236-241`; `requestWithFallbackCheck` `:412`, used `:476` |
| CHAIN-ADAPTERS-01 oversize logs | Med | fixed | `logs.ts` range halving, audit 17/24 L4-01 |
| CHAIN-ADAPTERS-02, -03 hostile head, resume | Med | fixed | audit 17; `logs.ts`, scanClient (other owner) |
| CHAIN-ADAPTERS-04 verifyReceipt trusts any token | Med | severity-changed to Low | `payments.ts:129-195` evidence needs router caller, canonical block hash, bound transfer log or receipt; `balanceOf` on arbitrary token no longer used. "received" is still funds of any token; allowlist is a UI decision |
| CHAIN-ADAPTERS-05 read-back only in Scan | Med | other owner (apps/web wiring); package side unchanged | `deploymentsVerify.ts` |
| CHAIN-ADAPTERS-06 checkpoint past disputed page | Low | fixed | audit 17/20; scanClient (other owner) |
| CHAIN-ADAPTERS-07 manifest rollback, `'key' in opts` | Low | still-valid, latent | `deploymentsSignature.ts:83` footgun; no effect while `RELEASE_KEY` is undefined, mainnet still fail-closed. Tests rely on `key: undefined` |
| CHAIN-ADAPTERS-08 policy read-back partial | Low | still-valid, latent | `deploymentsVerify.ts:61-62` code hashes only; no `FLAT_FEE`/`FEE_TOKEN`/`IMPLEMENTATION()` read, no `policyRouter` field. Policy scheme flagged off |
| CHAIN-ADAPTERS-09 policy decoder checks binding only | Low | still-valid | `policy-scheme/src/router.ts:154-185` checks stealth/policy binding; contract enforces metadata anyway |
| CHAIN-ADAPTERS-10 validator gaps | Low | fixed this pass (a,b,c); referrer policy item still open | see top table; `rpc.ts` fetch transport sets no `referrerPolicy` |
| 24 L4-I1 manifest digest has no domain prefix | Info | not re-checked (deferred by 24); note `manifestSigningBytes` now uses `MANIFEST_SIGNING_DOMAIN` (`deploymentsSignature.ts:60`) so likely fixed | - |
| 24 open follow-up logs.ts:365 regrow refusal | minor | not re-checked | - |
| 20 / 21 / 09 web items (scan, receipts, pay) | - | other owner; `payments.ts` dedupe rule per 20 addendum in code (`payments.ts:62-110`) | existing |

### Audit 05 bitcoin, solana-tron, wallet-safety

| id | orig | status | evidence |
|---|---|---|---|
| BITCOIN-01 PayJoin sender-claimed prevouts | High | fixed | `btc-payjoin/src/receiver/checks.ts:93-100` requires `getPrevOut`, fails `unavailable` without it |
| BITCOIN-02 x-only key map hides output | Med | fixed | `btc-silent-payments/src/scan/scanner.ts:178-192` list per key |
| BITCOIN-03 Esplora fully trusted | Med | still-valid, disclosed | apps/web path (other owner) |
| BITCOIN-04 sender fee redirect | Low | still-valid | `btc-payjoin/src/sender/checks.ts` no prevout lookup for receiver inputs |
| BITCOIN-05 stops at first missing k | Low | still-valid, documented | `receiver.ts` break on first miss |
| BITCOIN-06 broadcast URL | Low | other owner | apps/web |
| BITCOIN-07 script type | Info | still-valid | no type check |
| BITCOIN-08 / L8-05 loopback http `pj=` | Info | still-valid | `btc-payjoin/src/uri.ts:39,107` loopback allowed on any network |
| SOLANA-TRON-01 duplicate memos | High | fixed | `solana-stealth/src/scan.ts:159-178` dedupe by (signature, address) |
| SOLANA-TRON-02 trustedToken default true | Med | fixed | `tron-adapter/src/scan.ts:166` `(trusted?.has(asset) ?? false)` |
| SOLANA-TRON-03 decodeRawTx differential | Med | fixed | `tron-adapter/src/tx.ts:166-182` exact canonical re-encode |
| SOLANA-TRON-04 TRC-20 sweep funding | Med | still-valid, design | no sweep builder |
| SOLANA-TRON-05 arbitrary SPL mints, no trust flag | Low | still-valid | `solana-stealth/src/scan.ts` no allow-list or flag |
| SOLANA-TRON-06 Token-2022 extensions not rejected | Low | still-valid | `solana-stealth/src/programs.ts:16` comment only |
| SOLANA-TRON-07 TRON JSON unbound to hex | Low | fixed | `tron-adapter/src/scan.ts:57-78` fields from `decodeRawTx(raw_data_hex)` |
| SOLANA-TRON-08 block gaps | Low | fixed this pass | see top table |
| SOLANA-TRON-09 `memoProgram` override | Low | still-valid | `solana-stealth/src/tx.ts:175,210` any address accepted |
| SOLANA-TRON-10..12 | Low/Info | not re-checked | - |
| WALLET-SAFETY-02 node:crypto in browser | Med | fixed | no `node:crypto` in `address-safety/src`, `core-crypto/src`, `chain-adapters/src` |
| WALLET-SAFETY-03 registry parse | Med | fixed (parse); UI part other owner | `registry.ts:118-121` |
| WALLET-SAFETY-01, 04..12 | Med..Info | other owner (apps/web `sweep.ts`, `txGuard.ts`) | not re-checked |

### Audits 03, 09, 17, 20, 21, 24 remainder, 25

Web, relayer, hosting, CI and plugin findings (S3-02..07, S3-09..13, S3-15..S3-27, 09 S3-D1..D9 UI parts, 20, 21, 24 L1/L2/L5/L7/G, 25 secret-file race) belong to other workers. Package-side S3-12 (invoice text bidi/zero-width) is fixed in `invoice-schema/src/schema.ts:167` (spot check only). 25 dependency audit: not re-run.

## Review notes (no finding)

- Fail-closed RPC handling in `chain-adapters/src/rpc.ts`: response cap while streaming, `redirect: 'error'`, id and batch checks, chain recheck after transport failure. Retry loop bounded (after the NaN fix).
- Stealth, EIP-712 sweep digests and A256GCM(-PW) envelopes: covered by the 27 differential tests; no new defect found.
- No theoretical issue is labelled a vulnerability above. Every "fixed this pass" item has a failing test before the change.
