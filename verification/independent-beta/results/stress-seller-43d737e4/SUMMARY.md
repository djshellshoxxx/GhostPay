# W5 run 2026-11-26T1310

- Command: `node verification/independent-beta/harness/seller-run.mjs --named --seeds 1-40 --concurrency 2 --candidate 9d92472a --out verification/independent-beta/results/stress-seller-43d737e4`
- Source HEAD: `43d737e41543e60dc80c58db93907ba8c4eb4f76`; production tree clean: true; production paths differing from pinned main `9d92472a46a4e37f847472276d77e3b4ce158e80`: none
- Bundle: profile `lean`, dist sha256 `ab9bc5b061acb54a9bf8833fd788e81e343467be348506c697005e15a6d84c62` (18 files), built from `947e2ff600a2ed2eec6466f112922fa1665fb7ac`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: 1–40; wall time 33.5 min
- Totals: 56 scenarios, 68 payments, harness errors 0, with violations 0, with ambiguities 6, off-origin requests blocked: none

| Scenario | Result | s | Payments X/C | Seller decisions | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P2-control-stale-rpc-hides-reorg | CONTROL DETECTED | 35 | 1/0 | X:confirm@S1 | SI4 | SA6 |
| M1-pending-then-final-confirm | ok | 69 | 1/0 | X:confirm@S1 | – | – |
| M2-final-but-unconfirmed | ok | 29 | 1/0 | – | – | – |
| M3-reorg-after-link | ok | 50 | 1/0 | X:confirm@S1 | – | SA6 |
| M4-late-accept-then-reorg | ok | 54 | 1/0 | X:acceptLate@S1 | – | SA6 |
| M5-rpc-down-mid-scan | ok | 50 | 1/0 | X:confirm@S1 | – | – |
| M6-two-seller-tabs-confirm-race | ok | 51 | 1/0 | X:confirm@S1 | – | – |
| M7-two-rpc-reorg-disagreement | ok | 52 | 1/0 | X:confirm@S1 | – | SA6, SA7 |
| M8-seller-browser-restart-keeps-link | ok | 58 | 1/0 | X:confirm@S1 | – | – |
| M9-late-accept-survives-restart | ok | 41 | 1/0 | X:acceptLate@S1 | – | – |
| M10-checkout-after-expiry-refused-or-reverts | ok | 52 | 0/1 | C:confirm@S1 | – | – |
| M11-quarantined-link-keeps-invoice-reserved | ok | 84 | 2/0 | X:confirm@S1 | – | – |
| M12-old-backup-cannot-revive-reorged-link | ok | 79 | 1/0 | X:confirm@S1 | – | SA6, SA7 |
| M13-manual-link-cannot-replace-late-acceptance | ok | 30 | 1/0 | – | – | – |
| M14-on-time-manual-link-counted-once | ok | 46 | 1/0 | X:manualLink@S1 | – | – |
| M15-manual-link-to-reserved-invoice-probe | ok | 81 | 2/0 | X:confirm@S1, X:manualLink@S1 | – | SA8 |
| SG-1 | ok | 77 | 1/0 | – | – | – |
| SG-2 | ok | 87 | 1/0 | – | – | – |
| SG-3 | ok | 83 | 1/0 | – | – | – |
| SG-4 | ok | 55 | 1/0 | – | – | – |
| SG-5 | ok | 103 | 1/1 | X:confirm@S1 | – | – |
| SG-6 | ok | 85 | 1/0 | X:confirm@S1 | – | – |
| SG-7 | ok | 93 | 1/0 | – | – | – |
| SG-8 | ok | 55 | 1/0 | – | – | – |
| SG-9 | ok | 70 | 1/1 | X:confirm@S1 | – | – |
| SG-10 | ok | 82 | 1/0 | – | – | – |
| SG-11 | ok | 72 | 1/1 | C:confirm@S1 | – | – |
| SG-12 | ok | 78 | 1/1 | X:confirm@S1 | – | – |
| SG-13 | ok | 73 | 1/0 | – | – | – |
| SG-14 | ok | 84 | 1/0 | X:confirm@S1 | – | – |
| SG-15 | ok | 95 | 1/0 | X:confirm@S1 | – | – |
| SG-16 | ok | 71 | 1/0 | X:confirm@S1 | – | – |
| SG-17 | ok | 67 | 1/0 | X:confirm@S1 | – | – |
| SG-18 | ok | 86 | 1/1 | – | – | – |
| SG-19 | ok | 83 | 1/0 | – | – | – |
| SG-20 | ok | 76 | 1/0 | – | – | – |
| SG-21 | ok | 65 | 1/0 | – | – | – |
| SG-22 | ok | 82 | 1/0 | X:acceptLate@S1 | – | – |
| SG-23 | ok | 69 | 1/0 | X:confirm@S1 | – | – |
| SG-24 | ok | 68 | 1/0 | – | – | – |
| SG-25 | ok | 97 | 1/0 | – | – | – |
| SG-26 | ok | 81 | 1/0 | – | – | – |
| SG-27 | ok | 67 | 1/0 | – | – | – |
| SG-28 | ok | 97 | 1/0 | – | – | – |
| SG-29 | ok | 59 | 1/1 | – | – | – |
| SG-30 | ok | 78 | 1/0 | – | – | – |
| SG-31 | ok | 50 | 1/0 | – | – | – |
| SG-32 | ok | 78 | 1/1 | X:confirm@S1 | – | – |
| SG-33 | ok | 62 | 1/0 | – | – | – |
| SG-34 | ok | 107 | 1/0 | – | – | – |
| SG-35 | ok | 84 | 1/1 | X:confirm@S1 | – | – |
| SG-36 | ok | 70 | 1/0 | X:confirm@S1 | – | – |
| SG-37 | ok | 90 | 1/1 | – | – | – |
| SG-38 | ok | 72 | 1/1 | – | – | – |
| SG-39 | ok | 62 | 1/0 | X:confirm@S1 | – | – |
| SG-40 | ok | 89 | 1/0 | X:confirm@S1 | – | – |

