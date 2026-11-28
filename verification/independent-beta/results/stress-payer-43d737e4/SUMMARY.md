# W5 run 2026-11-26T1310

- Command: `node verification/independent-beta/harness/run.mjs --named --seeds 1-60 --concurrency 2 --minimize --candidate 9d92472a --out verification/independent-beta/results/stress-payer-43d737e4`
- Source HEAD: `43d737e41543e60dc80c58db93907ba8c4eb4f76`; production tree clean: true; production paths differing from pinned main `9d92472a46a4e37f847472276d77e3b4ce158e80`: none
- Bundle: profile `lean`, dist sha256 `ab9bc5b061acb54a9bf8833fd788e81e343467be348506c697005e15a6d84c62` (18 files), built from `947e2ff600a2ed2eec6466f112922fa1665fb7ac`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: 1–60; wall time 37.3 min
- Totals: 74 scenarios, 152 wallet handoffs, harness errors 0, with violations 0, with ambiguities 2, off-origin requests blocked: none

| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P1-control-fresh-profile-loses-journal | VIOLATION | 126 | A:X:ok, A:X:ok, B:C:ok | X=0 | I3, I4, I2 | – |
| N1-interrupt-before-hash-tab-closed | ok | 39 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N2-hash-returned-reload-reorg | ok | 81 | A:X:ok, B:C:ok | X=0 | – | A1 |
| N3-error-after-broadcast-then-mined | ok | 32 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| N4-override-dismissed-then-accepted | ok | 124 | A:X:hang-nobroadcast, B:X:ok, B:C:ok | X=1 | – | – |
| N5-late-hash-after-account-switch | ok | 43 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N6-rpc-down-on-reload | ok | 77 | A:X:ok, B:C:ok | X=0 | – | – |
| N7-chain-switch-after-prepare | ok | 73 | A:X:ok, B:C:ok | X=0 | – | – |
| N8-included-then-reorg-done-panel | ok | 39 | A:X:ok, B:C:ok | X=0 | – | A1 |
| N9-late-hash-after-in-page-invoice-switch | ok | 91 | A:X:hang-broadcast, A:C:ok | X=0 | – | – |
| N10-one-clear-two-tabs-race | ok | 92 | A:X:error-after-broadcast, A:X:hang-broadcast, B:C:ok | X=1 | – | – |
| N11-browser-restart-after-hash | ok | 75 | A:X:ok, B:C:ok | X=0 | – | – |
| N12-browser-restart-before-hash | ok | 30 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N13-disclosure-cancelled-send | ok | 85 | A:X:ok, B:C:ok | X=0 | – | – |
| G-1 | ok | 100 | A:X:ok, B:C:ok | X=0 | – | – |
| G-2 | ok | 57 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-3 | ok | 88 | A:X:ok, B:C:ok | X=0 | – | – |
| G-4 | ok | 85 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-5 | ok | 45 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-6 | ok | 81 | A:X:ok, B:C:ok | X=0 | – | – |
| G-7 | ok | 83 | A:X:ok, B:C:ok | X=0 | – | – |
| G-8 | ok | 35 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-9 | ok | 53 | A:X:reject, B:C:ok | X=0 | – | – |
| G-10 | ok | 37 | A:X:reject, B:C:ok | X=0 | – | – |
| G-11 | ok | 38 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-12 | ok | 83 | A:X:ok, B:C:ok | X=0 | – | – |
| G-13 | ok | 48 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-14 | ok | 42 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-15 | ok | 81 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-16 | ok | 85 | A:X:ok, B:C:ok | X=0 | – | – |
| G-17 | ok | 89 | A:X:ok, B:C:ok | X=0 | – | – |
| G-18 | ok | 51 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-19 | ok | 37 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-20 | ok | 37 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-21 | ok | 32 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-22 | ok | 41 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-23 | ok | 79 | A:X:ok, B:C:ok | X=0 | – | – |
| G-24 | ok | 40 | A:X:reject, B:C:ok | X=0 | – | – |
| G-25 | ok | 44 | A:X:reject, B:C:ok | X=0 | – | – |
| G-26 | ok | 41 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-27 | ok | 128 | A:X:ok, A:C:ok | X=0 | – | – |
| G-28 | ok | 36 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-29 | ok | 82 | A:X:ok, B:C:ok | X=0 | – | – |
| G-30 | ok | 39 | A:X:reject, B:C:ok | X=0 | – | – |
| G-31 | ok | 32 | A:X:reject, B:C:ok | X=0 | – | – |
| G-32 | ok | 49 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-33 | ok | 38 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-34 | ok | 49 | A:X:reject, B:C:ok | X=0 | – | – |
| G-35 | ok | 35 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-36 | ok | 58 | A:X:reject, B:C:ok | X=0 | – | – |
| G-37 | ok | 36 | A:X:reject, B:C:ok | X=0 | – | – |
| G-38 | ok | 36 | A:X:reject, B:C:hang-broadcast | X=0 | – | – |
| G-39 | ok | 36 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-40 | ok | 47 | A:X:reject, B:C:ok | X=0 | – | – |
| G-41 | ok | 90 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-42 | ok | 80 | A:X:hang-nobroadcast, A:X:ok, B:C:ok | X=1 | – | – |
| G-43 | ok | 41 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-44 | ok | 80 | A:X:ok, B:C:ok | X=0 | – | – |
| G-45 | ok | 31 | A:X:reject, B:C:ok | X=0 | – | – |
| G-46 | ok | 40 | A:X:reject, B:C:ok | X=0 | – | – |
| G-47 | ok | 82 | A:X:ok, B:C:ok | X=0 | – | – |
| G-48 | ok | 94 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-49 | ok | 42 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-50 | ok | 85 | A:X:ok, B:C:ok | X=0 | – | – |
| G-51 | ok | 88 | A:X:ok, B:C:ok | X=0 | – | – |
| G-52 | ok | 79 | A:X:ok, B:C:ok | X=0 | – | – |
| G-53 | ok | 32 | A:X:reject, B:C:ok | X=0 | – | – |
| G-54 | ok | 36 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-55 | ok | 40 | A:X:reject, B:C:ok | X=0 | – | – |
| G-56 | ok | 37 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-57 | ok | 55 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-58 | ok | 36 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-59 | ok | 46 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-60 | ok | 83 | A:X:ok, B:C:ok | X=0 | – | – |

