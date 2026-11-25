# W5 run 2026-11-25T1125

- Command: `node verification/independent-beta/harness/run.mjs --named --seeds 1-30 --concurrency 3 --out verification/independent-beta/results/m1-d3edbdb`
- Source HEAD: `d3edbdb2d0904a5c6006b5e6425b5391c33c3d28`; production tree clean: true; production paths differing from pinned main `aaa71a112d90fd39f59b40de9f139e9cfdc62d61`: none
- Bundle: profile `lean`, dist sha256 `cae30f5d6a2c1f389d545adeec84143f993ea20281f6eec4997f86b1227721b4` (18 files), built from `0e87e6342961e100abf744acae22d8523c669e2c`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: 1–30; wall time 14.9 min
- Totals: 40 scenarios, 83 wallet handoffs, harness errors 0, with violations 0, with ambiguities 1, off-origin requests blocked: none

| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| N1-interrupt-before-hash-tab-closed | ok | 39 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N2-hash-returned-reload-reorg | ok | 78 | A:X:ok, B:C:ok | X=0 | – | – |
| N3-error-after-broadcast-then-mined | ok | 32 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| N4-override-dismissed-then-accepted | ok | 122 | A:X:hang-nobroadcast, B:X:ok, B:C:ok | X=1 | – | – |
| N5-late-hash-after-account-switch | ok | 81 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N6-rpc-down-on-reload | ok | 77 | A:X:ok, B:C:ok | X=0 | – | – |
| N7-chain-switch-after-prepare | ok | 71 | A:X:ok, B:C:ok | X=0 | – | – |
| N8-included-then-reorg-done-panel | ok | 39 | A:X:ok, B:C:ok | X=0 | – | A1 |
| N9-late-hash-after-in-page-invoice-switch | ok | 90 | A:X:hang-broadcast, A:C:ok | X=0 | – | – |
| N10-one-clear-two-tabs-race | ok | 90 | A:X:error-after-broadcast, A:X:hang-broadcast, B:C:ok | X=1 | – | – |
| G-1 | ok | 98 | A:X:ok, B:C:ok | X=0 | – | – |
| G-2 | ok | 58 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-3 | ok | 86 | A:X:ok, B:C:ok | X=0 | – | – |
| G-4 | ok | 83 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-5 | ok | 45 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-6 | ok | 86 | A:X:ok, B:C:ok | X=0 | – | – |
| G-7 | ok | 82 | A:X:ok, B:C:ok | X=0 | – | – |
| G-8 | ok | 35 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-9 | ok | 51 | A:X:reject, B:C:ok | X=0 | – | – |
| G-10 | ok | 38 | A:X:reject, B:C:ok | X=0 | – | – |
| G-11 | ok | 39 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-12 | ok | 84 | A:X:ok, B:C:ok | X=0 | – | – |
| G-13 | ok | 48 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-14 | ok | 77 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-15 | ok | 80 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-16 | ok | 84 | A:X:ok, B:C:ok | X=0 | – | – |
| G-17 | ok | 88 | A:X:ok, B:C:ok | X=0 | – | – |
| G-18 | ok | 51 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-19 | ok | 37 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-20 | ok | 37 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-21 | ok | 78 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-22 | ok | 40 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-23 | ok | 78 | A:X:ok, B:C:ok | X=0 | – | – |
| G-24 | ok | 40 | A:X:reject, B:C:ok | X=0 | – | – |
| G-25 | ok | 44 | A:X:reject, B:C:ok | X=0 | – | – |
| G-26 | ok | 41 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-27 | ok | 126 | A:X:ok, A:C:ok | X=0 | – | – |
| G-28 | ok | 79 | A:X:error-after-broadcast, A:X:ok, B:C:ok | X=1 | – | – |
| G-29 | ok | 80 | A:X:ok, B:C:ok | X=0 | – | – |
| G-30 | ok | 39 | A:X:reject, B:C:ok | X=0 | – | – |

## Details

### N8-included-then-reorg-done-panel

Steps: open:A:X → send:A:ok → reorg:2 → drop → check:A:X → reload:A (+ fixed suffix)
- A1 at step 2: `{"tab":"A","intent":"X","hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","staleShown":"Status: included in block 501","truth":{"state":"mempool"}}`
- A1 at step 3: `{"tab":"A","intent":"X","hash":"0xe7b02a729298aa0c16f091508c5d8c04659c3d5327ad88c4a27593519249f10b","staleShown":"Status: included in block 501","truth":{"state":"dropped"}}`

RPC methods the mock did not implement (requested by the app): none
