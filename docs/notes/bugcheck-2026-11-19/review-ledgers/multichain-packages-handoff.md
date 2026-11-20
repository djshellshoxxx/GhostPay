> Historical handoff, subsequently completed. Use ../source-coverage.json for final state.

# Fresh worker instructions — Bitcoin package remainder

User requested defensive bugcheck of core and current features on pinned main/recent branches, all in-scope source, findings to repo notes. Root is publishing notes; do not change application code or refs.

Main: `/workspace/scratch/72c433175c66/GhostPay-bugcheck` at `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Integration: `/workspace/scratch/72c433175c66/GhostPay-latest` at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

Read `multichain-packages-audit.json` and findings. All PIR/Solana/TRON/policy package production source is done, including changed variants. Exactly all production source in `packages/btc-silent-payments/src` remains **unread** by this worker. Test utilities (`*.testutil.ts` etc) are not production coverage. No partial BTC line ranges to preserve: start each pending file at line 1.

Review full main BTC source and integration changed variants of `scan/headersync.ts`, `scan/scanner.ts`, `scan/state.ts`. Every other BTC production blob is unchanged. Record coverage in a new `bitcoin-package-audit.json` (or update only pending BTC entries of the existing manifest without losing other records), plus findings. Generated protobuf file may be structurally reviewed but state that method explicitly. Other source must receive full logic review, including headers/reorg state, inputs/sender/receiver, spend safety and serialization. Do not equate a tree listing with review.

No exploit workflows, hostile active probing, live transactions, or product edits. Benign local functional tests allowed when they resolve a concrete candidate; no broad optional suites. Exact-lock dependencies installed and root built source packages. Full-profile BTC is preserved/excluded from lean Pages, so qualify impact accordingly. Send exact remaining paths and finish if context tight, so root can assign another fresh worker.

Pending main files:
- `packages/btc-silent-payments/src/adapter-types.ts` (132 lines), blob `901e9906521be23cca02c21c0750264728b639c6`
- `packages/btc-silent-payments/src/adapter.ts` (142 lines), blob `1072254049ee6e94c045380e7bd8469d77039ccd`
- `packages/btc-silent-payments/src/address.ts` (95 lines), blob `8cbb43bf29fb2fc203f052d271e32625447470a6`
- `packages/btc-silent-payments/src/bech32m.ts` (47 lines), blob `3917c3bbbdb693a9e8326c8c5d81c6bffaa7b9c5`
- `packages/btc-silent-payments/src/bip32.ts` (92 lines), blob `cd4ca1be1798a0ec8e23a8d3949b0c2a60101752`
- `packages/btc-silent-payments/src/ecc.ts` (120 lines), blob `5cd677d126079526ab0df7dc2a0a9ccb4776c020`
- `packages/btc-silent-payments/src/errors.ts` (93 lines), blob `77ac1437a99c4dde6166e7ec4cc1e476e45a188b`
- `packages/btc-silent-payments/src/header.ts` (150 lines), blob `863f38ff91fd6805ff1343ea1e2ae00cc2365aba`
- `packages/btc-silent-payments/src/headerchain.ts` (631 lines), blob `e577f406fb3834d67001c97bb976a8f950c556ee`
- `packages/btc-silent-payments/src/hexbytes.ts` (20 lines), blob `8e50a66e6bcd59e1498e67d6a0087e1bcd712149`
- `packages/btc-silent-payments/src/index.ts` (30 lines), blob `4a87d565ef51dd8a6d3cf29fc43f87eeb7dbd117`
- `packages/btc-silent-payments/src/inputs.ts` (121 lines), blob `dbe0d7d1bab83ef411697aeb7b8e703039d86606`
- `packages/btc-silent-payments/src/keys.ts` (98 lines), blob `7c2cb47d034770aa38b1973385e99c272e079f88`
- `packages/btc-silent-payments/src/labels.ts` (136 lines), blob `0963b7730b8128bd17bc832764e0bdc8864a650b`
- `packages/btc-silent-payments/src/merkleProof.ts` (76 lines), blob `ee5ac9a44048f6ee0b26cf1582cb1498824f3483`
- `packages/btc-silent-payments/src/policy.ts` (273 lines), blob `5d5e730bb85834c3725f743e8f0fa86185505c62`
- `packages/btc-silent-payments/src/receiver.ts` (240 lines), blob `3fbf815988cf4c0bf72d75457bed66793136eed0`
- `packages/btc-silent-payments/src/rng.ts` (42 lines), blob `a288cab09f29ac1f2b00f9642e9923db72c966af`
- `packages/btc-silent-payments/src/scan/blindbit.ts` (277 lines), blob `27b4ba539478dff52a2949b7659bb0ffa5f20664`
- `packages/btc-silent-payments/src/scan/blindbitGrpc.ts` (158 lines), blob `e03070464c6a66fe02859968fdc4a2a699709803`
- `packages/btc-silent-payments/src/scan/grpcWebUnary.ts` (119 lines), blob `3ebd682f7c9080572677e83aa346f1a7d3d9f7dd`
- `packages/btc-silent-payments/src/scan/headersync.ts` (312 lines), blob `8fd7ee9fda3fc8b44ff495903d8ed07353445207`
- `packages/btc-silent-payments/src/scan/memory.ts` (50 lines), blob `8b085ade190d873d2cc1c5e02ea08c29a5bca4e5`
- `packages/btc-silent-payments/src/scan/proto/indexing_server_pb.ts` (426 lines), blob `969dc5976ffc67870acd3a17adf132fa715deda2`
- `packages/btc-silent-payments/src/scan/scanner.ts` (304 lines), blob `89cb28c0d18a282c013e2944a49ca10212d1b8f8`
- `packages/btc-silent-payments/src/scan/state.ts` (300 lines), blob `77571a1307c976eead82afd73aadf8e9244e137e`
- `packages/btc-silent-payments/src/scan/types.ts` (64 lines), blob `7b20af963696cb445482948c89aaecbadbe6f9d9`
- `packages/btc-silent-payments/src/secret.ts` (125 lines), blob `f3f4d2dd1c98ad6772c7c077caf88c59a2225585`
- `packages/btc-silent-payments/src/sender.ts` (188 lines), blob `bfe54bb84dbe28daf82794f1606c6ac59a6453b7`
- `packages/btc-silent-payments/src/spend.ts` (721 lines), blob `60697bc4a3b2c8518f822786027049ee6d770e53`
- `packages/btc-silent-payments/src/tx.ts` (134 lines), blob `bff496601c6a38b41708c52b42c06d5e19e225e2`
- `packages/btc-silent-payments/src/units.ts` (44 lines), blob `28c782cdb5e7b46734b718d6b8b0984f97d2afc7`
- `packages/btc-silent-payments/src/uri.ts` (114 lines), blob `08f5f2179825e58dba561eb6ec53fe6fe5ac4eb9`
- `packages/btc-silent-payments/src/witness.ts` (218 lines), blob `efea1fc2f488289ce18418791527e199d9983de5`