## Details

### P1-control-fresh-profile-loses-journal

Steps: open:A:X → send:A:ok → freshProfile → open:A:X → send:A:ok (+ fixed suffix)
- **I3** at step 3: `{"tab":"A","missingIntent":"X","expectedHashes":["0x4ce1b821ef2a0ab507195d059820d1aa6d84980e74d5b2a4917fcfdf4a617072"],"acceptsUnknownRow":false,"sendButton":"enabled","journal":[]}`
- **I4** at step 3: `{"intent":"X","hash":"0x4ce1b821ef2a0ab507195d059820d1aa6d84980e74d5b2a4917fcfdf4a617072","behaviour":"ok"}`
- **I2** at step 4: `{"intent":"X","handoffs":2,"allowed":1,"accounts":["0x5555555555555555555555555555555555555555"]}`

### N2-hash-returned-reload-reorg

Steps: open:A:X → send:A:ok → reload:A → mine → open:B:X → check:B:X → reorg:1 → check:B:X → reload:B (+ fixed suffix)
- A1 at step 6: `{"tab":"B","row":"payment on chain 84532 · 0x5555555555555555555555555555555555555555 · Returned hash: 0x61129c81c6a83612ddc42b5387d235d1bcc9ff33ab7379c2d604a085e2e86094\n\nCheck status on my RPC\nLink a replacement transaction\n\nIncluded in a canonical block. W","shown":[{"hash":"0x61129c81c6a8361`

### N8-included-then-reorg-done-panel

Steps: open:A:X → send:A:ok → reorg:2 → drop → check:A:X → reload:A (+ fixed suffix)
- A1 at step 2: `{"tab":"A","intent":"X","basis":"displayed","shown":"Status: included in block 501","judged":[{"hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","truth":{"state":"mempool"}}],"staleShown":"Status: included in block 501","after":"chain change (reorg)"}`
- A1 at step 3: `{"tab":"A","intent":"X","basis":"displayed","shown":"Status: included in block 501","judged":[{"hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","truth":{"state":"dropped"}}],"staleShown":"Status: included in block 501","after":"chain change (drop)"}`
- A1 at step 4: `{"tab":"A","intent":"X","basis":"displayed","shown":"Status: included in block 501","judged":[{"hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","truth":{"state":"dropped"}}],"staleShown":"Status: included in block 501","after":"no fresh render (check)"}`

Explicit classifications (never silent): pay action enabled with own record visible (R20) 1053 observations; I1 judged without a displayed known hash 0; I3 unknown-row identity unjudgeable 21; I3 satisfied only by a hash-less unknown row (presence, not identity) 910; I3 record concealed behind the account-privacy notice (#691) not-connected 142, other-account-or-chain 25.

RPC methods the mock did not implement (requested by the app): none
