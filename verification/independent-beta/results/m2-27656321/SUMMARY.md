# W5 run 2026-11-26T1144

- Command: `node verification/independent-beta/harness/seller-run.mjs --named --seeds 1-24 --concurrency 3 --candidate e7e98109 --out verification/independent-beta/results/m2-27656321`
- Source HEAD: `27656321395659cc60697c2d457d7f6381b30811`; production tree clean: true; production paths differing from pinned main `e7e981095b07a05c7727bf9fafb0a0fec7e4fc36`: none
- Bundle: profile `lean`, dist sha256 `b7c87578f7319d6394abda8c9ad569a899cc581489ee4030f2f357c8740b32a6` (18 files), built from `e314815480aee24cd613cfaf89c7ec0d4e3de901`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: 1–24; wall time 12.0 min
- Totals: 31 scenarios, 37 payments, harness errors 0, with violations 0, with ambiguities 14, off-origin requests blocked: none

| Scenario | Result | s | Payments X/C | Seller decisions | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P2-control-stale-rpc-hides-reorg | CONTROL DETECTED | 36 | 1/0 | X:confirm@S1 | SI4 | SA6 |
| M1-pending-then-final-confirm | ok | 68 | 1/0 | X:confirm@S1 | – | – |
| M2-final-but-unconfirmed | ok | 30 | 1/0 | – | – | – |
| M3-reorg-after-link | ok | 52 | 1/0 | X:confirm@S1 | – | SA6 |
| M4-late-accept-then-reorg | ok | 52 | 1/0 | X:acceptLate@S1 | – | SA6 |
| M5-rpc-down-mid-scan | ok | 51 | 1/0 | X:confirm@S1 | – | – |
| M6-two-seller-tabs-confirm-race | ok | 50 | 1/0 | X:confirm@S1 | – | – |
| SG-1 | ok | 92 | 1/0 | – | – | – |
| SG-2 | ok | 72 | 1/1 | – | – | – |
| SG-3 | ok | 102 | 1/1 | X:confirm@S1 | – | SA6 |
| SG-4 | ok | 69 | 1/0 | – | – | – |
| SG-5 | ok | 96 | 1/0 | X:confirm@S1 | – | SA6 |
| SG-6 | ok | 92 | 1/1 | C:confirm@S1 | – | SA6 |
| SG-7 | ok | 59 | 1/0 | X:confirm@S1 | – | SA6 |
| SG-8 | ok | 51 | 1/0 | – | – | – |
| SG-9 | ok | 65 | 1/1 | X:confirm@S1 | – | – |
| SG-10 | ok | 68 | 1/1 | X:confirm@S1 | – | SA6 |
| SG-11 | ok | 66 | 1/0 | – | – | – |
| SG-12 | ok | 67 | 1/0 | X:confirm@S1 | – | SA6 |
| SG-13 | ok | 77 | 1/0 | X:confirm@S1 | – | – |
| SG-14 | ok | 79 | 1/0 | X:confirm@S1 | – | – |
| SG-15 | ok | 83 | 1/0 | X:confirm@S1 | – | SA6 |
| SG-16 | ok | 78 | 1/0 | – | – | – |
| SG-17 | ok | 75 | 1/0 | X:confirm@S1 | – | SA6 |
| SG-18 | ok | 62 | 1/0 | – | – | – |
| SG-19 | ok | 53 | 1/0 | X:confirm@S1 | – | – |
| SG-20 | ok | 92 | 1/1 | X:confirm@S2, C:confirm@S1 | – | SA6 |
| SG-21 | ok | 53 | 1/0 | – | – | – |
| SG-22 | ok | 102 | 1/0 | X:confirm@S1 | – | – |
| SG-23 | ok | 70 | 1/0 | X:confirm@S1 | – | SA6 |
| SG-24 | ok | 69 | 1/0 | X:confirm@S1 | – | SA6 |

## Details

### P2-control-stale-rpc-hides-reorg

