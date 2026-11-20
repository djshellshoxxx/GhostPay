# Chain adapter and core contract handoff

Status: **complete**. Reviewer: `chain_contracts_review`.

- Read all 44 assigned unique path/blob versions: 34 chain-adapter versions and 10 core-contract/interface versions, spanning 41 paths and 328 path/ref appearances.
- `chain-contracts-coverage.json` matches every assigned entry in `source-inventory.json`; each recorded commit/path resolves to its recorded Git blob. Nothing remains unread in this domain.
- The only alternate production files were `deployments.ts`, `payments.ts` and `rpc.ts`. Each was covered by full baseline plus complete diff. All ten contract blobs are identical across all eight refs.
- No production edits, tests, reproductions, live requests, transactions, deployment, commit or remote publication occurred.

## Consolidation

`ZC-CHAIN-01` is the known Low policy-account native-buffer stranding issue (`CONTRACTS-CORE-01`), unchanged in all selected refs. Keep its supporting/experimental applicability: the ordinary Pages policy payment helper supplies no buffer, the compiled deployment table is empty, and the experimental build flag is an additional gate. Do not present it as a newly discovered active mainnet theft path.

The report separately records six observations/hardening items. Most important for the overall wording: **new EVM bulk receipt evidence is opt-in and defaults off**, so newer snapshots still perform per-match evidence reads by default. Its partial cover selection does not guarantee anonymity. Do not describe the newer branches as fixing all chain scan disclosure, and deduplicate any overlapping EVM privacy note from the browser-library worker. This differs from WV-06's BTC/Solana/TRON default per-match balance reads, which were changed in the six newer snapshots.

The native buffer's fee/metadata exception and factory fee-token misconfiguration hazard are existing protocol/deployment limitations, not new arbitrary-user attacks. The calldata decoder's missing independent buffer-cap check does not defeat the builder or contract checks; no untrusted active authorization path was established. Main RPC ambient-policy/non-finite-retry changes are existing newer hardening, with the Pages HTML already setting `no-referrer`.

No fresh worker is needed for this assigned domain. The coordinator must still reconcile all domains, review final branch drift, commit documentation locally and respect the recorded remote-publication block.
