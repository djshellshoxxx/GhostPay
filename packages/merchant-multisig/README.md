# Merchant off-chain approvals

This library validates m-of-n merchant approvals, queues proposals, enforces a local timelock, and consumes the queued authorization. It does not sign or broadcast transactions. The holder of the on-chain key can still move funds directly; successful local execution is not transaction finality.

`validateAccountState` validates every persisted field, queued nonce/order, proposal binding, timestamp relationship and stored quorum. `queueProposal`, `executeProposal` and `pruneExpired` apply that validation before making decisions. Runtime NaN/string/negative queue times, unconsumed nonces, duplicate entries/signers, mismatched policy and altered proposals are rejected. A valid old snapshot or coherent manipulation of both timestamps cannot be detected from this storage alone: signatures authenticate proposal bytes, not the local queue clock or a history of transitions.

`serializeAccountState` / `parseAccountState` provide a bounded (1 MiB), versioned canonical JSON exchange. `serializeProposalExchange` / `parseProposalExchange` provide the corresponding proposal/partial-approval exchange (32 KiB), checked against the caller's trusted policy. Import does not queue, execute or install a policy. Only exact canonical exports are accepted: whitespace, reordered keys, duplicate JSON keys and unexpected fields are refused. Use the serializers, not hand-edited JSON. Existing proposal domains and TLV signing bytes are unchanged.

A host must own the clock, trust the initial/current policy, serialize all transitions and independently protect against rollback. An attacker who can replace both account state and policy can invent a different account; a checksum in that same store does not solve this problem. Imported snapshots are data, not an authority to replace a current account. No on-chain enforcement or recovery authority is added.

## Qualification

From repository root, with Node >=22 and the pinned workspace dependencies:

```sh
npm ci --ignore-scripts
npm run build -w @ghostpay/merchant-multisig
npm run typecheck -w @ghostpay/merchant-multisig
npm run lint -w @ghostpay/merchant-multisig
npm test -w @ghostpay/merchant-multisig -- --maxWorkers=1
node packages/merchant-multisig/tools/verify-vector.cjs
node --test examples/merchant-operations/approvals-store.test.mjs
node examples/merchant-operations/approvals-demo.mjs
```

The independent vector helper manually constructs TLV bytes and uses the existing lockfile's `keccak@3.0.4` JavaScript implementation rather than this library's encoder or noble hash. The fixture is also pinned in the package test suite.

See [the local recorder](../../examples/merchant-operations/approvals-README.md) for process concurrency, restart and filesystem limitations.
