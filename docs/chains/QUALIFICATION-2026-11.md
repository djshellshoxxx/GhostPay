# Multi-chain qualification, 2026-11

Scope: Bitcoin (BIP-352 silent payments, PayJoin), Solana, Tron, ERC-4337 payer sponsorship. This assessment is separate from the EVM beta and does not gate it. None of these chains is enabled on mainnet and none is in the EVM beta scope. Everything here is a proof of concept, unaudited, test networks only.

Method: code read at the cited file:line, package test suites run in a sandbox without Foundry, bitcoind, solana-test-validator or Docker (their evidence is CI-only and was read from `.github/workflows/integration.yml`, not re-run). Bitcoin is review only: main plus the diffs of PR #113 (`origin/claude/vibrant-cori-scu18b`) and PR #74 (`origin/claude/ar-a4-btc-headersync`), which touch the BTC packages heavily and are not reflected in the Bitcoin line numbers below unless stated.

Status vocabulary: implemented, tested locally, integration-tested in CI, externally qualified, deferred. No chain here is externally qualified.

## Summary

| Chain | Status | Local tests (this run) | CI integration | Mainnet | Estimated work remaining to a functional, testnet-qualified payment workflow |
|---|---|---|---|---|---|
| Bitcoin SP | tested locally; integration-tested in CI (regtest) | btc-silent-payments 369, btc-family 161, web btc 4 files | `scripts/integration/btc-regtest.e2e.mjs` (integration.yml) | disabled | about 35 percent (see below) |
| Bitcoin PayJoin | implemented, tested locally; not wired to the web app | btc-payjoin 158 | none in integration.yml (own `e2e/regtest.e2e.test.ts`, separate config) | not representable | about 60 percent |
| Solana | tested locally; integration-tested in CI (local validator) | solana-stealth 108, chain-solana 97, web solana | `scripts/integration/solana-local.e2e.mjs` | disabled in web; library flag `allowMainnet` | about 40 percent |
| Tron | tested locally | tron-adapter 73, chain-tron 42, web tron | none | disabled unconditionally | about 55 percent |
| ERC-4337 | implemented, tested locally; not wired to any app | payer-sponsor 128 passed, 4 skipped | Foundry/anvil only (not in integration.yml; Foundry tests in the contracts package) | chain allowlist testnet only | about 70 percent |

Percentages are judgement, not measurements. Rationale is per chain below. "Functional payment workflow" means: a payer on a public testnet can pay a recipient and the recipient can detect and sweep, with the trust assumptions documented. It does not mean audited or mainnet-ready, which none of these is close to.

## What must stay disabled (all chains)

1. Mainnet for Bitcoin, Solana, Tron. Current guards: `apps/web/src/features/btc/network.ts` (`enabled:false`, genesis refusal at `esplora.ts:268-274`), `apps/web/src/features/solana/network.ts`, `apps/web/src/features/tron/network.ts`, `packages/tron-adapter/src/adapter.ts:22,139` (unconditional throw), `packages/btc-payjoin/src/network.ts` (mainnet unrepresentable).
2. The Solana library flag `allowMainnet` (`packages/solana-stealth/src/adapter.ts:24,56`) is not passed by any app (grep of `apps` and `packages/*/src`), so it is not reachable from the product. Keep it that way; consider removing the flag.
3. The web nav lists the Bitcoin, Solana, Tron and Registry views unconditionally (`apps/web/src/App.tsx:22`). Each view carries a "Proof of concept, test networks only" notice (`BtcView.tsx:164`, `SolanaView.tsx:215`) but there is no build-time feature flag that removes them from a production bundle. For an EVM-only beta release this is the one path that is enabled and arguably should not be: gate the three chain views and the registry view behind a build flag defaulting off (owner of `apps/web`, not changed here). Test networks cannot move real value, so the severity is low, but the surface is shipped and unaudited.
4. ERC-4337 (PH-4) and the other payer-hiding modes: no app imports `@ghostpay/payer-sponsor` (grep of `apps`), so nothing is enabled in production config. Chain allowlist is `[11155111, 84532, 31337]` (`packages/payer-sponsor/src/chainGuard.ts:4`) and the paymaster contract inherits a `ChainGuard`.
5. Tron TRC-20 value credit for untrusted tokens (`trustedToken` fails closed when `trustedTokens` is unset, `packages/tron-adapter/src/scan.ts`).

## Bitcoin

