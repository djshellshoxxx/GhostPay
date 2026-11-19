# Historical security promotion from qualified main

**Focused source ready for hosted qualification; no complete release or merge qualification is claimed.**

Base main: `e454de6abfefda70d82784fafc1d8949b277c334`. Tested source: `4d7402feffa18b37e68a121665d4a28e0a0b92a9`.
Reconciled source head: `b7e9a34c55689ce61e7c89f4f8292090e7470cce`; source tree: `8a0247ce437dfb51e047720a3f6bc1be09c0cd66`.
The final handoff commit adds documentation only.

## Preserved source groups

| Group | Original reviewed source | Refreshed source | Integration |
| --- | --- | --- | --- |
| PR245 positive pool inputs | `baa032547a16196005dccc30a247acd55d4f62c6` | `ca61cc889c6a5ca6f264cf787e2d2e698f594ea8` | Both exact heads retained in merge ancestry |
| PR247 AST source scanning | `20207a930336da95e78ad1d6f4987b3c74fc535a` | `6c11242abca5a3f20d933266c723d71b2e75d39b` | Both exact heads retained in merge ancestry |
| PR253 decoded SOCKS guard | `303ba1114fd78426162c4728f1778f66d64088f4` | `6b07e403dd26a8c8e12dfab82dedb0c36002b043` | Only two source/test hunks selected; neither dependency-train head merged |

The original and refreshed pool/scanner heads are ancestors of this branch.
Their only merge conflicts were ownership registry append collisions. Both sides'
claims were retained; a final blank line was normalized. The refreshed heads
merely incorporated already-qualified main and claim/evidence updates: all nine
selected source/test/deviation blobs remain identical to the executed test source.
The latest SOCKS candidate changes no selected source/test blob.

All nine blobs equal the indicated upstream source exactly. No package manifest,
lockfile, workflow or production contract runtime changed from main. Only the
selected nine files and documentation differ. The broader master scanner guards
were already separately retained and tested on master; this focused branch retains
the current main scanner baseline and the exact PR247 changes.

## Independent source review

The history reviewer inspected the pool guards against contract nonzero checks,
positive boundary/full-withdrawal behavior, property expectations and the raw
witness adaptation. The circuit still allows the historical zero-withdrawal raw
witness; the stricter helper refuses preparing unusable proof inputs. Existing
nine public-output assertions remain in that fixture. Raw circuit execution was
not performed here because Wasm/zkey artifacts are absent.

The AST detector and regressions were compared with historical016fa252 and the
current main source selection/artifact checks. Only source parsing/detection
changes; no compiled-output or privacy gate is disabled. This remains syntactic
detection, not JavaScript alias/dataflow analysis.

The SOCKS guard refuses text-decoded chunks before binary greeting parsing,
closes that socket, and preserves the Buffer path. Its real-socket test requires
a server-initiated close; timeout fails instead of counting cleanup as success.
Both pre-port files exactly matched the candidate's parent, so no major-version
source adaptation or dependency upgrade was imported.

## Executed validation

| Check | Result |
| --- | --- |
| Pool helper suite | 19 passed, zero failures/skips |
| Scanner and privacy suites | 88 passed, zero failures/skips |
| Complete SOCKS harness test file | 28 passed, zero failures/skips |
| SOCKS regression before runtime guard | One failed with ERR_INVALID_ARG_TYPE and timeout; 27 tests not selected |
| Selected source equality and merge ancestry | Passed mechanical assertions for all nine selected blobs and both generations of PR245/247 |
| Unchanged dependency/workflow/contract runtime boundary | Passed exact Git comparison |

The 135 passing tests used Node24.22.3 and the focused lock's Vitest5.0.5,
Vite8.3.5 and TypeScript5.9.3, one worker at a time, with a 768MB Node heap bound.
Existing dependencies came from the earlier scoped exact-version installation.
The missing poseidon-lite0.3.0, lean-imt2.2.5 and utils1.4.1 test packages were
retrieved without lifecycle scripts and each tarball's SHA512 was verified against
this repository's lockfile. These are environment additions, not manifest changes.
An initial missing-transitive-dependency startup failure ran no tests and remains
recorded; the subsequent helper run passed19/19 after resolution.

Pool and harness tests used their package configurations with coverage disabled
for this bounded run. Scanner/privacy tests used a minimal Node configuration to
avoid unrelated compiled workspace prerequisites. No full clean install, app
build, coverage, lint, typecheck, browser or hosted-gate success is claimed.
Detailed commands, package identities, logs and source blobs are recorded in the
JSON companion and coordinator audit workspace.

## Next action

Publish this exact focused source as a draft qualification PR, run its required
hosted gates, and refresh current-head/overlap checks before promotion. Keep
original active source branches intact. No finding exception, deployment,
experimental pool activation, protocol change or major dependency train is
included. Independent review here is AI-assisted engineering review.
