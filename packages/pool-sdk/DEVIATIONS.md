# Deviations from `docs/remote/privacy-specs/shielded-pool.md`

1. **Package names and locations.** The spec names `@ghostpay/shielded-pool(-prover)` and `apps/pool-relayer`; this swarm builds
   `packages/pool-sdk`, `packages/pool-prover`, `packages/pool-relayer` (relayer is a package, not an app) as assigned.
2. **Zero-nullifier retry.** The spec says "retry if 0"; the retry appends a counter byte to the HKDF `info`. Output for the
   non-retry path is exactly the spec formula.
3. **Tree witness index.** The circuit takes the real leaf index (`INTERFACE.md`); zk-kit's compressed path index is not used.
   Siblings are re-expanded to one slot per level.
4. **Sync order.** The tree is rebuilt from `Deposited` and `Withdrawn` events (deposit leaf, change leaf including value 0)
   in `(block, logIndex)` order. The contract also emits `LeafInserted`; the SDK does not rely on it. A reorg is handled by
   `reorgDepth` (re-fetch from `lastBlock - reorgDepth`); there is no block-hash based detection.
5. **Root check.** `assertRootMatches` uses `isKnownRoot(localRoot)` (64-root window) instead of strict `currentRoot()` equality
   so a pool that advanced between sync and check does not cause a false `ROOT_MISMATCH`.
6. **Crowd estimate.** Events carry no timestamp; the window is converted to blocks with `blockTimeSec` (default 12). Counts
   deposits with `value >= requested`. Label thresholds (0 / <10 / <50 / else) are cosmetic.
7. **`asp-cli` not built.** `buildAspTree` / `verifyAspSet` exist; no CLI binary and no `set.json` writer/publisher.
8. **Cross-language vectors.** `test-vectors/shielded-pool.json` is owned by the circuits agent; this package does not read it. It has the
   three circomlib known-answer vectors, a witness-equality test against the real circuits (`packages/pool-relayer/src/circuit.witness.test.ts`)
   and the anvil e2e.
9. **Seed backup** (scrypt + AES-GCM) and the random pool seed helper are additions for SP-PAY payers without GhostPay keys.
10. **No `depositWithPermit` helper.** Only `deposit`; the sponsor/permit path (SP-CON-8) has no client builder here.
11. **Minimum crowd default 50** is enforced in `prepareWithdrawal` (`CROWD_TOO_SMALL`) unless `crowdConfirmed`.
