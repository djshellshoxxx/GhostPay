# Wallet lifecycle generation 3: coordinator-preserved handoff

Runtime source `3ef264facbde9ffb93abfde231a91e58d5f9772c`, tree `f2488516f4d23c35a0f12ef171d31fc095e8ff4e`. The worker finished and committed its small implementation, tests and recorded successful runs, but its turn was interrupted before the final handoff commit. The coordinator inspected the runtime diff, verified every retained compressed/raw log hash against evidence.json, and completed this documentation checkpoint. This is not a coordinator test rerun.

## Bounded change

Pay captures the current wallet operation before acquiring its payment RPC context, combines that operation signal with the existing network signal, and rechecks the same captured scope after acquisition. Provider account, chain or disconnect events can no longer leave that old action's read grant usable for later continuation. Existing returned hashes, uncertain attempts and duplicate-protection records remain intact. No signing guard is re-applied after broadcast, and no shared transport, protocol, cryptography, fee or dependency changed.

The new controlled App/Pay tests use the actual NetworkAuthority and an authorized injected RPC recorder. They demonstrate reads under the old grant before the repair; they do not constitute HTTP-wire or real-extension evidence. Six behavioral failures were recorded at 02434632. On the repaired source, the lifecycle file passes17/17 and the separate original Pay/payment/network/journal selection passes271/271 across10files, both exit0 and zero skips. The earlier first RED terminal exit receipt was not retained, and evidence.json explicitly leaves that exit unknown rather than inventing it.

## Next independent checkpoint

Merge this exact feature ancestry into the standalone v1 candidate and then into the v1.1 candidate. In v1.1, preserve explicit account/transaction decisions in the original lifecycle helper and six new cases. Validate known-hash and unknown-outcome preservation, cancelled old reads, and fresh deliberate actions. Preserve the independent wallet/disclosure observer composition. Original full type/lint/coverage/build/browser/hosted checks remain required on the exact combined source. Do not count selected predecessor tests as whole-release qualification.
