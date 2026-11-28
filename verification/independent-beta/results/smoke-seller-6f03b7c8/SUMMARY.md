# W5 run 2026-11-28T1126

- Command: `node verification/independent-beta/harness/seller-run.mjs --named --concurrency 2 --candidate origin/main --out /tmp/claude-0/-home-user-GhostPay/c27c3356-f657-5672-b9f8-fb53fe35cccf/scratchpad/smoke-seller`
- Source HEAD: `6f03b7c8ce5696b9e0e35e895f8d3df3f1f5db04`; production tree clean: true; production paths differing from pinned main `0934ea094cb1db90293b74d2d1e9d9324e09a883`: none
- Bundle: profile `lean`, dist sha256 `e58aa564a4866e9b9c8530c8f90682c1d9be7f162b7cd43623f31bdd8990501c` (18 files), built from `6f03b7c8ce5696b9e0e35e895f8d3df3f1f5db04`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: none (named only); wall time 7.8 min
- Totals: 16 scenarios, 18 payments, harness errors 0, with violations 0, with ambiguities 6, off-origin requests blocked: none

| Scenario | Result | s | Payments X/C | Seller decisions | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P2-control-stale-rpc-hides-reorg | CONTROL DETECTED | 38 | 1/0 | X:confirm@S1 | SI4 | SA6 |
| M1-pending-then-final-confirm | ok | 73 | 1/0 | X:confirm@S1 | – | – |
| M2-final-but-unconfirmed | ok | 30 | 1/0 | – | – | – |
| M3-reorg-after-link | ok | 55 | 1/0 | X:confirm@S1 | – | SA6 |
| M4-late-accept-then-reorg | ok | 55 | 1/0 | X:acceptLate@S1 | – | SA6 |
| M5-rpc-down-mid-scan | ok | 53 | 1/0 | X:confirm@S1 | – | – |
| M6-two-seller-tabs-confirm-race | ok | 52 | 1/0 | X:confirm@S1 | – | – |
| M7-two-rpc-reorg-disagreement | ok | 53 | 1/0 | X:confirm@S1 | – | SA6, SA7 |
| M8-seller-browser-restart-keeps-link | ok | 59 | 1/0 | X:confirm@S1 | – | – |
| M9-late-accept-survives-restart | ok | 43 | 1/0 | X:acceptLate@S1 | – | – |
| M10-checkout-after-expiry-refused-or-reverts | ok | 52 | 0/1 | C:confirm@S1 | – | – |
| M11-quarantined-link-keeps-invoice-reserved | ok | 85 | 2/0 | X:confirm@S1 | – | – |
| M12-old-backup-cannot-revive-reorged-link | ok | 80 | 1/0 | X:confirm@S1 | – | SA6, SA7 |
| M13-manual-link-cannot-replace-late-acceptance | ok | 30 | 1/0 | – | – | – |
| M14-on-time-manual-link-counted-once | ok | 46 | 1/0 | X:manualLink@S1 | – | – |
| M15-manual-link-to-reserved-invoice-probe | ok | 83 | 2/0 | X:confirm@S1, X:manualLink@S1 | – | SA8 |

## Details

### P2-control-stale-rpc-hides-reorg