Steps: pay:X → advance → scan:S1 → confirm:S1:X → reorg:103 → scan:S1
- **SI4** at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x3432a57d3ef0e0361be952888c32ea4ca9f9b5e4b4aacbe5aef4434ace36fffc 498750000000000000 base units of native; valid until 2026-11-27T11:44:14.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 498750000000000000 of 498750000000000000 ","payments":[],"scanHead":601}`
- SA6 at step 4: `{"tab":"S1","intent":"X","card":"Invoice 0x3432a57d3ef0e0361be952888c32ea4ca9f9b5e4b4aacbe5aef4434ace36fffc 498750000000000000 base units of native; valid until 2026-11-27T11:44:14.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### M3-reorg-after-link

Steps: pay:X → advance → scan:S1 → confirm:S1:X → reorg:103 → advance → scan:S1 → reload:S1 → scan:S1 → compareTabs
- SA6 at step 4: `{"tab":"S1","intent":"X","card":"Invoice 0x7c68747f924348d48aafaac9079855c2a791a46d1fa62d965170552ff98e5f5d 498750000000000000 base units of native; valid until 2026-11-27T11:44:43.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 5: `{"tab":"S1","intent":"X","card":"Invoice 0x7c68747f924348d48aafaac9079855c2a791a46d1fa62d965170552ff98e5f5d 498750000000000000 base units of native; valid until 2026-11-27T11:44:43.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### M4-late-accept-then-reorg

Steps: pay:X → warp → directPay:X → advance → scan:S1 → confirm:S1:X → acceptLate:S1:X → scan:S1 → reorg:103 → advance → scan:S1 → reload:S1
- SA6 at step 8: `{"tab":"S1","intent":"X","card":"Invoice 0xb07765b0f46f5f60c764b1f7e51eca09d28b2423753ffcadd35a6e484ca6cda2 498750000000000000 base units of native; valid until 2026-11-26T12:44:50.000Z. Verified late payment accepted by seller. Linked total equals the expected net amount. Linked observation total: `
- SA6 at step 9: `{"tab":"S1","intent":"X","card":"Invoice 0xb07765b0f46f5f60c764b1f7e51eca09d28b2423753ffcadd35a6e484ca6cda2 498750000000000000 base units of native; valid until 2026-11-26T12:44:50.000Z. Verified late payment accepted by seller. Linked total equals the expected net amount. Linked observation total: `

### SG-3

Steps: pay:X → scan:S1 → confirm:S1 → scan:S1 → scan:S1 → scan:S2 → confirm:S2 → pay:C → advance → reload:S2 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 12: `{"tab":"S2","intent":"X","card":"Invoice 0x0e2e6cae824fe4392a3df833b91a64f896400f9cd3fd9490726d0bdb7dd08eae 498750000000000000 base units of native; valid until 2026-11-27T11:46:26.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 13: `{"tab":"S2","intent":"X","card":"Invoice 0x0e2e6cae824fe4392a3df833b91a64f896400f9cd3fd9490726d0bdb7dd08eae 498750000000000000 base units of native; valid until 2026-11-27T11:46:26.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-5

Steps: pay:X → scan:S1 → scan:S2 → compareTabs → scan:S2 → scan:S1 → confirm:S1 → compareTabs → scan:S2 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 11: `{"tab":"S2","intent":"X","card":"Invoice 0x2e25af80b8cadcd9fac5c80eb3a852b25040130ac768ec3b60dd5b39e5c22c15 498750000000000000 base units of native; valid until 2026-11-27T11:47:24.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 12: `{"tab":"S2","intent":"X","card":"Invoice 0x2e25af80b8cadcd9fac5c80eb3a852b25040130ac768ec3b60dd5b39e5c22c15 498750000000000000 base units of native; valid until 2026-11-27T11:47:24.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-6

Steps: pay:X → scan:S2 → confirm:S2 → reorg:2 → compareTabs → compareTabs → scan:S1 → confirm:S1 → pay:C → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 11: `{"tab":"S2","intent":"C","card":"Invoice 0x68d8f3907e5d4b1264c81c7376d9f7ac8fde48741f7229432b91dfe4d7a5bb48 299250000000000000 base units of native; valid until 2026-11-27T11:48:09.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 29925000`
- SA6 at step 12: `{"tab":"S2","intent":"C","card":"Invoice 0x68d8f3907e5d4b1264c81c7376d9f7ac8fde48741f7229432b91dfe4d7a5bb48 299250000000000000 base units of native; valid until 2026-11-27T11:48:09.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 29925000`

### SG-7

Steps: pay:X → scan:S2 → advance → mine → scan:S1 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 7: `{"tab":"S2","intent":"X","card":"Invoice 0xf95a75e25535fdd1655f2dc388177a24a5edca8bf7190eb98e6cf86c4d6b4123 498750000000000000 base units of native; valid until 2026-11-27T11:48:24.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 8: `{"tab":"S2","intent":"X","card":"Invoice 0xf95a75e25535fdd1655f2dc388177a24a5edca8bf7190eb98e6cf86c4d6b4123 498750000000000000 base units of native; valid until 2026-11-27T11:48:24.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-10

Steps: pay:X → compareTabs → pay:C → advance → scan:S2 → advance → compareTabs → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 9: `{"tab":"S2","intent":"X","card":"Invoice 0xc8800bdc175c6cdd716191b093f3336f583514297bbb8d0d59b7021c816387a6 498750000000000000 base units of native; valid until 2026-11-27T11:49:40.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 10: `{"tab":"S2","intent":"X","card":"Invoice 0xc8800bdc175c6cdd716191b093f3336f583514297bbb8d0d59b7021c816387a6 498750000000000000 base units of native; valid until 2026-11-27T11:49:40.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-12

Steps: pay:X → scan:S2 → scan:S2 → scan:S1 → advance → reload:S2 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 8: `{"tab":"S2","intent":"X","card":"Invoice 0xd571bd6b277aab57ff90d97d4ecd2d67cc2e1de5cc944a6d02c1d1055bb33b8f 498750000000000000 base units of native; valid until 2026-11-27T11:50:28.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 9: `{"tab":"S2","intent":"X","card":"Invoice 0xd571bd6b277aab57ff90d97d4ecd2d67cc2e1de5cc944a6d02c1d1055bb33b8f 498750000000000000 base units of native; valid until 2026-11-27T11:50:28.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-15

Steps: pay:X → advance → scan:S2 → scan:S1 → confirm:S1 → advance → scan:S1 → confirm:S1 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 7: `{"tab":"S2","intent":"X","card":"Invoice 0xafaaa6d3a270b8703bba35ce60a72a23153f4416070a59fdb03e00e5b468750f 498750000000000000 base units of native; valid until 2026-11-27T11:51:36.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 8: `{"tab":"S2","intent":"X","card":"Invoice 0xafaaa6d3a270b8703bba35ce60a72a23153f4416070a59fdb03e00e5b468750f 498750000000000000 base units of native; valid until 2026-11-27T11:51:36.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 9: `{"tab":"S2","intent":"X","card":"Invoice 0xafaaa6d3a270b8703bba35ce60a72a23153f4416070a59fdb03e00e5b468750f 498750000000000000 base units of native; valid until 2026-11-27T11:51:36.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 11: `{"tab":"S2","intent":"X","card":"Invoice 0xafaaa6d3a270b8703bba35ce60a72a23153f4416070a59fdb03e00e5b468750f 498750000000000000 base units of native; valid until 2026-11-27T11:51:36.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-17

Steps: pay:X → scan:S2 → confirm:S2 → scan:S2 → confirm:S2 → reorg:103 → advance → reload:S2 → scan:S1 → mine → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 12: `{"tab":"S2","intent":"X","card":"Invoice 0x792c8fb05102cc12177247acbe774619b4ca027c3c1ca0fc4d3c4fb445a24d78 498750000000000000 base units of native; valid until 2026-11-27T11:52:16.000Z. Reorg invalidated earlier payment evidence. Verify again before relying on this invoice. Linked to a verified obs`
- SA6 at step 13: `{"tab":"S2","intent":"X","card":"Invoice 0x792c8fb05102cc12177247acbe774619b4ca027c3c1ca0fc4d3c4fb445a24d78 498750000000000000 base units of native; valid until 2026-11-27T11:52:16.000Z. Reorg invalidated earlier payment evidence. Verify again before relying on this invoice. Linked to a verified obs`

### SG-20

Steps: pay:X → advance → advance → pay:C → compareTabs → scan:S1 → scan:S2 → confirm:S2 → scan:S1 → confirm:S1 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 12: `{"tab":"S2","intent":"C","card":"Invoice 0xe7abfe712d39df0b14dcf991d604813732d379fabf960ec87fa0d1099422aac6 299250000000000000 base units of native; valid until 2026-11-27T11:53:32.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 29925000`
- SA6 at step 13: `{"tab":"S2","intent":"C","card":"Invoice 0xe7abfe712d39df0b14dcf991d604813732d379fabf960ec87fa0d1099422aac6 299250000000000000 base units of native; valid until 2026-11-27T11:53:32.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 29925000`

### SG-23

Steps: pay:X → scan:S2 → confirm:S2 → advance → compareTabs → scan:S2 → confirm:S2 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 9: `{"tab":"S2","intent":"X","card":"Invoice 0x16700be139d72185be361f93b3ad6fb83ccbb2467313f4dc5dd6cb5ca5aa7b29 498750000000000000 base units of native; valid until 2026-11-27T11:54:54.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 10: `{"tab":"S2","intent":"X","card":"Invoice 0x16700be139d72185be361f93b3ad6fb83ccbb2467313f4dc5dd6cb5ca5aa7b29 498750000000000000 base units of native; valid until 2026-11-27T11:54:54.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

### SG-24

Steps: pay:X → compareTabs → scan:S2 → confirm:S2 → scan:S1 → reload:S1 → scan:S1 → advance → scan:S1 → confirm:S1 → compareTabs → scan:S2 → compareTabs
- SA6 at step 9: `{"tab":"S2","intent":"X","card":"Invoice 0xb6385ffaf964ed58b2a0bcb467af9bedd151455f0d14144bdf2c82b2015669aa 498750000000000000 base units of native; valid until 2026-11-27T11:55:04.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`
- SA6 at step 10: `{"tab":"S2","intent":"X","card":"Invoice 0xb6385ffaf964ed58b2a0bcb467af9bedd151455f0d14144bdf2c82b2015669aa 498750000000000000 base units of native; valid until 2026-11-27T11:55:04.000Z. Linked to a verified observation. Linked total equals the expected net amount. Linked observation total: 49875000`

RPC methods the mock did not implement (requested by the app): none
