# W5 run 2026-11-26T1539

- Command: `node verification/independent-beta/harness/run.mjs --only N14-linked-replacement-receipt-withheld,N15-link-replacement-while-receipt-withheld --concurrency 2 --candidate origin/main --out verification/independent-beta/results/probe-replacement-a6b354ab`
- Source HEAD: `a6b354ab5b1b307d1f608ffa58cf6c6c34e81ff4`; production tree clean: true; production paths differing from pinned main `601f20955b435eede448c6d82d8315705d7e381d`: none
- Bundle: profile `lean`, dist sha256 `ab9bc5b061acb54a9bf8833fd788e81e343467be348506c697005e15a6d84c62` (18 files), built from `e3a7037e79384867015d800e9219322321f9b5b5`
- Environment: node v22.23.5, playwright-core 1.64.1, Chromium 158.0.8127.36, linux 6.18.44-fc-v880 x64, 4 CPUs
- Seeds: none (named only); wall time 2.1 min
- Totals: 2 scenarios, 4 wallet handoffs, harness errors 0, with violations 0, with ambiguities 0, off-origin requests blocked: none

| Scenario | Result | s | Handoffs (tab:intent:behaviour) | Clears | Violations | Ambiguities |
|---|---|---|---|---|---|---|
| N14-linked-replacement-receipt-withheld | ok | 128 | A:X:ok, B:C:ok | X=0 | – | – |
| N15-link-replacement-while-receipt-withheld | ok | 108 | A:X:ok, B:C:ok | X=0 | – | – |

Explicit classifications (never silent): pay action enabled with own record visible (R20) 44 observations; I1 judged without a displayed known hash 0; I3 unknown-row identity unjudgeable 0; I3 satisfied only by a hash-less unknown row (presence, not identity) 0; I3 record concealed behind the account-privacy notice (#691) 0.

RPC methods the mock did not implement (requested by the app): none
