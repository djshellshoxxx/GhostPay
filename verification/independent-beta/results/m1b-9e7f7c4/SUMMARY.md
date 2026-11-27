# W5 run 2026-11-25T1143

- Command: `node verification/independent-beta/harness/run.mjs --only P1-control-fresh-profile-loses-journal,N11-browser-restart-after-hash,N12-browser-restart-before-hash --seeds 31-50 --concurrency 3 --minimize --out verification/independent-beta/results/m1b-9e7f7c4`
- Source HEAD: `9e7f7c48d830e616fc6181c3eeb9f9e4c08fa308`; production tree clean: true; production paths differing from pinned main `aaa71a112d90fd39f59b40de9f139e9cfdc62d61`: none
- Bundle: profile `lean`, dist sha256 `cae30f5d6a2c1f389d545adeec84143f993ea20281f6eec4997f86b1227721b4` (18 files), built from `0e87e6342961e100abf744acae22d8523c669e2c`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: 31–50; wall time 8.1 min
- Totals: 23 scenarios, 48 wallet handoffs, harness errors 0, with violations 0, with ambiguities 0, off-origin requests blocked: none

| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| P1-control-fresh-profile-loses-journal | VIOLATION | 125 | A:X:ok, A:X:ok, B:C:ok | X=0 | I3, I4, I2 | – |
| N11-browser-restart-after-hash | ok | 74 | A:X:ok, B:C:ok | X=0 | – | – |
| N12-browser-restart-before-hash | ok | 32 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-31 | ok | 33 | A:X:reject, B:C:ok | X=0 | – | – |
| G-32 | ok | 50 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-33 | ok | 39 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-34 | ok | 48 | A:X:reject, B:C:ok | X=0 | – | – |
| G-35 | ok | 76 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-36 | ok | 58 | A:X:reject, B:C:ok | X=0 | – | – |
| G-37 | ok | 36 | A:X:reject, B:C:ok | X=0 | – | – |
| G-38 | ok | 36 | A:X:reject, B:C:hang-broadcast | X=0 | – | – |
| G-39 | ok | 36 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-40 | ok | 47 | A:X:reject, B:C:ok | X=0 | – | – |
| G-41 | ok | 89 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-42 | ok | 80 | A:X:hang-nobroadcast, A:X:ok, B:C:ok | X=1 | – | – |
| G-43 | ok | 41 | A:X:hang-broadcast, B:C:ok | X=0 | – | – |
| G-44 | ok | 78 | A:X:ok, B:C:ok | X=0 | – | – |
| G-45 | ok | 31 | A:X:reject, B:C:ok | X=0 | – | – |
| G-46 | ok | 39 | A:X:reject, B:C:ok | X=0 | – | – |
| G-47 | ok | 80 | A:X:ok, B:C:ok | X=0 | – | – |
| G-48 | ok | 93 | A:X:hang-nobroadcast, B:C:ok | X=0 | – | – |
| G-49 | ok | 42 | A:X:error-after-broadcast, B:C:ok | X=0 | – | – |
| G-50 | ok | 83 | A:X:ok, B:C:ok | X=0 | – | – |

## Details

### P1-control-fresh-profile-loses-journal

Steps: open:A:X → send:A:ok → freshProfile → open:A:X → send:A:ok (+ fixed suffix)
- **I3** at step 3: `{"tab":"A","rows":0,"expected":["X"],"journal":[]}`
- **I4** at step 3: `{"intent":"X","hash":"0x4ce1b821ef2a0ab507195d059820d1aa6d84980e74d5b2a4917fcfdf4a617072","behaviour":"ok"}`
- **I2** at step 4: `{"intent":"X","handoffs":2,"allowed":1,"accounts":["0x5555555555555555555555555555555555555555"]}`

RPC methods the mock did not implement (requested by the app): none