### Status
Tested locally, integration-tested in CI on regtest only (BIP-352 send, scan, sweep through `testmempoolaccept`, per `scripts/integration/run-in-runner.sh:112`). Testnet4/signet and public Esplora were not exercised in any evidence I could see. Not externally qualified.

### Evidence checked
| Item | Finding | Where |
|---|---|---|
| BIP-352 vectors | Official send/receive vector file is committed and exercised. 369 tests pass in `packages/btc-silent-payments`. | `packages/btc-silent-payments/test-vectors/send_and_receive_test_vectors.json`, `src/vectors.test.ts` |
| Scanner per-outpoint mapping (audit BITCOIN-02) | Verified. Output metadata is kept per x-only key as a list and matched on `(txid, vout, amount)`; a duplicate outpoint is skipped, a shared x-only key does not hide an output. | `src/scan/scanner.ts:120-153,206` |
| PayJoin sender-claimed prevouts (audit BITCOIN-01) | Verified closed. Receiver refuses to run without `getPrevOut`, refuses on lookup failure, unknown/spent outpoint and amount/script mismatch, before any fee calculation. | `packages/btc-payjoin/src/receiver/checks.ts:93-105`; regression tests `receiver.test.ts:183,191` |
| PayJoin sender checks | Fee not lowered, payment output not substituted unless allowed, keypaths rejected. | `src/sender/checks.ts:108-173` |
| PayJoin wiring | `btc-payjoin` and `btc-family` are not imported by `apps/web` (only listed in their own package.json). PayJoin is library-only. | grep of `apps` |
| Header validation (main) | Per-block only: header hash, proof of work against the network limit, merkle root, adjacent-height linkage over a 64-entry window. Explicitly not best-chain: no retarget, chain work or fork choice; a malicious Esplora server can serve a cheap low-work fork on a test network. | `apps/web/src/features/btc/esplora.ts:286-340` |
| Header validation (PR #74 / #113) | Adds `headerchain.ts` (631 lines), `headersync.ts`, `state.ts`, web `headers.ts` and view gating of sweeps on checked inputs. This is the planned remediation. Not merged, not tested by me. | `git diff origin/main...origin/claude/ar-a4-btc-headersync --stat` |
| Reorg handling (main) | `REORG_DETECTED` thrown when adjacent verified heights disagree. No persistence of a chain across sessions, no depth/finality policy in the Bitcoin scan path. #74 adds persistence and fork streaming. | `esplora.ts:325-330` |
| Esplora trust | Single provider. Spent status (`isUnspent`) is the server's word; each matched outpoint is sent to the provider (open privacy finding PRIVACY-E2E-01). The UI states this at `BtcView.tsx:275`. Server also learns block heights read and broadcasts. | `apps/web/src/features/btc/scan.ts:83`, `esplora.ts:172` |
| Fee estimation | Fee rate comes from the server `/fee-estimates` (`esplora.ts:254`), validated as a finite positive number. Guards: warning above 50 sat/vB (`sweep.ts:27,46`), warning when fee exceeds 10 percent of the sweep (`sweep.ts:47`), hard refusal above 10 000 sat/vB (`spend.ts:71,190`), dust handling (`spend.ts:69,201`). A hostile server can still inflate the fee up to those limits. After signing, fee and vsize are re-checked against the review (`sweep.ts:99`). | |
| Sweep construction / consolidation default | Outputs start unchecked; each must be selected, so no automatic consolidation (audit PRIVACY-E2E-03). The user can still select several and link them; the review shows "Change: None". | `BtcView.tsx:28,290,382` |
| Address reuse | Silent payment addresses give a fresh output per payment by construction. There is no address-reuse warning for the sweep destination in the web UI, and no check for a destination that already appeared on chain. PayJoin receiver tracks previously seen outpoints (`receiver/seen.ts`). | |
| Mainnet | Disabled in the web network table and refused by genesis check. | `network.ts`, `esplora.ts:268` |

### Defects and gaps (Bitcoin; not edited here)
| Id | Severity | Location | Status |
|---|---|---|---|
| BTC-1 Header chain is not best-chain validated; a dishonest Esplora can serve a low-work fork and mark outputs unspent | Medium (test networks), High before mainnet | `apps/web/src/features/btc/esplora.ts:286-300` | Open on main; remediation in PR #74 (not merged) |
| BTC-2 Spend tracking is server-reported only; a sweep can be re-offered for an output already spent elsewhere | Medium | `apps/web/src/features/btc/scan.ts:83` | Open on main; PR #113 "BTC local spend tracking and wallet policy" targets this |
| BTC-3 Per-outpoint spent-status queries disclose matched outpoints to the provider | Medium (privacy) | `scan.ts:83` | Open, documented (audit 17) |
| BTC-4 Fee rate trusted from a single server within the hard cap | Low | `esplora.ts:254` | Open; mitigated by warnings |
| BTC-5 PayJoin and btc-family not wired to the product; PayJoin has no CI integration job | Info | | Open |

### Blockers to a functional workflow
Merge and review of #74 and #113; exercise on testnet4 or signet against two independent providers; wire PayJoin if it is meant to ship; a decision on a self-hosted or bulk-spentness privacy design; external review of the spend path.

### Remaining estimate
About 35 percent: the cryptography and the regtest flow are done and vector-tested, but chain validation, spend tracking and the persistence layer are in two unmerged branches, and no public-testnet run exists.

## Solana

### Status
Tested locally. Integration-tested in CI against `solana-test-validator` (`scripts/integration/solana-local.e2e.mjs`: pay SOL and SPL to two stealth addresses, scan with the view key, sweep both with sponsored fee, assert balances). Not run here. Not externally qualified.

### Evidence checked
| Item | Finding | Where |
|---|---|---|
| Stealth logic | ed25519 dual-key scheme; spend key derivation re-verified; tests 108 (solana-stealth) and 97 (chain-solana). | `packages/solana-stealth/src/stealth.ts`, `ed25519.ts` |
| Memo handling | `gpst1:` plus base58(R and view tag), 52 characters, strict length and point validation. Only top-level memo instructions are scanned (inner CPI memos ignored). Malformed memos are skipped, not thrown. Three memo program ids are scanned; only the long-deployed one is used to send. | `announcement.ts:26-55`, `scan.ts:44-60`, `programs.ts` |
| Spoofed memos | A matching memo without a credit to the derived address in the same transaction is dropped. | `scan.ts:179-181` |
| Duplicate detection | Existing test covers the same memo repeated inside one transaction (SOLANA-TRON-01, `scan.test.ts:261`). Gap found and fixed (SOL-1 below): a signature re-served non-adjacently by the RPC produced a second payment record. | |
| SPL transfer construction | `CreateIdempotent` ATA then `TransferChecked` with mint decimals; token program restricted to Token and Token-2022 (plain transfers; extensions unsupported); decimals bounded; legacy transaction capped at 1232 bytes. | `tx.ts:70-120,205-240` |
| Commitment level | Library scan and tx fetch use `finalized` throughout (default `getSlot`, `getTransaction`, `getSignaturesForAddress`). Web view uses `finalized` for balances and `preflightCommitment: finalized` for send. The CI e2e sends with `confirmed` preflight and waits for `finalized` before scanning, consistent with this. Conservative: slow, no reorg exposure. | `scan.ts:75,90`, `rpc.ts:121,142,230`, `apps/web/src/features/solana/rpc.ts:38,45` |
| RPC trust | HTTPS only (http for localhost), no embedded credentials, `redirect: 'error'`, timeout, response id must echo, bigint-lossless JSON parse, strict response shape checks, slot in `getTransaction` must equal the slot in the signature listing. No default endpoint. A single RPC still decides what exists; balances and "credit" are the RPC's word. Web checks cluster genesis hash and refuses mainnet's. | `rpc.ts:36-95`, `scan.ts:92`, `apps/web/src/features/solana/rpc.ts:12-30` |
| Fee payer / sponsorship | Transaction builder supports a separate fee payer; no relayer or fee program exists (`SOLANA_FEES` all `not_deployed`). Sweep defaults fee payer to the stealth address itself, which then pays from its balance. | `adapter.ts:34-40`, `tx.ts:238-245` |
| Signer handling | The package never sends and never holds the payer key: it returns an unsigned transaction. Stealth key signs with a scalar-based signer; every attached signature is verified against the message before use (`addSignature`). | `tx.ts:122-150` |
| Parallel packages | `chain-solana` is a second, RPC-less skeleton implementation of the same scheme; no app imports it. Two implementations of one scheme invite divergence. | `packages/chain-solana/src/adapter.ts` |

### Defects
| Id | Severity | Location | Status |
|---|---|---|---|
| SOL-1 Duplicate payment records when the same signature is returned twice, non-adjacently (RPC overlap across pages or a replaying RPC). The dedup only compared with the previous record's signature. | Medium (double credit in a ledger that keys on detections) | `packages/solana-stealth/src/scan.ts:165-178` (was lines 167-180) | Fixed: scan-wide `Set` keyed on `signature:stealthAddress`; regression test `scan.test.ts` "re-serves a signature non-adjacently (EXTRA-08)", fails on the old code |
| SOL-2 A native sweep with `closeTokenAccount` is refused, but an SPL sweep with `closeTokenAccount: true` and `amount` below the token balance builds a transaction the runtime will reject (close needs zero balance). No fund loss, failed transaction wastes a fee. | Low | `tx.ts:230-236` | Open |
| SOL-3 Native sweep of less than the full balance can leave the stealth account below rent exemption, which the runtime rejects. Callers must sweep all but fee or leave rent. Not validated by the builder. | Low | `tx.ts:215-218` | Open |
| SOL-4 No on-chain program or relayer: sponsored fee needs an out-of-band co-signer. Fee payer links transactions (documented). | Info | `docs/chains/solana.md` | Open by design |
| SOL-5 Web nav exposes the view in production builds (see "What must stay disabled" item 3). | Low | `apps/web/src/App.tsx:22` | Open |

### Blockers to a functional workflow
Run on devnet against a real RPC (the CI evidence is a local validator); token allowlist (no mint is pinned; USDC/USDT unverified); decision on Token-2022 extension handling (reject mints with transfer hooks or fees); fee sponsorship service; third-party review.

### Remaining estimate
About 40 percent: scheme, builders, scanner and local-validator e2e exist; public-cluster behaviour, token policy, sponsorship, indexing at scale (paging the global memo program is O(all memos), `scan.ts` remark) and review do not.

## Tron

### Status
Tested locally against mock RPC only. No CI integration job and no Nile run. Not externally qualified.

### Evidence checked
| Item | Finding | Where |
|---|---|---|
| Address validation | Strict: `T` plus 33 base58 characters, base58check (double SHA-256, 4-byte checksum), exactly 21 bytes, prefix `0x41`. Existing negative tests cover bad checksum, length, charset and wrong prefix (valid checksum), and every single-character mutation. | `packages/tron-adapter/src/address.ts:13-35`; `address.test.ts:36,51`; `packages/chain-tron/src/address.test.ts:73-105,161,177` |
| TRC-20 encoding | `transfer(address,uint256)` selector `a9059cbb`, 12 zero pad bytes, 20-byte address, big-endian 32-byte amount, 68 bytes total; amount 1..2^256-1. Vectors cross-checked against an independent Python implementation (`scripts/crosscheck_vectors.py`). | `tx.ts:51-62` |
| Protobuf strictness (previous finding) | Decoder rejects truncation, wire types other than 0 and 2, field 0 and over-long lengths. It did NOT reject duplicate scalar fields, unknown fields nested below the top level, wrong wire types, non-canonical varints or reordered fields (TRON-1, fixed below). | `protobuf.ts`, `tx.ts:141-210` |
| Energy and bandwidth | Resource model documented; `parseChainParameters` fails closed on missing keys; bandwidth estimate is an upper bound; TRC-20 energy figures are labelled estimates; `suggestFeeLimit` adds a margin; `fee_limit` is mandatory and > 0 with no default; `chain-tron` caps it at 15 000 TRX. Key names and prices are unverified against live docs. | `fees.ts`, `docs/chains/tron.md` |
| Sweep funding | A fresh stealth address holds the token but no TRX or energy, so a TRC-20 sweep cannot pay for itself; the three funding options each link payer or sponsor to the stealth address. No relayer. Documented only. | `fees.ts:1-14`, `docs/chains/tron.md` |
| Confirmation handling | The scanner takes its head from `getnowblock` and reads unconfirmed blocks; there is no solidity-node or confirmation-depth step (TRON-2). | `scan.ts:148`, `apps/web/src/features/tron/scan.ts:47` |
| RPC trust | HTTPS only (http for localhost), `redirect: 'error'`, 8 MiB body cap, timeout, API key header never logged. The scanner recomputes the txid from `raw_data_hex`. The node's JSON `raw_data` was previously trusted for owner, recipient and amount although only `raw_data_hex` is hashed (TRON-3, fixed below). The `contractRet` result is node-reported and unsigned, so it is the node's word. TRC-20 credit additionally requires a matching `Transfer` log from `gettransactioninfobyid`, which is also the node's word. The web view only refuses a node reporting the mainnet genesis; it does not pin the expected testnet genesis (Solana does). | `scan.ts:54-90`, `apps/web/src/features/tron/rpc.ts:32-39` |
| Sweep review | The web sweep decodes the transaction it built locally with `decodeRawTx` before signing, so the strictness fix applies. | `apps/web/src/features/tron/sweep.ts:114` |
| Mainnet | `createTronAdapter({network:'mainnet'})` always throws; web table has `enabled:false`. | `adapter.ts:22,139`, `apps/web/src/features/tron/network.ts:23` |
| Parallel packages | `chain-tron` is an RPC-less skeleton with its own address/TRC-20 code; no app imports it. | |

### Defects
| Id | Severity | Location | Status |
|---|---|---|---|
| TRON-1 `decodeRawTx` is not canonical: duplicate scalar fields (timestamp, expiration, fee_limit, ref block, memo, amount, owner), unknown fields inside the Contract, Any and TransferContract messages, wrong wire types and over-long varints were accepted. `find` takes the first occurrence while a protobuf node takes the last, so the reviewed amount or fee_limit could differ from what a node executes if a node-built or third-party transaction were reviewed. | Medium (review/verification trust boundary; the web sweep builds its own bytes, so not exploitable there today) | `packages/tron-adapter/src/tx.ts:141-210` | Fixed: decoded values are re-encoded with the package's builders and must equal the input byte for byte; 8 new negative tests (trailing bytes, unknown top-level field, duplicate scalars, nested unknown/duplicate fields, over-long varint, calldata not exactly `transfer`, non-0x41 owner). Three of them fail on the old code |
| TRON-3 `parseCandidate` hashed `raw_data_hex` but took payer, recipient, amount and memo from the unhashed JSON `raw_data`. A hostile node could present a JSON payment to the viewer's stealth address backed by hex bytes that pay someone else (same memo). | Medium (RPC trust) | `packages/tron-adapter/src/scan.ts:54-90` | Fixed: the hashed bytes are strictly decoded and must equal the JSON on kind, payer, recipient, contract, amount and memo; regression test "skips a tx whose node JSON disagrees with the hashed raw_data_hex (EXTRA-09)", fails on the old code |
| TRON-2 No confirmation depth or solidified-block read; scanning reads the head block; a reorged block could be reported as a payment and swept against. | Medium | `scan.ts:148` | Open. Needs a design (solidity node endpoint or depth parameter) |
| TRON-4 Web view does not pin the expected genesis for Nile/Shasta (only refuses mainnet's) | Low | `apps/web/src/features/tron/rpc.ts:32` | Open |
| TRON-5 Block-range endpoint semantics (`getblockbylimitnext` end exclusive), memo size acceptance and fee key names are unverified against live nodes | Medium (qualification gap) | `rpc.ts:96`, `docs/chains/tron.md` | Open; needs a Nile run |
| TRON-6 Native TRX amount is read from a JSON number and rejected above 2^53 (fail closed); fine. TRC-20 `call_value` check relies on the new canonical re-encode as well as the JSON check | Info | | Closed by TRON-1 fix |

### Blockers to a functional workflow
A Nile run (faucet funds, real ref block, broadcast, memo size and fee behaviour); confirmation policy (TRON-2); an integration job (a local java-tron or quickstart container) alongside the Bitcoin and Solana jobs; a sweep-funding answer (energy delegation or a TRX top-up with its privacy cost); trusted-token list management; review.

### Remaining estimate
About 55 percent: encoding, signing, scan and sweep review are built and cross-checked, but nothing has touched a real node, and the funding and confirmation questions are open design items.

## ERC-4337 (payer-hiding mode PH-4)

### Status
Implemented and tested locally (TypeScript library and Solidity contracts). Not integrated into any app. Foundry was not available here, so the contract tests were not re-run; `payer-sponsor` ran 128 passed, 4 skipped (the skipped ones are the anvil end-to-end tests). The Foundry/anvil evidence is not in `.github/workflows/integration.yml`; `ci.yml` runs anvil suites for workspaces that have them. Review only: the relayer team owns this code and I made no edits.

### Evidence checked
| Item | Finding | Where |
|---|---|---|
| UserOperation construction | `PackedUserOperation` builder, batch of 1 to 8 calls, 128-bit field packing checks, nonce range check. | `packages/payer-sponsor/src/erc4337/userop.ts:59-229` |
| EntryPoint version | v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`); v0.8 constant exists but is declared unsupported. The v0.7 source is fetched for tests only by `packages/payer-hiding-contracts/scripts/fetch-entrypoint.sh` (the path in the task, `scripts/fetch-entrypoint.sh`, does not exist at repo root; the script is in that package), pinned to `@account-abstraction/contracts@0.7.0`. The paymaster constructor requires the EntryPoint to have code, and the manifest has an `entryPointCodeHash` for a runtime check. | `account.ts:14-17`, `GhostPayVerifyingPaymaster.sol:104-107`, `manifest.ts:14` |
| Paymaster authorization and signature fields | `paymasterAndData` is exactly 129 bytes: paymaster, verification gas, postOp gas, `validUntil`, `validAfter`, 65-byte signature. The signed hash covers sender, nonce, `initCode`, `callData`, account gas limits, `preVerificationGas`, `gasFees`, paymaster gas limits, chain id, paymaster address and the window. `validationData` packs sigFailed, `validUntil`, `validAfter` in the v0.7 layout; `validUntil == 0` is refused; `tryRecover` rejects malleable signatures. TypeScript and Solidity hashing mirror each other (tests in `erc4337.test.ts`). | `GhostPayVerifyingPaymaster.sol:112-175`, `paymaster.ts:67-106` |
| Gas-limit bounds | Immutable caps on `maxFeePerGas`, `maxPriorityFeePerGas` and `preVerificationGas` (constructor rejects zero and priority above fee). There is no cap on `callGasLimit` or `verificationGasLimit`; they are bound by the signature, so only a compromised signer could exceed intent. | `GhostPayVerifyingPaymaster.sol:114-121,92-102` |
| Nonce / replay | Signature binds the account nonce (single use per operation), the chain id and the paymaster address, so no cross-chain or cross-paymaster replay. The bundler/beneficiary is not bound (documented, mitigated by the caps). | `GhostPayVerifyingPaymaster.sol:11-24,159-174` |
| `postOp` | Reverts always; context is empty so the EntryPoint never calls it. No ERC-20 gas payment. | `...Paymaster.sol:130-134` |
| Privileged role | A single immutable `SPONSOR_ADMIN` can withdraw deposit and manage stake; no upgrade path; no way to rotate the signer (new deployment needed). | `...Paymaster.sol:136-170` |
| Production enablement | Not wired: no import of `@ghostpay/payer-sponsor` or `payer-hiding-contracts` in `apps/web` or `apps/relayer`. Chain allowlist is testnet only (`chainGuard.ts:4`); the mode table reports `NO_ENTRYPOINT` when the manifest lacks entry point, factory or paymaster (`modes.ts:191`). Nothing here is on in production config. | |

### Defects and gaps (review only)
| Id | Severity | Location | Status |
|---|---|---|---|
| AA-1 No cap on `callGasLimit`/`verificationGasLimit` in the paymaster; relies on the sponsor service's signing policy | Low | `GhostPayVerifyingPaymaster.sol:112-125` | Open, owner: relayer team |
| AA-2 Signer rotation needs redeploy; lost admin key strands the deposit (documented) | Low | contract header | Open by design |
| AA-3 No real bundler or public-testnet run; the EntryPoint address is checked by manifest code hash only if the client uses it | Medium (qualification gap) | `manifest.ts`, `docs/remote/privacy-specs/payer-hiding.md` | Open |
| AA-4 The Foundry tests were not re-run here and there is no integration job for PH-4 | Info | | Open |

### Blockers to a functional workflow
A bundler run on Sepolia or Base Sepolia, the sponsor service wired to the relayer app, paymaster policy for the uncapped gas fields, an ADR superseding ADR-0009 (per the spec), external review of the account and paymaster (own code, not the audited reference implementation).

### Remaining estimate
About 70 percent for the contract and client library; essentially none of the service integration. The estimate covers a testnet-qualified workflow only.

## Test runs in this assessment

| Package | Result |
|---|---|
| solana-stealth | 108 passed (107 before, +1 regression test); coverage thresholds pass; typecheck and lint clean |
| chain-solana | 97 passed |
| tron-adapter | 73 passed (64 before, +8 strictness tests, +1 scan test); coverage thresholds pass; typecheck and lint clean |
| chain-tron | 42 passed |
| btc-silent-payments | 369 passed |
| btc-payjoin | 158 passed |
| btc-family | 161 passed |
| payer-sponsor | 128 passed, 4 skipped |
| apps/web features solana, tron, btc | 117 passed, 1 skipped (regtest e2e) |

Not run: Foundry tests, anvil end-to-end tests, bitcoind regtest end-to-end, solana-test-validator end-to-end, any Tron node. Docker and those binaries are unavailable here.