## Details

### P2-control-stale-rpc-hides-reorg

Steps: pay:X → advance → scan:S1 → confirm:S1:X → reorg:103 → scan:S1
- **SI4** at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x674fca3371c550576b369c00ade878781933867c464b202f81eff52a2453e770 498750000000000000 base units of native; valid until 2026-11-27T13:10:25.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 498750000000000000 of 498750000000000000 ","payments":[],"scanHead":601}`
- SA6 at step 4: `{"tab":"S1","intent":"X","card":"Invoice 0x674fca3371c550576b369c00ade878781933867c464b202f81eff52a2453e770 498750000000000000 base units of native; valid until 2026-11-27T13:10:25.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### M3-reorg-after-link

Steps: pay:X → advance → scan:S1 → confirm:S1:X → reorg:103 → advance → scan:S1 → reload:S1 → scan:S1 → compareTabs
- SA6 at step 4: `{"tab":"S1","intent":"X","card":"Invoice 0xb051ef406c78f11f7ae18e0ed709e1326484da5ec8c1a0b4926895b2a3d05284 498750000000000000 base units of native; valid until 2026-11-27T13:11:28.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0xb051ef406c78f11f7ae18e0ed709e1326484da5ec8c1a0b4926895b2a3d05284 498750000000000000 base units of native; valid until 2026-11-27T13:11:28.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### M4-late-accept-then-reorg

Steps: pay:X → warp → directPay:X → advance → scan:S1 → confirm:S1:X → acceptLate:S1:X → scan:S1 → reorg:103 → advance → scan:S1 → reload:S1
- SA6 at step 8: `{"tab":"S1","intent":"X","card":"Invoice 0x723b343e9a8faf4f3178c283c0b8554279a6e602f1dbf520481c6a71bc97908d 498750000000000000 base units of native; valid until 2026-11-26T14:11:33.000Z. Verified late payment accepted by seller. Linked total equals the expected net amount. Linked observation total: `
- SA6 at step 9: `{"tab":"S1","intent":"X","card":"Invoice 0x723b343e9a8faf4f3178c283c0b8554279a6e602f1dbf520481c6a71bc97908d 498750000000000000 base units of native; valid until 2026-11-26T14:11:33.000Z. Verified late payment accepted by seller. Linked total equals the expected net amount. Linked observation total: `

### M7-two-rpc-reorg-disagreement

Steps: pay:X → advance → scan:S1 → confirm:S1:X → freezeSecondary → reorg:103 → advance → scan:S1 → reload:S1 → thawSecondary → scan:S1 → compareTabs
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0xcea0d597d59b5795e0980ec73ef1c468c75a0abc86d79cb51e29ce4078eed9f5 498750000000000000 base units of native; valid until 2026-11-27T13:13:08.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 6: `{"tab":"S1","intent":"X","card":"Invoice 0xcea0d597d59b5795e0980ec73ef1c468c75a0abc86d79cb51e29ce4078eed9f5 498750000000000000 base units of native; valid until 2026-11-27T13:13:08.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA7 at step 9: `{"tab":"S1","intent":"X","card":"Invoice 0xcea0d597d59b5795e0980ec73ef1c468c75a0abc86d79cb51e29ce4078eed9f5 498750000000000000 base units of native; valid until 2026-11-27T13:13:08.000Z. Unverified observation. Scan again before relying on it. Remove registration","payments":[],"scanHead":603,"reaso`

### M12-old-backup-cannot-revive-reorged-link

Steps: pay:X → advance → scan:S1 → confirm:S1:X → exportBackup:S1 → reorg:103 → advance → scan:S1 → deleteObservations:S1 → importBackup:S1 → reload:S1 → compareTabs
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0xcd00e01ef6d3488c20ea808cd7dfa184c8f74c66df751e322b08de58e3b7ee9a 498750000000000000 base units of native; valid until 2026-11-27T13:15:08.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 6: `{"tab":"S1","intent":"X","card":"Invoice 0xcd00e01ef6d3488c20ea808cd7dfa184c8f74c66df751e322b08de58e3b7ee9a 498750000000000000 base units of native; valid until 2026-11-27T13:15:08.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA7 at step 8: `{"tab":"S1","intent":"X","card":"Invoice 0xcd00e01ef6d3488c20ea808cd7dfa184c8f74c66df751e322b08de58e3b7ee9a 498750000000000000 base units of native; valid until 2026-11-27T13:15:08.000Z. No linked observation. No eligible linked observations to compare. Only live observations verified as final when `

### M15-manual-link-to-reserved-invoice-probe

Steps: pay:X → advance → scan:S1 → confirm:S1:X → scan:S1 → pay:X → advance → scan:S1 → manualLink:S1:X → scan:S1 → compareTabs
- SA8 at step 8: `{"tab":"S1","intent":"X","before":"Invoice 0xd8dc081d928b54f4bafa02dd87d87dd81af16a7d7b48da2991874c57a3cbb817 498750000000000000 base units of native; valid until 2026-11-27T13:16:36.000Z. Unverified observation. Scan again before relying on it. Possible payment. The evidence does not establish a un`

RPC methods the mock did not implement (requested by the app): none
