# W5 run 2026-11-26T0004

- Command: `node verification/independent-beta/harness/run.mjs --named --seeds 1-30 --concurrency 3 --minimize --candidate 8aca5a06 --out verification/independent-beta/results/m1d-1bb92a77`
- Source HEAD: `1bb92a773269204d6791d7e4d85db7f0e809a8bc`; production tree clean: true; production paths differing from pinned main `8aca5a06a9435dd30e40378ba606da3c68f94863`: none
- Bundle: profile `lean`, dist sha256 `b440bed21c63a6c4262e5f8e9020d1bb1d2daf1fbb8bb087bbf72f95ca3e248d` (18 files), built from `4bf50bf3bc111aa9cb09b6db478526dfdc126755`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: 1–30; wall time 16.2 min
- Totals: 44 scenarios, 91 wallet handoffs, harness errors 0, with violations 0, with ambiguities 1, off-origin requests blocked: none

| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P1-control-fresh-profile-loses-journal | VIOLATION | 124 | A:X:ok, A:X:ok, B:C:ok | X=0 | I3, I4, I2 | – |
| N1-interrupt-before-hash-tab-closed | ok | 39 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N2-hash-returned-reload-reorg | ok | 79 | A:X:ok, B:C:ok | X=0 | – | – |
| N3-error-after-broadcast-then-mined | ok | 32 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| N4-override-dismissed-then-accepted | ok | 122 | A:X:hang-nobroadcast, B:X:ok, B:C:ok | X=1 | – | – |
| N5-late-hash-after-account-switch | ok | 81 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N6-rpc-down-on-reload | ok | 77 | A:X:ok, B:C:ok | X=0 | – | – |
| N7-chain-switch-after-prepare | ok | 71 | A:X:ok, B:C:ok | X=0 | – | – |
| N8-included-then-reorg-done-panel | ok | 39 | A:X:ok, B:C:ok | X=0 | – | A1 |
| N9-late-hash-after-in-page-invoice-switch | ok | 89 | A:X:hang-broadcast, A:C:ok | X=0 | – | – |
| N10-one-clear-two-tabs-race | ok | 90 | A:X:error-after-broadcast, A:X:hang-broadcast, B:C:ok | X=1 | – | – |
| N11-browser-restart-after-hash | ok | 73 | A:X:ok, B:C:ok | X=0 | – | – |
| N12-browser-restart-before-hash | ok | 30 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N13-disclosure-cancelled-send | ok | 84 | A:X:ok, B:C:ok | X=0 | – | – |
| G-1 | ok | 98 | A:X:ok, B:C:ok | X=0 | – | – |
| G-2 | ok | 58 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-3 | ok | 86 | A:X:ok, B:C:ok | X=0 | – | – |
| G-4 | ok | 83 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-5 | ok | 46 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-6 | ok | 79 | A:X:ok, B:C:ok | X=0 | – | – |
| G-7 | ok | 82 | A:X:ok, B:C:ok | X=0 | – | – |
| G-8 | ok | 35 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-9 | ok | 53 | A:X:reject, B:C:ok | X=0 | – | – |
| G-10 | ok | 37 | A:X:reject, B:C:ok | X=0 | – | – |
| G-11 | ok | 40 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-12 | ok | 81 | A:X:ok, B:C:ok | X=0 | – | – |
| G-13 | ok | 48 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-14 | ok | 77 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-15 | ok | 80 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-16 | ok | 84 | A:X:ok, B:C:ok | X=0 | – | – |
| G-17 | ok | 88 | A:X:ok, B:C:ok | X=0 | – | – |
| G-18 | ok | 51 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-19 | ok | 37 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-20 | ok | 37 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-21 | ok | 32 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-22 | ok | 40 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-23 | ok | 77 | A:X:ok, B:C:ok | X=0 | – | – |
| G-24 | ok | 40 | A:X:reject, B:C:ok | X=0 | – | – |
| G-25 | ok | 44 | A:X:reject, B:C:ok | X=0 | – | – |
| G-26 | ok | 42 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-27 | ok | 126 | A:X:ok, A:C:ok | X=0 | – | – |
| G-28 | ok | 35 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-29 | ok | 80 | A:X:ok, B:C:ok | X=0 | – | – |
| G-30 | ok | 39 | A:X:reject, B:C:ok | X=0 | – | – |

## Details

### P1-control-fresh-profile-loses-journal

Steps: open:A:X → send:A:ok → freshProfile → open:A:X → send:A:ok (+ fixed suffix)
- **I3** at step 3: `{"tab":"A","missingIntent":"X","expectedHashes":["0x4ce1b821ef2a0ab507195d059820d1aa6d84980e74d5b2a4917fcfdf4a617072"],"acceptsUnknownRow":false,"sendButton":"enabled","journal":[]}`
- **I4** at step 3: `{"intent":"X","hash":"0x4ce1b821ef2a0ab507195d059820d1aa6d84980e74d5b2a4917fcfdf4a617072","behaviour":"ok"}`
- **I2** at step 4: `{"intent":"X","handoffs":2,"allowed":1,"accounts":["0x5555555555555555555555555555555555555555"]}`

### N8-included-then-reorg-done-panel

Steps: open:A:X → send:A:ok → reorg:2 → drop → check:A:X → reload:A (+ fixed suffix)
- A1 at step 2: `{"tab":"A","intent":"X","basis":"displayed","shown":"Status: included in block 501","judged":[{"hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","truth":{"state":"mempool"}}],"staleShown":"Status: included in block 501","after":"chain change (reorg)"}`
- A1 at step 3: `{"tab":"A","intent":"X","basis":"displayed","shown":"Status: included in block 501","judged":[{"hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","truth":{"state":"dropped"}}],"staleShown":"Status: included in block 501","after":"chain change (drop)"}`
- A1 at step 4: `{"tab":"A","intent":"X","basis":"displayed","shown":"Status: included in block 501","judged":[{"hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","truth":{"state":"dropped"}}],"staleShown":"Status: included in block 501","after":"no fresh render (check)"}`

Explicit classifications (never silent): pay action enabled with own record visible (R20) 629 observations; I1 judged without a displayed known hash 0; I3 unknown-row identity unjudgeable 0; I3 satisfied only by a hash-less unknown row (presence, not identity) 482.

RPC methods the mock did not implement (requested by the app): none
