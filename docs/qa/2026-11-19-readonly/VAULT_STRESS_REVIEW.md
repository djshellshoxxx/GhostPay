# Independent review of bounded vault stress evidence

Source: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Reviewed the coordinator's `qa-logs/vault-model-stress.mjs`, result JSON, empty error log, and related `packages/ux-vault/src/{vault,envelope,search,merge}.ts`. The package has no tracked source differences. This was source/result review only, without rerunning the workload.

## Counts and supported claims

- Initial capacity is 5,000 contacts; serialization equality and typed `LIMIT` refusal of the 5,001st addition are asserted.
- **981 adds + 980 updates + 1,039 removals = 3,000 operations**. Final cardinality reconciles: **5,000 + 981 − 1,039 = 4,942**.
- There are **100** validation/serialization and tag-search checks, at steps 0, 30, …, 2,970. They verify roundtrip equality, that returned contacts carry the requested tag, and ordering equality after reversing source contact order.
- The merge has **600** newer same-ID records; it checks unchanged cardinality, 600 update-report IDs, and serialization equality of the resulting book.
- **256 mutations run in 16 batches of 16 concurrently requested API calls**. The implementation serializes these calls; this is not 16 concurrent storage writes. Assertions check count 256 before/after lock/unlock, then backup import with 256 additions and full equality to the reopened book.
- **261 writes** reconcile: four writes for two profile creations, 256 mutation writes, and one import write.
- No custom `kdf` or `subtle` is passed. `createVault` uses `defaultCryptoDeps` and **600,000 PBKDF2-HMAC-SHA256 iterations**. Unchanged defaults are source-supported. This profile workload does not test the separate portable keystore's scrypt format.
- Recorded duration **86,871.55 ms** and peak RSS **331,415,552 bytes** describe the whole process, not isolated KDF latency or browser/device performance.

## Limits to retain

"Seeded contact-operation consistency workload" is more precise than an independent model-based proof: the script does not keep a separate expected map for every contact. Product serialization/validation APIs provide the roundtrip checks; search completeness is not independently checked. The merge checks counts/reports/serialization rather than each incoming note against an oracle. Concurrent checks compare counts and backup equality, not the full inserted-address set against an independent expected set.

These limits define what passed without invalidating the observations. Storage is an async in-memory map with a 1 ms artificial write delay; real IndexedDB quotas, browser restarts, disk I/O, failing storage, and cross-tab sessions are not exercised. No full `ux-vault` coverage result follows from this harness. The initial full-suite SIGKILL remains an incomplete attempt, not automatically an app defect. The coordinator subsequently obtained a separate complete 284-test coverage pass; see TEST_RESULTS.md.

No additional execution or product/test code modification was performed by this review.
