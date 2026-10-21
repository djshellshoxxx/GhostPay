# Self security review: `@ghostpay/privacy-pipeline`

Date 2026-10-21. Branch `claude/remote-extensions-9`. **This is an AI self-review by the builder, not an independent audit.** Scope: `packages/privacy-pipeline` only (planner, validator, executor over abstract ports, presets, serialisation). Testnet-only proof of concept. Spec: `chaining.md`, `profiles.md` section 18, baseline `security-specs/privacy-ops.md`.

## 1. Threat model

Assets: the user's funds mid-chain (holdings between steps), the user's linkability, the integrity of the persisted run, the honesty of what the UI is told.

Adversaries and failure modes considered:

| # | Threat | Where it bites |
|---|---|---|
| T1 | Composition that cancels or contradicts itself, or a chain the user reads as stronger than it is | validator, summary |
| T2 | Crash, reload or relayer failure mid-chain: double submit, stranded funds, forgotten step | executor |
| T3 | Secret, signature or raw transaction written to storage or logs | serialisation, error messages |
| T4 | Tampered or corrupt stored run (malicious extension, bad migration, truncated write) | `sanitizeRun` |
| T5 | Network or clock side channels added by the package itself | package-wide |
| T6 | Driver misbehaviour (throws, lies, never returns, spins) | executor |
| T7 | Wrong chain: any mainnet or non-allowed network reaching planning or execution | guard |
| T8 | Overclaiming through wording, scores, rankings | keys, summary types |
| T9 | Two executors acting on one run | executor |

Out of scope: the method packages, relayers, pools, wallets, the web app, Tor/OHTTP/PIR behaviour, cryptography (the package hashes with `@noble/hashes` and does nothing else).

## 2. Controls and how each was checked

| Control | Check run |
|---|---|
| Testnet guard (31337, 11155111, 84532; BTC testnet/signet/regtest) at `validate` (returns blocking `E_WRONG_CHAIN`), `expand`, `planHash`, `simulate`, `createRun`, `newPipeline`, `templateFor`, `createExecutor().start/resume/advance/abort`, `sanitizePipeline`/`sanitizeRun` (null) | `validate.test.ts` iterates 11 bad chain values through every entry point; sanitizers return null; executor loads re-assert the guard |
| No I/O, clock, randomness or crypto imports (PL-1) | `honesty.test.ts` greps every non-test source file; imports limited to relative paths and two `@noble/hashes` modules |
| Persist-before-sign (EX-1), reconcile-before-resubmit (EX-3) | executor tests plus crash injection: the store dies before or after every one of its saves (about 60 points, both modes) and the driver dies before or after its effect at every submit; each run is restarted from the persisted bytes only; every intent key has exactly one effect; a property test repeats this on four random shapes with random crash points |
| No secret fields in state (EX-2) | run type has no such field; tests walk the stored JSON keys; sign-port output never appears in the stored body |
| Run integrity | `sanitizeRun` is field-by-field, bounds sizes (1 MB text, 64 steps, 1024 instances, 64 outputs, 128-char refs), requires instance ids to equal the pipeline's own expansion in order, and requires the plan hash to equal the hash of the stored pipeline and quotes; fuzzed with `fast-check` over `unknown` and over single-point mutations of a valid run |
| Fail closed | unknown step kind, unknown or out-of-range parameter, unknown layer value, wrong chain, malformed id: all blocking; fuzzed over garbage steps |
| Honest wording | banned-word grep over all sources, rule keys, step ids and copy keys; no numeric privacy field (runtime and type check); strength is a set; credited dwell is only `pool.dwell`; two pools or hops add no crowd (property test) |
| Acks | package never adds an ack; `start` throws `E_ACK_MISSING` unless the caller's set covers `requiredAcks`; presets return acks as required, not given |
| Layers | non-direct transport needs a passing self-test at start **and** at resume; failing pauses and never rewrites transport to `direct`; layers cannot change after the run starts (`replan` is illegal while running or paused) |

## 3. Findings

Severity is the builder's estimate for a testnet proof of concept. "Fixed" means fixed before the commit and covered by a test that failed first.