Steps: pay:X → advance → scan:S1 → confirm:S1:X → reorg:103 → scan:S1
- **SI4** at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x13cdeeb3a6c62d18375d1091e82d6a9a5692a7d32ae50c52a47fcf9bd7633d2e 498750000000000000 base units of native; valid until 2026-11-29T11:26:34.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 498750000000000000 of 498750000000000000 ","payments":[],"scanHead":601}`
- SA6 at step 4: `{"tab":"S1","intent":"X","card":"Invoice 0x13cdeeb3a6c62d18375d1091e82d6a9a5692a7d32ae50c52a47fcf9bd7633d2e 498750000000000000 base units of native; valid until 2026-11-29T11:26:34.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### M3-reorg-after-link

Steps: pay:X → advance → scan:S1 → confirm:S1:X → reorg:103 → advance → scan:S1 → reload:S1 → scan:S1 → compareTabs
- SA6 at step 4: `{"tab":"S1","intent":"X","card":"Invoice 0x81872509d66b7a55f044d5d5ee913e5ca226198cbcfc0f0530443d78ef194593 498750000000000000 base units of native; valid until 2026-11-29T11:27:40.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x81872509d66b7a55f044d5d5ee913e5ca226198cbcfc0f0530443d78ef194593 498750000000000000 base units of native; valid until 2026-11-29T11:27:40.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### M4-late-accept-then-reorg

Steps: pay:X → warp → directPay:X → advance → scan:S1 → confirm:S1:X → acceptLate:S1:X → scan:S1 → reorg:103 → advance → scan:S1 → reload:S1
- SA6 at step 8: `{"tab":"S1","intent":"X","card":"Invoice 0xb57f8dcc001fa17963b46e434c433c52966565cfd2d7de6cdd8d75f02bbef7a1 498750000000000000 base units of native; valid until 2026-11-28T12:27:45.000Z. Verified late payment accepted by seller. Linked total equals the expected net amount. Linked observation total: `
- SA6 at step 9: `{"tab":"S1","intent":"X","card":"Invoice 0xb57f8dcc001fa17963b46e434c433c52966565cfd2d7de6cdd8d75f02bbef7a1 498750000000000000 base units of native; valid until 2026-11-28T12:27:45.000Z. Verified late payment accepted by seller. Linked total equals the expected net amount. Linked observation total: `

### M7-two-rpc-reorg-disagreement

Steps: pay:X → advance → scan:S1 → confirm:S1:X → freezeSecondary → reorg:103 → advance → scan:S1 → reload:S1 → thawSecondary → scan:S1 → compareTabs
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x5cc76dc4ee76b6a44fe6e49786d1fb0a7bcd43c0dabc314f6ae554d117c1a300 498750000000000000 base units of native; valid until 2026-11-29T11:29:28.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 6: `{"tab":"S1","intent":"X","card":"Invoice 0x5cc76dc4ee76b6a44fe6e49786d1fb0a7bcd43c0dabc314f6ae554d117c1a300 498750000000000000 base units of native; valid until 2026-11-29T11:29:28.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA7 at step 9: `{"tab":"S1","intent":"X","card":"Invoice 0x5cc76dc4ee76b6a44fe6e49786d1fb0a7bcd43c0dabc314f6ae554d117c1a300 498750000000000000 base units of native; valid until 2026-11-29T11:29:28.000Z. Unverified observation. Scan again before relying on it. Remove registration","payments":[],"scanHead":603,"reaso`

### M12-old-backup-cannot-revive-reorged-link

Steps: pay:X → advance → scan:S1 → confirm:S1:X → exportBackup:S1 → reorg:103 → advance → scan:S1 → deleteObservations:S1 → importBackup:S1 → reload:S1 → compareTabs
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x9fe97d3f76bfc7724a38f63077c0271965dda39a722a1772ba5738425400b24f 498750000000000000 base units of native; valid until 2026-11-29T11:31:23.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 6: `{"tab":"S1","intent":"X","card":"Invoice 0x9fe97d3f76bfc7724a38f63077c0271965dda39a722a1772ba5738425400b24f 498750000000000000 base units of native; valid until 2026-11-29T11:31:23.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA7 at step 8: `{"tab":"S1","intent":"X","card":"Invoice 0x9fe97d3f76bfc7724a38f63077c0271965dda39a722a1772ba5738425400b24f 498750000000000000 base units of native; valid until 2026-11-29T11:31:23.000Z. No linked observation. No eligible linked observations to compare. Only live observations verified as final when `

### M15-manual-link-to-reserved-invoice-probe

Steps: pay:X → advance → scan:S1 → confirm:S1:X → scan:S1 → pay:X → advance → scan:S1 → manualLink:S1:X → scan:S1 → compareTabs
- SA8 at step 8: `{"tab":"S1","intent":"X","before":"Invoice 0x9fd1a0f3b57b8799713d49eb8e3246717cb2f8ea1d4fece4f630c5af639cc23f 498750000000000000 base units of native; valid until 2026-11-29T11:32:59.000Z. Unverified observation. Scan again before relying on it. Possible payment. The evidence does not establish a un`

RPC methods the mock did not implement (requested by the app): none
