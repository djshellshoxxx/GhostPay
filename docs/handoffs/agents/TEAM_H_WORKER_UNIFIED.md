# Team H — dedicated Bitcoin scan worker

- Repository: djshellshoxxx/GhostPay.
- Branch: `codex/unified-btc-worker`; original base `a94989ce`.
- Implementation: `7bdfa683cfbec5635ebd1717e730e2a2af09dfde` (coordinator integration `661b6484`).
- Artifact qualification head: `57f50251dfb3f047ae85900f30df35d715f2a787`; includes only the coordinator's registry bundle corrections in addition to the implementation. Integration needs the worker commit, not duplicate registry patches.
- Independent reviewer: `final_review`; no remaining source blocker at the implementation SHA.

## Behavior

The full-profile Bitcoin view now performs scanning and header revalidation in a dedicated module worker per scan. Cancel, lock, unmount, worker faults, storage failures and normal completion terminate the worker and detach its handlers. Request IDs and closed-session guards discard stale messages and wipe any returned stale tweak buffers. Unsupported worker startup fails closed; production never silently falls back to a main-thread scan.

Only an ephemeral copy of the scan secret and the public spend key cross into the worker. The seed and spend secret do not. Main-thread temporary scan-key bytes are wiped immediately after structured cloning. Worker-owned key and result copies are wiped on normal/error completion; termination discards the worker realm on cancellation. Structured cloning strips the redacting scalar prototype, so the client validates and restores that wrapper on returned spend tweaks, then wipes the temporary plain buffers. JavaScript zeroization remains best effort, as in the existing wallet.

The worker contains no network API. It emits typed public-data commands to a main-thread bridge, which reconstructs GET URLs only under the explicitly selected Esplora base. The bridge permits tip, block-height, block metadata/header, bounded transaction pages and outspend paths. It cannot broadcast, follow redirects, attach credentials, add arbitrary query strings or choose another origin. It uses no-store/no-referrer, a 30-second deadline, at most four simultaneous requests and a streamed 16-MiB response cap. Closing cancels pending fetches/readers; a fetch that ignores cancellation has its late response body canceled. Errors crossing the worker boundary use fixed codes.

Each scan remains limited to 500 new blocks and 500 historical matching blocks. At most 10,000 ephemeral matches are retained before failing closed; checkpoints are capped at the vault's existing 512 KiB and header messages at the existing 400,000-header bound. Headers are rebuilt against the selected network's pinned genesis inside the worker, rather than accepting a caller-provided checkpoint or consensus parameters.

The encrypted persistence design is unchanged. A worker checkpoint waits for the main-thread vault callback and an ordered acknowledgment before scanning the next block. The existing UI and transactional CAS guards still reject canceled, locked or cross-tab stale writes. Restored metadata has no spend tweak and cannot authorize a sweep: prior matching blocks must pass fresh source/header checks and current outspend checks, and outputs remain unselected.

## Evidence

Counts overlap; do not sum them as independent test totals.

| Check | Result |
| --- | --- |
| Initial worker test before implementation | Failed module import, no behavioral-pass claim |
| Final worker protocol and source-bridge tests | 16/16 passed; independently repeated by reviewer |
| Worker transport plus persistence restart tests | 10/10 passed |
| Combined scoped regression suite | 85/85 passed in 9 files, `maxWorkers=1` |
| Full web TypeScript check | Passed |
| Focused ESLint over all changed source/tests and browser test | Passed; an earlier concurrent lint run was killed with exit 137 and is not counted as a pass |
| Full Vite build and unchanged bundle guard | Passed: 19 files; emitted `scan.worker-456D036t.js` (92.58 kB); no worker network API or unexpected origin |
| Lean Vite build and unchanged bundle guard | Passed: 17 files; Bitcoin worker excluded |
| Hosted-browser test discovery | Passed: one desktop test listed |
| Actual local Chromium | Blocked: `socket() failed: Operation not permitted`; no browser acceptance pass claimed |
| Diff whitespace check | Passed |

The protocol tests use the production protocol with structured-clone boundaries, not a mocked successful scan. They cover scan parity, absence of spend secrets, redacting-wrapper restoration, checkpoint backpressure, cancellation during an uncommitted checkpoint, CAS rejection, worker startup/message errors, stale/foreign requests, malformed results, pinned checkpoint rejection, path allowlisting, body caps, late fetch cancellation and request deadlines. Existing UI tests inject that transport; the separate UI secret-lifetime suite deliberately isolates its preexisting stale-result races.

`apps/web/e2e/btc-worker.spec.ts` exercises actual emitted workers in the full browser artifact. It holds block 2 after block 1 is committed, cancels and checks worker closure, resumes without fetching block 1, reloads persisted history, and requires fresh validation before showing unselected outputs. Run on hosted CI with working Chromium; discovery/typecheck are not execution evidence.

## Remaining requirements

This milestone closes the dedicated scan-worker/cancel requirement, not all of spec 12. It does not enable mainnet, add hosted scanning or change key custody. Existing Esplora txid/Merkle/witness and header-chain checks remain in force. Direct bitcoind API choice, oracle source selection, secondary-source policy and lightweight oracle-proof verification require the precise follow-on assessment in [TEAM_H_SOURCE_SELECTION_NEXT.md](TEAM_H_SOURCE_SELECTION_NEXT.md). Real-node, compatible gRPC-Web proxy and physical-device acceptance remain separate external evidence.
