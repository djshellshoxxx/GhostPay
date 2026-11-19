# Manifest test integration repair

## Source and scope

- Branch: `codex/ghostpay-manifest-test-integration-20261119`.
- Base: `cae9be35a006cdbf91113396bb9a86b85fc458a3`, the BTC consolidation lane already integrated by the coordinator.
- Claim: `6745c732` in `docs/ai/ACTIVE_WORK.md`.
- Tested product: `fee5001e6cd5f8f4f6fc72b501cdf26aace31804`.
- Changed product path: `apps/web/src/lib/manifest.test.ts` only.

The combined web typecheck found that this test still imported `stripComments`
from the production bundle scanner after that scanner moved to AST parsing.
The repair imports the existing TypeScript dependency locally, parses
`manifest.ts` as TypeScript, and prints it with `removeComments: true`.
No production scanner API was restored and no production source was changed.

Every pre-existing assertion is unchanged: the exported loader surface, no
runtime fetch, no deployments path, no legacy text signature verifier, no
console call, no testnet acceptance, produced trust values strictly `signed`,
unsigned-manifest rejection, release-key checks, chain readback and origin gates.
The existing produced-trust assertion still compares the exact string
`"'signed'"`; its passing result confirms the printer preserves the quoting
needed by that source-level assertion. No additional regression was needed:
the original test reproduced the integration failure and verifies the repair.

## Focused execution

Environment: Node 22.23.4, TypeScript 5.9.3, Vitest 5.1.0, matching dependency
cache already established for the BTC lane. Both runs used the original web
configuration with one worker and no file parallelism:

```sh
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' \
  /home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node \
  node_modules/vitest/vitest.mjs run --root apps/web \
  src/lib/manifest.test.ts --maxWorkers=1 --no-file-parallelism
```

| Run | Result | Evidence |
| --- | --- | --- |
| Before repair | Exit 1; 13 passed, 1 failed; `TypeError: stripComments is not a function` | `evidence/manifest-red.txt` |
| After repair | Exit 0; 14 passed; 3.38 seconds | `evidence/manifest-green.txt` |

The managed environment's existing `EnvHttpProxyAgent` experimental warning
appears in both logs. No network configuration was changed. No broad compile,
lint retry, production build, browser qualification or remote write was run
for this repair. The coordinator owns the final combined-head qualification.

## Independent BTC egress inventory review

Reviewed the coordinator's uncommitted
`docs/privacy/network-egress-inventory.json` delta against merged source while
its checkout HEAD was `8cdbfa3572fb427fd1129bac74ade5bbbd9cc6e3`.
This worker did not edit the coordinator's checkout.

The proposed changes correctly remove automatic fee/outpoint requests from
review and signing, remove `btc-sweep` authority from matched-proof checks,
and describe explicit broadcast using `btc-sweep` authority and POST `/tx`.
`BtcView.tsx` keeps provider checking off by default for full scans, derives
required provider checking from explicit light-oracle selection, and snapshots
that choice into the worker request. The selected Esplora and oracle grants
remain bound to the current network, action, prefix and cancellation signal.
Local signing depends on current spentness/header evidence, with exact-tip
coverage required for local evidence. No sign-time outpoint fetch remains.

Two documentation corrections are required before accepting that inventory
delta; the coordinator acknowledged both and owns their application:

1. The `btc-match-proof` trigger must state that matched `/tx/<txid>/hex` and
   `/merkle-proof` requests occur only in light-oracle mode. A full scan with
   optional provider checking authorizes outspend queries, not these proof
   paths. Full scans verify downloaded committed block data instead.
2. The `btc-worker-bridge` authorization text must describe the separate
   light-only proof gate as well as the captured provider-check flag.
   `scanWorkerClient.ts` derives `allowMatchedProof` from the normalized
   oracle mode; `scanWorkerSource.ts` refuses `/hex` and `/merkle-proof`
   unless it is true, and separately refuses `/outspend/` without the
   captured provider-check flag.

The other reviewed BTC delta descriptions match the merged source. This is a
source-mapping review, not a claim of fresh combined runtime or hosted
qualification. The coordinator will independently read and commit the
corrected inventory.