| ID | Sev | Finding | Status |
|---|---|---|---|
| F-1 | Medium | `C-03` ("anything after a pool exit") matched a pool exit that had nothing after it, so a valid seller pipeline ending in `pool.exit` would have been blocked. Found by the near-miss test for C-03. | Fixed |
| F-2 | Medium | `validate` was not total for a malformed `layers` value (`null` threw a `TypeError`). Found by the "unknown layer values fail closed" test. A shape check now runs before projection; `expand`/`planHash`/`simulate` throw `E_NOT_VALID` instead. | Fixed |
| F-3 | High (liveness) | A driver whose `submit` always throws (relayer down) made the executor loop forever inside one `advance` call: `submit` threw, reconcile said `not-started`, the instance went straight back to `due`, repeat. Found while running the EX-1 mutation (the mutated run never terminated). Now a thrown submit followed by `not-started` goes through `failed-retryable` (pause, retry limit 3, then terminal), and every `advance` has a turn budget that pauses the run with `loop-guard`. | Fixed |
| F-4 | Medium | An early draft of `sanitizeRun` skipped the plan-hash check for most statuses. Caught in self-review before any test; the check is unconditional now. | Fixed |
| F-5 | Medium (app) | The in-memory lock only stops re-entry into one executor object. Two browser tabs (or a tab and a worker) can run the same run and double-submit. | Open: wiring doc requires a `navigator.locks` wrapper (`pipelineLock.ts`); not testable in this package |
| F-6 | Medium (app) | The executor trusts persisted instance state. An attacker who can write the store (not just read it) can forge `done` with chosen output refs. `sanitizeRun` checks structure and hashes, not authenticity. | Open: store must be authenticated-encrypted (wiring doc); not testable here |
| F-7 | Medium | The package only guarantees one `submit` per intent key if the driver's `reconcile()` is truthful or its `submit` is idempotent. A driver that answers `not-started` for something it already sent defeats it. | Open by design; documented in README and wiring; no way to verify without real drivers |
| F-8 | Low | `HoldingRef.ref` and `SideEffectRef` are opaque strings. The sanitiser limits charset and length but cannot recognise a secret that a driver chooses to put there. | Open; wiring doc forbids it; a driver test in `apps/web` should assert refs are not key material |
| F-9 | Medium | Profile rules R-xx are restated locally (the brief forbids importing `privacy-profiles`). They can drift from the real `RULES`. | Open until the profiles package is built; PL-7 must then be run against it |
| F-10 | Low | Fee and constant placeholders where the spec gives no number (`CT_MIN_DWELL_MS`, pool relayer cap, accrual router fee, `LONG_RUN_STEPS`). They affect warnings and the cost summary, not safety. | Open; listed in `DEVIATIONS.md` B for owner decision |
| F-11 | Low | Reconcile after a crash reads chain state through the driver. If the driver uses a direct RPC read, the RPC sees the address. The `verification` layer and CP-5 make this explicit, but the package cannot enforce it on the driver. | Open; documented |
| F-12 | Low | Wait times come from an injected `DelayPort`. A non-CSPRNG implementation would weaken delay distributions. | Open; wiring doc says to reuse `jitter.ts` `randomDelayMs` |
| F-13 | Info | `tor-browser` per-step isolation cannot be enforced by a web page (Q4); shown as `privacy.warn.chain.isolationUnenforced`. | Accepted |
| F-14 | Info | A pipeline may end at a non-terminal holding (for example a seller pipeline that stops at `stealth`). It validates; funds stay where they are. `validate().endHolding` lets the UI warn. | Accepted |

No finding allows funds to move without a user-visible checkpoint inside this package, because the package cannot move funds at all: it only calls driver methods that the app supplies.

## 4. Mutation check (chaining spec 10.6)

Each deletion was applied to the source, the relevant tests were run, and the file restored.

| Mutation | Result |
|---|---|
| delete rule `C-03` | 2 tests fail (rule fires; rule present) |
| delete rule `C-13` | 2 tests fail |
| delete rule `C-23` | 3 tests fail |
| remove the save before signing (EX-1) | 3 tests fail (EX-1 direct check, store crash sweep, driver crash sweep) |

## 5. Verification status

Run on the final tree of this commit, in `packages/privacy-pipeline`:

- `npx vitest run --coverage`: 12 test files, 747 tests passing. Coverage: statements 99.34 %, branches 97.07 %, functions 99.7 %, lines 99.5 % (thresholds 95/90/95/95).
- `npm run typecheck`: clean. `npm run lint`: clean.
- Property tests (fast-check): P-1, P-2, P-3, P-4 (append form; see the note below), P-5, P-6, P-7, P-8 (every order of every multiset of up to five seller steps against an independent oracle), P-9 (reducers and random crash points).
- PL-11: every preset template validates ok (modulo acks) for 5 chains x 3 environments x 2 self-test sets x about 300 capability subsets, both roles, four presets (over 10 000 contexts).
- PL-12 (informational): median `validate` time for an 8-step seller pipeline measured once at about 0.15 ms; not asserted.

Notes on departures from the test plan: P-4's "inserting a step anywhere never makes an invalid pipeline valid" holds only up to steps whose projection depends on later steps (a `pool.deposit` inserted after an amount shaper or fresh wallet changes what they project, which is the intended R-17 refinement); the property asserts exactly that exception. Appending a step never removes a type error or chain-rule finding. Profile-rule blocking keys can be replaced by an option-clash error when a later step overrides an option, so the key-level monotonicity applies to type and chain-rule findings only.

Not verified: anything involving real drivers, anvil, Tor, OHTTP, PIR, a browser, or two tabs (chaining test-plan item 5, `scripts/gen-matrix.mjs --chain`, UI wiring). Marked UNVERIFIED in the README.
