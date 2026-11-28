# W5 run 2026-11-28T1126

- Command: `node verification/independent-beta/harness/run.mjs --named --concurrency 2 --candidate origin/main --out /tmp/claude-0/-home-user-GhostPay/c27c3356-f657-5672-b9f8-fb53fe35cccf/scratchpad/smoke-payer`
- Source HEAD: `6f03b7c8ce5696b9e0e35e895f8d3df3f1f5db04`; production tree clean: true; production paths differing from pinned main `0934ea094cb1db90293b74d2d1e9d9324e09a883`: none
- Bundle: profile `lean`, dist sha256 `e58aa564a4866e9b9c8530c8f90682c1d9be7f162b7cd43623f31bdd8990501c` (18 files), built from `6f03b7c8ce5696b9e0e35e895f8d3df3f1f5db04`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: none (named only); wall time 10.7 min
- Totals: 16 scenarios, 35 wallet handoffs, harness errors 0, with violations 0, with ambiguities 2, off-origin requests blocked: none

| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P1-control-fresh-profile-loses-journal | VIOLATION | 125 | A:X:ok, A:X:ok, B:C:ok | X=0 | I3, I4, I2 | – |
| N1-interrupt-before-hash-tab-closed | ok | 40 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N2-hash-returned-reload-reorg | ok | 82 | A:X:ok, B:C:ok | X=0 | – | A1 |
| N3-error-after-broadcast-then-mined | ok | 33 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| N4-override-dismissed-then-accepted | ok | 125 | A:X:hang-nobroadcast, B:X:ok, B:C:ok | X=1 | – | – |
| N5-late-hash-after-account-switch | ok | 43 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N6-rpc-down-on-reload | ok | 77 | A:X:ok, B:C:ok | X=0 | – | – |
| N7-chain-switch-after-prepare | ok | 73 | A:X:ok, B:C:ok | X=0 | – | – |
| N8-included-then-reorg-done-panel | ok | 41 | A:X:ok, B:C:ok | X=0 | – | A1 |
| N9-late-hash-after-in-page-invoice-switch | ok | 92 | A:X:hang-broadcast, A:C:ok | X=0 | – | – |
| N10-one-clear-two-tabs-race | ok | 92 | A:X:error-after-broadcast, A:X:hang-broadcast, B:C:ok | X=1 | – | – |
| N11-browser-restart-after-hash | ok | 75 | A:X:ok, B:C:ok | X=0 | – | – |
| N12-browser-restart-before-hash | ok | 31 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| N13-disclosure-cancelled-send | ok | 85 | A:X:ok, B:C:ok | X=0 | – | – |
| N14-linked-replacement-receipt-withheld | ok | 128 | A:X:ok, B:C:ok | X=0 | – | – |
| N15-link-replacement-while-receipt-withheld | ok | 109 | A:X:ok, B:C:ok | X=0 | – | – |

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

Explicit classifications (never silent): pay action enabled with own record visible (R20) 219 observations; I1 judged without a displayed known hash 0; I3 unknown-row identity unjudgeable 0; I3 satisfied only by a hash-less unknown row (presence, not identity) 70; I3 record concealed behind the account-privacy notice (#691) not-connected 21, other-account-or-chain 4.

RPC methods the mock did not implement (requested by the app): none
