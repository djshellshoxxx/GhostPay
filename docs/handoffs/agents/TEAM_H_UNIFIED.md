# Team H — encrypted BTC scan continuity

- Repository: djshellshoxxx/GhostPay.
- Branch: `codex/unified-btc`.
- Base: `f783f14e` (unified integration candidate at task start).
- Implementation: `9b911803`.
- Owner: fresh Caveman BTC persistence worker. Security/CAS review: `security_inventory`; independent caller review: `final_review`.

## Implemented

The full-profile Bitcoin view now offers explicit opt-in encrypted scan progress. It reuses the existing IndexedDB ciphertext/compare-and-swap adapter and HKDF-SHA256/AES-GCM pattern. The scan key derives a nonextractable encryption key; authenticated context binds the wallet identity and Bitcoin network. Seed, key and spend-tweak bytes are never serialized. Each completed block awaits an encrypted checkpoint commit, preserving bounded restart/cancellation loss. Seed import itself does not load saved history or contact a server.

Reimporting the same seed on the same network and choosing saved progress restores its birth height, last block and historical match count. Restored records do not become spendable. A scan compares saved headers to the current locally verified header chain, rolls back forked state through the existing `reconcileScanState`/`resumeScan` library, then downloads prior matching blocks and rederives their outputs before current outspend checks and explicit sweep selection. Pending/reorg-invalidated history is excluded. Bigint amounts remain exact.

History revalidation is paginated: at most 500 prior matching blocks and 500 new blocks per operation. Previous/next controls expose remaining history, allowing the new-block cursor to advance even when more than 500 old receiving blocks exist. Restored groups not rechecked are never offered for sweeping. A 512-KiB plaintext cap bounds encrypted state. Per-block serialization strips unsupported fields, including accidentally attached secret buffers.

Reload, wallet replacement, lock, unmount and cancellation invalidate asynchronous operations. Storage CAS rejects cross-tab stale writes. Explicit deletion writes a fresh random tombstone on every invocation; the nonce prevents stale tabs from reviving deleted data across repeated save/forget cycles. The existing public header store remains separate.

## Regressions and checks

Counts overlap; do not sum them as independent test totals.

| Check | Result |
|---|---|
| New store acceptance before module existed | Failed module load; no behavioral test-pass claim |
| Resume acceptance before implementation | 4 failures reproduced |
| Independent reviewer tombstone ABA regression | 1 failed / 6 passed before fix; fresh-nonce correction passed |
| Final focused suite: store, resume, view persistence, existing tweak cleanup | 17/17 passed in 4 files |
| Existing BTC view, header/error, secret regressions plus pre-ABA store tests | 63/63 passed in 5 files; 6 store cases overlap |
| Independent current store/resume/view suite | 14/14 passed; excludes the three existing tweak-cleanup cases |
| Full web typecheck | Passed with `NODE_OPTIONS=--max-old-space-size=1536`; initial 768-MiB run exhausted its heap, not a pass |
| Focused ESLint | Passed after correcting one unsafe-any test assertion found after pagination |
| `git diff --check` | Passed |

Focused command:

```sh
cd apps/web
NODE_OPTIONS=--max-old-space-size=512 ../../node_modules/.bin/vitest run \
  src/features/btc/scan.resume.test.ts src/features/btc/scanStore.test.ts \
  src/features/btc/scan-secrets.hardening.test.ts src/features/btc/BtcView.persistence.test.tsx --maxWorkers=1
```

The independent Node crypto test decrypts the envelope using `hkdfSync` and AES-GCM outside the browser implementation. Tests cover wrong wallet/network, corrupt/swapped ciphertext, fresh ciphertext, delayed stale writes, deletion ABA, per-block cancellation, rescan after restart, fork rollback, page revalidation and no spend selection from saved metadata alone.

## Review and constraints

Independent review found and reproduced the constant-tombstone ABA defect; fresh nonce tombstones fix it. Review also found that refusing more than 500 saved receiving blocks would stall resume; paginated revalidation fixes that behavior. Final security/CAS and caller reviews found no remaining blocker in the changed source. This is source review, not an external security audit.

This change does not implement BlindBit gRPC, a new hosted scanner, a new key-custody model, Web Worker scanning or real-node/device qualification. Existing Esplora disclosure still applies: the chosen server sees block requests and current outspend queries; header validation is not full Bitcoin validation. Browser-process restart with actual IndexedDB remains a hosted/external acceptance gate; the local test exercises component remount, serialized ciphertext storage and existing transactional adapter seams. No mainnet enablement or release claim.

## Integration

- Merge the worker branch and retain the coordinator's locale/security additions for `btc.persistence.*` (12 keys, delivered to the coordinator). Locale changes used for local tests are deliberately excluded from this branch's commits.
- Preserve `IdbReconciliationVaultStore` CAS guards; do not replace them with unguarded localStorage writes.
- Re-run combined-source web/typecheck/lint/coverage and browser acceptance after integration. No external production state changed.
