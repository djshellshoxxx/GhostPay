# P13 confidential amounts: implementation record (client core, phase 1)

Status: **experimental, default off, testnet/fixture only, not independently reviewed, not deployed.** The owner approved
merging it into main as dormant code on 2026-11-25. That merge does not activate it or count as independent review.
Nothing here authorizes settlement, deployment, real funds, pricing or a confidentiality claim to users.
Spec: [SPEC.md](SPEC.md) (normative), [COMMON.md](../COMMON.md). Branch `nodata/eloquent-shannon-gfv6t9`,
base main `c8e131c1`, spec ancestry `8846d555` merged. Test evidence and SHAs: section 9.

## 1. Discovery and inventory (2026-11-25)

| Item | Where | State | Evidence |
|---|---|---|---|
| P13 spec | `future/p13-confidential-amounts` (`8846d555`) | spec only, 679 commits behind main | `git diff --stat` showed docs only |
| Issue #284 (P13 line) | GitHub | open, future-only, no implementation authorized | issue body |
| `@ghostpay/confidential-amounts` | main | implemented PoC: `ConfidentialBackend`, CT-1 Zama adapter over a port, CT-M cleartext ledger, metadata codec, decrypt scheduler, manifest + chain guard, copy | 88 tests pass on main base |
| `@ghostpay/confidential-contracts` | main | Hardhat PoC router/wrapper over ERC-7984 (fhEVM mock only) | package README, audit `docs/remote/privacy-specs/audit-confidential-tokens.md` |
| Router return-bomb fix `cd544529` | `security/mythril-full-remediation-20261118` and 2 integration branches | **not on main**; contract change, out of P13 scope | `git branch -r --contains` |
| CT-C-2 fee-event forensics test `4bfaffa5` | `audit/ct-c-2-fee-event-forensics-20261121` | not on main; test-only, contracts lane | same |
| Protocol comparison CT-0..CT-6 | `docs/remote/privacy-specs/confidential-tokens.md` section 3 | sourced table exists ([P]/[S]/[U] tags) | reused, not re-derived |
| Shared COMMON types (`ModuleResult`, `AssetRefV1`, capability) | any package | **none on main** (P08 branch keeps its own) | `git grep` on main |
| UI amount masking (`ux-privacy`, #286 PRs) | main/PRs | screen masking only; no on-chain effect | route class `ui-mask` below |
| apps/web wiring of confidential amounts | main | **none** (no import of the package) | `grep -rl confidential apps/web/src` empty |
| Active P13 worker claims | `docs/ai/ACTIVE_WORK.md`, open PRs | only the 2026-11-19 spec claim; no implementation PR | PR list 2026-11-25 |

Duplicated/obsolete: `CleartextLedger` and the Solidity router implement the same rules twice (audit CT-09, kept; P13
cross-checks its split preview against the same `FEE_DIVISOR`). Nothing removed.

## 2. What is and is not confidential

| Route | On-chain amount | Claim allowed | Notes |
|---|---|---|---|
| Transparent ETH / ERC-20 (current router) | **public** | no | P13-A01; nothing in the client changes this |
| Screen masking (`ui-mask`) | **public** | no | hides digits on one device only |
| CT-M cleartext fixture | plaintext in memory | no | labelled `fixture-only` (P13-A02) |
| CT-1 Zama fhEVM / ERC-7984 | encrypted handle | yes, amount only, under Zama threshold trust | **unavailable** here: code hashes unpinned (CT-08), mock-only evidence (CT-10) |
| Commitment + range-proof (ZK) | n/a | no | no audited EVM implementation selected (spec table: "ZK-based ERC-7984: none found [U]") |

Still public with CT-1 (from `classifyRoute('ct1-zama').publicFields`, audit CT-03..CT-07): payer address, stealth
address, token and router contracts, block time, gas payer, ETH gas buffer, view tag, wrap and unwrap amounts, ACL
grants, wrapped total supply, ciphertext handles, and decrypt-request metadata seen by the hosted relayer (stealth
address, handle, IP, time). The fee recipient can decrypt epoch fee totals; with low traffic that reveals the gross
within 400 units (CT-03). Zero-value "silent" transfers are indistinguishable until decrypted (CT-05).

## 3. Trust assumptions and guarantees of this phase

- Keys: record key is a non-extractable WebCrypto AES-256-GCM key supplied by the composition root. Stealth/spend keys
  are not touched by P13 code. Nothing is sent anywhere: P13 sources contain no fetch, storage, logging or dynamic
  import (enforced by `boundary.test.ts`).
- Cryptography: only AES-256-GCM via WebCrypto (same primitive/parameters as ADR-0005 and `ux-vault`) and sha256 via
  viem. No new primitive. The plan digest excludes amounts (an unkeyed hash of a low-entropy amount is brute-forceable);
  amounts are bound by the authenticated record.
- Confidentiality of stored records rests on the record key; a compromised page or device sees everything (COMMON 6).
  `SecretAmount` is a guardrail (no JSON/String/coercion/clone path), not memory protection: bigints cannot be wiped.
- Integrity: envelopes are bound to record id, revision and namespace (AAD); CAS prevents silent cross-tab overwrite;
  in-session rollback is detected. Cross-session rollback by an attacker who can write storage is **not** detected
  without an external monotonic counter (owner decision D6).
- Settlement: none. `authorize/sign/submit/wrap/unwrap/decrypt/transfer` return `P13_SETTLEMENT_DISABLED` in every
  configuration; only `ctm-cleartext` preparation/review on chain 31337 can be enabled, and only with a consent value
  equal to the current disclosure version digest (fields, keys and exact wording). That digest identifies what was
  shown; it is computable by any caller and is not proof that a person saw it.
- Stale work: plan writes run a liveness guard (abort, epoch, deadline) after sealing and immediately before the
  compare-and-set, so a cancelled or stale operation commits nothing; a commit already in flight completes and is then
  reported stale. Plans from an older session epoch stay unreviewable (re-prepare or cancel).

## 4. Implemented components (`packages/confidential-amounts/src/future/p13/`)

| File | Responsibility | Acceptance IDs |
|---|---|---|
| `units.ts` | canonical `DecimalUnits`, exact display parse/format (no floats, no silent rounding), euint64 domain, checked add/sub, OZ wrapper decimals/rate mirror (min(d,6), 10^(d-6)), exact underlying↔confidential units, router split `fee=floor(g/400)`, minimal `grossForNet`, plan-level conservation check | A03 |
| `asset.ts`, `strict.ts` | strict `AssetRefV1` / `ConfidentialAssetV1` decoders (exact keys, no accessors/symbols/classes), `eip155:` testnet allow-list, pinned manifest digests (any manifest change fails closed), required trust statements, explicit approved-asset list | A04, A05 |
| `secret.ts` | `SecretAmount`, bounded `assertNoSecretAmount` payload scanner | A08 |
| `disclosure.ts`, `copy.ts` | route classification, disclosure built from backend info + P13 limits, forbidden-wording check, consent digest | A01, A02 |
| `gate.ts` | default-off gate, capability descriptors (`fixture-only` / `unavailable`), P13 fee refusal | A01, A10 |
| `lifecycle.ts` | transition table, evidence interpretation (hash/receipt/zero/underpaid never verify; reorg back to submitted), epoch/abort/deadline guard | A06, A09, A11 |
| `record.ts`, `cipher.ts`, `store.ts` | canonical record codec; `RecordSealer` port + AES-GCM adapter; GPC1 envelope store with CAS, corrupt reporting, reload reconciliation, ciphertext backup export and staged import | A07 (fixture), A08 |
| `invoice.ts` | unchanged invoice-schema v1/v2 → confidential amounts (fixed_token only, exact precision, payer/seller fee policy) | A04 |
| `plan.ts` | gate-first fixture preparation/review/cancel journaled before return; authorize always refused | A01, A11 |

Ordinary payments: no existing file outside `confidential-amounts` changed except the regenerated package map and
lockfile workspace entries; invoice-schema is consumed, not modified; apps/web does not import P13.

## 5. Remaining work (not done, in dependency order)

1. Owner decisions D1–D8 (section 8). 2. Protocol ADR selecting the settlement protocol (spec step 1). 3. P06 role
contract (hard dependency) for view/decrypt roles. 4. Pin CT-1 manifest code hashes from a reviewed source and run
CT-M against the Solidity contracts on a local chain (CT-08/CT-09/CT-10). 5. `AmountSettlementProvider.verifyEvidence`
adapter reading receipts and decrypt results through P02-approved transports. 6. Vault integration: derive/wrap the
record key under the profile key and include P13 envelopes in the vault backup (P05 owner). 7. Production IndexedDB
port and cross-session monotonic counter. 8. apps/web composition behind the flag, outside the lean artifact, with
consent UI, i18n and accessibility. 9. Firefox/WebKit/mobile qualification. 10. Independent cryptographic, contract
and privacy review. 11. Separately authorized testnet phase.

## 6. Dependencies and licensing

New runtime dependency: `@ghostpay/invoice-schema` 0.1.0 (workspace, UNLICENSED; brings `@noble/curves`/`@noble/hashes`
2.4.0, MIT, already in the register). New dev dependencies (already pinned by `apps/web`): `@playwright/test` 1.64.1
(Apache-2.0), `vite` 8.3.5 (MIT). No new third-party package. `THIRD_PARTY.md` generated tables are already stale on
main `c8e131c1` (`node docs/tools/third-party-table.mjs --check` fails there); regeneration was left to the register
owner to avoid a 333-line unrelated rewrite. CT-1 code paths remain subject to Zama BSD-3-Clause-Clear plus patent
licence for commercial use (audit CT-16; owner decision D7).

## 7. Recovery guarantees and limits

- Records survive reload (Chromium evidence) and restore from a ciphertext-only backup into a fresh database **with the
  same record key and namespace**. Import is all-or-nothing and never downgrades a newer revision.
- Losing the record key loses the records, not funds: confidential balances stay controlled by stealth keys; finding
  them again needs a rescan and decryption through the protocol (copy `P13_RECORD_KEY`).
- Interrupted work: stale reviews are invalidated and, like other plans from an older epoch, are counted as
  `stalePlans` (not reviewable); `submitted` becomes `unknown`; `authorized` is only flagged. Nothing is resent or
  cancelled automatically. The store only accepts `verified`/`reverted` with the matching evidence reason.
- Corrupt envelopes are reported and kept, never deleted.

## 8. Outstanding owner decisions

D1 settlement protocol (CT-1 vs CT-2/3 vs shielded pools vs none); D2 represented assets and wrapper policy; D3
`invoice-schema` `amountVisibility` field (spec 5.2 of confidential-tokens.md; not added here); D4 decrypt relayer
exposure and transport (CT-07); D5 fee design for confidential payments (CT-03; FEE01); D6 record-key custody,
backup inclusion and monotonic counter (P05); D7 Zama licensing; D8 independent audit scope and the unmerged router
fix `cd544529`.

## 9. Audit follow-up (2026-11-25)

Fuzz, stress, two-tab browser QA, an AI-assisted security audit and a bug search found 22 issues (1 high, 6 medium,
7 low, 8 info) across P13 and the PoC; 21 are fixed with regression tests and 1 is accepted (A12). The most important change:
a payment is verified only with on-chain provenance from the pinned router and token (B1). Report:
[`docs/audits/P13_CONFIDENTIAL_AMOUNTS_QA_20261125.md`](../../../audits/P13_CONFIDENTIAL_AMOUNTS_QA_20261125.md).

## 10. Verification

See the handoff `docs/handoffs/P13_CONFIDENTIAL_AMOUNTS_20261125.md` for exact commands, SHAs and results.
